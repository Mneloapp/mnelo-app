# Mnelo

**Open source · AGPL-3.0-only.** [Source and licensing](docs/OPEN_SOURCE.md) ·
[Contributing](CONTRIBUTING.md) · [Report a security issue privately](SECURITY.md).
Built for simple, private human communication, without AI. A future voluntary
donation model is intended; no payment integration is active.

> September 14: TestFlight **0.1.0 (21)** is available to the existing internal testing group; the external group is **Waiting for Review**. Build 22 is in verification and adds group calls, video-call screen sharing and the latest chat corrections. [Build evidence](docs/BUILD_LOG.md) · [Build 22 behavior and validation](docs/BUILD_22.md).

Mnelo is the official product name. The product is now a device-owned messenger: direct chats, private groups and voice/video calls. Navigation is **Chats | Calls | Me**. Connect, Need/Offer, matching and reputation are removed. Phone registration and exact-number contact lookup are supported through a separate minimal identity registry. Calls provides local history and voice/video calling to saved contacts; calls also remain available inside direct conversations.

New chat and New call open a shared, searchable local-contact picker in a native modal. Chat contacts open conversations directly; call contacts have inline voice/video actions. New call → Keypad supports dialing a full international number. New contact and public-code screens are separate from the picker; closing returns to the originating tab. [Current navigation](docs/UX_FLOW.md).

Chats includes permanent local search and All / Unread / Direct / Groups filters. Chats and Calls show independent device-local unread/missed counts. Me → Notifications enables generic alerts with no sender names or message previews. Native APNs/PushKit/CallKit on iOS and FCM/Telecom on Android now provide the background delivery path. Provider configuration and real-device acceptance remain separate requirements. [Notification behavior](docs/NOTIFICATIONS.md) and [routing/privacy boundary](docs/BACKGROUND_DELIVERY.md).

Private history lives in SQLCipher on participant devices. Each participant owns an independent copy. Clearing a conversation stays local. Build 22 adds authenticated author edits and deletion of individual sent messages for every original recipient; recipients need the updated client to apply these controls. Installed build 9 keeps unsent messages locally until the recipient can connect. TestFlight build 11 enables a separate authenticated Signal ciphertext mailbox and encrypted media store, with original expiry up to 30 days and recipient-ACK cleanup. The signaling relay is not a conversation archive. Account/routing metadata remains separate; this is not a zero-server-information claim.

**Status: architecture migration implemented for development; NOT READY for public release.** The protocol integration is new and awaits independent review. Development identity/relay/TURN and the encrypted delivery endpoint are deployed. No physical new-client or background delivery guarantee is claimed. See [QA](docs/QA_REPORT.md) and [release blockers](docs/RELEASE.md).

## Run locally

Node 24.18 / npm 11.16. Use an Expo Development Build; Expo Go and a browser database fallback are unsupported.

```sh
npm ci
cp .env.example .env.local # only for a new checkout; preserve existing local configuration
npm run relay:start
# In another terminal; accepts fictional test numbers only and sends no SMS.
npm run identity:local
# In another terminal; IPv4 avoids localhost resolving only to ::1 for the simulator.
NODE_OPTIONS=--dns-result-order=ipv4first npm start -- --localhost --port 8083
npm run ios
```

The relay listens only on 127.0.0.1:8084. For iOS generate native projects and install pods after adding native modules. Android uses `npm run android:build`; see [native build evidence](docs/BUILD_LOG.md). The same app identity remains `com.mnelo.messenger`, scheme `mnelo`, domain https://mnelo.com.

