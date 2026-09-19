import ExpoModulesCore
import PushKit
import CallKit
import AVFoundation
import WebRTC
import UserNotifications
import UIKit

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
  private var connectedCalls: Set<UUID> = []
  private var ringbackID: UUID?
  private var ringbackPlayer: AVAudioPlayer?
  private var audioActive = false
  private var defaultSpeaker = false
  private var explicitSpeaker: Bool?
  private var routeObserver: NSObjectProtocol?
  private var timingEvents: [[String: Any]] = []
  private var timingFlush: Timer?
  private let timingQueue = DispatchQueue(label: "com.mnelo.connection-timing", qos: .utility)
  private var reporting: [UUID: [() -> Void]] = [:]
  private var deadlines: [UUID: Timer] = [:]
  private var ended: [UUID: Date] = [:]
  private let callerCacheKey = "MneloCallersV1"
  private let endJournalKey = "MneloPendingCallEndsV1"
  private let accountKey = "MneloCallAccountV1"
  private var account: String?
  private var pendingEnds: [[String: Any]] = []
  private var endDeliveryTask = UIBackgroundTaskIdentifier.invalid
  private var endDeliveryDeadline: Timer?

  override init() {
    let config = CXProviderConfiguration()
    config.supportsVideo = true
    config.maximumCallGroups = 1
    config.maximumCallsPerCallGroup = 1
    config.supportedHandleTypes = [.generic, .phoneNumber]
    config.includesCallsInRecents = false
    provider = CXProvider(configuration: config)
    super.init()
    account = UserDefaults.standard.string(forKey: accountKey)
    pendingEnds = UserDefaults.standard.array(forKey: endJournalKey) as? [[String: Any]] ?? []
    prunePendingEnds()
    for value in pendingEnds {
      if let text = value["id"] as? String, let id = UUID(uuidString: text), let expiry = value["expires"] as? Double {
        ended[id] = Date(timeIntervalSince1970: expiry)
      }
    }
    provider.setDelegate(self, queue: .main)
    RTCAudioSession.sharedInstance().useManualAudio = true
    RTCAudioSession.sharedInstance().isAudioEnabled = false
    routeObserver = NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] _ in
      Task { @MainActor in self?.reportAudioRoute() }
    }
    timing("APP_STARTED")
  }
  // Bounded local USB diagnostics. No conversation identifiers, content,
  // addresses, credentials or server upload. Caches are excluded from backup.
  func timing(_ code: String, duration: Double = 0) {
    guard code.range(of: "^[A-Z_]{1,48}$", options: .regularExpression) != nil, duration.isFinite else { return }
    let now = Date().timeIntervalSince1970 * 1000
    timingEvents = timingEvents.filter { ($0["at"] as? Double ?? 0) > now - 900000 }
    timingEvents.append(["stage":code, "at":now, "duration":max(0, min(60000, duration))])
    if timingEvents.count > 200 { timingEvents.removeFirst(timingEvents.count - 200) }
    guard timingFlush == nil else { return }
    timingFlush = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: false) { _ in
      Task { @MainActor in
        self.timingFlush = nil
        guard let data = try? JSONSerialization.data(withJSONObject: self.timingEvents),
              let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return }
        let url = directory.appendingPathComponent("MneloConnectionTimings.json")
        self.timingQueue.async { try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]) }
      }
    }
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
  private func prunePendingEnds() {
    let now = Date().timeIntervalSince1970
    pendingEnds = Array(pendingEnds.filter {
      $0["account"] as? String == account && account != nil &&
      ($0["expires"] as? Double ?? 0) > now && ($0["expires"] as? Double ?? 0) <= now + 120 &&
      ($0["id"] as? String).flatMap(UUID.init(uuidString:)) != nil &&
      ["local", "remote", "decline", "timeout"].contains($0["reason"] as? String ?? "")
    }.suffix(16))
    UserDefaults.standard.set(pendingEnds, forKey: endJournalKey)
  }
  func configureAccount(_ value: String) {
    guard value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { return }
    if account != value {
      if account != nil {
        events.removeAll { $0["type"] as? String == "end" }
        releaseEndDelivery()
      }
      // First launch after upgrade may already have a native end event; keep
      // its short activity assertion while JS authenticates that exact call.
      pendingEnds.removeAll()
    }
    account = value
    UserDefaults.standard.set(value, forKey: accountKey)
    prunePendingEnds()
  }
  private func holdEndDelivery() {
    guard endDeliveryTask == .invalid else { return }
    // Acquire BEFORE fulfilling the CallKit end action removes our VoIP activity.
    // The database module separately releases its own locks on expiration.
    endDeliveryTask = UIApplication.shared.beginBackgroundTask(withName: "Mnelo call end") { [weak self] in
      Task { @MainActor in self?.releaseEndDelivery() }
    }
    guard endDeliveryTask != .invalid else { return }
    endDeliveryDeadline = Timer.scheduledTimer(withTimeInterval: 25, repeats: false) { [weak self] _ in
      Task { @MainActor in self?.releaseEndDelivery() }
    }
  }
  private func releaseEndDelivery() {
    endDeliveryDeadline?.invalidate()
    endDeliveryDeadline = nil
    let task = endDeliveryTask
    endDeliveryTask = .invalid
    if task != .invalid { UIApplication.shared.endBackgroundTask(task) }
  }
  private func terminalEvent(_ id: UUID, reason: String) {
    holdEndDelivery()
    prunePendingEnds()
    if let account, !pendingEnds.contains(where: { $0["id"] as? String == id.uuidString.lowercased() }) {
      pendingEnds.append(["id": id.uuidString.lowercased(), "reason": reason,
                          "account": account, "expires": Date().timeIntervalSince1970 + 120])
      prunePendingEnds()
    }
    event(["type": "end", "id": id.uuidString.lowercased(), "reason": reason])
  }
  func acknowledgeEnd(_ id: UUID, account value: String) {
    guard value == account else { return }
    pendingEnds.removeAll { $0["id"] as? String == id.uuidString.lowercased() }
    prunePendingEnds()
    if pendingEnds.isEmpty { releaseEndDelivery() }
  }
  func drain() -> [[String: Any]] {
    prunePendingEnds()
    var result = events
    events.removeAll()
    // Draining JS events is not an acknowledgement: an interrupted SQL/Signal
    // write must replay after the next runtime or process starts.
    for value in pendingEnds {
      guard let id = value["id"] as? String, let reason = value["reason"] as? String else { continue }
      if !result.contains(where: { $0["type"] as? String == "end" && $0["id"] as? String == id }) {
        result.append(["type": "end", "id": id, "reason": reason])
      }
    }
    return result
  }
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
    incoming(
      id ?? UUID(),
      video: value?["video"] as? Bool ?? false,
      callerHint: value?["callerHint"] as? String,
      usable: valid && id != nil,
      completion: completion
    )
  }
  private func arm(_ id: UUID) {
    deadlines[id]?.invalidate()
    deadlines[id] = Timer.scheduledTimer(withTimeInterval: 60, repeats: false) { _ in
      Task { @MainActor in
        self.terminalEvent(id, reason: "timeout")
        self.finish(id, reason: .unanswered)
      }
    }
  }
  func incoming(_ id: UUID, video: Bool, callerHint: String? = nil, usable: Bool = true, completion: @escaping () -> Void = {}) {
    ended = ended.filter { $0.value > Date() }
    if reporting[id] != nil { reporting[id]?.append(completion); return }
    if live.contains(id) { completion(); return }
    let allowed = usable && ended[id] == nil && live.isEmpty
    reporting[id] = [completion]
    if allowed { live.insert(id); defaultSpeaker = video; explicitSpeaker = nil }
    let cached = callerHint.flatMap { cachedCaller($0) }
    let displayName = cached?.name ?? "Mnelo"
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(
      type: cached?.phone.hasPrefix("+") == true ? .phoneNumber : .generic,
      value: cached?.phone.isEmpty == false ? cached!.phone : displayName
    )
    update.localizedCallerName = displayName
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
  private func cachedCaller(_ hint: String) -> (name: String, phone: String)? {
    guard hint.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
      let cache = UserDefaults.standard.dictionary(forKey: callerCacheKey),
      let value = cache[hint] as? [String: Any],
      let name = value["name"] as? String, !name.isEmpty else { return nil }
    return (name, value["phone"] as? String ?? "")
  }
  func cacheCaller(_ hint: String, name: String, phone: String) {
    guard hint.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { return }
    let cleanName = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(160))
    guard !cleanName.isEmpty else { return }
    var cache = UserDefaults.standard.dictionary(forKey: callerCacheKey) as? [String: [String: String]] ?? [:]
    cache[hint] = ["name": cleanName, "phone": String(phone.prefix(40))]
    if cache.count > 256, let oldest = cache.keys.sorted().first { cache.removeValue(forKey: oldest) }
    UserDefaults.standard.set(cache, forKey: callerCacheKey)
  }
  private func removeCallReplyNotification(_ id: UUID) {
    let identifier = "mnelo-call-" + id.uuidString.lowercased()
    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])
    UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [identifier])
  }
  func outgoing(_ id: UUID, video: Bool) {
    guard !live.contains(id), live.isEmpty else { return }
    live.insert(id)
    defaultSpeaker = video
    explicitSpeaker = nil
    outgoingCalls.insert(id)
    let action = CXStartCallAction(call: id, handle: CXHandle(type: .generic, value: "Mnelo"))
    action.isVideo = video
    controller.request(CXTransaction(action: action)) { error in
      if error != nil { Task { @MainActor in self.finish(id, reason: .failed); self.event(["type":"end", "id":id.uuidString.lowercased(), "code":"NATIVE_TRANSACTION_FAILED"]) } }
    }
    arm(id)
  }
  func identify(_ id: UUID, name: String, phone: String, video: Bool) {
    guard live.contains(id), !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
    let update = CXCallUpdate()
    update.localizedCallerName = String(name.prefix(160))
    update.remoteHandle = CXHandle(type: phone.hasPrefix("+") ? .phoneNumber : .generic,
                                  value: phone.isEmpty ? String(name.prefix(160)) : phone)
    update.hasVideo = video
    provider.reportCall(with: id, updated: update)
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
    connectedCalls.insert(id)
    ringback(id, enabled: false)
    deadlines.removeValue(forKey: id)?.invalidate()
    if outgoingCalls.contains(id) { provider.reportOutgoingCall(with: id, connectedAt: Date()) }
  }
  func finish(_ id: UUID, reason: CXCallEndedReason = .remoteEnded) {
    ringback(id, enabled: false)
    removeCallReplyNotification(id)
    connectedCalls.remove(id)
    deadlines.removeValue(forKey: id)?.invalidate()
    ended[id] = Date().addingTimeInterval(120)
    outgoingCalls.remove(id)
    answeredCalls.remove(id)
    guard live.remove(id) != nil else { return }
    if live.isEmpty { explicitSpeaker = nil; defaultSpeaker = false }
    provider.reportCall(with: id, endedAt: Date(), reason: reason)
  }
  private func prepareAudio() throws {
    // CallKit and WebRTC must use the same configuration. Otherwise an answer
    // replaces the video speaker preference with voiceChat's receiver route.
    let config = RTCAudioSessionConfiguration.webRTC()
    config.category = AVAudioSession.Category.playAndRecord.rawValue
    config.mode = AVAudioSession.Mode.voiceChat.rawValue
    config.categoryOptions = defaultSpeaker ? [.allowBluetoothHFP, .defaultToSpeaker] : [.allowBluetoothHFP]
    RTCAudioSessionConfiguration.setWebRTC(config)
    let rtc = RTCAudioSession.sharedInstance()
    rtc.lockForConfiguration()
    defer { rtc.unlockForConfiguration() }
    try rtc.setConfiguration(config)
  }
  func prepareCallAudio(_ speaker: Bool) throws {
    defaultSpeaker = explicitSpeaker ?? speaker
    try prepareAudio()
  }
  func speaker(_ enabled: Bool) throws {
    defaultSpeaker = enabled
    explicitSpeaker = enabled
    try prepareAudio()
    if audioActive { try AVAudioSession.sharedInstance().overrideOutputAudioPort(enabled ? .speaker : .none) }
    reportAudioRoute()
  }
  private func reportAudioRoute() {
    guard audioActive, let id = live.first else { return }
    let speaker = AVAudioSession.sharedInstance().currentRoute.outputs.contains { $0.portType == .builtInSpeaker }
    timing(speaker ? "AUDIO_SPEAKER" : "AUDIO_OTHER_ROUTE")
    event(["type":"route", "id":id.uuidString.lowercased(), "speaker":speaker])
  }
  func ringback(_ id: UUID, enabled: Bool) {
    if enabled {
      guard live.contains(id), outgoingCalls.contains(id), !connectedCalls.contains(id) else { return }
      ringbackID = id
    } else if ringbackID == id {
      ringbackID = nil
    }
    updateRingback()
  }
  private func updateRingback() {
    guard audioActive, let id = ringbackID, live.contains(id), outgoingCalls.contains(id), !connectedCalls.contains(id) else {
      ringbackPlayer?.stop()
      ringbackPlayer = nil
      return
    }
    guard ringbackPlayer == nil else { return }
    // A quiet 425 Hz telephone ringback: one second on, four seconds off.
    // Use CallKit's activated route (earpiece/Bluetooth), never a second session.
    if let player = try? AVAudioPlayer(data: Self.ringbackWave) {
      player.numberOfLoops = -1
      player.volume = 0.7
      player.prepareToPlay()
      if player.play() { ringbackPlayer = player }
    }
  }
  private static let ringbackWave: Data = {
    let rate = 16000, frames = rate * 5
    var data = Data()
    func text(_ value: String) { data.append(contentsOf: value.utf8) }
    func word(_ value: UInt16) { var little = value.littleEndian; withUnsafeBytes(of: &little) { data.append(contentsOf: $0) } }
    func long(_ value: UInt32) { var little = value.littleEndian; withUnsafeBytes(of: &little) { data.append(contentsOf: $0) } }
    text("RIFF"); long(UInt32(36 + frames * 2)); text("WAVEfmt "); long(16)
    word(1); word(1); long(UInt32(rate)); long(UInt32(rate * 2)); word(2); word(16)
    text("data"); long(UInt32(frames * 2))
    for frame in 0..<frames {
      let fade = max(0, min(1, min(Double(frame) / 160, Double(rate - frame) / 160)))
      let sample = frame < rate ? Int16(5000 * fade * sin(2 * Double.pi * 425 * Double(frame) / Double(rate))) : 0
      word(UInt16(bitPattern: sample))
    }
    return data
  }()
  func providerDidReset(_ provider: CXProvider) {
    for id in live { terminalEvent(id, reason: "local") }
    MneloScreenShare.shared.stop()
    live.removeAll()
    answeredCalls.removeAll()
    outgoingCalls.removeAll()
    connectedCalls.removeAll()
    ringbackID = nil
    audioActive = false
    explicitSpeaker = nil
    updateRingback()
    deadlines.values.forEach { $0.invalidate() }; deadlines.removeAll()
    RTCAudioSession.sharedInstance().isAudioEnabled = false
  }
  func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
    do { try prepareAudio(); action.fulfill(); provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date()) }
    catch { action.fail(); finish(action.callUUID, reason: .failed); event(["type":"end", "id":action.callUUID.uuidString.lowercased(), "code":"NATIVE_AUDIO_FAILED"]) }
  }
  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    timing("ANSWER_ACTION")
    answeredCalls.insert(action.callUUID)
    do { try prepareAudio(); event(["type":"answer", "id":action.callUUID.uuidString.lowercased()]); action.fulfill() }
    catch { action.fail(); finish(action.callUUID, reason: .failed); event(["type":"end", "id":action.callUUID.uuidString.lowercased(), "code":"NATIVE_AUDIO_FAILED"]) }
  }
  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    guard live.contains(action.callUUID) else { action.fulfill(); return }
    let declined = live.contains(action.callUUID) && !outgoingCalls.contains(action.callUUID) && !answeredCalls.contains(action.callUUID)
    terminalEvent(action.callUUID, reason: declined ? "decline" : "local")
    finish(action.callUUID, reason: declined ? .declinedElsewhere : .remoteEnded); action.fulfill()
  }
  func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
    event(["type":"mute", "id":action.callUUID.uuidString.lowercased(), "muted":action.isMuted]); action.fulfill()
  }
  func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
    if let call = action as? CXCallAction { finish(call.callUUID, reason: .failed); event(["type":"end", "id":call.callUUID.uuidString.lowercased(), "code":"NATIVE_ACTION_TIMEOUT"]) }
    action.fail()
  }
  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    timing("AUDIO_ACTIVATED")
    do {
      try prepareAudio()
      if let explicitSpeaker { try audioSession.overrideOutputAudioPort(explicitSpeaker ? .speaker : .none) }
    } catch {
      if let id = live.first { event(["type":"end", "id":id.uuidString.lowercased(), "code":"NATIVE_AUDIO_FAILED"]); finish(id, reason: .failed) }
      return
    }
    RTCAudioSession.sharedInstance().audioSessionDidActivate(audioSession)
    RTCAudioSession.sharedInstance().isAudioEnabled = true
    audioActive = true
    reportAudioRoute()
    updateRingback()
  }
  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    audioActive = false
    updateRingback()
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
    AsyncFunction("prepareCallAudio") { (speaker: Bool) async throws in try await MainActor.run { try MneloCallManager.shared.prepareCallAudio(speaker) } }
    AsyncFunction("speaker") { (enabled: Bool) async throws in try await MainActor.run { try MneloCallManager.shared.speaker(enabled) } }
    AsyncFunction("timing") { (code: String, duration: Double) async in await MainActor.run { MneloCallManager.shared.timing(code, duration: duration) } }
    AsyncFunction("configureAccount") { (account: String) async in await MainActor.run { MneloCallManager.shared.configureAccount(account) } }
    AsyncFunction("acknowledgeEnd") { (value: String, account: String) async in
      await MainActor.run { if let id = UUID(uuidString: value) { MneloCallManager.shared.acknowledgeEnd(id, account: account) } }
    }
    AsyncFunction("drain") { () async -> [[String: Any]] in await MainActor.run { MneloCallManager.shared.drain() } }
    AsyncFunction("incoming") { (value: String, video: Bool, callerHint: String?) async in
      await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
        Task { @MainActor in
          guard let id = UUID(uuidString: value) else { continuation.resume(); return }
          MneloCallManager.shared.incoming(id, video: video, callerHint: callerHint) { continuation.resume() }
        }
      }
    }
    AsyncFunction("cacheCaller") { (hint: String, name: String, phone: String) async in
      await MainActor.run { MneloCallManager.shared.cacheCaller(hint, name: name, phone: phone) }
    }
    AsyncFunction("identify") { (value: String, name: String, phone: String, video: Bool) async in
      await MainActor.run { if let id = UUID(uuidString: value) { MneloCallManager.shared.identify(id, name: name, phone: phone, video: video) } }
    }
    AsyncFunction("answer") { (value: String) async in await MainActor.run { if let id = UUID(uuidString: value) { MneloCallManager.shared.answer(id) } } }
    AsyncFunction("outgoing") { (value: String, video: Bool) async in await MainActor.run { if let id = UUID(uuidString: value) { MneloCallManager.shared.outgoing(id, video: video) } } }
    AsyncFunction("connected") { (value: String) async in await MainActor.run { if let id = UUID(uuidString: value) { MneloCallManager.shared.connected(id) } } }
    AsyncFunction("ringback") { (value: String, enabled: Bool) async in await MainActor.run { if let id = UUID(uuidString: value) { MneloCallManager.shared.ringback(id, enabled: enabled) } } }
    AsyncFunction("end") { (value: String) async in await MainActor.run { if let id = UUID(uuidString: value) { MneloCallManager.shared.finish(id) } } }
  }
}
