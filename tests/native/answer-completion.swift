import Foundation

@main
struct AnswerCompletionProbe {
  static func main() {
    let gate = MneloAnswerCompletion()
    let id = UUID(), other = UUID()
    let connected = Date(timeIntervalSince1970: 12345)
    var dates: [Date] = [], failures = 0
    gate.answer(id, fulfill: { dates.append($0) }, fail: { failures += 1 })
    // The user's answer alone must not start the system duration.
    precondition(dates.isEmpty && failures == 0)
    gate.connected(other, at: connected)
    precondition(dates.isEmpty)
    gate.connected(id, at: connected)
    gate.connected(id, at: connected.addingTimeInterval(2))
    precondition(dates == [connected] && failures == 0)
    gate.end(id)
    precondition(failures == 0)
    // A programmatic answer can reach CallKit after JS reported transport ready.
    gate.answer(other, fulfill: { dates.append($0) }, fail: { failures += 1 })
    precondition(dates == [connected, connected])
    gate.end(other)
    // End, timeout and provider reset use the same pending-action cleanup.
    for _ in 0..<3 {
      gate.answer(id, fulfill: { _ in preconditionFailure("Ended action completed") }, fail: { failures += 1 })
      gate.end(id)
      gate.end(id)
    }
    precondition(failures == 3)
    gate.answer(id, fulfill: { dates.append($0) }, fail: { failures += 1 })
    gate.answer(id, fulfill: { _ in preconditionFailure("Duplicate answer completed") }, fail: { failures += 1 })
    precondition(failures == 4)
    gate.connected(id, at: connected)
    precondition(dates.count == 3)
    gate.end(id)
    print("PASS native answer completion: readiness, exact timestamp, duplicate, early connection, cancellation and reset")
  }
}