Launch shows the approved Mnelo mark while fonts and the local vault load, with a short automatic Welcome transition. First entry is a large centered Mnelo wordmark, a single inline country-code/number field and Continue, followed by six-digit OTP and Chats. Privacy information opens on demand from a small footer link; a new installation also retains Restore a backup. Phone number is the primary discovery identifier: enabled at registration, with an opt-out in Me > Privacy. A number change preserves that prior privacy choice. Georgia (+995) is initially selected. Name entry is not required for registration; Me contains a local username and optional first/last names. Me > Change phone number verifies a replacement while retaining the old registration until success. Existing unverified identities retain their history but must verify before entering any feature. Already enrolled devices reopen offline without another SMS. Imported backups retain identity/history/profile but require enrollment on that installation; SMS never restores encryption keys. No global username reservation/search or address-book upload is introduced. The pending update supports national-number lookup with an inline country selector and local address-book names. Its new delivery adapter verifies the sender of an addressed first message; reciprocal manual adding is no longer required. Optional peer-key comparison remains available.

Local fixture numbers: `+12025550101` and `+12025550102`; code `864209`. These are reserved fictional numbers accepted only by `identity:local`. Infobip is configured separately for real registration SMS; the first physical iPhone SMS receipt and verification succeeded on September 12; the second tester also enrolled; both phones remain on build 9. See [phone identity setup, data and limitations](docs/PHONE_IDENTITY.md).

Infobip 2FA is the configured development SMS provider. Its account/template/API configuration was checked previously; the owner confirmed actual SMS receipt/code entry on the first iPhone, corroborated by the hosted registry. Only explicit device enrollment, number change or resend sends SMS; ordinary app restarts and reconnect do not. A restored installation enrolls again using the recovered key. Twilio/Vonage remain selectable adapters behind the same identity-service origin. See [setup and trial limitations](docs/PHONE_IDENTITY.md).

## Verify

```sh
npm run check
npm run doctor
npx expo install --check
npm run export:mobile
npm run scan:secrets
```

`npm run test:device` runs the current local storage, relay and privacy boundary tests. `npx tsx scripts/messenger-browser-qa.ts` serves a loopback-only real WebRTC test harness. Historical Supabase migrations and negative tests remain in the repository for audit continuity; they are not the active app backend. Removed UI lives in `legacy/server-v1`.

Optional backups are encrypted on-device and exported through the system share sheet to the user's chosen location. Restore needs the user's recovery key and an empty local identity. **Automatic Drive/iCloud synchronization is not implemented.** Mnelo has neither a backup copy nor a recovery key.

[Architecture](docs/ARCHITECTURE.md) · [Privacy](docs/PRIVACY_ARCHITECTURE.md) · [Security](docs/SECURITY.md) · [Testing](docs/TESTING.md)

Two physical iPhones: [current delivery status](docs/TWO_IPHONE_TESTING.md) and [Georgian test guide](docs/BETA_TEST_PLAN_KA.md). **0.1.0 (12)** passes signed archive/export/upload and Apple processing. The existing internal Mnelo Development group has access; the external Mnelo Preview group is **Waiting for Review**, with automatic tester notification enabled. Build 11 was removed from review so the latest corrected version is reviewed. Apple confirms build 11 installed for the existing internal tester. No build-12 installation, external email delivery or new two-phone flow PASS is claimed. Existing isolated reviewer accounts, real-number admission and hosted services were preserved. [Physical-test corrections](docs/PHYSICAL_FIXES.md) need acceptance on build 12.

The first rented development server is running in Hetzner: CX23 in Nuremberg, $7.09/month before tax. HTTPS phone verification and WSS signaling are deployed; Infobip has $20 funded balance and SMS is restricted to the two owner-selected testers; one has completed registration. [Hosting plan and actual provisioning state](docs/DEVELOPMENT_HOSTING.md). Run `npm run test:relay:cohort` for the isolated 50-peer signaling check; this is not live voice/video capacity certification.

UI typography and navigation: native iOS/Android screens use system typography; web keeps the bundled DM Sans/FiraGO faces. The compact three-tab bar and approved Mnelo wordmark remain. See [font provenance](docs/TYPOGRAPHY.md) and the [physical-feedback QA result](docs/QA_REPORT.md). The latest chat, calls, contacts and photo refinements require a subsequent build; they are not in the already uploaded TestFlight build 11.
