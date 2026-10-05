# Public launch preparation — 21 September 2026

Status: **in progress; not a public release approval**. The owner authorized real-number registration and public iOS/Android distribution, then added message send/receive reliability and latency. Starting source: `4688397`, following TestFlight 0.1.0 (53). Original archives and participant state are preserved.

## Message flow changes

- Successful partial media transfers request the next serial delivery cycle immediately, eliminating the three-second idle polling interval between two-chunk steps. Uncertain responses and failed durable writes retain backoff.
- Delivery/read receipts proceed between media requests and projected messages. Calls retain higher priority and burst fairness. Encryption, durable journal commits and idempotent retries are unchanged.
- Advancing bounded outbox/inbox pages continue without artificial idle gaps. Deferred, blocked or failed work alone does not trigger a busy loop.
- Notification workers remember wakes arriving during provider requests and immediately drain subsequent due pages. Provider retries retain individual backoff; push acceptance never consumes message ciphertext.

The new autonomous integration uses real libsignal, signed HTTP, SQLite journals, production pacing, a relay-equivalent wake, a 13-part encrypted attachment and concurrent text. No manual polling drives the measurement. This is a synthetic network model, **not physical phone latency**.

| Measurement, 40 ms per HTTP request       |    Before |    After |
| ----------------------------------------- | --------: | -------: |
| 13-part attachment visible                | 19,889 ms | 4,524 ms |
| Maximum gap between downloaded chunks     |  3,113 ms |   114 ms |
| Concurrent text visible                   |    599 ms |   604 ms |
| Concurrent text delivered acknowledgement |    945 ms |   958 ms |

The full suite also uses real WebSocket wakes with 80 ms/request: text visible 350 ms, subsequent delivery receipt 360 ms, read receipt 371 ms. Sixty one-second messages had maximum visible latency 377 ms and maximum read latency 947 ms. These are regression measurements, not production guarantees.

`npm run check`: **934 tests passed** (696 Jest / 119 suites, 235 device/protocol integrations, 3 server utilities), plus type, lint, format, security-boundary, environment, localization and brand checks. Scenarios cover offline reconnect, attachment byte integrity, once-only projection, lost responses, failed commits, call preemption, poison ciphertext, review isolation and notification retries. The new notification race test drains 26 jobs without idle page delays.

Evidence: ignored `artifacts/public-launch-message-baseline.log`, `public-launch-message-after.log`, `public-launch-message-regression.log`, `public-launch-full-check.log`.

## Server checks

Read-only inventory (20 September UTC / 21 September Tbilisi): identity, TURN and Caddy active, zero recorded restarts; standalone relay intentionally inactive because routing is combined with identity. Four identity records, three admitted indexes. Configuration files are mode 0600, application services have hardening and memory limits, swap is absent, and about 34 GiB remains free.

HTTPS/WSS probes passed: forged signatures, unknown registration, browser origins and forged proxy-address headers cannot bypass tested boundaries. No SMS, account, push or call was created by these probes. This is not a load test or independent infrastructure audit.

Evidence: ignored `artifacts/public-launch-20260920-server-audit.json`, `public-launch-hosted-identity.log`, `public-launch-hosted-relay.log`.

