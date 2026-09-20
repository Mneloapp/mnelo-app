import Foundation

@main
struct AnswerCompletionProbe {
  static func main() {
    let gate = MneloAnswerCompletion()
    let id = UUID(), other = UUID()
    let connected = Date(timeIntervalSince1970: 12345)
    var dates: [Date] = [], failures = 0
    gate.answer(id, fulfill: { dates.append($0) }, fail: { failures += 1 })
    // CallKit must be allowed to activate audio before negotiation completes.
    precondition(dates.count == 1 && abs(dates[0].timeIntervalSinceNow) < 1 && failures == 0)
    let answerDate = dates[0]
    gate.connected(other, at: connected)
    precondition(dates == [answerDate])
    gate.connected(id, at: connected)
    gate.connected(id, at: connected.addingTimeInterval(2))
    precondition(dates == [answerDate] && failures == 0)
    gate.end(id)
    precondition(failures == 0)
    // A programmatic answer can reach CallKit after JS reported transport ready.
    gate.answer(other, fulfill: { dates.append($0) }, fail: { failures += 1 })
    precondition(dates == [answerDate, connected])
    gate.end(other)
    // End/reset must not fail an action that was already fulfilled.
    for _ in 0..<3 {
      gate.answer(id, fulfill: { dates.append($0) }, fail: { failures += 1 })
      gate.end(id)
      gate.end(id)
    }
    precondition(failures == 0 && dates.count == 5)
    gate.answer(id, fulfill: { dates.append($0) }, fail: { failures += 1 })
    gate.answer(id, fulfill: { _ in preconditionFailure("Duplicate answer completed") }, fail: { failures += 1 })
    precondition(failures == 1)
    gate.connected(id, at: connected)
    precondition(dates.count == 6)
    gate.end(id)
    print("PASS native answer completion: immediate audio authorization, no network gate, duplicate, early connection and reset")
  }
}
