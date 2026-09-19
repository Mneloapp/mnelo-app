import Foundation
import Intents

// A real SiriKit service, separate from Share Sheet suggestions. Recipient
// resolution is deliberately limited to a recent, authenticated incoming call.
// It never asks Contacts to choose somebody by display name or invokes SMS.
struct MneloIntentRecipient: Codable {
  let account: String
  let peer: String
  let callId: String
  let handle: String
  let displayName: String
  let conversation: String

  static let prefix = "mnelo-call-reply-v1:"
  static func decode(_ value: String?) -> MneloIntentRecipient? {
    guard let value, value.hasPrefix(prefix), value.utf8.count <= 2048,
      let data = Data(base64Encoded: String(value.dropFirst(prefix.count))),
      let recipient = try? JSONDecoder().decode(Self.self, from: data), recipient.valid else { return nil }
    return recipient
  }
  var valid: Bool {
    account.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil &&
      peer.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil &&
      UUID(uuidString: callId) != nil && Self.validPhone(handle) &&
      !conversation.isEmpty && conversation.utf8.count <= 256 &&
      !displayName.isEmpty && displayName.utf8.count <= 640
  }
  static func validPhone(_ value: String) -> Bool {
    value.range(of: "^\\+[1-9][0-9]{7,14}$", options: .regularExpression) != nil
  }
  var token: String {
    Self.prefix + ((try? JSONEncoder().encode(self))?.base64EncodedString() ?? "")
  }
  var fields: [String: Any] {
    ["account": account, "peer": peer, "callId": callId, "handle": handle,
     "displayName": displayName, "conversation": conversation]
  }
  var person: INPerson {
    INPerson(personHandle: INPersonHandle(value: handle, type: .phoneNumber),
             nameComponents: nil, displayName: displayName, image: nil,
             contactIdentifier: nil, customIdentifier: token)
  }
}

protocol MneloMessageIntentRuntime: AnyObject {
  func start(_ operation: String, input: String, completion: @escaping (Result<Any, Error>) -> Void)
  func stop(completion: @escaping () -> Void)
}

final class MneloLiveMessageIntentRuntime: MneloMessageIntentRuntime {
  private let runtime = ShareRuntime()
  func start(_ operation: String, input: String, completion: @escaping (Result<Any, Error>) -> Void) {
    runtime.open(items: [], bundle: "MneloIntents", operation: operation, argument: input,
                 databaseBusyTimeout: 1000, completion: completion)
  }
  func stop(completion: @escaping () -> Void) { runtime.close(completion: completion) }
}

// The timeout never completes the intent while SQLite still owns a transaction.
// stop interrupts outstanding SQL and closes its original connection first.
final class MneloMessageIntentRequest {
  private let runtime: MneloMessageIntentRuntime
  private var deadline: DispatchWorkItem?
  private var finished = false
  init(runtime: MneloMessageIntentRuntime) { self.runtime = runtime }
  func start(operation: String, fields: [String: Any], timeout: TimeInterval,
             completion: @escaping (Result<Any, Error>) -> Void) {
    dispatchPrecondition(condition: .onQueue(.main))
    guard let data = try? JSONSerialization.data(withJSONObject: fields),
      let input = String(data: data, encoding: .utf8) else {
      completion(.failure(NSError(domain: "INTENT_INVALID", code: 1))); return
    }
    let deadline = DispatchWorkItem { [self] in
      finish(.failure(NSError(domain: "INTENT_TIMEOUT", code: 1)), completion: completion)
    }
    self.deadline = deadline
    DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: deadline)
    runtime.start(operation, input: input) { [self] result in
      DispatchQueue.main.async { self.finish(result, completion: completion) }
    }
  }
  private func finish(_ result: Result<Any, Error>, completion: @escaping (Result<Any, Error>) -> Void) {
    guard !finished else { return }
    finished = true
    deadline?.cancel(); deadline = nil
    runtime.stop { completion(result) }
  }
}

