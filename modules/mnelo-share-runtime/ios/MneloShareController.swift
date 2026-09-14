import UIKit
import SwiftUI
import Intents

open class MneloShareController: UIViewController {
  private let model = ShareModel()
  private var host: UIHostingController<ShareView>?
  open override func viewDidLoad() {
    super.viewDidLoad()
    let host = UIHostingController(rootView: ShareView(model: model))
    self.host = host
    addChild(host); view.addSubview(host.view)
    host.view.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor), host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor), host.view.topAnchor.constraint(equalTo: view.topAnchor), host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)])
    host.didMove(toParent: self)
    model.finish = { [weak self] completed in
      guard let context = self?.extensionContext else { return }
      if completed { context.completeRequest(returningItems: nil) }
      else { context.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError)) }
    }
    let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
    let suggestion = (extensionContext?.intent as? INSendMessageIntent)?.conversationIdentifier
    model.load(providers, suggestion: suggestion)
  }
  deinit { model.dispose() }
}

struct ShareRecipient: Identifiable { let id: String; let title: String; let group: Bool }
final class ShareModel: ObservableObject {
  @Published var items: [ShareAttachment] = []
  @Published var recipients: [ShareRecipient] = []
  @Published var selected: String?
  @Published var query = ""
  @Published var loading = true
  @Published var sending = false
  @Published var issue = ""
  @Published var completed = false
  @Published var partial = false
  @Published var committed = 0
  var finish: ((Bool) -> Void)?
  private let loader = ShareAttachments()
  private let runtime = ShareRuntime()
  private var closed = false
  let georgian = Locale.preferredLanguages.first?.hasPrefix("ka") == true
  func text(_ en: String, _ ka: String) -> String { georgian ? ka : en }
  var filtered: [ShareRecipient] { query.isEmpty ? recipients : recipients.filter { $0.title.localizedStandardContains(query) } }
  func load(_ providers: [NSItemProvider], suggestion: String?) {
    loader.load(providers) { [weak self] result in
      guard let self, !self.closed else { return }
      switch result {
      case .failure(let error): self.loading = false; self.issue = self.message(error)
      case .success(let items):
        self.items = items
        self.runtime.open(items: items) { [weak self] result in
          guard let self, !self.closed else { return }
          self.loading = false
          switch result {
          case .failure(let error): self.issue = self.message(error)
          case .success(let value):
            self.recipients = (value as? [[String: Any]] ?? []).compactMap { row in
              guard let id = row["id"] as? String, let title = row["title"] as? String else { return nil }
              return ShareRecipient(id: id, title: title, group: row["group"] as? Bool ?? false)
            }
            if self.recipients.contains(where: { $0.id == suggestion }) { self.selected = suggestion }
          }
        }
      }
    }
  }
  func send() {
    guard let selected, !sending else { return }
    sending = true; issue = ""
    runtime.send(selected) { [weak self] result in
      guard let self, !self.closed else { return }
      self.sending = false
      switch result {
      case .failure(let error): self.issue = self.message(error)
      case .success(let value):
        guard let value = value as? [String: Any], let count = value["committed"] as? Int else { self.issue = self.message(shareError("SHARE_FAILED")); return }
        self.committed = count
        if count == self.items.count && value["uploaded"] as? Bool == true { self.close(completed: true); return }
        self.completed = count == self.items.count
        self.partial = count > 0 && !self.completed
        if self.completed { self.issue = self.text("Saved to your chat. Open Mnelo to retry sending when a connection is available.", "შეტყობინება ჩატში შენახულია. კავშირის აღდგენის შემდეგ გასაგზავნად გახსენით Mnelo.") }
        else if self.partial { self.issue = self.text("\(count) of \(self.items.count) items saved. Retry to send the remaining items.", "შენახულია \(count)/\(self.items.count). დარჩენილი ფაილების გასაგზავნად სცადეთ ხელახლა.") }
        else { self.issue = self.message(shareError(value["failure"] as? String ?? "SHARE_FAILED")) }
      }
    }
  }
  func close(completed: Bool = false) {
    guard !closed else { return }; closed = true
    runtime.close(); loader.cancel(); finish?(completed || self.completed || committed > 0)
  }
  func dispose() { runtime.close(); loader.cancel() }
  private func message(_ error: Error) -> String {
    switch (error as NSError).domain {
    case "SHARE_OPEN_MNELO_FIRST": return text("Open Mnelo once after updating, then return here to share.", "განახლების შემდეგ ერთხელ გახსენით Mnelo, შემდეგ აქ დაბრუნდით გასაზიარებლად.")
    case "SHARE_TOO_MANY": return text("Choose up to 10 items to share.", "გასაზიარებლად აირჩიეთ მაქსიმუმ 10 ფაილი.")
    case "SHARE_STORAGE_FULL": return text("There is not enough free space to prepare this file. Free some space on your phone, then try again.", "ფაილის მოსამზადებლად საკმარისი თავისუფალი ადგილი არ არის. გაათავისუფლეთ ადგილი ტელეფონში და სცადეთ ხელახლა.")
    case "SHARE_FILE_TOO_LARGE": return text("This file is too large. Files can be up to 10 MB; photos are resized automatically.", "ფაილი ძალიან დიდია. მაქსიმალური ზომაა 10 მბ; ფოტოები ავტომატურად მცირდება.")
    case "CONTACT_BLOCKED", "CHAT_FORBIDDEN": return text("You cannot send to this conversation. Choose another chat.", "ამ ჩატში გაგზავნა შეუძლებელია. აირჩიეთ სხვა ჩატი.")
    case "SHARE_FILE_UNAVAILABLE": return text("This item could not be loaded. Return to Photos or Files and try sharing it again.", "ფაილის ჩატვირთვა ვერ მოხერხდა. დაბრუნდით Photos-ში ან Files-ში და სცადეთ ხელახლა.")
    default: return text("Sharing could not finish. Please try again.", "გაზიარება ვერ დასრულდა. სცადეთ ხელახლა.")
    }
  }
}

