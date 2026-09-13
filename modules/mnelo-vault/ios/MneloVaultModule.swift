import ExpoModulesCore

public class MneloVaultModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MneloVault")
    AsyncFunction("directory") { () throws -> String in
      let manager = FileManager.default
      var folder = try manager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("MneloPrivate", isDirectory: true)
      try manager.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
      // Existing vault files inherit their old protection until explicitly migrated.
      try manager.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: folder.path)
      for file in try manager.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) {
        try manager.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: file.path)
      }
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try folder.setResourceValues(values)
      guard try folder.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true else {
        throw NSError(domain: "MneloVault", code: 1)
      }
      return folder.absoluteString
    }
  }
}
