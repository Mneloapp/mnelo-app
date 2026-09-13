import Foundation

// Resolve the real filesystem location, including iOS's /var -> /private/var
// alias, before checking ownership. Never accept a sibling or an escaping symlink.
enum MneloIncomingFile {
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
