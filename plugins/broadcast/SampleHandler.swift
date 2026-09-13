// Adapted from the Jitsi screen sharing sample (Apache-2.0). See NOTICE.md.
import ReplayKit

class SampleHandler: RPBroadcastSampleHandler {
  private let defaults = UserDefaults(suiteName: "group.com.mnelo.messenger.sharing")!
  private var client: SocketConnection?
  private var uploader: SampleUploader?
  private var timer: DispatchSourceTimer?
  private var token: String?
  private var lastFrame = 0.0
  private var finished = false
  private let stateQueue = DispatchQueue(label: "com.mnelo.broadcast.state")

  override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
    stateQueue.sync { start() }
  }
  private func start() {
    guard !finished else { return }
    defaults.synchronize()
    let requested = defaults.double(forKey: "MneloBroadcastRequestedAt")
    guard let token = defaults.string(forKey: "MneloBroadcastRequest"),
      UUID(uuidString: token) != nil, Date().timeIntervalSince1970 - requested < 65,
      requested <= Date().timeIntervalSince1970,
      let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.mnelo.messenger.sharing"),
      let client = SocketConnection(filePath: container.appendingPathComponent("rtc_SSFD").path) else {
      finish(); return
    }
    self.token = token
    self.client = client
    uploader = SampleUploader(connection: client)
    client.didClose = { [weak self] _ in self?.stateQueue.async { [weak self] in self?.finish() } }
    CFNotificationCenterAddObserver(CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(), { _, observer, _, _, _ in
        guard let observer else { return }
        let handler = Unmanaged<SampleHandler>.fromOpaque(observer).takeUnretainedValue()
        handler.stateQueue.async { [weak handler] in handler?.finish() }
      }, "com.mnelo.broadcast.stop" as CFString, nil, .deliverImmediately)
    let timer = DispatchSource.makeTimerSource(queue: stateQueue)
    self.timer = timer
    let deadline = Date().addingTimeInterval(10)
    timer.schedule(deadline: .now(), repeating: .milliseconds(100))
    timer.setEventHandler { [weak self] in
      guard let self, !self.finished else { return }
      self.defaults.synchronize()
      guard self.defaults.string(forKey: "MneloBroadcastRequest") == token, Date() < deadline else {
        self.finish(); return
      }
      if client.open() {
        self.defaults.set(token, forKey: "MneloBroadcastActive")
        self.defaults.synchronize()
        self.timer?.cancel()
        self.timer = nil
      }
    }
    timer.resume()
  }
  override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
    guard sampleBufferType == .video else { return }
    stateQueue.sync { consume(sampleBuffer) }
  }
  private func consume(_ sampleBuffer: CMSampleBuffer) {
    guard !finished, let token else { return }
    defaults.synchronize()
    guard defaults.string(forKey: "MneloBroadcastRequest") == token else { finish(); return }
    let now = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
    guard now.isFinite, now - lastFrame >= 1.0 / 15.0 else { return }
    lastFrame = now
    autoreleasepool { _ = uploader?.send(sample: sampleBuffer) }
  }
  override func broadcastFinished() { stateQueue.sync { finish(report: false) } }
  private func finish(report: Bool = true) {
    guard !finished else { return }
    finished = true
    CFNotificationCenterRemoveEveryObserver(CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque())
    timer?.cancel(); timer = nil
    client?.didClose = nil
    client?.close(); client = nil; uploader = nil
    if defaults.string(forKey: "MneloBroadcastActive") == token {
      defaults.removeObject(forKey: "MneloBroadcastActive"); defaults.synchronize()
    }
    if report {
      let message = Locale.preferredLanguages.first?.hasPrefix("ka") == true ? "ეკრანის გაზიარება შეწყდა" : "Screen sharing stopped"
      finishBroadcastWithError(NSError(domain: RPRecordingErrorDomain, code: 10001,
        userInfo: [NSLocalizedDescriptionKey: message]))
    }
  }
}
