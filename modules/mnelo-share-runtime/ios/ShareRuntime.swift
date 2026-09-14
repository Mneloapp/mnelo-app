import Foundation
import JavaScriptCore
import Security

final class ShareRuntime {
  private let queue = DispatchQueue(label: "com.mnelo.share.engine")
  private var context: JSContext?
  private var database: ShareDatabase?
  private var items: [ShareAttachment] = []
  private var pending: [String: (Result<Any, Error>) -> Void] = [:]
  private var timers: [Int: DispatchWorkItem] = [:]
  private var requests: [Int: ShareNetwork] = [:]
  private var sequence = 0
  private var stopped = false
  func open(items: [ShareAttachment], completion: @escaping (Result<Any, Error>) -> Void) {
    queue.async {
      do {
        guard !self.stopped else { return }
        self.items = items
        self.database = try ShareDatabase()
        guard let context = JSContext(), let url = Bundle.main.url(forResource: "MneloShare", withExtension: "js") else { throw shareError("SHARE_FAILED") }
        self.context = context
        let bridge: @convention(block) (String, String) -> String = { [weak self] operation, text in
          autoreleasepool {
            do { return shareJSON(["value": try self?.native(operation, text) ?? NSNull()]) }
            catch { return shareJSON(["error": (error as NSError).domain]) }
          }
        }
        context.setObject(bridge, forKeyedSubscript: "__native" as NSString)
        let contactNames: @convention(block) (String, JSValue) -> String = { text, normalize in
          guard let numbers = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String] else { return "[]" }
          return shareJSON(SharePhonebook.names(numbers) { raw in
            normalize.call(withArguments: [raw])?.toString() ?? ""
          })
        }
        context.setObject(contactNames, forKeyedSubscript: "__contactNames" as NSString)
        let result: @convention(block) (String, String) -> Void = { [weak self] id, text in
          guard let self, let callback = self.pending.removeValue(forKey: id), let value = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else { return }
          let outcome: Result<Any, Error> = (value["error"] as? String).map { .failure(shareError($0)) } ?? .success(value["value"] ?? NSNull())
          DispatchQueue.main.async { callback(outcome) }
        }
        context.setObject(result, forKeyedSubscript: "__result" as NSString)
        let timer: @convention(block) (JSValue, Double) -> Int = { [weak self] callback, delay in
          guard let self else { return 0 }; self.sequence += 1; let id = self.sequence
          let work = DispatchWorkItem { [weak self] in
            guard let self, !self.stopped else { return }
            self.timers.removeValue(forKey: id); callback.call(withArguments: [])
          }
          self.timers[id] = work
          self.queue.asyncAfter(deadline: .now() + min(max(delay, 0), 60000) / 1000, execute: work)
          return id
        }
        let clear: @convention(block) (Int) -> Void = { [weak self] id in self?.timers.removeValue(forKey: id)?.cancel() }
        context.setObject(timer, forKeyedSubscript: "__timer" as NSString)
        context.setObject(clear, forKeyedSubscript: "__clearTimer" as NSString)
        let request: @convention(block) (String, String, JSValue) -> Int = { [weak self] address, body, callback in
          guard let self else { return 0 }; self.sequence += 1; let id = self.sequence
          guard let origin = Bundle.main.object(forInfoDictionaryKey: "MneloDeliveryOrigin") as? String,
            let url = URL(string: address), ["/challenge", "/delivery", "/execute"].contains(url.path),
            address == origin + url.path, url.scheme == "https", body.utf8.count <= 3_000_000 else {
            self.queue.async { callback.call(withArguments: [shareJSON(["error": "PHONE_REQUEST_FAILED"])]) }; return id
          }
          self.requests[id] = ShareNetwork(url: url, body: body) { [weak self] result in
            self?.queue.async { [weak self] in
              guard let self, !self.stopped else { return }
              self.requests.removeValue(forKey: id); callback.call(withArguments: [result])
            }
          }
          return id
        }
        let cancel: @convention(block) (Int) -> Void = { [weak self] id in self?.requests[id]?.cancel() }
        context.setObject(request, forKeyedSubscript: "__request" as NSString)
        context.setObject(cancel, forKeyedSubscript: "__cancelRequest" as NSString)
        context.evaluateScript(try String(contentsOf: url, encoding: .utf8))
        guard context.exception == nil, context.objectForKeyedSubscript("MneloShare")?.isUndefined == false else { throw shareError("SHARE_FAILED") }
        self.invoke("open", "", completion)
      } catch { DispatchQueue.main.async { completion(.failure(error)) } }
    }
  }
  func send(_ chat: String, completion: @escaping (Result<Any, Error>) -> Void) { queue.async { self.invoke("send", chat, completion) } }
  private func invoke(_ operation: String, _ argument: String, _ completion: @escaping (Result<Any, Error>) -> Void) {
    guard !stopped, let context else { return }
    let id = UUID().uuidString
    pending[id] = completion
    context.objectForKeyedSubscript("MneloShare")?.call(withArguments: [id, operation, argument])
    if context.exception != nil { pending.removeValue(forKey: id); context.exception = nil; DispatchQueue.main.async { completion(.failure(shareError("SHARE_FAILED"))) } }
  }
  func close() {
    queue.async {
      self.stopped = true
      self.timers.values.forEach { $0.cancel() }; self.timers.removeAll()
      self.requests.values.forEach { $0.cancel() }; self.requests.removeAll()
      self.pending.removeAll(); self.database?.close(); self.database = nil
      self.context = nil; self.items.removeAll()
    }
  }
  private func native(_ operation: String, _ text: String) throws -> Any {
    let input = try JSONSerialization.jsonObject(with: Data(text.utf8), options: [.fragmentsAllowed])
    let fields = input as? [String: Any] ?? [:]
    switch operation {
    case "exec", "run", "all":
      guard let database, let sql = fields["sql"] as? String else { throw shareError("SHARE_DATABASE_INVALID") }
      if operation == "exec" { try database.exec(sql); return NSNull() }
      let rows = try database.all(sql, fields["params"] as? [Any] ?? [])
      return operation == "all" ? shareJSON(rows) : NSNull()
    case "close": database?.close(); database = nil; return NSNull()
    case "count": return items.count
    case "item":
      guard let index = input as? Int, items.indices.contains(index) else { throw shareError("SHARE_FILE_UNAVAILABLE") }
      return try items[index].payload()
    case "signal": guard let encoded = input as? String else { throw shareError("SIGNAL_OPERATION_FAILED") }; return try MneloSignalCore.run(encoded)
    case "uuid": return UUID().uuidString.lowercased()
    case "random":
      guard let count = input as? Int, (1...65536).contains(count) else { throw shareError("SHARE_FAILED") }
      var bytes = [UInt8](repeating: 0, count: count)
      guard SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess else { throw shareError("SHARE_FAILED") }; return bytes
    case "utf8Encode": return Array((input as? String ?? "").utf8)
    case "utf8Decode":
      let bytes = fields["bytes"] as? [UInt8] ?? []
      if fields["fatal"] as? Bool == true { guard let value = String(bytes: bytes, encoding: .utf8) else { throw shareError("SHARE_INVALID_UTF8") }; return value }
      return String(decoding: bytes, as: UTF8.self)
    case "btoa":
      guard let value = input as? String, value.utf16.allSatisfy({ $0 <= 255 }) else { throw shareError("SHARE_INVALID_BASE64") }
      return Data(value.utf16.map { UInt8($0) }).base64EncodedString()
    case "atob":
      guard let value = input as? String, let data = Data(base64Encoded: value) else { throw shareError("SHARE_INVALID_BASE64") }
      return String(utf16CodeUnits: data.map { UInt16($0) }, count: data.count)
    case "url":
      guard let text = input as? String, let url = URLComponents(string: text), let scheme = url.scheme else { throw shareError("SHARE_INVALID_URL") }
      let host = url.host ?? "", authority = host + (url.port.map { ":\($0)" } ?? "")
      return ["href": url.string ?? text, "protocol": scheme + ":", "hostname": host, "host": authority, "origin": scheme + "://" + authority, "pathname": url.path.isEmpty ? "/" : url.path, "username": url.user ?? "", "password": url.password ?? "", "search": url.percentEncodedQuery.map { "?" + $0 } ?? "", "hash": url.percentEncodedFragment.map { "#" + $0 } ?? ""]
    default: throw shareError("SHARE_FAILED")
    }
  }
}
