import Foundation

struct ShareRecipient: Identifiable {
  let id: String
  let title: String
  let group: Bool
  let searchTerms: [String]

  func matches(_ query: String) -> Bool {
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
    return needle.isEmpty || title.localizedStandardContains(needle)
      || searchTerms.contains { $0.localizedStandardContains(needle) }
  }
}
