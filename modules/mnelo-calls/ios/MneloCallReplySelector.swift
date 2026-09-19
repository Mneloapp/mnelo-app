import Foundation

// This is only a short-lived routing selector for Apple's separate Intents
// process. Push metadata is NOT proof: the encrypted runtime must authenticate
// the exact call and match both account and sender before it can send a reply.
final class MneloCallReplySelector {
  private let defaults: UserDefaults?
  private let now: () -> TimeInterval
  private let key = "MneloIncomingReplySelectorV1"
  private let accountKey = "MneloIncomingReplyAccountV1"
  init(defaults: UserDefaults? = UserDefaults(suiteName: "group.com.mnelo.messenger.sharing"),
       now: @escaping () -> TimeInterval = { Date().timeIntervalSince1970 }) {
    self.defaults = defaults; self.now = now
  }
  func configureAccount(_ account: String?) {
    if defaults?.string(forKey: accountKey) != account { defaults?.removeObject(forKey: key) }
    if let account { defaults?.set(account, forKey: accountKey) }
    else { defaults?.removeObject(forKey: accountKey) }
  }
  func begin(_ id: UUID, account: String?, callerHint: String?, handle: String) {
    defaults?.removeObject(forKey: key)
    guard let account, Self.hash(account), let callerHint, Self.hash(callerHint) else { return }
    defaults?.set(["callId": id.uuidString.lowercased(), "accountHint": account,
                   "callerHint": callerHint, "handle": Self.phone(handle) ? handle : "",
                   "receivedAt": now() * 1000, "expires": now() + 65, "phase": "ringing"], forKey: key)
  }
  func identify(_ id: UUID, handle: String) {
    guard Self.phone(handle), var value = current(), value["callId"] as? String == id.uuidString.lowercased(),
      value["phase"] as? String == "ringing" else { return }
    value["handle"] = handle; defaults?.set(value, forKey: key)
  }
  func end(_ id: UUID, declined: Bool = false) {
    guard var value = current(), value["callId"] as? String == id.uuidString.lowercased() else { return }
    if declined {
      value["phase"] = "declined"; value["expires"] = now() + 120
      defaults?.set(value, forKey: key)
    } else { defaults?.removeObject(forKey: key) }
  }
  func finish(_ id: UUID) {
    guard let value = current(), value["callId"] as? String == id.uuidString.lowercased(),
      value["phase"] as? String != "declined" else { return }
    defaults?.removeObject(forKey: key)
  }
  func clear() { defaults?.removeObject(forKey: key) }
  func read(handle: String) -> [String: Any]? {
    guard Self.phone(handle), let value = current(), value["handle"] as? String == handle else { return nil }
    return value.filter { ["callId", "accountHint", "callerHint", "handle", "receivedAt"].contains($0.key) }
  }
  private func current() -> [String: Any]? {
    guard let value = defaults?.dictionary(forKey: key), let expires = value["expires"] as? Double,
      let receivedAt = value["receivedAt"] as? Double,
      receivedAt <= now() * 1000 + 1000, receivedAt >= (now() - 185) * 1000,
      expires > now(), expires <= now() + 120,
      let account = value["accountHint"] as? String, Self.hash(account),
      account == defaults?.string(forKey: accountKey),
      let caller = value["callerHint"] as? String, Self.hash(caller),
      (value["callId"] as? String).flatMap(UUID.init(uuidString:)) != nil,
      ["ringing", "declined"].contains(value["phase"] as? String ?? "") else {
      defaults?.removeObject(forKey: key); return nil
    }
    return value
  }
  private static func hash(_ value: String) -> Bool { value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil }
  private static func phone(_ value: String) -> Bool { value.range(of: "^\\+[1-9][0-9]{7,14}$", options: .regularExpression) != nil }
}
