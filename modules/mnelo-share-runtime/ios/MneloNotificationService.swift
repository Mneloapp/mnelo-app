import Foundation
import UserNotifications

open class MneloNotificationService: UNNotificationServiceExtension {
  private var runtime: ShareRuntime?
  private var handler: ((UNNotificationContent) -> Void)?
  private var content: UNMutableNotificationContent?
  private var deadline: DispatchWorkItem?

  open override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
    DispatchQueue.main.async { self.receive(request, contentHandler: contentHandler) }
  }

  private func receive(_ request: UNNotificationRequest, contentHandler: @escaping (UNNotificationContent) -> Void) {
    guard let copy = request.content.mutableCopy() as? UNMutableNotificationContent else { contentHandler(request.content); return }
    handler = contentHandler
    content = copy
    guard let event = copy.userInfo["mnelo"] as? [String: Any], event["v"] as? Int == 1,
      event["kind"] as? String == "message", let id = event["id"] as? String, UUID(uuidString: id) != nil else { finish(); return }
    // Keep a new-message indicator even if the encrypted vault is unavailable.
    // A successful local preview replaces it with the verified unread count.
    copy.badge = NSNumber(value: max(1, copy.badge?.intValue ?? 0))
    let deadline = DispatchWorkItem { [weak self] in self?.finish() }
    self.deadline = deadline
    DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: deadline)
    let runtime = ShareRuntime()
    self.runtime = runtime
    runtime.open(items: [], bundle: "MneloNotification", operation: "preview", argument: id) { [weak self] result in
      guard let self, self.handler != nil else { return }
      if case .success(let value) = result, let preview = value as? [String: Any], preview["id"] as? String == id,
        let title = preview["title"] as? String, let body = preview["body"] as? String,
        !title.isEmpty, !body.isEmpty, title.utf8.count <= 1000, body.utf8.count <= 2000 {
        self.content?.title = title
        self.content?.body = body
        if let badge = preview["badge"] as? Int, badge >= 0, badge <= 99999 {
          self.content?.badge = NSNumber(value: badge)
        }
      }
      self.finish()
    }
  }

  open override func serviceExtensionTimeWillExpire() { DispatchQueue.main.async { self.finish() } }

  private func finish() {
    guard let handler, let content else { return }
    self.handler = nil
    deadline?.cancel(); deadline = nil
    runtime?.close(); runtime = nil
    handler(content)
    self.content = nil
  }
}
