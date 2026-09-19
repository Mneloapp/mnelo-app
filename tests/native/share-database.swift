import Foundation

enum MneloSharedVault {
  static func folder() throws -> URL { URL(fileURLWithPath: CommandLine.arguments[1]) }
  static func key() throws -> String { String(repeating: "a", count: 64) }
}

final class CancellationFlag {
  private let lock = NSLock()
  private var cancelled = false
  var value: Bool { lock.lock(); defer { lock.unlock() }; return cancelled }
  func cancel() { lock.lock(); cancelled = true; lock.unlock() }
}

@main struct ShareDatabaseProbe {
  static func main() throws {
    let path = try MneloSharedVault.folder().appendingPathComponent("history-v1.db").path
    var initial: OpaquePointer?
    let key = try MneloSharedVault.key()
    precondition(exsqlite3_open(path, &initial) == SQLITE_OK)
    precondition(exsqlite3_exec(initial, "PRAGMA key = \"x'\(key)'\"; CREATE TABLE fixture(id INTEGER PRIMARY KEY); INSERT INTO fixture VALUES(1);", nil, nil, nil) == SQLITE_OK)
    exsqlite3_close(initial)

    let database = try ShareDatabase(busyTimeout: 1000)
    try database.exec("BEGIN IMMEDIATE")
    _ = try database.all("INSERT INTO fixture VALUES(?)", [2])
    database.interrupt()
    do { try database.exec("COMMIT"); fatalError("Late commit was accepted") }
    catch { precondition((error as NSError).domain == "SHARE_CANCELLED") }
    database.close()
    let reopened = try ShareDatabase(busyTimeout: 1000)
    let persisted = try reopened.all("SELECT * FROM fixture", [])
    precondition(persisted.count == 1)
    print("PASS extension SQLCipher: cancelled transaction rolls back and original handle rejects late work")

    let started = DispatchSemaphore(value: 0)
    let completed = DispatchSemaphore(value: 0)
    let begin = ProcessInfo.processInfo.systemUptime
    DispatchQueue.global().async {
      started.signal()
      do {
        _ = try reopened.all("WITH RECURSIVE long_query(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM long_query WHERE x<100000000) SELECT sum(x) FROM long_query", [])
        fatalError("Cancelled long query completed")
      } catch {}
      reopened.close()
      completed.signal()
    }
    started.wait(); Thread.sleep(forTimeInterval: 0.02); reopened.interrupt()
    precondition(completed.wait(timeout: .now() + 2) == .success)
    precondition(ProcessInfo.processInfo.systemUptime - begin < 1)
    let after = try ShareDatabase(busyTimeout: 1000)
    let integrity = try after.all("PRAGMA integrity_check", [])[0]
    precondition(integrity["integrity_check"] as? String == "ok")
    after.close()
    print("PASS extension SQLCipher: deadline interrupts active cursor, closes off-thread, and preserves encrypted vault")

    // Real two-connection contention: a default ten-second busy timeout must
    // not delay the deadline cleanup when another process owns the writer.
    let writer = try ShareDatabase()
    let waiting = try ShareDatabase()
    try writer.exec("BEGIN IMMEDIATE")
    let busyStarted = DispatchSemaphore(value: 0)
    let busyClosed = DispatchSemaphore(value: 0)
    DispatchQueue.global().async {
      busyStarted.signal()
      do { try waiting.exec("BEGIN IMMEDIATE"); fatalError("Concurrent writer unexpectedly acquired lock") }
      catch {}
      waiting.close()
      busyClosed.signal()
    }
    busyStarted.wait(); Thread.sleep(forTimeInterval: 0.05)
    let interruptedAt = ProcessInfo.processInfo.systemUptime
    waiting.interrupt()
    precondition(busyClosed.wait(timeout: .now() + 1) == .success)
    precondition(ProcessInfo.processInfo.systemUptime - interruptedAt < 0.5)
    try writer.exec("ROLLBACK")
    writer.close()
    print("PASS extension SQLCipher: real busy writer cancellation closes in under 500 ms instead of waiting ten seconds")

    let exclusive = try ShareDatabase()
    try exclusive.exec("BEGIN EXCLUSIVE")
    let flag = CancellationFlag()
    let opening = DispatchSemaphore(value: 0)
    let openingClosed = DispatchSemaphore(value: 0)
    DispatchQueue.global().async {
      opening.signal()
      do {
        _ = try ShareDatabase(cancellationCheck: { flag.value })
        fatalError("Opening connection bypassed exclusive lock")
      } catch {}
      openingClosed.signal()
    }
    opening.wait(); Thread.sleep(forTimeInterval: 0.05)
    let openingCancelledAt = ProcessInfo.processInfo.systemUptime
    flag.cancel()
    precondition(openingClosed.wait(timeout: .now() + 1) == .success)
    precondition(ProcessInfo.processInfo.systemUptime - openingCancelledAt < 0.5)
    try exclusive.exec("ROLLBACK"); exclusive.close()
    print("PASS extension SQLCipher: deadline also interrupts initialization before the runtime publishes its handle")
  }
}
