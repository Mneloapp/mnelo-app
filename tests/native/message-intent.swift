import Foundation
import Intents

// Executable tests use Apple's real INSendMessageIntent/INPerson types. Only the
// encrypted runtime is replaced; its account/call/outbox rules have SQLite tests.
final class IntentProbeRuntime: MneloMessageIntentRuntime {
  var operations: [(String, [String: Any])] = []
  var outcome: Result<Any, Error>?
  var stopped = false
  var stopCompleted = false
  var callback: ((Result<Any, Error>) -> Void)?
  func start(_ operation: String, input: String, completion: @escaping (Result<Any, Error>) -> Void) {
    operations.append((operation, try! JSONSerialization.jsonObject(with: Data(input.utf8)) as! [String: Any]))
    callback = completion
    if let outcome { completion(outcome) }
  }
  func stop(completion: @escaping () -> Void) {
    stopped = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.005) {
      self.stopCompleted = true; completion()
    }
  }
}

func settle(_ condition: () -> Bool, deadline: TimeInterval = 1) {
  let end = Date().addingTimeInterval(deadline)
  while !condition() && Date() < end { RunLoop.main.run(until: Date().addingTimeInterval(0.002)) }
  precondition(condition(), "Intent callback did not complete")
}

func intent(_ person: INPerson, content: String = "I will call you back.") -> INSendMessageIntent {
  INSendMessageIntent(recipients: [person], outgoingMessageType: .outgoingMessageText,
                      content: content, speakableGroupName: nil, conversationIdentifier: nil,
                      serviceName: nil, sender: nil, attachments: nil)
}

