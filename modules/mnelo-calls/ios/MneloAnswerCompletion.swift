import Foundation

// Keep CallKit's answer action pending during ICE/DTLS negotiation. Completing
// the button press itself starts iOS's timer before the call can communicate.
// Media transport readiness does not depend on audio-session activation.
final class MneloAnswerCompletion {
  private struct Pending {
    let fulfill: (Date) -> Void
    let fail: () -> Void
  }
  private var pending: [UUID: Pending] = [:]
  private var connectedDates: [UUID: Date] = [:]

  func answer(_ id: UUID, fulfill: @escaping (Date) -> Void, fail: @escaping () -> Void) {
    if let date = connectedDates[id] { fulfill(date); return }
    guard pending[id] == nil else { fail(); return }
    pending[id] = Pending(fulfill: fulfill, fail: fail)
  }
  func connected(_ id: UUID, at date: Date) {
    guard connectedDates[id] == nil else { return }
    connectedDates[id] = date
    pending.removeValue(forKey: id)?.fulfill(date)
  }
  func end(_ id: UUID) {
    connectedDates.removeValue(forKey: id)
    pending.removeValue(forKey: id)?.fail()
  }
}
