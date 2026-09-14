# Build 26: native Photos and Files sharing

Photos/Files now present a native Mnelo recipient sheet inside the source app. It shows bounded local previews, conversation search and an explicit Send action. X cancels the extension and returns to the source share sheet. Successful submission completes the extension and returns to the source app. The containing Mnelo app is not launched by this flow.

The provider's temporary file is copied synchronously inside `loadFileRepresentation`'s callback, before iOS releases it. Images are downsampled with ImageIO to 1600 pixels and encoded as JPEG without source metadata. Source images are bounded at 50 MB; ordinary files at 10 MB; at most 10 items are accepted. Temporary copies use data protection, backup exclusion, cleanup on completion/cancellation and expiry after an interrupted session. The older pending-share fallback imports app-group files into the app cache once instead of rechecking a temporary file on every render.

The share extension runs the existing portable DeviceMessenger/ApplicationDelivery engine in JavaScriptCore. The Signal Swift core is shared source, not a separate protocol implementation. A pure native pod supplies the same SQLCipher and official libsignal versions without a React Native UI/runtime. The extension consumes no delivery inbox or incoming calls. New share items are committed sequentially and retry skips committed items in that session. Offline submissions remain in the main chat's durable queue and the UI says to open Mnelo to retry; it never calls this recipient delivery.

On the first main-app launch after updating, the existing SQLCipher vault directory and journal move together into the app's existing App Group. The encryption key remains device-bound and is additionally available to the app's own share extension through an explicit keychain group. The main app retains its original keychain access group and SecureStore key. Conflicting old/new histories or a missing key fail closed. The extension only opens an existing schema/registered identity. SQLite `BEGIN IMMEDIATE` transactions and a busy timeout serialize app/extension writes to the same ratchet state. Foreground query refresh reveals messages committed by the extension. Android retains its existing vault behavior.

Verification before release:

- Full repository checks: 444 UI/unit tests, 3 server tests and 145 device/protocol tests, including a real Signal text/photo share, blocked recipient, offline queue, cancel and partial retry.
- Native incoming-file probe: canonical paths, iOS aliases, traversal/symlink rejection, protected cache copy, repeat import and cleanup.
- Unsigned iOS app/share/broadcast build and standalone simulator share runtime build.
- Dedicated iOS 26.5 simulator, with no user account or real contacts: existing encrypted history moved successfully; actual Photos provider loaded the synthetic photo; X returned to the Photos share sheet; an offline share stayed queued; actual native SQLCipher/JavaScriptCore/Swift libsignal photo submission reached a loopback receiver using the official Node libsignal implementation; success returned to Photos. The test used a reserved `.invalid` origin and a fixture-only URLProtocol, without changing certificate trust or contacting the hosted service.

Simulator evidence does not replace a physical TestFlight cold/warm share, iCloud download or large-file memory acceptance test. After installing this update, open Mnelo once before using the new share extension. Existing account identity, phone registration and messages must be retained; do not reinstall to test the update.

Final signed archive, public source, CI, upload and tester availability are recorded in BUILD_LOG after verification. Build 25 remains the previous released build until that checkpoint.
