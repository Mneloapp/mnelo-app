import Foundation

@main struct IncomingFileProbe {
  static func main() throws {
    let manager = FileManager.default
    let root = manager.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? manager.removeItem(at: root) }
    let inbox = root.appendingPathComponent("MneloIncoming")
    try manager.createDirectory(at: inbox, withIntermediateDirectories: true)
    let photo = inbox.appendingPathComponent("photo with spaces.png")
    try Data([1, 2, 3]).write(to: photo)
    let outside = root.appendingPathComponent("private.db")
    try Data([4]).write(to: outside)
    let alias = root.appendingPathComponent("alias")
    try manager.createSymbolicLink(at: alias, withDestinationURL: inbox)
    let escape = inbox.appendingPathComponent("escape")
    try manager.createSymbolicLink(at: escape, withDestinationURL: outside)
    precondition(MneloIncomingFile.resolve(photo.absoluteString, inbox: inbox) != nil)
    precondition(MneloIncomingFile.resolve(alias.appendingPathComponent(photo.lastPathComponent).absoluteString, inbox: inbox) != nil)
    precondition(MneloIncomingFile.resolve(outside.absoluteString, inbox: inbox) == nil)
    precondition(MneloIncomingFile.resolve(escape.absoluteString, inbox: inbox) == nil)
    precondition(MneloIncomingFile.resolve(inbox.absoluteString, inbox: inbox) == nil)
    precondition(MneloIncomingFile.resolve("https://example.com/photo.png", inbox: inbox) == nil)
    precondition(MneloIncomingFile.resolve(inbox.appendingPathComponent("../private.db").absoluteString, inbox: inbox) == nil)
    let cache = root.appendingPathComponent("cache")
    let claimed = try MneloIncomingFile.claim([photo.absoluteString], inbox: inbox, cache: cache)
    let local = URL(string: claimed[photo.absoluteString]!)!
    let content = try Data(contentsOf: local)
    precondition(content == Data([1, 2, 3]))
    let repeated = try MneloIncomingFile.claim([photo.absoluteString], inbox: inbox, cache: cache)
    precondition(repeated == claimed)
    MneloIncomingFile.discard([photo.absoluteString], inbox: inbox, cache: cache)
    precondition(!manager.fileExists(atPath: local.path))
    precondition(!manager.fileExists(atPath: photo.path))
    precondition(manager.fileExists(atPath: outside.path))
    do {
      _ = try MneloIncomingFile.claim([outside.absoluteString], inbox: inbox, cache: cache)
      preconditionFailure("Escaping file was imported")
    } catch {}
    precondition(!manager.fileExists(atPath: MneloIncomingFile.batch([outside.absoluteString], cache: cache).path))
    print("PASS: canonical owned files, aliases, escaped links, traversal, directories and remote URLs")
  }
}
