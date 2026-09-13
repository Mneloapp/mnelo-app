# Mnelo development push operations

This deployment extends the existing development identity service. It never copies a device database, changes tester admission, sends an OTP or enables conversation storage. The server keeps only installation routing and opaque capability hashes in `push-routes.db`, protected by the same 0700 state directory/0077 umask. Identity registry, index key and SMS budget files must remain intact.

## Apple

Use topic-specific APNs keys scoped only to `com.mnelo.messenger`. Development-signed local builds use Sandbox; TestFlight uses Production. A Sandbox-only key is not a TestFlight credential. The server deliberately rejects registration for an unconfigured environment instead of reporting readiness. Both alert and VoIP topics must be tested with actual device tokens.

Store private keys outside the repository and install root-owned mode 0600 under `/etc/mnelo`. Retain the existing 0700 directory; do not make it readable by the service account. Pass keys through systemd credentials, for example:

```ini
[Service]
LoadCredential=apns-sandbox:/etc/mnelo/apns-sandbox.p8
LoadCredential=apns-production:/etc/mnelo/apns-production.p8
EnvironmentFile=/etc/mnelo/push.env
```

The root-only environment file contains key IDs/team ID and credential paths, never inline private keys:

```dotenv
MNELO_APNS_TEAM_ID=CS6GJ2BMS9
MNELO_APNS_SANDBOX_KEY_ID=REPLACE_WITH_SCOPED_KEY_ID
MNELO_APNS_SANDBOX_KEY_FILE=/run/credentials/mnelo-identity.service/apns-sandbox
MNELO_APNS_PRODUCTION_KEY_ID=REPLACE_WITH_SCOPED_KEY_ID
MNELO_APNS_PRODUCTION_KEY_FILE=/run/credentials/mnelo-identity.service/apns-production
```

Apply a reviewed code bundle first, reload the unit and restart only identity. Preserve the previous runtime for rollback. Verify file modes, hashes, service health, registered-user count and existing tester admission without printing tokens, phone indices, keys or provider responses. `check-identity.mjs --url https://identity-dev.mnelo.com` is a no-SMS challenge/health diagnostic, not push receipt evidence.

September 12 follow-up: the owner's Download of ZF78N9555B also produced no accessible file. After checking Downloads and Chrome's download history, that unused key was revoked. A replacement was downloaded successfully through native Chrome: **UHS939BXXT**, Mnelo TestFlight Push, Production, Topic Specific, only `com.mnelo.messenger`. The existing Sandbox key **5G4XS8J4XY** was preserved. No other application's keys were changed.

The 257-byte Production key was moved from Downloads to `~/.config/mnelo/push/apns-production.p8` (0600, directory 0700), validated as EC P-256 without printing key material, and installed over SSH stdin to `/etc/mnelo/apns-production.p8` (root-owned 0600). Both environment keys are now loaded by systemd. Existing registry, SMS budgets, admission configuration and Sandbox key were checked unchanged across the identity restart. All four services are active and the public no-SMS HTTPS authorization check passes. This confirms configuration/health, not APNs acceptance or physical receipt. At this initial checkpoint there was one iOS Sandbox VoIP route, no alert route and zero recipient grants.

TestFlight follow-up at **2026-09-12 13:19:53 Tbilisi**: after the owner confirmed build 4 opened and notification permission was enabled, a read-only aggregate query found **one registered identity, one iOS Production alert route, one iOS Production VoIP route, zero peer grants**. It read counts only, without extracting route tokens, private phone indices, grant digests or keys. The TestFlight installation has registered its Production channels. Actual APNs acceptance, locked-screen alert receipt, PushKit/CallKit ringing and peer capability exchange remain untested. Evidence: `artifacts/build4-push-registration.json`.

## Android

Use the owner-controlled **Mnelo Development** Firebase project: ID `mnelo-development`, number `657690934155`. The owner confirmed Firebase terms acceptance. The first in-app creation attempt reported a ProgressEvent error but had created the underlying Cloud project. Native Chrome inventory found that exact project, and Add Firebase completed with **Your Firebase project is ready**. No duplicate project was created. Analytics was explicitly disabled; Gemini and Google Developer Program enrollment were not selected in the initial setup. No paid product, database or billing upgrade was enabled.

Register only Android package `com.mnelo.messenger`. Put the client `google-services.json` outside source and point `MNELO_GOOGLE_SERVICES_FILE` at it before Expo prebuild. This public client configuration is different from a private service-account JSON. Use a dedicated `mnelo-push-sender` identity with `roles/firebasecloudmessaging.admin`, not the broad default Firebase Admin SDK account. Install its private JSON root-owned 0600 and load it with systemd `LoadCredential=fcm:/etc/mnelo/fcm.json`. Set `MNELO_FCM_CREDENTIAL_FILE=/run/credentials/mnelo-identity.service/fcm` in the root-only push environment. Never expose the private credential through `EXPO_PUBLIC_*`, app assets or EAS client configuration.

Remaining setup is not complete: the in-app Firebase console fails to list this project's apps while Google Cloud confirms owner access. Native Chrome subsequently stopped exposing its window controls to automation. An in-app `mnelo-push-sender` creation attempt failed (tracking `c50707889250639`); the refreshed service-account list still contains only the auto-created Firebase Admin SDK account with **No keys**. No sender role/key, Android client registration/configuration or FCM server credential is claimed. Resume from the existing project in a functioning Chrome session, check for partial state before retrying, then rebuild Android with the client configuration. Never recreate the project or grant Editor to work around these UI failures.

FCM carries only a generic wake event, not a message body, contact name, phone number, image, audio or history. Google necessarily processes installation/routing and delivery metadata; disabled Analytics does not mean zero provider metadata. Infobip remains the registration SMS provider; iOS uses direct APNs/PushKit, not Firebase. Sources: [FCM architecture](https://firebase.google.com/docs/cloud-messaging), [FCM sender role](https://docs.cloud.google.com/iam/docs/roles-permissions/firebasecloudmessaging), [Firebase privacy](https://firebase.google.com/support/privacy).

The direct provider uses FCM HTTP v1, bounded OAuth/token expiry and zero message TTL. No Expo Push Service or third-party push proxy is introduced. `push-register` fails closed until that platform's provider is configured.

## Acceptance

Install in place, first launch unlocked, grant notification permission in Me → Notifications and verify server-acknowledged alert/call registration. Exchange authenticated contact capabilities while both clients are reachable. Test alerts, answer/decline, voice/video, timeout, interruption, token rotation, block/revoke and revoked credentials on physical phones. Include locked-screen/cold start, camera foreground constraints, Android Recents versus Force stop and no sender/content in provider payloads. Configuration and mocked transport PASS never substitute for actual receipt/audio evidence.

## Linux credential mount compatibility

Actual systemd probe: LoadCredential exposes the read-only key as root:root mode 0440 and its root:root directory as 0550, using a per-service ACL. The initial generic owner-only-file check rejected this protected format and the deployment rolled back. The reader now accepts that exact root-owned, non-writable, non-symlink `/run/credentials/<unit>` directory bound to CREDENTIALS_DIRECTORY; ordinary provider files must still be owner-only. O_NOFOLLOW and descriptor-based checks prevent a final-component symlink race. Original `/etc/mnelo` directory and source key remain 0700/0600. No service-account access to the source directory was widened.

Deployment preservation checks compare logical SQLite records and the byte-identical index key/provider/admission files. SQLite reassigning PRAGMA user_version can change database header bytes with identical records; a disposable local fixture confirmed that, so a raw whole-database byte comparison is not a valid preservation check. Runtime code has a rollback point; no private state copy is used.
