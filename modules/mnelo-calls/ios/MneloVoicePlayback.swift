import Foundation
import AVFoundation
import UIKit

let mneloVoicePlaybackStopped = Notification.Name("MneloVoicePlaybackStopped")

// This lease configures output only; it never opens an input, requests microphone
// permission, changes user volume, or starts a recorder. CallKit always wins.
@MainActor
final class MneloVoicePlayback {
  static let shared = MneloVoicePlayback()
  private struct Configuration: Equatable {
    let category: AVAudioSession.Category
    let mode: AVAudioSession.Mode
    let options: AVAudioSession.CategoryOptions
    init(_ session: AVAudioSession) {
      category = session.category; mode = session.mode; options = session.categoryOptions
    }
    func restore(_ session: AVAudioSession) throws {
      try session.setCategory(category, mode: mode, options: options)
    }
  }
  private var token: String?
  private var canOwnAudio: (() -> Bool)?
  private var previous: Configuration?
  private var applied: Configuration?
  private var observers: [NSObjectProtocol] = []
  private var deadline: Timer?
  private var priorProximity = false
  private var allowHFP = false

  func begin(_ value: String, canOwnAudio: @escaping () -> Bool) throws -> Bool {
    guard UUID(uuidString: value) != nil, canOwnAudio(), UIApplication.shared.applicationState == .active else { return false }
    stop()
    let session = AVAudioSession.sharedInstance()
    token = value
    self.canOwnAudio = canOwnAudio
    previous = Configuration(session)
    priorProximity = UIDevice.current.isProximityMonitoringEnabled
    allowHFP = session.currentRoute.outputs.contains { $0.portType == .bluetoothHFP }
    UIDevice.current.isProximityMonitoringEnabled = true
    do {
      try configureRoute(initial: true)
      for name in [UIDevice.proximityStateDidChangeNotification, AVAudioSession.routeChangeNotification] {
        observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
          Task { @MainActor in
            guard let self else { return }
            do { try self.configureRoute() } catch { self.stop() }
          }
        })
      }
      observers.append(NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
        Task { @MainActor in self?.stop() }
      })
      deadline = Timer.scheduledTimer(withTimeInterval: 900, repeats: false) { [weak self] _ in
        Task { @MainActor in self?.stop() }
      }
      return true
    } catch {
      stop()
      throw error
    }
  }

  func end(_ value: String) {
    guard token == value else { return }
    stop()
  }

  func stop(restoreAudio: Bool = true) {
    guard let oldToken = token else { return }
    token = nil
    deadline?.invalidate(); deadline = nil
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    observers.removeAll()
    UIDevice.current.isProximityMonitoringEnabled = priorProximity
    let session = AVAudioSession.sharedInstance()
    // A delayed JS cleanup must never deactivate or reconfigure CallKit, a new
    // recording, or another player that has already changed the session.
    if restoreAudio, canOwnAudio?() == true, let applied,
       applied == Configuration(session) {
      try? session.overrideOutputAudioPort(.none)
      try? previous?.restore(session)
      try? session.setActive(false, options: [.notifyOthersOnDeactivation])
    }
    canOwnAudio = nil; previous = nil; applied = nil
    NotificationCenter.default.post(name: mneloVoicePlaybackStopped, object: nil, userInfo: ["token": oldToken])
  }

  private func configureRoute(initial: Bool = false) throws {
    guard token != nil else { return }
    guard canOwnAudio?() == true else { stop(restoreAudio: false); return }
    let session = AVAudioSession.sharedInstance()
    if !initial, let applied, applied != Configuration(session) {
      stop(restoreAudio: false)
      return
    }
    let external = session.currentRoute.outputs.contains {
      $0.portType != .builtInReceiver && $0.portType != .builtInSpeaker
    }
    // Proximity must not steal headphones, Bluetooth, AirPlay or USB audio.
    if external && !initial { return }
    var options: AVAudioSession.CategoryOptions = [.allowBluetoothA2DP, .allowAirPlay]
    if allowHFP { options.insert(.allowBluetoothHFP) }
    if !UIDevice.current.proximityState { options.insert(.defaultToSpeaker) }
    if initial || session.category != .playAndRecord || session.mode != .default || session.categoryOptions != options {
      try session.setCategory(.playAndRecord, mode: .default, options: options)
      applied = Configuration(session)
      try session.overrideOutputAudioPort(.none)
    }
  }
}
