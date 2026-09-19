import Foundation
public final class AVAudioSession {
  public enum Category { case ambient, playAndRecord, playback }
  public enum Mode { case `default`, voiceChat }
  public struct CategoryOptions: OptionSet {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }
    public static let allowBluetoothA2DP = Self(rawValue: 1)
    public static let allowAirPlay = Self(rawValue: 2)
    public static let allowBluetoothHFP = Self(rawValue: 4)
    public static let defaultToSpeaker = Self(rawValue: 8)
  }
  public enum Port { case builtInReceiver, builtInSpeaker, bluetoothHFP, bluetoothA2DP, headphones, airPlay, usbAudio }
  public struct Output { public let portType: Port; public init(_ type: Port) { portType = type } }
  public struct Route { public var outputs: [Output]; public init(_ ports: [Port]) { outputs = ports.map(Output.init) } }
  public enum Override { case none }
  public enum ActivationOption { case notifyOthersOnDeactivation }
  public static let routeChangeNotification = Notification.Name("route")
  private static let shared = AVAudioSession()
  public static func sharedInstance() -> AVAudioSession { shared }
  public var category = Category.ambient
  public var mode = Mode.default
  public var categoryOptions: CategoryOptions = []
  public var currentRoute = Route([.builtInSpeaker])
  public var categoryChanges = 0
  public var deactivations = 0
  public func setCategory(_ category: Category, mode: Mode, options: CategoryOptions) throws {
    self.category = category; self.mode = mode; self.categoryOptions = options; categoryChanges += 1
  }
  public func overrideOutputAudioPort(_ value: Override) throws {}
  public func setActive(_ active: Bool, options: [ActivationOption]) throws { if !active { deactivations += 1 } }
}
