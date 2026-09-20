import Foundation

// Fulfill as soon as the answer's audio configuration is ready. CallKit grants
// its audio session after fulfillment; holding this action for network readiness
// delays audio activation and can leave a connected transport without sound.
// The in-app duration is still measured from transport readiness independently.
final class MneloAnswerCompletion {
  private var completed: Set<UUID> = []
  private var connectedDates: [UUID: Date] = [:]

  func answer(_ id: UUID, fulfill: @escaping (Date) -> Void, fail: @escaping () -> Void) {
    guard completed.insert(id).inserted else { fail(); return }
    fulfill(connectedDates[id] ?? Date())
  }
  func connected(_ id: UUID, at date: Date) {
    guard connectedDates[id] == nil else { return }
    connectedDates[id] = date
  }
  func end(_ id: UUID) {
    connectedDates.removeValue(forKey: id)
    completed.remove(id)
  }
}
