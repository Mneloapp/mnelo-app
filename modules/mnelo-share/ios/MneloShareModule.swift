import ExpoModulesCore
import Intents
import CryptoKit

public final class MneloShareModule: Module {
  private let group = "group.com.mnelo.messenger.sharing"

  public func definition() -> ModuleDefinition {
    Name("MneloShare")

    Function("resolveIncomingFile") { (value: String) -> String? in
      guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: self.group)
        else { return nil }
      return MneloIncomingFile.resolve(value, inbox: container.appendingPathComponent("MneloIncoming"))?.absoluteString
    }

    Function("sharedConversation") { (values: [String]) -> String? in
      guard let defaults = UserDefaults(suiteName: self.group),
        let data = defaults.data(forKey: "expo-sharing"),
        let payloads = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
        payloads.compactMap({ $0["value"] as? String }) == values,
        let context = defaults.dictionary(forKey: "MneloShareContext"),
        context["digest"] as? String == SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined(),
        let chat = context["conversation"] as? String, chat.count <= 200 else { return nil }
      return chat
    }

    AsyncFunction("donateConversation") { (chat: String, title: String, avatar: String?, outgoing: Bool, promise: Promise) in
      guard !chat.isEmpty, chat.count <= 200, !title.isEmpty, title.count <= 200 else {
        promise.resolve(false)
        return
      }
      // No message body, phone number, identity key or conversation database enters the intent.
      let intent = INSendMessageIntent(recipients: nil, outgoingMessageType: .outgoingMessageText,
        content: nil, speakableGroupName: INSpeakableString(spokenPhrase: title),
        conversationIdentifier: chat, serviceName: nil, sender: nil, attachments: nil)
      if let avatar, avatar.hasPrefix("data:image/"), avatar.count < 2_000_000,
        let comma = avatar.firstIndex(of: ","),
        let data = Data(base64Encoded: String(avatar[avatar.index(after: comma)...])),
        let image = UIImage(data: data) {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 360, height: 360))
        let thumbnail = renderer.jpegData(withCompressionQuality: 0.8) { _ in
          image.draw(in: CGRect(x: 0, y: 0, width: 360, height: 360))
        }
        intent.setImage(INImage(imageData: thumbnail), forParameterNamed: \.speakableGroupName)
      }
      let interaction = INInteraction(intent: intent, response: nil)
      interaction.groupIdentifier = chat
      // One interaction per conversation bounds metadata retained by the system.
      interaction.identifier = "mnelo.conversation." + chat
      interaction.direction = outgoing ? .outgoing : .incoming
      interaction.donate { error in promise.resolve(error == nil) }
    }.runOnQueue(.main)

    AsyncFunction("forgetConversation") { (chat: String?, promise: Promise) in
      if let chat {
        INInteraction.delete(with: ["mnelo.conversation." + chat]) { error in promise.resolve(error == nil) }
      } else {
        INInteraction.deleteAll { error in promise.resolve(error == nil) }
      }
    }
  }
}
