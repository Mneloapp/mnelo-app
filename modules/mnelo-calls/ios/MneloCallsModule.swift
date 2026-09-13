import ExpoModulesCore
import PushKit
import CallKit
import AVFoundation
import WebRTC

private let wakeChanged = Notification.Name("MneloNativeCallChanged")

// Created before JS by the AppDelegate subscriber. PushKit reporting never waits
// for React, SQLCipher, a network request, or an unlocked screen.
@MainActor
final class MneloCallManager: NSObject, PKPushRegistryDelegate, CXProviderDelegate {
  static let shared = MneloCallManager()
  private let provider: CXProvider
  private let controller = CXCallController()
  private var registry: PKPushRegistry?
  private var token: String?
  private var events: [[String: Any]] = []
  private var live: Set<UUID> = []
  private var outgoingCalls: Set<UUID> = []
  private var answeredCalls: Set<UUID> = []
  private var reporting: [UUID: [() -> Void]] = [:]
  private var deadlines: [UUID: Timer] = [:]
  private var ended: [UUID: Date] = [:]

  override init() {
    let config = CXProviderConfiguration()
    config.supportsVideo = true
    config.maximumCallGroups = 1
    config.maximumCallsPerCallGroup = 1
    config.supportedHandleTypes = [.generic]
    config.includesCallsInRecents = false
    provider = CXProvider(configuration: config)
    super.init()
    provider.setDelegate(self, queue: .main)
    RTCAudioSession.sharedInstance().useManualAudio = true
    RTCAudioSession.sharedInstance().isAudioEnabled = false
  }
  func contains(_ id: UUID) -> Bool { live.contains(id) }
  func start() {
    guard registry == nil else { return }
    let next = PKPushRegistry(queue: .main)
    next.delegate = self
    next.desiredPushTypes = [.voIP]
    MneloScreenShare.shared.stop()
    registry = next
  }
  private func event(_ value: [String: Any]) {
    if events.count >= 64 { events.removeFirst() }
    events.append(value)
    NotificationCenter.default.post(name: wakeChanged, object: nil)
  }
  func drain() -> [[String: Any]] { let result = events; events.removeAll(); return result }
  func state() -> [String: Any] {
    var result: [String: Any] = ["environment": environment(), "managedAudio": true]
    if let token { result["voipToken"] = token }
    return result
  }
  private func environment() -> String {
    // A Release archive installed with development signing still uses sandbox.
    // App Store binaries have no embedded development provisioning profile.
    guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision") else { return "production" }
    guard let data = try? Data(contentsOf: url),
          let text = String(data: data, encoding: .isoLatin1),
          let begin = text.range(of: "<?xml"), let end = text.range(of: "</plist>"),
          let xml = text[begin.lowerBound..<end.upperBound].data(using: .utf8),
          let plist = try? PropertyListSerialization.propertyList(from: xml, format: nil) as? [String: Any],
          let entitlements = plist["Entitlements"] as? [String: Any],
          let value = entitlements["aps-environment"] as? String else { return "unknown" }
    return value == "development" ? "sandbox" : value == "production" ? "production" : "unknown"
  }
  func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    guard type == .voIP else { return }
    token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    event(["type": "token"])
  }
  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    guard type == .voIP else { return }
    token = nil
    event(["type": "token-invalid"])
  }
  func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
    guard type == .voIP else { completion(); return }
    let value = payload.dictionaryPayload["mnelo"] as? [String: Any]
    let expiry = (value?["expires"] as? NSNumber)?.doubleValue ?? 0
    let valid = value?["v"] as? Int == 1 && value?["kind"] as? String == "call" && expiry > Date().timeIntervalSince1970 * 1000 && expiry <= (Date().timeIntervalSince1970 + 65) * 1000
    let id = (value?["id"] as? String).flatMap(UUID.init(uuidString:))
    // Even malformed/late VoIP pushes are reported and immediately ended. Never
    // misuse PushKit for message/background work or omit Apple's completion.
    incoming(id ?? UUID(), video: value?["video"] as? Bool ?? false, usable: valid && id != nil, completion: completion)
  }
  private func arm(_ id: UUID) {
    deadlines[id]?.invalidate()
    deadlines[id] = Timer.scheduledTimer(withTimeInterval: 60, repeats: false) { _ in
      Task { @MainActor in
        self.finish(id, reason: .unanswered)
        self.event(["type": "end", "id": id.uuidString.lowercased(), "reason": "timeout"])
      }
    }
  }
  func incoming(_ id: UUID, video: Bool, usable: Bool = true, completion: @escaping () -> Void = {}) {
    ended = ended.filter { $0.value > Date() }
    if reporting[id] != nil { reporting[id]?.append(completion); return }
    if live.contains(id) { completion(); return }
    let allowed = usable && ended[id] == nil && live.isEmpty
    reporting[id] = [completion]
    if allowed { live.insert(id) }
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: "Mnelo")
    update.localizedCallerName = "Mnelo"
    update.hasVideo = video
    update.supportsHolding = false
    update.supportsGrouping = false
    update.supportsUngrouping = false
    provider.reportNewIncomingCall(with: id, update: update) { error in
      Task { @MainActor in
        if error == nil && allowed && self.ended[id] == nil {
          self.arm(id)
          self.event(["type": "incoming", "id": id.uuidString.lowercased(), "video": video])
        } else {
          self.live.remove(id)
          if error == nil { self.provider.reportCall(with: id, endedAt: Date(), reason: .failed) }
          self.event(["type": "end", "id": id.uuidString.lowercased(), "code":"NATIVE_INCOMING_FAILED"])
        }
        self.reporting.removeValue(forKey: id)?.forEach { $0() }
      }
    }
  }
  func outgoing(_ id: UUID, video: Bool) {
    guard !live.contains(id), live.isEmpty else { return }
    live.insert(id)
    outgoingCalls.insert(id)
    let action = CXStartCallAction(call: id, handle: CXHandle(type: .generic, value: "Mnelo"))
    action.isVideo = video
    controller.request(CXTransaction(action: action)) { error in
      if error != nil { Task { @MainActor in self.finish(id, reason: .failed); self.event(["type":"end", "id":id.uuidString.lowercased(), "code":"NATIVE_TRANSACTION_FAILED"]) } }
    }
    arm(id)
  }
  func answer(_ id: UUID) {
    guard live.contains(id), !answeredCalls.contains(id) else { return }
    answeredCalls.insert(id)
    controller.request(CXTransaction(action: CXAnswerCallAction(call: id))) { error in
      if error != nil { Task { @MainActor in self.finish(id, reason: .failed); self.event(["type":"end", "id":id.uuidString.lowercased(), "code":"NATIVE_TRANSACTION_FAILED"]) } }
    }
  }
  func connected(_ id: UUID) {
    guard live.contains(id) else { return }
    deadlines.removeValue(forKey: id)?.invalidate()
    if outgoingCalls.contains(id) { provider.reportOutgoingCall(with: id, connectedAt: Date()) }
  }
  func finish(_ id: UUID, reason: CXCallEndedReason = .remoteEnded) {
    deadlines.removeValue(forKey: id)?.invalidate()
    ended[id] = Date().addingTimeInterval(120)
    outgoingCalls.remove(id)
    answeredCalls.remove(id)
    guard live.remove(id) != nil else { return }
    provider.reportCall(with: id, endedAt: Date(), reason: reason)
  }
  private func prepareAudio() throws {
    try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetoothHFP])
  }
  func providerDidReset(_ provider: CXProvider) {
    for id in live { event(["type":"end", "id":id.uuidString.lowercased()]) }
    MneloScreenShare.shared.stop()
    live.removeAll()
    answeredCalls.removeAll()
    outgoingCalls.removeAll()
    deadlines.values.forEach { $0.invalidate() }; deadlines.removeAll()
    RTCAudioSession.sharedInstance().isAudioEnabled = false
  }
  func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
    do { try prepareAudio(); action.fulfill(); provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date()) }
    catch { action.fail(); finish(action.callUUID, reason: .failed); event(["type":"end", "id":action.callUUID.uuidString.lowercased(), "code":"NATIVE_AUDIO_FAILED"]) }
  }
  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    answeredCalls.insert(action.callUUID)
    do { try prepareAudio(); event(["type":"answer", "id":action.callUUID.uuidString.lowercased()]); action.fulfill() }
    catch { action.fail(); finish(action.callUUID, reason: .failed); event(["type":"end", "id":action.callUUID.uuidString.lowercased(), "code":"NATIVE_AUDIO_FAILED"]) }
  }
  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    event(["type":"end", "id":action.callUUID.uuidString.lowercased()])
    finish(action.callUUID); action.fulfill()
  }
  func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
    event(["type":"mute", "id":action.callUUID.uuidString.lowercased(), "muted":action.isMuted]); action.fulfill()
  }
  func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
    if let call = action as? CXCallAction { finish(call.callUUID, reason: .failed); event(["type":"end", "id":call.callUUID.uuidString.lowercased(), "code":"NATIVE_ACTION_TIMEOUT"]) }
    action.fail()
  }
  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    RTCAudioSession.sharedInstance().audioSessionDidActivate(audioSession)
    RTCAudioSession.sharedInstance().isAudioEnabled = true
  }
  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    RTCAudioSession.sharedInstance().isAudioEnabled = false
    RTCAudioSession.sharedInstance().audioSessionDidDeactivate(audioSession)
  }
}

