import ExpoModulesCore

public class MneloVaultModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MneloVault")
    Function("hasDatabase") { () throws -> Bool in FileManager.default.fileExists(atPath: try MneloSharedVault.folder().appendingPathComponent("history-v1.db").path) }
    AsyncFunction("directory") { () throws -> String in try MneloSharedVault.prepareMain().absoluteString }
    AsyncFunction("publishShareKey") { (key: String) throws in try MneloSharedVault.publishKey(key) }
  }
}
