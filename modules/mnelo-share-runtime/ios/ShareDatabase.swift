import Foundation

final class ShareDatabase {
  private var handle: OpaquePointer?
  private let cancellation = NSLock()
  private var interrupted = false
  private let busyAttempts: Int32
  private let cancellationCheck: () -> Bool
  private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
  init(busyTimeout: Int32 = 10000, cancellationCheck: @escaping () -> Bool = { false }) throws {
    busyAttempts = min(max(busyTimeout, 0), 10000) / 10
    self.cancellationCheck = cancellationCheck
    let path = try MneloSharedVault.folder().appendingPathComponent("history-v1.db")
    guard FileManager.default.fileExists(atPath: path.path),
      exsqlite3_open_v2(path.path, &handle, SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX | SQLITE_OPEN_NOFOLLOW, nil) == SQLITE_OK else { close(); throw shareError("SHARE_OPEN_MNELO_FIRST") }
    do {
      let key = try MneloSharedVault.key()
      try exec("PRAGMA key = \"x'\(key)'\"; PRAGMA cipher_memory_security = ON;")
      installCancellation()
      guard !(try all("PRAGMA cipher_version", [])).isEmpty else { throw shareError("SQLCIPHER_REQUIRED") }
      _ = try all("SELECT count(*) FROM sqlite_master", [])
    } catch { close(); throw shareError("SHARE_OPEN_MNELO_FIRST") }
  }
  // The extension must release its original SQLite connection before telling
  // Siri/its host it has finished. Interrupt may be called from the deadline
  // queue while a native statement is executing; close itself stays serialized.
  func interrupt() {
    cancellation.lock(); defer { cancellation.unlock() }
    interrupted = true
    if let handle { exsqlite3_interrupt(handle) }
  }
  func close() {
    cancellation.lock(); defer { cancellation.unlock() }
    interrupted = true
    if let handle { exsqlite3_close_v2(handle) }; handle = nil
  }
  private func requireActive() throws {
    if isInterrupted { throw shareError("SHARE_CANCELLED") }
  }
  private var isInterrupted: Bool {
    cancellation.lock(); let local = interrupted; cancellation.unlock()
    return local || cancellationCheck()
  }
  private func installCancellation() {
    let context = Unmanaged.passUnretained(self).toOpaque()
    exsqlite3_busy_handler(handle, { context, attempt in
      guard let context else { return 0 }
      let database = Unmanaged<ShareDatabase>.fromOpaque(context).takeUnretainedValue()
      if database.isInterrupted || attempt >= database.busyAttempts { return 0 }
      // sqlite3_interrupt alone does not stop the default busy timeout. Keep
      // the ordinary contention budget, but observe host expiration promptly.
      Thread.sleep(forTimeInterval: 0.01)
      return database.isInterrupted ? 0 : 1
    }, context)
    exsqlite3_progress_handler(handle, 1000, { context in
      guard let context else { return 1 }
      return Unmanaged<ShareDatabase>.fromOpaque(context).takeUnretainedValue().isInterrupted ? 1 : 0
    }, context)
  }
  deinit { close() }
  func exec(_ sql: String) throws {
    try requireActive()
    guard let handle, exsqlite3_exec(handle, sql, nil, nil, nil) == SQLITE_OK else { throw shareError("SHARE_DATABASE_BUSY") }
  }
  func all(_ sql: String, _ parameters: [Any]) throws -> [[String: Any]] {
    try requireActive()
    var statement: OpaquePointer?
    guard let handle, exsqlite3_prepare_v2(handle, sql, -1, &statement, nil) == SQLITE_OK, let statement else { throw shareError("SHARE_DATABASE_BUSY") }
    defer { exsqlite3_finalize(statement) }
    guard exsqlite3_bind_parameter_count(statement) == parameters.count else { throw shareError("SHARE_DATABASE_INVALID") }
    for (index, value) in parameters.enumerated() {
      let slot = Int32(index + 1)
      let status: Int32
      if value is NSNull { status = exsqlite3_bind_null(statement, slot) }
      else if let value = value as? String { status = exsqlite3_bind_text(statement, slot, value, Int32(value.utf8.count), transient) }
      else if let blob = value as? [String: String], let encoded = blob["__blob"], let data = Data(base64Encoded: encoded) {
        status = data.withUnsafeBytes { exsqlite3_bind_blob(statement, slot, $0.baseAddress, Int32(data.count), transient) }
      } else if let value = value as? NSNumber { status = exsqlite3_bind_double(statement, slot, value.doubleValue) }
      else { throw shareError("SHARE_DATABASE_INVALID") }
      guard status == SQLITE_OK else { throw shareError("SHARE_DATABASE_BUSY") }
    }
    var rows: [[String: Any]] = []
    while true {
      let step = exsqlite3_step(statement)
      if step == SQLITE_DONE { return rows }
      guard step == SQLITE_ROW else { throw shareError("SHARE_DATABASE_BUSY") }
      var row: [String: Any] = [:]
      for column in 0..<exsqlite3_column_count(statement) {
        let name = String(cString: exsqlite3_column_name(statement, column))
        switch exsqlite3_column_type(statement, column) {
        case SQLITE_INTEGER: row[name] = exsqlite3_column_int64(statement, column)
        case SQLITE_FLOAT: row[name] = exsqlite3_column_double(statement, column)
        case SQLITE_TEXT:
          let count = Int(exsqlite3_column_bytes(statement, column))
          row[name] = String(decoding: UnsafeBufferPointer(start: exsqlite3_column_text(statement, column), count: count), as: UTF8.self)
        case SQLITE_BLOB:
          let count = Int(exsqlite3_column_bytes(statement, column))
          let data = exsqlite3_column_blob(statement, column).map { Data(bytes: $0, count: count) } ?? Data()
          row[name] = ["__blob": data.base64EncodedString()]
        default: row[name] = NSNull()
        }
      }
      rows.append(row)
    }
  }
}

func shareError(_ code: String) -> NSError { NSError(domain: code, code: 1) }
func shareJSON(_ value: Any) -> String {
  guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]), let text = String(data: data, encoding: .utf8) else { return "{\"error\":\"SHARE_FAILED\"}" }
  return text
}
