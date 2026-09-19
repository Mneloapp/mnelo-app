import Foundation

// Local, content-free diagnostics. Keep call phases when background HTTP polls
// would otherwise evict an entire call before a tester can export the trace.
struct MneloConnectionTimings {
  private(set) var events: [[String: Any]] = []

  @discardableResult
  mutating func append(_ stage: String, duration: Double, now: Double) -> Bool {
    guard stage.range(of: "^[A-Z_]{1,48}$", options: .regularExpression) != nil,
          duration.isFinite, now.isFinite else { return false }
    events = events.filter { ($0["at"] as? Double ?? 0) > now - 900000 }
    events.append(["stage": stage, "at": now, "duration": max(0, min(60000, duration))])
    var callCount = 0
    var otherCount = 0
    events = events.reversed().filter { event in
      let code = event["stage"] as? String ?? ""
      let other = code.hasPrefix("HTTP_") || code == "MESSAGE_PROJECTED" ||
        code == "DELIVERY_CONFIRMED" || code == "READ_CONFIRMED"
      if other { otherCount += 1; return otherCount <= 200 }
      callCount += 1
      return callCount <= 200
    }.reversed()
    return true
  }
}
