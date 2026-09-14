# Build 27: contact names and automatic share completion

The native Photos/Files recipient picker now uses the same contact-name precedence as Chats: the current authorized phone-book name, then the current Mnelo profile/username/phone fallback. The previous stored alias no longer overrides that projection. Native Contacts access uses the containing app’s existing authorized or limited grant, never requests access from the share sheet, and drops results on denial/read failure. Name and full-number normalization are shared with the main app. Unmatched contacts and matched aliases are never persisted or transmitted.

After every selected item has been durably committed to the existing encrypted chat/outbox and the bounded upload attempt finishes, the extension completes automatically and returns to the source app. This applies to online and queued sends. There is no extra Done screen. Uncommitted/partial failures retain the picker and retry skips items already committed; a queued item is not reported as recipient delivery. Main-app delivery resumes queued work when the app runs with connectivity.

A reproduced delivery bug let older failed outbox entries stop the current share’s multi-chunk photo transfer. The extension now scopes its delivery pump to this share’s message tokens. It advances eligible transfers even if another selected group recipient is in backoff, while respecting retry deadlines. The containing app retains its ordinary full-queue pump. No inbox is consumed by the extension.

Validation:

- Full repository checks passed: 444 UI/unit, 3 server and 145 device/protocol tests.
- Extended real-Signal regression: 21 older unready outbox entries plus a 750 KB image reproduced premature queueing before the fix, then uploaded successfully after the fix. It also verifies current/renamed phone-book names, current-profile fallback, unchanged stored identity, partial retry without duplicates, offline durability and blocked recipients.
- Native share pod and isolated fixture app compiled for iOS 26.5. Actual Photos sharing resolved a local-format phone to its Georgian contact name, searched that name, reflected a renamed contact, and fell back to the number without prompting after Contacts permission was revoked.
- An explicit online native share reached a loopback official-Signal receiver and returned directly to Photos. An offline share also returned directly to Photos without a Done screen; X returned to the source share chooser. Tests used only synthetic files/identities/contacts in a disposable simulator and a reserved `.invalid` origin with a fixture-only URLProtocol; no real recipient was contacted.
- Release Metro export contains the preview endpoints and immutable source reference `ios-0.1.0-27`.

Signed archive/export, public-source CI and Apple/TestFlight availability are recorded separately in BUILD_LOG. Simulator results do not replace a physical TestFlight check of cold/warm and iCloud-backed sharing.