public class MneloCallsSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    MneloCallManager.shared.start()
    return true
  }
}
public class MneloCallsModule: Module {
  private var observer: NSObjectProtocol?
  public func definition() -> ModuleDefinition {
    Name("MneloCalls")
    Events("changed")
    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(forName: wakeChanged, object: nil, queue: .main) { [weak self] _ in self?.sendEvent("changed", [:]) }
    }
    OnStopObserving { if let observer = self.observer { NotificationCenter.default.removeObserver(observer) }; self.observer = nil }
    AsyncFunction("prepareScreenShare") { (value: String) async throws -> String in
      try await MainActor.run {
        guard let id = UUID(uuidString: value) else { throw NSError(domain: "Mnelo", code: 1) }
        return try MneloScreenShare.shared.prepare(id)
      }
    }
    AsyncFunction("presentScreenShare") { (token: String) async throws in try await MainActor.run { try MneloScreenShare.shared.present(token) } }
    AsyncFunction("screenShareActive") { (token: String) async -> Bool in await MainActor.run { MneloScreenShare.shared.active(token) } }
    AsyncFunction("stopScreenShare") { (token: String) async in await MainActor.run { MneloScreenShare.shared.stop(token: token) } }
    AsyncFunction("state") { () async -> [String: Any] in await MainActor.run { MneloCallManager.shared.start(); return MneloCallManager.shared.state() } }
    AsyncFunction("drain") { () async -> [[String: Any]] in await MainActor.run { MneloCallManager.shared.drain() } }
    AsyncFunction("incoming") { (value: String, video: Bool) async in
      await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
        Task { @MainActor in
          guard let id = UUID(uuidString: value) else { continuation.resume(); return }
          MneloCallManager.shared.incoming(id, video: video) { continuation.resume() }
        }
      }
    }
    AsyncFunction("answer") { (value: String) async in await MainActor.run { if let id = UUID(uuidString: value) { MneloCallManager.shared.answer(id) } } }
    AsyncFunction("outgoing") { (value: String, video: Bool) async in await MainActor.run { if let id = UUID(uuidString: value) { MneloCallManager.shared.outgoing(id, video: video) } } }
    AsyncFunction("connected") { (value: String) async in await MainActor.run { if let id = UUID(uuidString: value) { MneloCallManager.shared.connected(id) } } }
    AsyncFunction("end") { (value: String) async in await MainActor.run { if let id = UUID(uuidString: value) { MneloCallManager.shared.finish(id) } } }
  }
}
