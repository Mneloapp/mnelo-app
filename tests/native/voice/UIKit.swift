import Foundation
public final class UIApplication {
  public enum State { case active, background }
  public static let shared = UIApplication()
  public var applicationState = State.active
  public static let didEnterBackgroundNotification = Notification.Name("background")
}
public final class UIDevice {
  public static let current = UIDevice()
  public var isProximityMonitoringEnabled = false
  public var proximityState = false
  public static let proximityStateDidChangeNotification = Notification.Name("proximity")
}
