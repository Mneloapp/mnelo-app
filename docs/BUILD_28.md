# Build 28: duplicate phone-contact names in sharing

When the same full phone number was saved under two names, Chats and the Photos/Files share picker could choose different names. Chats uses Expo Contacts' user-default sorting, while the native share reader left Apple's fetch order unspecified. [Apple documents the default as unsorted](https://developer.apple.com/documentation/contacts/cncontactfetchrequest/sortorder?language=objc). Sharing now explicitly uses the same user-default sort and unified contacts as the installed Expo Contacts implementation.

Both readers use the same first nonempty name in that order. The share reader continues through matching duplicates and retains their distinct names for local search. Searching either name selects the same single conversation and leaves its displayed name unchanged. Full international phone matching, current-profile fallback, blocked-recipient filtering, existing contact permissions and automatic return after Send remain in place. Alternate names never enter message packets, stored identities or a server-side address book. Group names remain group names.

Validation:

- Full checks passed: 446 UI/unit tests, 3 server tests and 145 device/protocol tests (594 total), with TypeScript, lint, formatting, security, environment, localization and brand checks.
- Duplicate-name tests cover the first nonempty name, repeated aliases, and a blank match on a full first page followed by a named contact on the next page.
- The real-Signal share regression verifies that the recipient title matches the Chats projection, both aliases belong to one recipient, renames replace stale aliases and permission loss removes phone-book search terms. Existing encrypted text/photo delivery, offline queue, partial retry and blocked-recipient checks pass.
- The simulator-only native probe in `tests/native/share-phonebook.swift` compiles the actual production Contacts reader and recipient search model. On a disposable iOS 26.5 simulator, two synthetic records for one number returned the same order as Expo Contacts' request; Georgian, Latin, emoji, whitespace and phone queries matched. It also checked rename refresh, exclusion of an unrelated foreign phone, and denied access returning no contacts. The simulator was deleted after verification; no real phone contact or recipient was touched.

Signed release verification and TestFlight availability are recorded separately in BUILD_LOG. Physical-device acceptance should check the owner's actual duplicate contacts with their existing iOS sort preference.
