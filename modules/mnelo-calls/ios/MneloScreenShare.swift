import Foundation
import ReplayKit
import UIKit

// Only a live CallKit call can issue a short-lived broadcast request. ReplayKit
// still asks the person to start recording; no screen pixels are written to disk.
@MainActor
final class MneloScreenShare {
  static let shared = MneloScreenShare()
  static let group = "group.com.mnelo.messenger.sharing"
  private let defaults = UserDefaults(suiteName: group)!
  private var picker: RPSystemBroadcastPickerView?
  private var callID: UUID?
  private var timeout: Timer?
  func prepare(_ id: UUID) throws -> String {
    guard MneloCallManager.shared.contains(id) else { throw NSError(domain: "Mnelo", code: 1) }
    stop()
    let token = UUID().uuidString
    callID = id
    defaults.set(token, forKey: "MneloBroadcastRequest")
    defaults.set(Date().timeIntervalSince1970, forKey: "MneloBroadcastRequestedAt")
    defaults.synchronize()
    timeout = Timer.scheduledTimer(withTimeInterval: 65, repeats: false) { _ in
      Task { @MainActor in if !self.active(token) { self.stop() } }
    }
    return token
  }
  func present(_ token: String) throws {
    guard defaults.string(forKey: "MneloBroadcastRequest") == token,
      let id = callID, MneloCallManager.shared.contains(id),
      let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
        .flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) else {
      throw NSError(domain: "Mnelo", code: 1)
    }
    let view = RPSystemBroadcastPickerView(frame: CGRect(x: -100, y: -100, width: 44, height: 44))
    view.preferredExtension = "com.mnelo.messenger.broadcast"
    view.showsMicrophoneButton = false
    window.addSubview(view)
    picker = view
    guard let button = view.subviews.compactMap({ $0 as? UIButton }).first else {
      stop(); throw NSError(domain: "Mnelo", code: 1)
    }
    button.sendActions(for: .touchUpInside)
  }
  func active(_ token: String) -> Bool {
    defaults.synchronize()
    return defaults.string(forKey: "MneloBroadcastRequest") == token &&
      defaults.string(forKey: "MneloBroadcastActive") == token
  }
  func stop(call: UUID? = nil, token: String? = nil) {
    if let call, call != callID { return }
    if let token, defaults.string(forKey: "MneloBroadcastRequest") != token { return }
    defaults.removeObject(forKey: "MneloBroadcastRequest")
    defaults.removeObject(forKey: "MneloBroadcastActive")
    defaults.removeObject(forKey: "MneloBroadcastRequestedAt")
    defaults.synchronize()
    CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName("com.mnelo.broadcast.stop" as CFString), nil, nil, true)
    timeout?.invalidate(); timeout = nil
    picker?.removeFromSuperview(); picker = nil; callID = nil
  }
}