open class MneloMessageIntentHandler: INExtension, INSendMessageIntentHandling {
  private let makeRuntime: () -> MneloMessageIntentRuntime
  private let timeout: TimeInterval
  private let selector: MneloCallReplySelector
  public override init() {
    makeRuntime = { MneloLiveMessageIntentRuntime() }; timeout = 12; selector = MneloCallReplySelector()
    super.init()
  }
  init(makeRuntime: @escaping () -> MneloMessageIntentRuntime, timeout: TimeInterval = 12,
       selector: MneloCallReplySelector = MneloCallReplySelector(defaults: nil)) {
    self.makeRuntime = makeRuntime; self.timeout = timeout; self.selector = selector
    super.init()
  }
  open override func handler(for intent: INIntent) -> Any? {
    intent is INSendMessageIntent ? self : nil
  }
  private func request(_ operation: String, fields: [String: Any], completion: @escaping (Result<Any, Error>) -> Void) {
    DispatchQueue.main.async {
      MneloMessageIntentRequest(runtime: self.makeRuntime()).start(
        operation: operation, fields: fields, timeout: self.timeout, completion: completion)
    }
  }
  private func person(_ intent: INSendMessageIntent) -> INPerson? {
    guard let recipients = intent.recipients, recipients.count == 1,
      intent.speakableGroupName == nil, intent.attachments?.isEmpty != false,
      [.unknown, .outgoingMessageText].contains(intent.outgoingMessageType),
      let handle = recipients[0].personHandle, handle.type == .phoneNumber || handle.type == .unknown,
      let value = handle.value, MneloIntentRecipient.validPhone(value) else { return nil }
    return recipients[0]
  }
  private func binding(_ intent: INSendMessageIntent) -> MneloIntentRecipient? {
    guard let person = person(intent), let bound = MneloIntentRecipient.decode(person.customIdentifier),
      bound.handle == person.personHandle?.value else { return nil }
    return bound
  }
  public func resolveRecipients(for intent: INSendMessageIntent,
                                with completion: @escaping ([INSendMessageRecipientResolutionResult]) -> Void) {
    guard let person = person(intent), let handle = person.personHandle?.value else {
      completion([.unsupported()]); return
    }
    var fields: [String: Any] = ["handle": handle]
    if let token = person.customIdentifier, token.hasPrefix(MneloIntentRecipient.prefix) {
      guard let bound = MneloIntentRecipient.decode(token), bound.handle == handle else {
        completion([.unsupported()]); return
      }
      fields = bound.fields
    }
    if let selector = selector.read(handle: handle) { fields["selector"] = selector }
    request("intentResolve", fields: fields) { result in
      guard case .success(let value) = result,
        let data = try? JSONSerialization.data(withJSONObject: value),
        let bound = try? JSONDecoder().decode(MneloIntentRecipient.self, from: data),
        bound.valid, bound.handle == handle else { completion([.unsupported()]); return }
      completion([.success(with: bound.person)])
    }
  }
  public func resolveOutgoingMessageType(for intent: INSendMessageIntent,
                                         with completion: @escaping (INOutgoingMessageTypeResolutionResult) -> Void) {
    // `.unknown` is Apple's documented unspecified format. This extension only
    // supports text; never coerce an explicit audio/attachment request to text.
    completion([.unknown, .outgoingMessageText].contains(intent.outgoingMessageType) && intent.attachments?.isEmpty != false
      ? .success(with: .outgoingMessageText) : .unsupported())
  }
  public func resolveContent(for intent: INSendMessageIntent,
                             with completion: @escaping (INStringResolutionResult) -> Void) {
    guard let content = intent.content, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      content.utf8.count <= 8000 else { completion(.unsupported()); return }
    completion(.success(with: content))
  }
  public func confirm(intent: INSendMessageIntent, completion: @escaping (INSendMessageIntentResponse) -> Void) {
    process(intent, operation: "intentConfirm", completion: completion)
  }
  public func handle(intent: INSendMessageIntent, completion: @escaping (INSendMessageIntentResponse) -> Void) {
    process(intent, operation: "intentSend", completion: completion)
  }
  private func process(_ intent: INSendMessageIntent, operation: String,
                       completion: @escaping (INSendMessageIntentResponse) -> Void) {
    guard let person = person(intent), let handle = person.personHandle?.value,
      let content = intent.content, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      content.utf8.count <= 8000 else {
      completion(INSendMessageIntentResponse(code: .failure, userActivity: nil)); return
    }
    let selected = selector.read(handle: handle)
    if let bound = binding(intent) {
      perform(intent, bound: bound, selected: selected, content: content, operation: operation, completion: completion)
      return
    }
    // CallKit's preset reply may enter confirm/handle without Siri's recipient
    // resolution pass (or without preserving our customIdentifier). Resolve it
    // here against the exact recent call, never by display name or phone alone.
    guard person.customIdentifier?.hasPrefix(MneloIntentRecipient.prefix) != true, let selected else {
      completion(INSendMessageIntentResponse(code: .failure, userActivity: nil)); return
    }
    request("intentResolve", fields: ["handle": handle, "selector": selected]) { result in
      guard case .success(let value) = result,
        let data = try? JSONSerialization.data(withJSONObject: value),
        let bound = try? JSONDecoder().decode(MneloIntentRecipient.self, from: data),
        bound.valid, bound.handle == handle, bound.callId == selected["callId"] as? String else {
        completion(INSendMessageIntentResponse(code: .failureMessageServiceNotAvailable, userActivity: nil)); return
      }
      self.perform(intent, bound: bound, selected: selected, content: content, operation: operation, completion: completion)
    }
  }
  private func perform(_ intent: INSendMessageIntent, bound: MneloIntentRecipient, selected: [String: Any]?, content: String,
                       operation: String, completion: @escaping (INSendMessageIntentResponse) -> Void) {
    var fields = bound.fields
    fields["content"] = content
    if let selected { fields["selector"] = selected }
    if let identifier = intent.identifier, identifier.utf8.count <= 256 { fields["identifier"] = identifier }
    request(operation, fields: fields) { result in
      let code: INSendMessageIntentResponseCode
      switch result {
      case .success(let value):
        if let value = value as? [String: Any], operation == "intentConfirm", value["ready"] as? Bool == true {
          code = .ready
        } else if let value = value as? [String: Any], operation == "intentSend",
          value["committed"] as? Bool == true, value["uploaded"] as? Bool == true {
          code = .success
        } else { code = .failureMessageServiceNotAvailable }
      case .failure(let error):
        code = ["SHARE_OPEN_MNELO_FIRST", "INTENT_OPEN_MNELO_FIRST", "INTENT_ACCOUNT_UNAVAILABLE"].contains((error as NSError).domain)
          ? .failureRequiringAppLaunch : .failureMessageServiceNotAvailable
      }
      completion(INSendMessageIntentResponse(code: code, userActivity: nil))
    }
  }
}