struct ShareView: View {
  @ObservedObject var model: ShareModel
  private let accent = Color(red: 0.84, green: 1, blue: 0.24)
  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Button { model.close() } label: { Image(systemName: "xmark").font(.system(size: 21, weight: .medium)).frame(width: 44, height: 44).background(.white, in: Circle()) }
          .accessibilityLabel(model.text("Cancel sharing", "გაზიარების გაუქმება"))
        Spacer()
        Text(model.text("Send to", "გაგზავნა")).font(.headline)
        Spacer()
        Color.clear.frame(width: 44, height: 44)
      }.padding(.horizontal, 20).padding(.top, 20).padding(.bottom, 12)
      if !model.items.isEmpty {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 12) {
            ForEach(model.items) { item in
              VStack(spacing: 6) {
                if let image = item.thumbnail { Image(uiImage: image).resizable().scaledToFill().frame(width: 76, height: 76).clipped().clipShape(RoundedRectangle(cornerRadius: 14)) }
                else { Image(systemName: item.kind == "text" ? "text.alignleft" : "doc.fill").font(.title2).frame(width: 76, height: 76).background(.white, in: RoundedRectangle(cornerRadius: 14)) }
                Text(item.name).font(.caption2).lineLimit(1).frame(width: 88)
              }
            }
          }.padding(.horizontal, 20).padding(.vertical, 8)
        }.fixedSize(horizontal: false, vertical: true)
      }
      if model.loading {
        Spacer(); ProgressView(model.text("Preparing…", "მზადდება…")); Spacer()
      } else if model.recipients.isEmpty || model.completed {
        Spacer()
        VStack(spacing: 16) {
          Image(systemName: model.completed ? "checkmark.circle" : "person.2").font(.system(size: 36)).foregroundStyle(.secondary)
          Text(model.issue.isEmpty ? model.text("Your conversations will appear here after you start a chat in Mnelo.", "ჩატების დაწყების შემდეგ ისინი აქ გამოჩნდება.") : model.issue).multilineTextAlignment(.center).foregroundStyle(.secondary)
        }.padding(30)
        Spacer()
      } else {
        HStack(spacing: 10) {
          Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
          TextField(model.text("Search", "ძებნა"), text: $model.query).textInputAutocapitalization(.never).autocorrectionDisabled()
        }.padding(15).background(.white, in: Capsule()).padding(.horizontal, 20).padding(.vertical, 12)
        ScrollView {
          LazyVStack(spacing: 0) {
            ForEach(model.filtered) { recipient in
              Button {
                guard !model.sending && !model.partial else { return }
                model.selected = recipient.id; model.issue = ""
              } label: {
                HStack(spacing: 12) {
                  Image(systemName: recipient.group ? "person.2.fill" : "person.fill").foregroundStyle(Color(red: 0.27, green: 0.39, blue: 0.31)).frame(width: 46, height: 46).background(accent.opacity(0.25), in: Circle())
                  Text(recipient.title).font(.body.weight(.semibold)).lineLimit(2).multilineTextAlignment(.leading)
                  Spacer(minLength: 10)
                  Image(systemName: model.selected == recipient.id ? "checkmark.circle.fill" : "circle").font(.system(size: 26)).foregroundStyle(model.selected == recipient.id ? Color(red: 0.25, green: 0.42, blue: 0.22) : .gray)
                }.padding(14).contentShape(Rectangle())
              }.buttonStyle(.plain).accessibilityAddTraits(model.selected == recipient.id ? .isSelected : [])
              if recipient.id != model.filtered.last?.id { Divider().padding(.leading, 72) }
            }
          }.background(.white, in: RoundedRectangle(cornerRadius: 24)).padding(.horizontal, 20)
          if model.filtered.isEmpty { Text(model.text("No conversations found", "ჩატი ვერ მოიძებნა")).foregroundStyle(.secondary).padding(24) }
        }.scrollDismissesKeyboard(.interactively)
        if !model.issue.isEmpty { Text(model.issue).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.horizontal, 24).padding(.top, 12) }
      }
      if !model.loading && (!model.recipients.isEmpty || model.completed) {
        Button {
          if model.completed { model.close(completed: true) } else { model.send() }
        } label: {
          HStack {
            Spacer()
            if model.sending { ProgressView().tint(.black) }
            Text(model.completed ? model.text("Done", "დასრულება") : model.sending ? model.text("Sending…", "იგზავნება…") : model.partial ? model.text("Retry remaining items", "დარჩენილის გაგზავნა") : model.text("Send", "გაგზავნა")).font(.body.weight(.semibold))
            Spacer()
          }.padding(.vertical, 16).background(accent, in: Capsule())
        }.disabled((model.selected == nil && !model.completed) || model.sending).opacity(model.selected == nil && !model.completed ? 0.45 : 1).padding(20)
      }
    }.foregroundStyle(.black).background(Color(red: 0.94, green: 0.94, blue: 0.93)).preferredColorScheme(.light)
  }
}
