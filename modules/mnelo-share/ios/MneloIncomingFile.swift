import Foundation
import CryptoKit

// Resolve the real filesystem location, including iOS's /var -> /private/var
// alias, before checking ownership. Never accept a sibling or an escaping symlink.
enum MneloIncomingFile {
  static func batch(_ values: [String], cache: URL) -> URL {
    let digest = SHA256.hash(data: Data(values.joined(separator: "\n").utf8)).map { String(format: "%02x", $0) }.joined()
    return cache.appendingPathComponent("MneloIncomingCache", isDirectory: true).appendingPathComponent(digest, isDirectory: true)
  }

  // Expo's File API can reject an otherwise readable app-group URL. Import a
  // protected copy into the app's own cache before any JS file/image API reads it.
  static func claim(_ values: [String], inbox: URL, cache: URL) throws -> [String: String] {
    guard values.count <= 10 else { throw NSError(domain: "SHARE_TOO_MANY", code: 1) }
    guard !values.isEmpty else { return [:] }
    let manager = FileManager.default, folder = batch(values, cache: cache)
    try manager.createDirectory(at: folder, withIntermediateDirectories: true)
    var complete = false
    defer { if !complete { try? manager.removeItem(at: folder) } }
    var result: [String: String] = [:]
    for (index, value) in values.enumerated() {
      guard let source = resolve(value, inbox: inbox),
        let size = try source.resourceValues(forKeys: [.fileSizeKey]).fileSize,
        size > 0, size <= 50 * 1024 * 1024 else { throw NSError(domain: "SHARE_FILE_UNAVAILABLE", code: 1) }
      let destination = folder.appendingPathComponent("\(index)-\(source.lastPathComponent)")
      if !manager.fileExists(atPath: destination.path) {
        try manager.copyItem(at: source, to: destination)
      }
      #if os(iOS)
      try manager.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: destination.path)
      #endif
      result[value] = destination.absoluteString
    }
    complete = true
    return result
  }

  static func discard(_ values: [String], inbox: URL, cache: URL) {
    for value in values {
      if let source = resolve(value, inbox: inbox) { try? FileManager.default.removeItem(at: source) }
    }
    try? FileManager.default.removeItem(at: batch(values, cache: cache))
  }

  static func resolve(_ value: String, inbox: URL) -> URL? {
    guard let url = URL(string: value), url.isFileURL,
      url.host == nil || url.host == "" || url.host == "localhost" else { return nil }
    let root = inbox.resolvingSymlinksInPath().standardizedFileURL
    let file = url.resolvingSymlinksInPath().standardizedFileURL
    guard file.path.hasPrefix(root.path + "/"),
      let values = try? file.resourceValues(forKeys: [.isRegularFileKey]),
      values.isRegularFile == true else { return nil }
    return file
  }
}
