import Foundation
#if canImport(ExpoSQLite)
import ExpoSQLite
#endif

// The production implementation acquires UIApplication assertions. The same
// ownership rules are exercised with a controllable clock in native tests.
protocol MneloDatabaseTasks: AnyObject {
  func begin(_ token: UUID, expiration: @escaping () -> Void) -> Bool
  func end(_ token: UUID)
}

func mneloDatabaseError(_ code: String) -> NSError {
  NSError(domain: "MneloDatabase", code: 1, userInfo: [NSLocalizedDescriptionKey: code])
}

// One existing SQLCipher file, one connection and one serial operation queue.
// No prepared statement or read cursor survives a native invocation. A lease
// survives JS/native awaits only while SQLite says a transaction is open.
final class MneloDatabase {
  private let queue = DispatchQueue(label: "com.mnelo.vault.database", qos: .userInitiated)
  private let state = NSLock()
  private var pointer: OpaquePointer?
  private var suspended = false
  private var closed = false
  private var lease: UUID?
  private let tasks: MneloDatabaseTasks
  private let onSuspended: () -> Void
  private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

  init(path: String, key: String, tasks: MneloDatabaseTasks, onSuspended: @escaping () -> Void) throws {
    self.tasks = tasks
    self.onSuspended = onSuspended
    guard key.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
      throw mneloDatabaseError("DEVICE_KEY_INVALID")
    }
    // Foundation intentionally preserves /var aliases on Apple platforms.
    // Canonicalize only the trusted existing parent; NOFOLLOW still refuses a
    // symlink at the database file itself without rejecting the OS container.
    let file = URL(fileURLWithPath: path)
    guard let parent = realpath(file.deletingLastPathComponent().path, nil) else {
      throw mneloDatabaseError("DATABASE_OPEN_FAILED")
    }
    let databasePath = String(cString: parent) + "/" + file.lastPathComponent
    free(parent)
    try queue.sync {
      do {
        try acquireLease()
        var handle: OpaquePointer?
        let result = exsqlite3_open_v2(databasePath, &handle,
          SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX | SQLITE_OPEN_NOFOLLOW, nil)
        state.lock(); pointer = handle; state.unlock()
        guard result == SQLITE_OK, let handle else { throw mneloDatabaseError("DATABASE_OPEN_FAILED") }
        try requireActive()
        // Preserve the existing cipher, journal, file and key. This changes
        // ownership/lifetime only, never migrates or recreates local history.
        guard exsqlite3_exec(handle,
          "PRAGMA key = \"x'\(key)'\"; PRAGMA cipher_memory_security = ON; PRAGMA journal_mode = DELETE;",
          nil, nil, nil) == SQLITE_OK else { throw mneloDatabaseError("DATABASE_OPEN_FAILED") }
        installCancellation(handle)
        guard !(try rows(handle, "PRAGMA cipher_version", [])).isEmpty else {
          throw mneloDatabaseError("SQLCIPHER_REQUIRED")
        }
        _ = try rows(handle, "SELECT count(*) FROM sqlite_master", [])
        try requireActive()
        releaseIfIdle(handle)
      } catch {
        let interrupted = isSuspended
        closeOnQueue()
        if interrupted { throw mneloDatabaseError("DATABASE_SUSPENDED") }
        throw error
      }
    }
  }

  var isSuspended: Bool {
    state.lock(); defer { state.unlock() }
    return suspended
  }

  func exec(_ sql: String) throws {
    try operation { handle in
      guard exsqlite3_exec(handle, sql, nil, nil, nil) == SQLITE_OK else {
        throw mneloDatabaseError("DATABASE_QUERY_FAILED")
      }
    }
  }

  func all(_ sql: String, _ parameters: [Any]) throws -> [[String: Any]] {
    try operation { try rows($0, sql, parameters) }
  }

  func close() {
    queue.sync { closeOnQueue() }
  }

  private func operation<T>(_ work: (OpaquePointer) throws -> T) throws -> T {
    try queue.sync {
      try requireActive()
      guard let handle = pointer else { throw mneloDatabaseError("DATABASE_CLOSED") }
      try acquireLease()
      do {
        try requireActive()
        let result = try work(handle)
        try requireActive()
        releaseIfIdle(handle)
        return result
      } catch {
        // Expiration takes precedence over an interrupted SQLite return code.
        // Its queued cleanup, not this operation, owns ending that assertion.
        releaseIfIdle(handle)
        if isSuspended { throw mneloDatabaseError("DATABASE_SUSPENDED") }
        throw error
      }
    }
  }

  private func requireActive() throws {
    state.lock(); defer { state.unlock() }
    if suspended { throw mneloDatabaseError("DATABASE_SUSPENDED") }
    if closed { throw mneloDatabaseError("DATABASE_CLOSED") }
  }

  private func acquireLease() throws {
    try requireActive()
    state.lock()
    if lease != nil { state.unlock(); return }
    let token = UUID()
    lease = token
    state.unlock()
    guard tasks.begin(token, expiration: { [weak self] in self?.expire(token) }) else {
      // Failure to acquire time is not permission to touch the shared file.
      expire(token)
      throw mneloDatabaseError("DATABASE_SUSPENDED")
    }
    try requireActive()
  }

  private func releaseIfIdle(_ handle: OpaquePointer) {
    guard exsqlite3_get_autocommit(handle) != 0 else { return }
    state.lock()
    guard !suspended else { state.unlock(); return }
    let token = lease
    lease = nil
    state.unlock()
    if let token { tasks.end(token) }
  }

  private func expire(_ token: UUID) {
    state.lock()
    guard lease == token, !closed, !suspended else { state.unlock(); return }
    suspended = true
    // SQLite explicitly permits interrupt from another thread. The small lock
    // prevents racing a close/free of this exact handle; it never covers SQL.
    if let pointer { exsqlite3_interrupt(pointer) }
    state.unlock()
    queue.async { [self] in
      // In-flight work has finalized its statements before this runs. Closing
      // rolls back any transaction, including one waiting on a JS crypto await.
      closeOnQueue()
      onSuspended()
    }
  }

  private func closeOnQueue() {
    state.lock()
    let handle = pointer
    pointer = nil
    closed = true
    let token = lease
    lease = nil
    state.unlock()
    // All statements are local to rows()/exec(); no zombie cursors can retain
    // a lock after close. The queue excludes active SQL, including expiration.
    if let handle {
      exsqlite3_progress_handler(handle, 0, nil, nil)
      exsqlite3_busy_handler(handle, nil, nil)
      if exsqlite3_get_autocommit(handle) == 0 {
        _ = exsqlite3_exec(handle, "ROLLBACK", nil, nil, nil)
      }
      _ = exsqlite3_close_v2(handle)
    }
    // Ending the OS assertion happens only after rollback, finalize and close.
    if let token { tasks.end(token) }
  }

  private func installCancellation(_ handle: OpaquePointer) {
    let context = Unmanaged.passUnretained(self).toOpaque()
    exsqlite3_busy_handler(handle, { context, attempt in
      guard let context else { return 0 }
      let database = Unmanaged<MneloDatabase>.fromOpaque(context).takeUnretainedValue()
      if database.isSuspended || attempt >= 1000 { return 0 }
      // Preserve the normal ten-second busy budget, but expiration never waits
      // for that entire timeout; it is observed at most ten milliseconds later.
      Thread.sleep(forTimeInterval: 0.01)
      return database.isSuspended ? 0 : 1
    }, context)
    exsqlite3_progress_handler(handle, 1000, { context in
      guard let context else { return 1 }
      return Unmanaged<MneloDatabase>.fromOpaque(context).takeUnretainedValue().isSuspended ? 1 : 0
    }, context)
  }

  private func rows(_ handle: OpaquePointer, _ sql: String, _ parameters: [Any]) throws -> [[String: Any]] {
    var prepared: OpaquePointer?
    let preparedResult = exsqlite3_prepare_v2(handle, sql, -1, &prepared, nil)
    guard preparedResult == SQLITE_OK, let statement = prepared else {
      if let prepared { exsqlite3_finalize(prepared) }
      throw mneloDatabaseError("DATABASE_QUERY_FAILED")
    }
    defer { exsqlite3_finalize(statement) }
    guard exsqlite3_bind_parameter_count(statement) == parameters.count else {
      throw mneloDatabaseError("DATABASE_BINDING_INVALID")
    }
    for (index, value) in parameters.enumerated() {
      let slot = Int32(index + 1)
      let status: Int32
      if value is NSNull { status = exsqlite3_bind_null(statement, slot) }
      else if let text = value as? String {
        status = exsqlite3_bind_text(statement, slot, text, Int32(text.utf8.count), transient)
      } else if let blob = value as? [String: String], let encoded = blob["__mneloBlob"],
                let data = Data(base64Encoded: encoded) {
        status = data.isEmpty ? exsqlite3_bind_zeroblob(statement, slot, 0) : data.withUnsafeBytes {
          exsqlite3_bind_blob(statement, slot, $0.baseAddress, Int32(data.count), transient)
        }
      } else if let number = value as? NSNumber, number.doubleValue.isFinite {
        if let integer = Int64(exactly: number.doubleValue) {
          status = exsqlite3_bind_int64(statement, slot, integer)
        } else { status = exsqlite3_bind_double(statement, slot, number.doubleValue) }
      } else { throw mneloDatabaseError("DATABASE_BINDING_INVALID") }
      guard status == SQLITE_OK else { throw mneloDatabaseError("DATABASE_BINDING_INVALID") }
    }
    var result: [[String: Any]] = []
    while true {
      let next = exsqlite3_step(statement)
      if next == SQLITE_DONE { return result }
      guard next == SQLITE_ROW else { throw mneloDatabaseError("DATABASE_QUERY_FAILED") }
      var row: [String: Any] = [:]
      for column in 0..<exsqlite3_column_count(statement) {
        let name = String(cString: exsqlite3_column_name(statement, column))
        switch exsqlite3_column_type(statement, column) {
        case SQLITE_INTEGER: row[name] = exsqlite3_column_int64(statement, column)
        case SQLITE_FLOAT: row[name] = exsqlite3_column_double(statement, column)
        case SQLITE_TEXT:
          row[name] = String(decoding: UnsafeBufferPointer(start: exsqlite3_column_text(statement, column),
            count: Int(exsqlite3_column_bytes(statement, column))), as: UTF8.self)
        case SQLITE_BLOB:
          let count = Int(exsqlite3_column_bytes(statement, column))
          let data = exsqlite3_column_blob(statement, column).map { Data(bytes: $0, count: count) } ?? Data()
          row[name] = ["__mneloBlob": data.base64EncodedString()]
        default: row[name] = NSNull()
        }
      }
      result.append(row)
    }
  }

}
