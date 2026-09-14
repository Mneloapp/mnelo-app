import Foundation
import UIKit
import UniformTypeIdentifiers
import ImageIO

struct ShareAttachment: Identifiable {
  let id = UUID()
  let name: String
  let kind: String
  let mime: String
  let file: URL?
  let text: String?
  let thumbnail: UIImage?
  func payload() throws -> [String: Any] {
    if let text { return ["kind": "text", "text": text] }
    guard let file, let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize,
      size > 0, size <= 10 * 1024 * 1024 else { throw shareError("SHARE_FILE_UNAVAILABLE") }
    let bytes = try Data(contentsOf: file, options: .mappedIfSafe)
    return ["kind": kind, "media": ["name": name, "mime": mime, "duration": NSNull(), "bytes": bytes.base64EncodedString()]]
  }
}

final class ShareAttachments {
  private let queue = DispatchQueue(label: "com.mnelo.share.attachments")
  private let folder = FileManager.default.temporaryDirectory.appendingPathComponent("MneloShare-" + UUID().uuidString, isDirectory: true)
  private let lock = NSLock()
  private var cancelled = false
  private var progress: Progress?
  func cancel() {
    lock.lock(); cancelled = true; progress?.cancel(); lock.unlock()
    queue.async { try? FileManager.default.removeItem(at: self.folder) }
  }
  private func active() throws { lock.lock(); defer { lock.unlock() }; if cancelled { throw shareError("SHARE_CANCELLED") } }
  private func requireSpace(for bytes: Int) throws {
    let values = try folder.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
    // Reserve room for the protected copy, image conversion and encrypted outbox.
    // Capacity stays on-device and only determines whether this write can proceed.
    if let available = values.volumeAvailableCapacityForImportantUsage, available < Int64(bytes) * 4 + 16 * 1024 * 1024 {
      throw shareError("SHARE_STORAGE_FULL")
    }
  }
  func load(_ providers: [NSItemProvider], completion: @escaping (Result<[ShareAttachment], Error>) -> Void) {
    guard (1...10).contains(providers.count) else { completion(.failure(shareError("SHARE_TOO_MANY"))); return }
    queue.async {
      do {
        try self.active()
        let temporary = FileManager.default.temporaryDirectory
        for old in (try? FileManager.default.contentsOfDirectory(at: temporary, includingPropertiesForKeys: [.creationDateKey])) ?? [] {
          if old.lastPathComponent.hasPrefix("MneloShare-"), let created = try? old.resourceValues(forKeys: [.creationDateKey]).creationDate, created < Date().addingTimeInterval(-86400) { try? FileManager.default.removeItem(at: old) }
        }
        try FileManager.default.createDirectory(at: self.folder, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        var folder = self.folder, values = URLResourceValues(); values.isExcludedFromBackup = true
        try folder.setResourceValues(values)
        self.next(providers, 0, [], completion)
      } catch { DispatchQueue.main.async { completion(.failure(error)) } }
    }
  }
  private func next(_ providers: [NSItemProvider], _ index: Int, _ items: [ShareAttachment], _ completion: @escaping (Result<[ShareAttachment], Error>) -> Void) {
    do { try active() } catch { return }
    guard index < providers.count else { DispatchQueue.main.async { completion(.success(items)) }; return }
    let provider = providers[index]
    let done: (Result<ShareAttachment, Error>) -> Void = { result in
      self.queue.async {
        do {
          try self.active()
          self.next(providers, index + 1, items + [try result.get()], completion)
        } catch { DispatchQueue.main.async { completion(.failure(error)) } }
      }
    }
    let types = provider.registeredTypeIdentifiers.compactMap { UTType($0) }
    if let type = types.first(where: { $0.conforms(to: .image) }) {
      loadFile(provider, type: type, image: true, index: index, done: done)
    } else if let type = types.first(where: { $0.conforms(to: .movie) || $0.conforms(to: .audio) || ($0.conforms(to: .data) && !$0.conforms(to: .text) && !$0.conforms(to: .url)) }) {
      loadFile(provider, type: type, image: false, index: index, done: done)
    } else if let type = types.first(where: { $0.conforms(to: .url) || $0.conforms(to: .plainText) }) {
      provider.loadItem(forTypeIdentifier: type.identifier, options: nil) { value, _ in
        guard let text = (value as? URL)?.absoluteString ?? (value as? String), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.utf16.count <= 8000 else { done(.failure(shareError("SHARE_INVALID"))); return }
        done(.success(ShareAttachment(name: text, kind: "text", mime: "text/plain", file: nil, text: text, thumbnail: nil)))
      }
    } else { done(.failure(shareError("SHARE_INVALID"))) }
  }
  private func loadFile(_ provider: NSItemProvider, type: UTType, image: Bool, index: Int, done: @escaping (Result<ShareAttachment, Error>) -> Void) {
    let task = provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, _ in
      if let url {
        // The provider deletes its temporary file when this callback returns.
        // Own the bytes synchronously here, before scheduling preview/decode work.
        do {
          try self.active()
          let scoped = url.startAccessingSecurityScopedResource()
          defer { if scoped { url.stopAccessingSecurityScopedResource() } }
          let attributes = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
          guard attributes.isRegularFile == true, let size = attributes.fileSize,
            size > 0, size <= (image ? 50 : 10) * 1024 * 1024 else { throw shareError("SHARE_FILE_TOO_LARGE") }
          let copy = self.folder.appendingPathComponent("\(index)-source")
          try self.requireSpace(for: size)
          try FileManager.default.copyItem(at: url, to: copy)
          try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: copy.path)
          let name = provider.suggestedName ?? url.lastPathComponent
          self.finish(copy, name: name, type: type, image: image, index: index, done: done)
        } catch { done(.failure(error)) }
      } else {
        do { try self.active() } catch { return }
        let fallback = provider.loadDataRepresentation(forTypeIdentifier: type.identifier) { data, _ in
          do {
            try self.active()
            guard let data, !data.isEmpty else { throw shareError("SHARE_FILE_UNAVAILABLE") }
            guard data.count <= (image ? 50 : 10) * 1024 * 1024 else { throw shareError("SHARE_FILE_TOO_LARGE") }
            let copy = self.folder.appendingPathComponent("\(index)-source")
            try self.requireSpace(for: data.count)
            try data.write(to: copy, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            self.finish(copy, name: provider.suggestedName ?? "File", type: type, image: image, index: index, done: done)
          } catch { done(.failure(error)) }
        }
        self.lock.lock(); self.progress = fallback; if self.cancelled { fallback.cancel() }; self.lock.unlock()
      }
    }
    lock.lock(); progress = task; if cancelled { task.cancel() }; lock.unlock()
  }
  private func finish(_ source: URL, name: String, type: UTType, image: Bool, index: Int, done: @escaping (Result<ShareAttachment, Error>) -> Void) {
    queue.async {
      do {
        try self.active()
        let cleaned = String((name as NSString).lastPathComponent.unicodeScalars.map { CharacterSet.controlCharacters.contains($0) ? "_" : String($0) }.joined().suffix(160))
        if image {
          let item = try autoreleasepool { () throws -> ShareAttachment in
            guard let input = CGImageSourceCreateWithURL(source as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
              let cg = CGImageSourceCreateThumbnailAtIndex(input, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 1600, kCGImageSourceShouldCacheImmediately: true] as CFDictionary),
              let data = UIImage(cgImage: cg).jpegData(compressionQuality: 0.8) else { throw shareError("SHARE_FILE_UNAVAILABLE") }
            let file = self.folder.appendingPathComponent("\(index)-photo.jpg")
            try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            let thumbnail = CGImageSourceCreateThumbnailAtIndex(input, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 180] as CFDictionary).map { UIImage(cgImage: $0) }
            try FileManager.default.removeItem(at: source)
            let label = (cleaned as NSString).deletingPathExtension
            return ShareAttachment(name: (label.isEmpty ? "Photo" : label) + ".jpg", kind: "image", mime: "image/jpeg", file: file, text: nil, thumbnail: thumbnail)
          }
          done(.success(item))
        } else { done(.success(ShareAttachment(name: cleaned.isEmpty ? "File" : cleaned, kind: "file", mime: type.preferredMIMEType ?? "application/octet-stream", file: source, text: nil, thumbnail: nil))) }
      } catch { done(.failure(error)) }
    }
  }
}
