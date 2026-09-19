import Foundation

@main
struct TimingProbe {
  static func main() {
    var trace = MneloConnectionTimings()
    assert(trace.append("APP_STARTED", duration: 0, now: 100))
    assert(trace.append("ANSWER_ACTION", duration: 0, now: 200))
    assert(trace.append("CAPTURE_STREAM_READY", duration: 456, now: 300))
    assert(trace.append("REMOTE_AUDIO_RTP", duration: 0, now: 400))
    for i in 0..<1000 {
      trace.append("HTTP_DONE_INBOX", duration: 50, now: 500 + Double(i))
    }
    assert(trace.events.count == 204)
    assert(trace.events.prefix(4).map { $0["stage"] as! String } == ["APP_STARTED", "ANSWER_ACTION", "CAPTURE_STREAM_READY", "REMOTE_AUDIO_RTP"])
    assert(trace.events[2]["duration"] as? Double == 456)
    for i in 0..<300 { trace.append("MEDIA_TRANSPORT_CONNECTED", duration: 0, now: 2000 + Double(i)) }
    assert(trace.events.count == 400)
    assert(!trace.append("bad peer@example.com", duration: 0, now: 3000))
    assert(!trace.append("AUDIO_PREPARE_FINISHED", duration: .infinity, now: 3000))
    assert(trace.events.count == 400)
    trace.append("APP_STARTED", duration: 70000, now: 1000000)
    assert(trace.events.count == 1)
    assert(trace.events[0]["duration"] as? Double == 60000)
    trace.append("AUDIO_PREPARE_FINISHED", duration: -50, now: 1000001)
    assert(trace.events[1]["duration"] as? Double == 0)
    print("PASS: 15-minute, 400-event timing bounds, call reservation, validation and clamping")
  }
}
