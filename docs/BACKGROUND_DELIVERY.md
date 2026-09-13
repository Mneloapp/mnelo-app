# Background communication — required architecture

September 12 owner correction: background/closed-app incoming message alerts and calls are mandatory on **both iOS and Android** before the two-phone candidate is considered ready. The previously uploaded 0.1.0 (2) lacks this path and is not the accepted candidate. This document distinguishes implementation targets from verified results; QA_REPORT records actual tests.

## Privacy boundary

Conversation bodies, attachments, history and backups remain on participant devices. Mnelo does not add a durable encrypted or plaintext message queue. A sender keeps pending content locally until an authenticated recipient connection acknowledges receipt; push-provider acceptance never marks a message delivered/read. Deletion remains local to each participant.

The explicitly necessary routing exception consists of an application installation's Apple/Google push token, its platform/channel, public identity binding, token update time, and opaque revocable wake-permission hashes/expiry. No phone/name/contact graph/message/call history is stored in the push registry. Tokens are sensitive routing metadata, protected by filesystem permissions and authenticated APIs. They are not encryption keys. Account unlink/notification disable removes routing records; invalid/rotated provider tokens are removed safely. Do not continue claiming literally zero platform information.

Push payloads contain only a generic message/call event, random event UUID, and call media kind/expiry. No message text, sender name/number/public key, contact list, location or attachment enters Apple/Google payloads. Providers necessarily observe network/routing metadata. Requests use zero offline retention (`apns-expiration: 0`, FCM TTL zero). This is not a promise that third-party providers retain no operational metadata.

## Platforms

- **iOS messages:** ordinary visible APNs alerts can be presented while React is not running. A notification tap opens Mnelo and starts the existing authenticated delivery/reconnect path. Silent background pushes are not a reliable substitute for visible alerts. Notification permission remains user-controlled.
- **iOS calls:** PushKit wakes the native process. A native AppDelegate subscriber reports the incoming call to CallKit immediately, before JS/database/network initialization. CallKit drives answer, decline, end, interruption and audio-session activation. Ringing has a bounded deadline; late/cancelled events never revive a call. PushKit is used only for real incoming calls. System call-history integration is disabled.
- **Android messages:** FCM high-priority delivery and a native notification path; no dependency on an already-mounted React screen. Permission/channel settings remain user-controlled.
- **Android calls:** FCM triggers Android Telecom/native call lifecycle and a user-visible incoming call notification; appropriate foreground call execution supports an accepted ongoing call. Full-screen presentation follows Android permission/policy rules. Do not use an always-running websocket/service as a push substitute or require default-dialer replacement.

Android Settings → Force stop, an OS notification denial, power-off/no network, or iOS restart before the first passcode unlock are separate states. They must be tested/reported honestly rather than advertised as guaranteed reachable states. Removing a task from Recents is not the same as Android Force stop.

## Authorization and abuse prevention

Only an enrolled device can register its own push route. Sender-supplied arbitrary tokens/provider URLs/topics are rejected. A recipient grants a random wake capability to an accepted contact over the already authenticated DTLS channel. The server stores its hash and target route, not a sender/contact mapping. Unrelated enrolled users cannot wake arbitrary recipients by knowing a phone number or public key. Block revokes the capability; offline revocations stay in the recipient's encrypted outbox until server acknowledgement. Previously dispatched in-flight notifications cannot be recalled reliably, and a block is not reported as remotely synchronized before that acknowledgement.

Wake requests have sender, capability, recipient and global capacity bounds, short in-memory deduplication, fixed provider destinations, bounded timeouts/responses, and stable redacted failures. No request/payload logs, call/message journals or provider credentials in mobile code. APNs/FCM secrets stay in root-owned server configuration. Native tokens are never printed.

## Locked-device local storage

Calls must initialize after the screen locks. The original `WHEN_UNLOCKED_THIS_DEVICE_ONLY` key/complete file protection prevents that cold start. The implemented native migration preserves the same database key/name/path and SQLCipher content encryption, but changes accessibility to `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` and file protection to `completeUntilFirstUserAuthentication`. The key remains device-only and excluded from cloud backup; after reboot the first passcode unlock is still required. This intentionally permits this application's background runtime to access its local history after first unlock, including while the screen is locked. It does not claim unchanged lock-state access. Install/update once while unlocked; never generate a replacement key for an existing vault. Real-device migration acceptance remains pending.

Android now requires API 26 / Android 8 or later for the selected Core-Telecom integration. Both the authoritative Expo build-properties plugin and module Gradle configuration declare this minimum; target SDK remains 36. Video acceptance waits for the foreground app before camera capture; a voice call can use the native call lifecycle while locked, subject to previously granted microphone permission. Wake permission exchange uses a separate authenticated data channel so the main message protocol remains compatible with build 2. Pending offline revocations retry while the existing runtime is active; no permanent background service is introduced.

## Delivery limit that push does not remove

A generic notification can arrive while the recipient app is closed. Actual content transfer still needs the sender's local copy and a reachable authenticated sender runtime. If both operating systems suspend the apps, a push alone cannot make the unavailable content exist on the recipient device. No delivered checkmark until a device acknowledgement. Reliable content delivery while both participants remain offline would require a different approved store-and-forward design; it is not silently introduced here. Similarly, an OS force-stop cannot be overridden by our architecture.

## Acceptance matrix

For each platform, run native tests with an actual signed build: foreground; app backgrounded; screen locked; OS-terminated/cold start; notification denied; microphone/camera denied; Wi-Fi/cellular; receiver offline; sender suspended after send; duplicate/late push; answer before JS ready; decline before peer rendezvous; simultaneous calls; block/revoke; token rotation; in-place update; no content in provider/server logs. Android additionally covers Recents dismissal, explicit Force stop and full-screen notification access. iOS covers first unlock after reboot and CallKit audio activation/interruption.

A passing unit test, HTTP provider acceptance, a simulator injected push or native compilation is not a physical closed-app communication PASS. Apple/Google credentials and two-device testing remain independent external prerequisites.

Sources: [Apple PushKit/CallKit](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit), [APNs requests](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns), [Android calling architecture](https://developer.android.com/develop/connectivity/telecom/voip-app), [FCM priority](https://firebase.google.com/docs/cloud-messaging/android-message-priority).