@main struct MessageIntentProbe {
  static func main() throws {
    let recipient = MneloIntentRecipient(account: String(repeating: "a", count: 64),
      peer: String(repeating: "b", count: 64), callId: "a07bbde7-a39c-43ad-985d-cfbd48b1e232",
      handle: "+12025550123", displayName: "Fixture Caller", conversation: "fixture-direct")
    precondition(MneloIntentRecipient.decode(recipient.token)?.account == recipient.account)
    precondition(MneloIntentRecipient.decode("mnelo-call-reply-v1:not-base64") == nil)
    let sourcePerson = INPerson(personHandle: INPersonHandle(value: recipient.handle, type: .phoneNumber),
      nameComponents: nil, displayName: "Untrusted display", image: nil, contactIdentifier: nil, customIdentifier: nil)
    let resolving = IntentProbeRuntime(); resolving.outcome = .success(recipient.fields)
    let resolver = MneloMessageIntentHandler(makeRuntime: { resolving })
    var resolved = false
    resolver.resolveRecipients(for: intent(sourcePerson)) { result in
      precondition(resolving.stopCompleted && result.count == 1)
      resolved = true
    }
    settle { resolved }
    precondition(resolving.operations.count == 1 && resolving.operations[0].0 == "intentResolve")
    precondition(resolving.operations[0].1["handle"] as? String == recipient.handle)
    precondition(resolving.operations[0].1["displayName"] == nil)
    print("PASS intent resolution: canonical recipient only; user-visible names never route messages")

    let invalid = INPerson(personHandle: INPersonHandle(value: "Fixture Caller", type: .unknown),
      nameComponents: nil, displayName: "Fixture Caller", image: nil, contactIdentifier: nil, customIdentifier: nil)
    var invalidDone = false
    resolver.resolveRecipients(for: intent(invalid)) { _ in invalidDone = true }
    precondition(invalidDone && resolving.operations.count == 1)
    var unbound: INSendMessageIntentResponseCode?
    resolver.handle(intent: intent(sourcePerson)) { unbound = $0.code }
    precondition(unbound == .failure && resolving.operations.count == 1)
    let mismatched = INPerson(personHandle: INPersonHandle(value: "+12025550124", type: .phoneNumber),
      nameComponents: nil, displayName: "Fixture Caller", image: nil, contactIdentifier: nil, customIdentifier: recipient.token)
    resolver.handle(intent: intent(mismatched)) { unbound = $0.code }
    precondition(unbound == .failure && resolving.operations.count == 1)
    print("PASS intent routing guard: missing proof, generic names and changed handles cannot send")

    let applePerson = INPerson(personHandle: INPersonHandle(value: recipient.handle, type: .unknown),
      nameComponents: nil, displayName: "Other name", image: nil, contactIdentifier: "system-contact",
      customIdentifier: "system-owned-identifier")
    let unspecified = INSendMessageIntent(recipients: [applePerson], outgoingMessageType: .unknown,
      content: "Call back later", speakableGroupName: nil, conversationIdentifier: nil,
      serviceName: nil, sender: nil, attachments: nil)
    resolved = false
    resolver.resolveRecipients(for: unspecified) { _ in resolved = true }
    settle { resolved }
    precondition(resolving.operations.count == 2 && resolving.operations[1].1["handle"] as? String == recipient.handle)
    precondition(resolving.operations[1].1["account"] == nil)
    print("PASS system compatibility: unrelated custom IDs and unspecified text format still require authenticated resolution")

    for uploaded in [false, true] {
      let sending = IntentProbeRuntime()
      sending.outcome = .success(["committed": true, "uploaded": uploaded])
      let handler = MneloMessageIntentHandler(makeRuntime: { sending })
      var code: INSendMessageIntentResponseCode?
      handler.handle(intent: intent(recipient.person)) { response in
        precondition(sending.stopCompleted); code = response.code
      }
      settle { code != nil }
      precondition(code == (uploaded ? .success : .failureMessageServiceNotAvailable))
      let fields = sending.operations[0].1
      precondition(fields["account"] as? String == recipient.account && fields["peer"] as? String == recipient.peer)
      precondition(fields["callId"] as? String == recipient.callId && fields["handle"] as? String == recipient.handle)
    }
    print("PASS intent completion: account/call binding preserved and success requires durable upload after database close")

    let waiting = IntentProbeRuntime()
    let timeout = MneloMessageIntentHandler(makeRuntime: { waiting }, timeout: 0.015)
    var count = 0
    timeout.handle(intent: intent(recipient.person)) { response in
      precondition(waiting.stopCompleted && response.code == .failureMessageServiceNotAvailable)
      count += 1
    }
    settle { count == 1 }
    waiting.callback?(.success(["committed": true, "uploaded": true]))
    RunLoop.main.run(until: Date().addingTimeInterval(0.02))
    precondition(count == 1)
    print("PASS intent deadline: close finishes first and late encrypted runtime callbacks never double-complete")

    let confirming = IntentProbeRuntime(); confirming.outcome = .success(["ready": true])
    let confirmer = MneloMessageIntentHandler(makeRuntime: { confirming })
    var confirmed: INSendMessageIntentResponseCode?
    confirmer.confirm(intent: intent(recipient.person)) { confirmed = $0.code }
    settle { confirmed != nil }
    precondition(confirmed == .ready && confirming.operations[0].0 == "intentConfirm")
    confirmer.handle(intent: intent(recipient.person, content: String(repeating: "a", count: 8001))) { confirmed = $0.code }
    precondition(confirmed == .failure && confirming.operations.count == 1)
    print("PASS intent validation: confirm is separate from send; oversized message cannot reach runtime")

    let suite = "com.mnelo.intent-probe." + UUID().uuidString
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    var now: TimeInterval = 1000
    let selector = MneloCallReplySelector(defaults: defaults, now: { now })
    let call = UUID(uuidString: recipient.callId)!
    selector.configureAccount(recipient.account)
    selector.begin(call, account: recipient.account, callerHint: recipient.peer, handle: recipient.handle)
    precondition(selector.read(handle: "+12025550124") == nil)
    let selected = selector.read(handle: recipient.handle)!
    precondition(Set(selected.keys) == Set(["callId", "accountHint", "callerHint", "handle", "receivedAt"]))
    selector.end(call, declined: true); selector.finish(call)
    precondition(selector.read(handle: recipient.handle) != nil)
    let directResolve = IntentProbeRuntime(); directResolve.outcome = .success(recipient.fields)
    let directSend = IntentProbeRuntime(); directSend.outcome = .success(["committed": true, "uploaded": true])
    var directRuntimes = [directResolve, directSend]
    let quickReply = MneloMessageIntentHandler(makeRuntime: { directRuntimes.removeFirst() }, selector: selector)
    var quickCode: INSendMessageIntentResponseCode?
    quickReply.handle(intent: intent(applePerson)) { quickCode = $0.code }
    settle { quickCode != nil }
    precondition(quickCode == .success && directResolve.stopCompleted && directSend.stopCompleted)
    precondition(directResolve.operations[0].0 == "intentResolve" && directSend.operations[0].0 == "intentSend")
    precondition((directSend.operations[0].1["selector"] as? [String: Any])?["callId"] as? String == recipient.callId)
    precondition(directSend.operations[0].1["content"] as? String == "I will call you back.")
    print("PASS direct CallKit preset: missing custom recipient token is resolved against the exact authenticated declined call before sending")
    now += 121
    precondition(selector.read(handle: recipient.handle) == nil)
    selector.begin(call, account: recipient.account, callerHint: recipient.peer, handle: recipient.handle)
    selector.configureAccount(recipient.peer)
    precondition(selector.read(handle: recipient.handle) == nil)
    selector.begin(call, account: recipient.peer, callerHint: recipient.account, handle: recipient.handle)
    selector.end(call)
    precondition(selector.read(handle: recipient.handle) == nil)
    selector.begin(call, account: recipient.peer, callerHint: recipient.account, handle: recipient.handle)
    selector.configureAccount(nil)
    precondition(selector.read(handle: recipient.handle) == nil)
    print("PASS cold-call selector: exact phone match, bounded decline grace, answer/account/logout invalidation")
  }
}
