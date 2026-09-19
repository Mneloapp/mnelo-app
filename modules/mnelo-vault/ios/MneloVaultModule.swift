import ExpoModulesCore

public class MneloVaultModule: Module {
  private let registryLock = NSLock()
  private var databases: [String: MneloDatabase] = [:]
  private let databaseQueue = DispatchQueue(label: "com.mnelo.vault.bridge", qos: .userInitiated, attributes: .concurrent)
  private func database(_ id: String) throws -> MneloDatabase {
    registryLock.lock(); defer { registryLock.unlock() }
    guard let database = databases[id] else { throw mneloDatabaseError("DATABASE_CLOSED") }
    return database
  }
  public func definition() -> ModuleDefinition {
    Name("MneloVault")
    Events("databaseExpired")
    Function("hasDatabase") { () throws -> Bool in FileManager.default.fileExists(atPath: try MneloSharedVault.folder().appendingPathComponent("history-v1.db").path) }
    AsyncFunction("directory") { () throws -> String in try MneloSharedVault.prepareMain().absoluteString }
    AsyncFunction("publishShareKey") { (key: String) throws in try MneloSharedVault.publishKey(key) }
    AsyncFunction("databaseOpen") { (key: String) throws -> String in
      let id = UUID().uuidString
      let path = try MneloSharedVault.folder().appendingPathComponent("history-v1.db").path
      let database = try MneloDatabase(path: path, key: key, tasks: MneloApplicationDatabaseTasks()) { [weak self] in
        DispatchQueue.main.async { [weak self] in self?.sendEvent("databaseExpired", ["id": id]) }
      }
      self.registryLock.lock(); self.databases[id] = database; self.registryLock.unlock()
      return id
    }.runOnQueue(databaseQueue)
    Function("databaseIsSuspended") { (id: String) -> Bool in
      (try? self.database(id).isSuspended) ?? false
    }
    AsyncFunction("databaseExec") { (id: String, sql: String) throws in
      try self.database(id).exec(sql)
    }.runOnQueue(databaseQueue)
    AsyncFunction("databaseAll") { (id: String, sql: String, parameters: [Any]) throws -> [[String: Any]] in
      try self.database(id).all(sql, parameters)
    }.runOnQueue(databaseQueue)
    AsyncFunction("databaseClose") { (id: String) in
      self.registryLock.lock(); let database = self.databases.removeValue(forKey: id); self.registryLock.unlock()
      database?.close()
    }.runOnQueue(databaseQueue)
    OnDestroy {
      self.registryLock.lock(); let databases = Array(self.databases.values); self.databases.removeAll(); self.registryLock.unlock()
      // Never synchronously wait for a SQL queue from UIKit's main thread.
      self.databaseQueue.async { databases.forEach { $0.close() } }
    }
  }
}
