import Foundation

final class ProbeTasks: MneloDatabaseTasks {
  private let lock = NSLock()
  private var handlers: [UUID: () -> Void] = [:]
  var deny = false
  var begins = 0
  var ends = 0
  var onEnd: (() -> Void)?
  func begin(_ token: UUID, expiration: @escaping () -> Void) -> Bool {
    lock.lock(); defer { lock.unlock() }
    begins += 1
    if deny { return false }
    handlers[token] = expiration
    return true
  }
  func end(_ token: UUID) {
    lock.lock()
    if handlers.removeValue(forKey: token) != nil { ends += 1 }
    let callback = onEnd
    lock.unlock()
    callback?()
  }
  var active: Int { lock.lock(); defer { lock.unlock() }; return handlers.count }
  func expire() {
    lock.lock(); let callbacks = Array(handlers.values); lock.unlock()
    callbacks.forEach { $0() }
  }
}

func expectError(_ code: String, _ work: () throws -> Void) {
  do { try work(); fatalError("Expected \(code)") }
  catch { precondition(error.localizedDescription == code, "Unexpected error: \(error)") }
}

@main struct DatabaseProbe {
  static func main() throws {
    let manager = FileManager.default
    let directory = manager.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent(UUID().uuidString)
    try manager.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? manager.removeItem(at: directory) }
    let path = directory.appendingPathComponent("history-v1.db").path
    let key = String(repeating: "a", count: 64)
    let tasks = ProbeTasks()
    let database = try MneloDatabase(path: path, key: key, tasks: tasks, onSuspended: {})
    if CommandLine.arguments.count > 1 {
      let schema = try String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
      try database.exec(schema)
      let enabled = try database.all("PRAGMA foreign_keys", [])[0]["foreign_keys"] as? Int64
      let tables = try database.all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('identity','messages','phonebook_name_cache','control_outbox')", [])
      precondition(enabled == 1 && tables.count == 4)
      print("PASS native schema: actual application tables and foreign-key policy apply unchanged")
    }
    try database.exec("CREATE TABLE items(id INTEGER PRIMARY KEY, integer_value INTEGER, real_value REAL, text_value TEXT, blob_value BLOB, null_value TEXT);")
    _ = try database.all("INSERT INTO items VALUES(?,?,?,?,?,?)", [1, 9007199254740991 as Int64, 1.25, "ქართული\0text", ["__mneloBlob": "AID/"], NSNull()])
    let row = try database.all("SELECT * FROM items", [])[0]
    precondition(row["integer_value"] as? Int64 == 9007199254740991)
    precondition(row["real_value"] as? Double == 1.25)
    precondition(row["text_value"] as? String == "ქართული\0text")
    precondition((row["blob_value"] as? [String: String])?["__mneloBlob"] == "AID/")
    precondition(row["null_value"] is NSNull)
    _ = try database.all("INSERT INTO items(id,blob_value) VALUES(?,?)", [2, ["__mneloBlob": ""]])
    let empty = try database.all("SELECT typeof(blob_value) AS kind,length(blob_value) AS size FROM items WHERE id=2", [])[0]
    precondition(empty["kind"] as? String == "blob" && empty["size"] as? Int64 == 0)
    precondition(tasks.active == 0 && tasks.begins == tasks.ends)
    expectError("DATABASE_BINDING_INVALID") { _ = try database.all("SELECT ?", []) }
    expectError("DATABASE_QUERY_FAILED") { try database.exec("INSERT INTO missing VALUES(1)") }
    precondition(tasks.active == 0)
    try database.exec("BEGIN IMMEDIATE")
    expectError("DATABASE_QUERY_FAILED") { try database.exec("INSERT INTO missing VALUES(2)") }
    precondition(tasks.active == 1)
    try database.exec("ROLLBACK")
    precondition(tasks.active == 0)
    let media = Data(repeating: 0xa5, count: 1024 * 1024).base64EncodedString()
    _ = try database.all("UPDATE items SET blob_value=? WHERE id=1", [["__mneloBlob": media]])
    let mediaCopy = try database.all("SELECT blob_value FROM items WHERE id=1", [])[0]["blob_value"] as? [String: String]
    precondition(mediaCopy?["__mneloBlob"] == media)
    let fileHeader = try Data(contentsOf: URL(fileURLWithPath: path)).prefix(16)
    precondition(String(decoding: fileHeader, as: UTF8.self) != "SQLite format 3\0")
    print("PASS native SQLCipher: integer/float/null/Unicode/NUL/binary/empty-blob parity and encrypted file")

