import Foundation
import UIKit
import AVFoundation

func check(_ value: Bool) { assert(value) }

@main
struct VoiceProbe {
  @MainActor static func changed(_ name: Notification.Name) async {
    NotificationCenter.default.post(name: name, object: nil)
    await Task.yield()
    await Task.yield()
  }
  @MainActor static func main() async throws {
    let session = AVAudioSession.sharedInstance()
    let device = UIDevice.current
    let voice = MneloVoicePlayback.shared
    var available = true
    let first = UUID().uuidString
    check(try voice.begin(first) { available })
    assert(session.category == .playAndRecord && session.mode == .default)
    assert(session.categoryOptions.contains(.defaultToSpeaker) && device.isProximityMonitoringEnabled)
    device.proximityState = true
    await changed(UIDevice.proximityStateDidChangeNotification)
    assert(!session.categoryOptions.contains(.defaultToSpeaker))
    for port in [AVAudioSession.Port.bluetoothA2DP, .headphones, .airPlay, .usbAudio] {
      session.currentRoute = .init([port])
      let changes = session.categoryChanges
      device.proximityState.toggle()
      await changed(UIDevice.proximityStateDidChangeNotification)
      assert(session.categoryChanges == changes, "proximity must preserve external output")
    }
    session.currentRoute = .init([.builtInReceiver]); device.proximityState = false
    await changed(AVAudioSession.routeChangeNotification)
    assert(session.categoryOptions.contains(.defaultToSpeaker))
    voice.end(first)
    assert(session.category == .ambient && !device.isProximityMonitoringEnabled)
    assert(session.deactivations == 1)
    let second = UUID().uuidString
    check(try voice.begin(second) { available })
    voice.end(first)
    assert(device.isProximityMonitoringEnabled && session.deactivations == 1)
    // CallKit handoff and late JS release never restore/deactivate the old audio.
    available = false
    voice.stop(restoreAudio: false)
    try session.setCategory(.playAndRecord, mode: .voiceChat, options: [])
    voice.end(second)
    assert(session.mode == .voiceChat && session.deactivations == 1)
    check(!(try voice.begin(UUID().uuidString) { available }))
    assert(!device.isProximityMonitoringEnabled)
    available = true
    check(try voice.begin(UUID().uuidString) { available })
    // A new recorder/player config owns the session, so voice cleanup cannot reset it.
    try session.setCategory(.playback, mode: .default, options: [])
    await changed(AVAudioSession.routeChangeNotification)
    assert(!device.isProximityMonitoringEnabled)
    voice.stop()
    assert(session.category == .playback && session.deactivations == 1)
    print("PASS: actual voice lease speaker/receiver, external-route preservation, stale release, CallKit handoff and new audio owner")
  }
}
