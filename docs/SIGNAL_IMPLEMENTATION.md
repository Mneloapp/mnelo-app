# Signal delivery migration checkpoint

Status: implementation in progress; **server deployed and enabled, physical clients not migrated**. See [current rollout](DELIVERY_ROLLOUT.md). The owner's September 12 instruction supersedes the former prohibition on all temporary ciphertext storage. The product remains Chats / Calls / Me, without Connect or AI. Existing phone registration, participant history and signing identity are preserved.

Latest checkpoint (September 13): native iOS **and** Android protocol execution now passes, including independent Node/vendor interoperability in both directions. Earlier compilation-only statements below are historical checkpoints. Shared runtime, encrypted media, profiles, per-item retry isolation and precise read receipts are implemented behind the opt-in flag. Safe key replenishment is implemented; signed-key rotation/retirement and device recovery are still release gates. Neither physical phone has been migrated. The owner has now authorized AGPL-3.0-only source distribution; binary distribution compliance remains a separate gate. See [open-source decision](OPEN_SOURCE.md).

## Verified foundation

- Official libsignal **0.102.2**, pinned native Swift and Java dependencies. Official Node package is a development-only dependency for tests; mobile and hosted bundles do not import its Node binary.
- Swift Expo module compiled and final Release iPhone app linked with Xcode 26.6. Kotlin Expo module compiled with Gradle 9.3.1 and isolated Temurin 21.0.12.1+1. These results are compilation evidence, not a native cross-device cryptographic interoperability test.
- The native modules accept and return opaque vendor state records. They do not persist or log private keys. The SQLCipher journal serializes mutations, committing the advanced session state together with ciphertext outbox or decrypted local inbox. Chat projection must complete before server acknowledgement.
- A public directory binds the Signal identity to the existing Ed25519 device identity. Signed phone challenge authentication precedes every delivery operation. Existing pins cannot be silently replaced; finite one-time EC/Kyber bundles are atomically leased, with a high-water mark preventing accidental republication of consumed keys.
- A separate SQLite delivery spool holds ciphertext, sender/recipient routing keys, opaque message IDs and expiry. Maximum retention is 30 days from the original message creation time; retries do not extend it. Recipient acknowledgement removes the ciphertext. Minimal ID/hash tombstones remain until the original expiry for idempotency. This is **not zero server metadata** and must not be marketed that way.
- Server-side bidirectional blocks and existing tester/reviewer cohort separation remain required. The server endpoint accepts only signed registered actors, bounds request sizes and paginates recipient-only inboxes. Configuration `MNELO_DELIVERY_V2=1` is opt-in and has not been enabled on the hosted server.
- Journal tests use the actual Rust-backed libsignal Node package: sender disappearance, server restart, commit rollback, process reconstruction, duplicate receive, wrong identity, tampered ciphertext and altered envelope ID/timestamp are covered.

## Native build finding

The first Signal iPhone build compiled Swift but failed at final linking with undefined `_signal_*` symbols. CocoaPods static frameworks archived the Swift wrapper but did not propagate its Rust static archive to the application linker. The local MneloSignal podspec now adds the vendor archive at `$(PROJECT_TEMP_ROOT)/Pods.build/libsignal_ffi/target/$(MNELO_SIGNAL_CARGO_TARGET)/release/libsignal_ffi.a` to the final link, with device/simulator architecture mappings. The CNG plugin pins the vendor's published archive SHA-256; no generated vendor source is patched. Reinstallation and incremental Release build passed. Existing Expo/RN versions were retained.

Upstream Java artifacts target Java 21. The Android helper now installs/selects a checksum-verified isolated JDK 21, preserving JDK 17 and existing SDK/AVD data. The new Kotlin module compiled; a complete new APK and device interoperability test remain pending.

## Release gates and remaining integration

1. Wire the durable journal into the shared device runtime with explicit protocol/version migration, per-peer serialization, retry/backoff, capacity/expiry UI and durable receipts. There must be no silent plaintext or old-protocol fallback.
2. Integrate the encrypted attachment-object store, local journal and bounded transfer worker with message projection. The isolated signed-HTTP path now covers quotas, resume and acknowledgement cleanup; application scheduling and physical media remain unverified. Large media must not block text or call control.
3. Separate authenticated call control from the message data channel, verify TURN behavior and finite ringing/missed-call handling, and test the reported “Call ended” failure on the two physical iPhones.
4. Complete native Swift/Java interoperability tests, prekey replenishment/expiry, signed-key rotation, account unlink and backup/recovery semantics. Restoring an old ratchet snapshot must not reuse session keys or silently reset a registered identity. The current history backup implementation has not yet been migrated.
5. Verify first-contact delivery, block changes while offline, projection/ACK crash boundaries, background notification behavior and both physical-device installations without deleting existing vaults.
6. Update all customer-facing privacy copy when the new path activates. Earlier direct-only claims in historical documentation describe the installed runtime, not the accepted target. Server backups must exclude the ephemeral delivery store; deletion means removal from active storage, not a promise of forensic erasure on provider media.
7. **Distribution license gate:** upstream libsignal is AGPL-3.0-only and explicitly does not support external consumers. Pinning provides reproducibility, not vendor support or a security certification. Before new TestFlight/App Store distribution, decide and satisfy applicable combined-work/source-offer obligations with the owner; do not silently relicense or publish the owner's repository. Development feasibility work is not a license-compliance sign-off. The wrapper's own metadata does not override upstream licensing.

