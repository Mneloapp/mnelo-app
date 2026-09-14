import Contacts
import Foundation

enum SharePhonebook {
  static func permitted() -> Bool {
    let status = CNContactStore.authorizationStatus(for: .contacts)
    if #available(iOS 18, *), status == .limited { return true }
    return status == .authorized
  }

  // The containing app's existing grant applies to its extension. Never prompt
  // from Photos, persist aliases, or retain the unmatched address book.
  static func names(_ numbers: [String], normalize: (String) -> String) -> [[String]] {
    guard !numbers.isEmpty, numbers.count <= 1000, permitted() else { return [] }
    let wanted = Set(numbers)
    var matches: [String: String] = [:]
    let request = CNContactFetchRequest(keysToFetch: [
      CNContactFormatter.descriptorForRequiredKeys(for: .fullName),
      CNContactPhoneNumbersKey as CNKeyDescriptor
    ])
    do {
      try CNContactStore().enumerateContacts(with: request) { contact, stop in
        for phone in contact.phoneNumbers {
          let number = normalize(phone.value.stringValue)
          if wanted.contains(number), matches[number] == nil {
            matches[number] = CNContactFormatter.string(from: contact, style: .fullName) ?? ""
          }
        }
        if matches.count == wanted.count { stop.pointee = true }
      }
      // A revoked or reduced grant must not leave previously read names behind.
      guard permitted() else { return [] }
      return matches.map { [$0.key, $0.value] }
    } catch { return [] }
  }
}