The delivery worker update is deployed from `ccf140f2e7d02f17baae70f486e9c7602d5abcb6`. The updater preserved all four existing registrations, previous keys, provider configuration and Caddy/delivery settings. Post-update HTTPS/WSS boundary probes passed. Exact corresponding source is published at [`server-2026-09-21`](https://github.com/Mneloapp/mnelo-app/tree/server-2026-09-21), public commit `35f0a594786101822617ea45eb98fd8bd8f621b5`; [CI passed](https://github.com/Mneloapp/mnelo-app/actions/runs/35536018099).

Fresh iOS/Android Hermes exports with source maps succeeded. Gitleaks 8.30.1 found zero findings in source, full Git history and both export bundles. These exports are not signed store binaries, and the client scheduling changes have not yet been distributed in a new TestFlight build.

## Android notification configuration

The existing `mnelo-development` Firebase project now contains the Android app `com.mnelo.messenger` (Mnelo Android). Its client configuration is held under ignored `.local/firebase/google-services.json`; prebuild and `:app:processReleaseGoogleServices` passed. No Analytics SDK or new paid Firebase plan was enabled.

The owner explicitly approved a dedicated `Mnelo notification sender` service account, its Firebase Cloud Messaging API Admin role, a new server credential and installation on the existing Hetzner server. The credential is stored owner-only locally and root-only on the server, outside code and application bundles. The running identity service receives it through systemd's protected credential mount. Existing identities, keys and configuration were verified unchanged. OAuth and FCM HTTP v1 `validate_only` checks returned 200 both locally and on the server. No device notification was sent by those checks; physical delivery remains pending. The initial Google key-creation attempt failed; a refresh confirmed no key existed before the successful retry.

Evidence: ignored `artifacts/public-launch-fcm-install.json`, `public-launch-fcm-runtime-check.json`, `public-launch-fcm-local-check.log`, `public-launch-fcm-hosted-check.log`, `public-launch-android-prebuild.log`, `public-launch-android-fcm-config.log`, `public-launch-secret-scan.log`.

Native Android development compilation also passed (638 tasks). The first attempt exhausted local disk space; only regenerable npm download caches and obsolete Xcode device-support symbols were removed. All app archives and exports remain preserved. A retry completed successfully, and the cold-build disk guard is now ten GiB. The ARM64 debug APK is 198,444,766 bytes, SHA-256 `b89680f8d0807a3de93a247546669e608cf55fbcc202af2217b6c958afb24b71`, with target SDK 36 and the correct Firebase project/app resources and messaging services. This is a development client, not a standalone production AAB or physical-delivery acceptance. Evidence: ignored `artifacts/public-launch-android-build-retry.log` and `public-launch-android-apk-check.json`.

## Public support

The owner approved `g.devd1@gmail.com` for public support and account-deletion requests. English/Georgian support, privacy and account-deletion pages now expose this contact and a deletion-request email action. A request does not automatically delete or recover an account; lost-device ownership verification still needs completion. Website source `48f9194`, deployment `mnelo-fghfuqjwl-mnelo.vercel.app`; the live [request page](https://mnelo.com/account-deletion#request-deletion) was verified after deployment. Website type, lint, all 16 tests and production build passed; both language versions and mailto destinations were checked in the browser without sending mail.

## Outstanding public release requirements

1. **Registration:** resolved by the owner's 27 September decision: every officially eligible distribution territory, with no total registration/SMS spending ceiling. A separate public mode now uses persistent per-number/device/source abuse controls without global business quotas; see [public registration policy](PUBLIC_REGISTRATION_2026_09_27.md). The existing live service still uses tester admission until account-specific provider coverage/sender eligibility and remaining production requirements are verified. The number/key recovery process remains a separate requirement; SMS alone must not silently replace a pinned encryption identity.
2. **Production:** `privacyRelease.reviewed=false`; dedicated production origins/configuration are missing. Automated engineering tests do not satisfy the existing independent protocol review gate. Do not relabel a preview binary or disable this gate to publish.
3. **Android:** owner chose a new personal Google Play account. Registration started with developer name Mnelo. Owner authorized the existing payments profile, but Google's embedded selection dialog currently fails automated interaction; a manual selection/Continue handoff is pending. Account completion, identity verification and USD 25 registration fee remain. Google's current new-personal-account policy requires at least 12 continuously opted-in closed testers for 14 days, followed by a production-access application. FCM configuration is now installed and validated as above. Signed AAB and physical Android acceptance are missing.
4. **Apple:** version 1.0 remains Prepare for Submission, with no screenshots, selected public build, copyright or review/contact fields. English description was corrected and saved for encrypted offline delivery and readable chat ZIPs. Build 53 is TestFlight testing, not a production submission.
5. **Security:** fresh npm audit reports 16 moderate affected package entries, zero high/critical, across the existing decoder/UUID advisory families. See `DEPENDENCY_AUDIT.md`. Native-intent mitigation and the tooling-only UUID disposition are not a clean dependency audit. Independent protocol/deployment review remains incomplete.
6. **Disclosures:** obsolete no-offline-queue website claims were corrected in English/Georgian and deployed to mnelo.com from website commit `3cc28d4`, then updated with the owner's public support contact as above. Operator details, final terms, privacy/data-safety forms, age rating, territories and verified handling of lost-device deletion requests still need completion. Private contact details cannot be assumed public.
7. **Physical QA:** no instrumented two-phone acceptance of 53 or these messaging changes is recorded. Final iOS/Android binaries need immediate first-word, locked/background call, Wi-Fi/cellular, media, receipt, offline restart, notification-routing and update-retention checks.

Current references: [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/), [Google personal-account testing](https://support.google.com/googleplay/android-developer/answer/14151465), [Google account deletion](https://support.google.com/googleplay/android-developer/answer/13327111). Verify the actual Play account's required testing and production access before promising a date.