No claim of WhatsApp wire compatibility, identical proprietary implementation, audited end-to-end security, complete offline delivery in installed builds or working physical calls is made by this checkpoint.

## Encrypted media checkpoint — September 13

Media objects use standard AES-256-GCM with an independently random key/nonce and authenticated owner, recipient and object ID. Their key, nonce and filename/MIME/duration travel only inside the encrypted Signal payload. The separate authenticated object API accepts ciphertext and bounded routing/expiry metadata, never a content key. Upload reservations enforce declared-size quotas before accepting chunks. The receiving device verifies ciphertext digest and GCM authentication before projecting the attachment into local history.

The local SQLCipher adapter retains resumable encrypted chunks and their private descriptors. An upload step sends at most two 128 KiB chunks; a download step receives at most two, allowing the caller to interleave messages and controls. Lost responses reuse existing chunks and object IDs. Recipient consumption is a separate durable step after history commit; only then may the server object be acknowledged/deleted. Expired partial local downloads release their slots and chunks. Keys and descriptors remain private local records and must be included in the pending account/deletion/recovery integration review.

Seven synthetic media tests pass, including real signed HTTP transport, sender disappearance, server restart, wrong-recipient access, tampering, quota/expiry boundaries, block/unlink cleanup, commit rollback and lost upload/ACK responses. This subsystem is not yet mounted in the mobile runtime or enabled on the hosted server.

## Evidence

- `artifacts/signal-ios-build-final.log`: **BUILD SUCCEEDED**.
- `artifacts/signal-android-compile.log`: `:mnelo-signal:compileDebugKotlin`, **BUILD SUCCESSFUL**.
- `artifacts/signal-full-check.log`: TypeScript, lint, formatting, 297 Jest tests, 3 server utility tests, 115 device/protocol integration tests, security/environment/localization/brand checks **PASS** (415 total tests).
- `artifacts/signal-directory-tests.log`, `signal-journal-tests.log`, `delivery-tests.log`: detailed synthetic-device test evidence. No real customer message, phone OTP or private key is a test fixture.

Sources: [official native implementation and license](https://github.com/signalapp/libsignal/tree/v0.102.2), [official Swift integration](https://github.com/signalapp/libsignal/blob/v0.102.2/swift/README.md), [PQXDH specification](https://signal.org/docs/specifications/pqxdh/), [Double Ratchet specification](https://signal.org/docs/specifications/doubleratchet/). API usage was checked against the installed/pinned vendor source.

## Application adapter checkpoint — September 13

The new adapter now delivers text and private media into real DeviceMessenger histories using the actual Signal-backed signed-HTTP test setup. It is not mounted in the shared mobile runtime yet. First-contact sender phone confirmation is restricted to a pending envelope already addressed to the authenticated recipient. No reverse-phone lookup or contact-book upload is introduced. The recipient's existing local address-book name wins when permission is already present.

Read receipts and reaction operations are staged with local mutations; reaction revisions reject stale replay. Local deletion clears unsubmitted content and private file descriptors without deleting the other participant's history. Offline block changes have durable revision-checked synchronization. Inbox/outbox pages rotate so one pending attachment or old client does not permanently own the first page. A server-to-active-socket hint contains only `{type:"delivery"}` after durable acceptance; HTTPS polling remains the recovery path.

Call control now accepts an independent durable signaling implementation. Signed SDP can travel inside Signal messages, while WebRTC carries live media. A durable call-ID terminal record prevents expired/cancelled invitations from ringing after restart and records a missed call instead. This is an implemented boundary with tests, not a physically verified call fix. The shared-runtime, push wakeup, key lifecycle, recovery and remaining migration gates above are still open.

# Runtime and queued notifications — September 13 checkpoint

`EXPO_PUBLIC_DELIVERY_V2=1` now mounts the application adapter in the shared mobile runtime. It uses native Signal, reconnect/foreground wakes, durable text/media and independent call control/SDP. A vault already migrated to version 6 rejects a build without this mode. The flag remains absent from distributed EAS profiles; the hosted `MNELO_DELIVERY_V2` flag is still disabled.

Push work is inserted transactionally with ciphertext acceptance. A server worker retries provider failures and missing routes independently of sender connectivity. Recipient ACK, block, unlink and original expiry remove pending work. Alerts contain only event identifiers/kind, never message text, names, numbers or content keys. These routing identifiers, timing and call/video hints are metadata visible to the service. The optional notification hint is also authenticated inside the Signal envelope.

Live call pushes retain zero provider TTL and a maximum original 60-second ringing window. If an invitation remains unacknowledged after that window, the pending job becomes a missed-call alert, not another ring. Message/missed-call alerts can wait at APNs until the original envelope expiry (maximum 30 days); Android FCM is bounded to 28 days. These are best-effort OS notifications, not delivery acknowledgements or a guarantee of background execution. Sources: [Apple APNs request documentation](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns), [Firebase message lifespan](https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan).

Accepted incoming call invitations are also journaled locally before the server ACK. Restart recovery preserves the original ring deadline, records expired invitations once and distinguishes a persisted answered/interrupted call from a missed invitation. No media stream is persisted. Swift/Java crypto interoperability, physical background/call testing, profile synchronization, key lifecycle/recovery, license disposition and adversarial queue handling remain release gates.
