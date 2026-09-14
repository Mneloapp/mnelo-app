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
    var matches: [[String]] = []
    let request = CNContactFetchRequest(keysToFetch: [
      CNContactFormatter.descriptorForRequiredKeys(for: .fullName),
      CNContactPhoneNumbersKey as CNKeyDescriptor
    ])
    // Expo Contacts uses userDefault + unified contacts for Chats. The Contacts
    // default is unsorted, which can choose a different duplicate for one phone.
    request.sortOrder = .userDefault
    request.unifyResults = true
    do {
      try CNContactStore().enumerateContacts(with: request) { contact, _ in
        var seen = Set<String>()
        for phone in contact.phoneNumbers {
          let number = normalize(phone.value.stringValue)
          if wanted.contains(number), seen.insert(number).inserted {
            matches.append([number, CNContactFormatter.string(from: contact, style: .fullName) ?? ""])
          }
        }
      }
      // A revoked or reduced grant must not leave previously read names behind.
      guard permitted() else { return [] }
      return matches
    } catch { return [] }
  }
}
