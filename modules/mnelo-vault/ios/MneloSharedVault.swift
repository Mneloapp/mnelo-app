import Foundation
import Security

public enum MneloSharedVault {
  public static let group = "group.com.mnelo.messenger.sharing"
  public static func folder() throws -> URL {
    guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { throw failure() }
    return container.appendingPathComponent("MneloPrivate", isDirectory: true)
  }
  public static func prepareMain() throws -> URL {
    let manager = FileManager.default
    var destination = try folder()
    let old = try manager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("MneloPrivate", isDirectory: true)
    if !manager.fileExists(atPath: destination.path) {
      if manager.fileExists(atPath: old.path) {
        // Move the entire encrypted vault and its journal together, before opening
        // a connection. Failed moves leave the original in place; never replace it.
        try manager.moveItem(at: old, to: destination)
      } else { try manager.createDirectory(at: destination, withIntermediateDirectories: true) }
    } else if manager.fileExists(atPath: old.appendingPathComponent("history-v1.db").path) {
      throw NSError(domain: "VAULT_MIGRATION_CONFLICT", code: 1)
    }
    try manager.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: destination.path)
    for file in try manager.contentsOfDirectory(at: destination, includingPropertiesForKeys: nil) {
      try manager.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: file.path)
    }
    var values = URLResourceValues(); values.isExcludedFromBackup = true
    try destination.setResourceValues(values)
    guard try destination.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true else { throw failure() }
    return destination
  }
  private static func query() throws -> [String: Any] {
    guard let access = Bundle.main.object(forInfoDictionaryKey: "MneloKeychainAccessGroup") as? String,
      !access.contains("$("), access.hasSuffix(".com.mnelo.messenger.shared") else { throw failure() }
    return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.mnelo.share.vault", kSecAttrAccount as String: "database-v1", kSecAttrAccessGroup as String: access]
  }
  public static func publishKey(_ key: String) throws {
    guard key.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw failure() }
    let query = try query()
    let values: [String: Any] = [kSecValueData as String: Data(key.utf8), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
    let status = SecItemUpdate(query as CFDictionary, values as CFDictionary)
    if status == errSecItemNotFound {
      guard SecItemAdd(query.merging(values) { _, new in new } as CFDictionary, nil) == errSecSuccess else { throw failure() }
    } else if status != errSecSuccess { throw failure() }
  }
  public static func key() throws -> String {
    var query = try query(); query[kSecReturnData as String] = true
    var value: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &value) == errSecSuccess,
      let data = value as? Data, let key = String(data: data, encoding: .utf8),
      key.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw failure() }
    return key
  }
  private static func failure() -> NSError { NSError(domain: "SHARE_OPEN_MNELO_FIRST", code: 1) }
}