    try database.exec("BEGIN IMMEDIATE")
    _ = try database.all("INSERT INTO items(id,text_value) VALUES(?,?)", [3, "Uncommitted ratchet/outbox fixture"])
    precondition(tasks.active == 1, "Transaction lease did not survive bridge await")
    // Native expiration while JavaScript is between statements must rollback
    // the original connection before relinquishing its OS execution assertion.
    tasks.onEnd = {
      let checkTasks = ProbeTasks()
      let check = try! MneloDatabase(path: path, key: key, tasks: checkTasks, onSuspended: {})
      try! check.exec("BEGIN IMMEDIATE")
      let count = try! check.all("SELECT count(*) AS value FROM items WHERE id=3", [])[0]["value"] as! Int64
      precondition(count == 0, "OS assertion ended before rollback")
      try! check.exec("ROLLBACK"); check.close()
    }
    tasks.expire()
    database.close()
    precondition(database.isSuspended && tasks.active == 0)
    expectError("DATABASE_SUSPENDED") { try database.exec("COMMIT") }
    expectError("DATABASE_SUSPENDED") { _ = try database.all("INSERT INTO items(id) VALUES(4)", []) }
    tasks.onEnd = nil
    database.close()
    print("PASS native expiration: cross-await transaction rollback precedes lease end, late operations reject")

    let reopenedTasks = ProbeTasks()
    let reopened = try MneloDatabase(path: path, key: key, tasks: reopenedTasks, onSuspended: {})
    let retained = try reopened.all("SELECT count(*) AS value FROM items", [])[0]["value"] as? Int64
    precondition(retained == 2)
    try reopened.exec("BEGIN IMMEDIATE")
    _ = try reopened.all("INSERT INTO items(id) VALUES(5)", [])
    try reopened.exec("COMMIT")
    precondition(reopenedTasks.active == 0)
    print("PASS native recovery: fresh handle keeps committed history; normal commit releases lease")

    let deniedTasks = ProbeTasks(); deniedTasks.deny = true
    let deniedPath = directory.appendingPathComponent("never-created.db").path
    expectError("DATABASE_SUSPENDED") {
      _ = try MneloDatabase(path: deniedPath, key: key, tasks: deniedTasks, onSuspended: {})
    }
    precondition(!manager.fileExists(atPath: deniedPath))
    reopenedTasks.deny = true
    expectError("DATABASE_SUSPENDED") { try reopened.exec("INSERT INTO items(id) VALUES(6)") }
    reopened.close()
    print("PASS native denied assertion: no open/SQL lock begins without a valid OS task")

    // Exercise an actual busy SQLite operation, not only mocked queue state.
    let holder = try MneloDatabase(path: path, key: key, tasks: ProbeTasks(), onSuspended: {})
    let waitingTasks = ProbeTasks()
    let waiting = try MneloDatabase(path: path, key: key, tasks: waitingTasks, onSuspended: {})
    try holder.exec("BEGIN IMMEDIATE")
    let finished = DispatchSemaphore(value: 0)
    DispatchQueue.global().async {
      expectError("DATABASE_SUSPENDED") { try waiting.exec("INSERT INTO items(id) VALUES(7)") }
      finished.signal()
    }
    while waitingTasks.active == 0 { Thread.sleep(forTimeInterval: 0.001) }
    Thread.sleep(forTimeInterval: 0.03)
    let began = Date()
    waitingTasks.expire()
    precondition(finished.wait(timeout: .now() + 2) == .success)
    waiting.close()
    precondition(Date().timeIntervalSince(began) < 1, "Expiration waited through the ten-second busy timeout")
    try holder.exec("ROLLBACK"); holder.close()
    print("PASS native busy expiry: interrupt/cancel/close without waiting for ten-second lock timeout")

    let readerTasks = ProbeTasks()
    let reader = try MneloDatabase(path: path, key: key, tasks: readerTasks, onSuspended: {})
    let readFinished = DispatchSemaphore(value: 0)
    DispatchQueue.global().async {
      expectError("DATABASE_SUSPENDED") {
        _ = try reader.all("WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<1000000000) SELECT sum(x) FROM n", [])
      }
      readFinished.signal()
    }
    while readerTasks.active == 0 { Thread.sleep(forTimeInterval: 0.001) }
    Thread.sleep(forTimeInterval: 0.02)
    readerTasks.expire()
    precondition(readFinished.wait(timeout: .now() + 2) == .success)
    reader.close()
    let final = try MneloDatabase(path: path, key: key, tasks: ProbeTasks(), onSuspended: {})
    let integrity = try final.all("PRAGMA integrity_check", [])[0]["integrity_check"] as? String
    let finalCount = try final.all("SELECT count(*) AS value FROM items", [])[0]["value"] as? Int64
    precondition(integrity == "ok")
    precondition(finalCount == 3)
    final.close()
    print("PASS native read expiry: cursor finalized, connection unlocks, committed data and integrity preserved")
  }
}
