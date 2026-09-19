import UIKit

final class MneloApplicationDatabaseTasks: MneloDatabaseTasks {
  // UIKit task ownership stays on main; SQL always runs on its own queue.
  private var tasks: [UUID: UIBackgroundTaskIdentifier] = [:]
  func begin(_ token: UUID, expiration: @escaping () -> Void) -> Bool {
    onMain {
      let task = UIApplication.shared.beginBackgroundTask(withName: "Mnelo local database", expirationHandler: expiration)
      guard task != .invalid else { return false }
      self.tasks[token] = task
      return true
    }
  }
  func end(_ token: UUID) {
    DispatchQueue.main.async { [self] in
      if let task = tasks.removeValue(forKey: token) { UIApplication.shared.endBackgroundTask(task) }
    }
  }
  private func onMain<T>(_ work: () -> T) -> T {
    Thread.isMainThread ? work() : DispatchQueue.main.sync(execute: work)
  }
}
