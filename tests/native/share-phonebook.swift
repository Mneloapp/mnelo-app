import UIKit
import Contacts

// Compile only into the disposable contact fixture app, alongside the production
// SharePhonebook.swift and ShareRecipient.swift. Never install on a real device.
#if !targetEnvironment(simulator)
#error("This fixture is simulator-only")
#endif

@main final class SharePhonebookProbe: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    precondition(Bundle.main.bundleIdentifier == "com.mnelo.fixture.phonebook")
    let label = UILabel(); label.numberOfLines = 0; label.textAlignment = .center
    let controller = UIViewController(); controller.view.backgroundColor = .white
    controller.view.addSubview(label); label.frame = CGRect(x: 20, y: 150, width: 350, height: 300)
    window = UIWindow(frame: UIScreen.main.bounds); window?.rootViewController = controller; window?.makeKeyAndVisible()
    do {
      let report = try verify()
      let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
      let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      try data.write(to: documents.appendingPathComponent("result.json"))
      label.text = "PASS\nDuplicate contact order and both-name search"
    } catch { label.text = "FAIL: \(error)" }
    return true
  }

  private func verify() throws -> [String: Any] {
    let number = "+12025550102"
    func normalize(_ raw: String) -> String {
      let digits = raw.filter(\.isNumber)
      if digits == "2025550102" || digits == "12025550102" { return number }
      return "+" + digits
    }
    if ProcessInfo.processInfo.arguments.contains("--denied") {
      precondition(!SharePhonebook.permitted())
      precondition(SharePhonebook.names([number], normalize: normalize).isEmpty)
      return ["permissionDenied": "PASS", "result": "PASS"]
    }
    precondition(SharePhonebook.permitted())
    let store = CNContactStore()
    let alias = CNMutableContact()
    alias.givenName = "Ani <3"; alias.familyName = "Z fixture"
    alias.phoneNumbers = [CNLabeledValue(label: CNLabelPhoneNumberMobile, value: CNPhoneNumber(stringValue: "(202) 555-0102"))]
    let primary = CNMutableContact()
    primary.givenName = "ჩემი მეგობარი ❣️"; primary.familyName = "A fixture"
    primary.phoneNumbers = [
      CNLabeledValue(label: CNLabelPhoneNumberMobile, value: CNPhoneNumber(stringValue: number)),
      CNLabeledValue(label: CNLabelPhoneNumberMain, value: CNPhoneNumber(stringValue: "2025550102"))
    ]
    let unrelated = CNMutableContact()
    unrelated.givenName = "Unrelated fixture"
    unrelated.phoneNumbers = [CNLabeledValue(label: CNLabelPhoneNumberMobile, value: CNPhoneNumber(stringValue: "+442025550102"))]
    let save = CNSaveRequest()
    for contact in [alias, primary, unrelated] { save.add(contact, toContainerWithIdentifier: nil) }
    try store.execute(save)
    defer {
      let cleanup = CNSaveRequest()
      for contact in [alias, primary, unrelated] { cleanup.delete(contact) }
      try? store.execute(cleanup)
    }
    func appNames() throws -> [String] {
      // The request configuration in the installed Expo Contacts repository.
      let request = CNContactFetchRequest(keysToFetch: [CNContactFormatter.descriptorForRequiredKeys(for: .fullName), CNContactPhoneNumbersKey as CNKeyDescriptor])
      request.sortOrder = .userDefault; request.unifyResults = true
      var result: [String] = []
      try store.enumerateContacts(with: request) { contact, _ in
        if contact.phoneNumbers.contains(where: { normalize($0.value.stringValue) == number }) {
          result.append(CNContactFormatter.string(from: contact, style: .fullName) ?? "")
        }
      }
      return result
    }
    let expected = try appNames()
    let rows = SharePhonebook.names([number], normalize: normalize)
    precondition(expected.count == 2)
    precondition(rows.map { $0[0] } == [number, number])
    precondition(rows.map { $0[1] } == expected)
    let recipient = ShareRecipient(id: "fixture-chat", title: expected[0], group: false, searchTerms: expected + [number])
    for query in ["Ani", "ani <3", "ჩემი", "მეგობარი", "  Ani  ", "❣️", number, " "] {
      precondition(recipient.matches(query), "Missing query: \(query)")
    }
    precondition(!recipient.matches("Unrelated"))
    let group = ShareRecipient(id: "group", title: "Family", group: true, searchTerms: ["Family"])
    precondition(!group.matches("Ani"))
    primary.givenName = "ახალი სახელი"
    let rename = CNSaveRequest(); rename.update(primary); try store.execute(rename)
    let renamed = SharePhonebook.names([number], normalize: normalize).map { $0[1] }
    let renamedExpected = try appNames()
    precondition(renamed == renamedExpected)
    precondition(renamed.contains { $0.contains("ახალი სახელი") })
    precondition(!renamed.contains { $0.contains("ჩემი მეგობარი") })
    return ["result": "PASS", "sameDeviceOrder": expected, "aliases": rows.count, "bothNameSearch": "PASS", "rename": "PASS", "unrelatedNumberExcluded": "PASS"]
  }
}
