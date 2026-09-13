> September 12 public-release request: [current readiness and exact blockers](PUBLIC_RELEASE_READINESS.md). Full automated suite 389 PASS, Doctor 21/21, no secrets. Apple confirms build 9 processing Complete. Public description/URLs saved as draft; no public submission. Second-device USB testing is the immediate acceptance step.

# Mnelo device-owned messenger QA

## September 12, 2026 — default notification enrollment

Phase: notification defaults requested by the owner.

Status: implemented and verified in a fresh iOS Simulator. Pending inclusion in the next TestFlight binary; no change to already distributed builds.

Implemented: on first foreground entry after verified registration, request OS alert/sound/badge authorization automatically. No prompt over registration, recovery or a call screen. Existing OS approval is reused; denial/revocation is respected, including Android denial when canAskAgain remains true. Me > Notifications opens device settings for turning alerts off or on. The OS setting is the saved preference; no misleading separate switch reports enabled before consent.

Files: DeviceNotifications, useNotificationEnrollment, native/web device-alerts, system-calls, EN/KA copy, focused permission/enrollment/registration tests and these docs. Database migrations: none. Security impact: no prompt before authentication, stale/background work cancelled, overlapping prompts coalesced, existing user choice preserved; notification payload/privacy and phone admission unchanged. Alert registration now rechecks authorization if first permission approval overlaps VoIP registration. Provisional iOS permission is consistently treated as allowed.

Tests: full check PASS, 53 Jest suites / 283 tests plus 98 device/relay integration and 3 preserved server utility tests, total 384. TypeScript, lint, formatting, security/environment/localization/brand guards PASS. Focused notification tests: 22 PASS, including denial, concurrency, foreground/auth gates and token registration after approval. Expo Doctor 21/21; iOS/Android Hermes exports PASS; Gitleaks history/source/latest bundles PASS, zero findings. No native dependency/config changes.

Native checks: created a fresh isolated Mnelo Notification QA simulator (iPhone 17 Pro / iOS 26.5) and installed the existing Xcode 26.6 development binary 6 with the updated JavaScript. The phone and fixture OTP screens displayed without a notification prompt. Completing fictional local registration immediately displayed Apple's Allow / Don't Allow notification dialog over Chats. Selecting Allow returned to Chats. No SMS or real personal data was used. The already enrolled profile QA simulator also displayed the new allowed-permission copy without prompting again. Screenshot: artifacts/notification-default-prompt.png.

Known limitations: this proves native permission enrollment, not physical APNs/FCM delivery. The isolated fixture has no push service. Android permission order is tested and its bundle exports, but no new physical Android test is claimed. No new IPA was uploaded. Commit: `fix: enable notification enrollment after registration` (this report's commit).

## September 12, 2026 — private profile cards, QR and website

Phase: requested profile/contact-sharing and visual refinement.

Status: implementation and simulator verification; new distribution binary and physical two-phone acceptance still required. This does not change the status of TestFlight build 5.

Implemented: optional photo/name/headline/about/email/HTTPS website; authenticated device-to-device cards; QR, invitation preview and scanner; Me card and settings groups; consistent local avatars and stable tab selection. The separate website now serves the messenger at https://mnelo.com in English and Georgian. See [PROFILE_CARDS_QR.md](PROFILE_CARDS_QR.md).

Files: app routes/configuration, messenger profile/transport/storage/screens, shared UI/tokens, localized copy, focused tests and architecture/security/release docs. Full inventory is in this feature commit.

Database migrations: local database version 4, defaulted identity fields and normalized contact_profiles. Old archives remain accepted with empty defaults. No cloud schema or server profile store.

Security impact: cards remain on the participating devices and cross only authenticated, trusted peer connections; bounded JPEG/frame/link inputs; explicit QR confirmation and block checks. QR includes public name/key only. New code does not create an offline server queue or alter phone tester admission. Existing crypto-review and offline limitations remain.

Tests: full check passed 52 Jest suites / 270 tests, 98 device/relay/privacy integration tests and 3 preserved server utility tests (371 total). TypeScript, lint with zero warnings, formatting, environment/import-graph guards, localization and 14 brand exports passed. Expo Doctor 21/21 and dependency compatibility passed. Final iOS/Android Hermes exports and Gitleaks history/source/bundle scans passed with zero findings. npm audit retains 16 moderate affected entries, zero high/critical; the new dependencies add no advisories. The separate website passed 3 tests, typecheck/lint/build, browser responsive checks and dependency audit with zero findings.

Native checks: dedicated fictional iPhone 17 Pro / iOS 26.5 simulator, Xcode 26.6 development build 6. Phone fixture registration visibly completed without SMS, SQLCipher/SecureStore booted, the system photo picker selected the explicit QA image, profile details saved and rendered, the actual QR appeared, Copy link changed to Link copied, and manual invitation preview kept Add contact disabled until confirmation. Adding the fictional contact succeeded and displayed the expected unavailable-card explanation. No actual peer was contacted. Final native build and restart evidence follows in BUILD_LOG.md.

Visual fixes: added a visible unchecked/checked control to the existing confirmation row; fixed compact Georgian website overflow; retained fixed tab dimensions and scalable labels. React component review covered hook cleanup, bounded subscriptions, validation, accessible actions and local-only avatar rendering. Native process restart preserved the selected photo and profile; Chats/Calls/Me headings and selected tabs rendered consistently. Georgian settings and the actual QR screen rendered without visible clipped labels at the tested simulator size. No hardware keyboard/camera or arbitrary Dynamic Type matrix is inferred from this check.

Failures fixed during QA: lint declarations in the isolated Metro tests; scanner test foreground setup; picker mock initialization; camera plugin accidentally removing the shared microphone purpose string; unsigned simulator Keychain failure; disk exhaustion in generated build caches; SDK 57 development dotenv overriding the isolated fixture endpoint. Exact native dispositions are in BUILD_LOG.md. No failed run is counted as a pass.

Known limitations: physical camera scanning, two-phone card exchange, signed universal-link behavior, Android native camera build/QA and new TestFlight distribution remain pending. New functionality is not present in builds 4/5. Website installation guidance honestly retains private TestFlight enrollment; no public store availability is invented. Screenshots use a fictional QA profile, not production user data.

Commit: `feat: add private profile cards and QR contact sharing` (the commit containing this report). Website commit `44383e1`; existing project production deployment `dpl_C8gJMjndQeKendEsyU1bWBemXZhP`, verified on the apex and www domains.

## September 10, 2026 — prior architecture checkpoint

Status: **architecture migration verified for local development; NOT READY for public release**. Previous server-backed phase results are historical, preserved under `legacy/server-v1/docs`.

## Actual automated checks

| Check                                    | Result                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| Strict TypeScript                        | PASS                                                                             |
| ESLint, zero warnings                    | PASS                                                                             |
| Prettier active source/docs              | PASS; legacy snapshots intentionally excluded                                    |
| Jest                                     | 34 suites / 173 tests PASS (shared and preserved historical regression coverage) |
| Current device/relay/privacy integration | 17 tests PASS                                                                    |
| Preserved server utility integration     | 3 tests PASS                                                                     |
| Source security guard                    | PASS                                                                             |
| Active import-graph isolation            | PASS; no reachable old Supabase/Connect/auth persistence                         |
| Public environment validation            | PASS; cloud release gate remains closed                                          |
| Localization source guard                | PASS, no inline feature copy                                                     |
| Brand export validation                  | PASS, 14 exports                                                                 |
| Expo Doctor                              | 21/21 PASS with installed CocoaPods PATH/RUBYOPT                                 |
| Expo dependency compatibility            | PASS                                                                             |
| npm audit                                | 16 moderate affected entries, zero high/critical; same two historical advisories |
| Gitleaks 8.30.1                          | PASS: Git history, source, exported bundles; zero findings                       |
| iOS / Android Hermes exports             | PASS                                                                             |

Full output: `artifacts/privacy-check.log`; native and transport artifacts below. The 17 current integration tests run the real local SQL engine, actual WebSocket relay connections, crypto tamper checks and route/deployment boundaries. They do not substitute for independent cryptographic review.

## Actual native checks

- Xcode 26.6 iOS Simulator development build: PASS. SQLCipher and MneloVault included; pod install completed (127 dependencies / 130 pods). iPhone 17 Pro, iOS 26.5 booted the new Welcome screen, created a local identity and reopened the persisted identity after process restart.
- Local iOS database exists (94,208 bytes at the captured check), has no plaintext SQLite header and fails SQLite reads without its key. MneloVault verifies the iOS backup-exclusion resource flag before returning its directory. This is simulator evidence, not a hardware Secure Enclave or forensic certification.
- Native iPhone Simulator ↔ real Chromium peer: public codes were exchanged and explicitly confirmed. Browser text arrived in the native UI; ACK/read packets returned. Georgian text typed using the native keyboard reached the browser, and the app displayed recipient delivery.
- Incoming voice call reached the native call UI, was accepted and became connected. The Chromium peer reported one remote native audio track. Native Mute changed to Unmute; hangup propagated and the call history stayed local. This proves connected WebRTC signaling/media tracks, not measured acoustic quality or a physical phone call.
- Android ARM64 development APK build: PASS, 7m40s, 576 tasks (84 executed / 492 up-to-date). Installed and booted on emulator-5554. New SQLCipher database exists under `no_backup/mnelo-private`, 94,208 bytes, without a plaintext SQLite header. Full Android messaging/call flow was not run in this phase.
- No new physical iPhone, two-phone cross-network, background/killed-app, native video quality or automatic Drive/iCloud sync PASS is claimed.

## Real WebRTC transport harness

Final harness run completed **16 PASS assertions**: signed/pinned SDP data channels, text, chunked file integrity, voice/video remote tracks, pre-accept microphone isolation, mute, hangup, decline and block teardown. It uses synthetic audio/video and in-memory development identities. Each call uses actual PeerConnections/DTLS/SRTP. Browser fixture repositories are transport test adapters, not a production browser messenger.

Files: `artifacts/privacy-web-transport-results.txt`, `privacy-web-transport-pass.png`, `privacy-native-peer-result.json`, `privacy-native-chat.png`, `privacy-native-storage.json`, `privacy-android-storage.json`, `privacy-android-boot.png`. No recovery/private identity keys are included in committed evidence.

## Failures found and disposition

- React Native WebSocket omits browser `bufferedAmount`. The initial browser-only backpressure guard therefore withheld relay authentication. Fixed capability handling; added a regression verifying the real Ed25519 auth proof on a native-shaped socket. Native messaging and call passed afterward.
- Localhost resolved only to ::1 in a restarted Metro process, while the simulator used 127.0.0.1. Restarted using `NODE_OPTIONS=--dns-result-order=ipv4first`; subsequent simulator launch passed. This was a development server bind failure, not a native compile failure.
- One Fast Refresh transition exposed a pending focus query against the old closed database. Closing now refuses new peer authorization and the UI owns/catches the cancelled focus task. Reconnected native send/receive/call succeeded afterward; do not describe the earlier run as error-free.
- The first chunked-file test compared JSON property order. Changed the assertion to compare the schema-normalized complete packet, preserving byte-for-byte payload checks; final run passed.
- Stale local-development notice and former Georgian slogan test expectations were migrated to current copy/environment. Final Jest suite passes without removing coverage.
- One Jest process exited 139. macOS recorded Node/V8 `EXC_BAD_ACCESS` in `ClearStaleLeftTrimmedPointerVisitor` during GC. No assertion was reported as passed for that interrupted run. A subsequent complete `npm run check` passed all 173 Jest tests and all later checks without a runtime workaround.
- Doctor initially used a shell without the installed CocoaPods path and failed 20/21; with `PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH" RUBYOPT=-rlogger`, it passed 21/21. Pod install and native build independently succeeded.
- Android's initial install command omitted the required device serial and safely refused. Retried with `emulator-5554`, installed successfully. Expo SQLite required NDK 27.0.12077973 in addition to the existing toolchain; Gradle installed that dependency and completed.

## Remaining release limits

Independent protocol/security assessment; hosted wss/TURN with verified no retention; two physical devices and real camera/microphone quality; interrupted/background/killed-app behavior; multi-device key rotation/synchronization; automatic user-cloud backup; storage-pressure handling and larger streamed backups; durable reaction/read receipt retry; offline group revocation review. See [RELEASE](RELEASE.md). No hidden success claims for these areas.

## Calls tab follow-up — 2026-09-10

Phase: dedicated Calls navigation, superseding the earlier no-Calls-tab instruction.

Status: PASS for the scoped local UI change; existing public-release blockers above remain.

Implemented: Chats | Calls | Me, paginated local call history, trusted/unblocked contact search, explicit voice/video selection, offline-disabled actions, return to an ongoing call, open conversation and local-only history deletion. Registration remains device identity creation from a display name, with public-code exchange; no phone/SMS/server registration. Restore requires the user's archive and recovery key.

Files: tab/root routes, CallsScreen, local engine/model, English/Georgian dictionaries, route-boundary/device/UI tests, README, architecture and UX documentation.

Database migrations: additive local partial index `call_cursor` on existing call messages; no schema version change, server migration, content upload or new credential.

Security impact: existing peer consent and block checks retained. Call history recording/deletion sends no transport packet. A new integration test verifies 40-row pagination, deduplication, text exclusion, deletion tombstones and preservation of the other participant's call entry.

Tests: full `npm run check` PASS — TypeScript, lint with zero warnings, Prettier, **35 Jest suites / 176 tests**, **18 device/privacy integration tests**, 3 historical server-utility tests, source-security/environment/localization/brand guards. Three new UI tests cover empty history, blocked/offline contact restrictions and explicit video-call service invocation. Expo Doctor **21/21 PASS**; dependency compatibility PASS; iOS and Android Hermes exports PASS. Logs: `artifacts/calls-tab-{check,ui-tests,doctor,compatibility,export}.log`.

Native checks: existing Xcode 26.6 iOS development client booted the updated bundle. iPhone 17 Pro simulator showed existing local history in English and Georgian, search/no-results, offline-disabled voice/video actions and local deletion copy. Android emulator-5554 created a development-only local identity and rendered Chats | Calls | Me, empty Calls history and the new-call picker. Screenshots: `artifacts/calls-tab-ios-ka.png`, `artifacts/calls-tab-android.png`. No new native compilation was needed or claimed for this TypeScript/local-index change. No physical-device or new live-call media QA is claimed here.

Diagnostic issues: running Metro briefly saw the new route before its screen file existed; final exports and native reload succeeded. The initial Android launch used 10.0.2.2, which the existing cleartext policy correctly rejected. Using the existing `adb reverse tcp:8083 tcp:8083` loopback flow and 127.0.0.1 restored boot without weakening network policy. Expo's floating development Tools control appears in screenshots; it is not Mnelo product UI.

Known limitations: old call rows have only media type, ended/failed outcome and end timestamp. The UI does not fabricate incoming/outgoing/missed classifications or durations. Automatic user-cloud sync, independent protocol assessment and reliable Internet/background calling remain open as documented above.

Commit: the commit containing this entry, `feat: add local calls tab` (use `git log -1 --format=%H -- src/messenger/screens/CallsScreen.tsx`).

## Phone registration and discovery — 2026-09-10

Phase: phone registration and exact-number contact lookup, under the owner's subsequent request.

Status: local fixture implementation and native simulator/emulator flow PASS. Real SMS delivery and hosted production identity service remain unconfigured; public release remains NOT READY.

Implemented: number/OTP onboarding following local name creation, migration entry under Me, complete-number lookup after own verification, explicit peer-key confirmation, visibility toggle and authenticated unlink. Existing conversation histories and pinned identities are preserved. The new narrow phone-metadata exception and SMS provider disclosure replace the former no-phone-directory wording in current documentation.

Files: `identity/` registry/provider/service/HTTP boundary; phone protocol/client/copy/screens; native routes; local phone display-cache methods; config/scripts; English/Georgian dictionaries; tests; README and architecture/privacy/security/data/authorization/UX/testing/release documentation. `docs/PHONE_IDENTITY.md` contains setup, data inventory, provider requirements and remaining limits.

Database migrations: additive `phone_registration` display-cache table in local SQLCipher, excluded from backup and erased with local data. Separate `phone_identities` version-1 registry contains only keyed phone index, unique public key, discovery setting and verification time. No Supabase/cloud schema or old conversation storage was activated. Local fixture and real-provider directories are distinct, ignored and privately created.

Security impact: exact-number lookup is now authorized, bounded and opt-out. OTP plus one-use signed key proof is required for binding. Tampering/replay, wrong/expired codes, cross-device OTP, excessive retries/lookups and silent reassignment of an existing identity fail. Number HMACs are pseudonymous personal metadata, not anonymous private discovery. The owner-facing promise no longer says that the platform stores absolutely no information. The relay/content paths remain unchanged.

Tests: full `npm run check` PASS — strict TypeScript, lint zero warnings, formatting, **36 Jest suites / 179 tests**, **28 device/privacy/phone integration tests**, 3 preserved server-utility tests and source/env/localization/brand guards. The final active import-graph test also rejects server `identity/` and `relay/` modules from the mobile route graph. Expo Doctor **21/21 PASS**, dependency alignment PASS, iOS and Android Hermes exports PASS. Gitleaks 8.30.1 Git history/source/bundles all PASS with zero findings. Dependencies were not changed. Logs: `artifacts/phone-{check,device-tests,doctor,compatibility,export,secrets}.log`.

Native checks: existing Xcode 26.6 iPhone 17 Pro development client and Android emulator-5554 loaded the new bundle. iPhone rejected `000000`, accepted the fictional fixture code, returned to its preserved chat history and found the Android device by its separately registered fictional number. Android accepted its own fixture OTP and returned to Chats. The found peer remained untrusted until explicit user confirmation; the UI did not automatically create a connection. English Android and Georgian iPhone screens were inspected. Screenshots: `artifacts/phone-android-otp.png`, `artifacts/phone-ios-discovery.png`. No real SMS was sent, no physical OTP autofill PASS is claimed, and no native dependency rebuild was needed for this source/local-schema change.

Issues fixed: OTP's long privacy introduction initially pushed controls down behind the keyboard; it now shows a compact code step after the initial disclosure. ESLint caught an unnecessary hook dependency; corrected without suppressing the rule. Android UIAutomator could not settle during the one-second resend countdown; the timed-out stale XML was rejected, and a fresh screenshot/subsequent live hierarchy was used for verification. Export emitted only Node NO_COLOR/FORCE_COLOR environment warnings; completed bundles passed scanning.

External prerequisite: owner creates an SMS-enabled service in the [Twilio Verify console](https://console.twilio.com/us1/develop/verify/services), with 6-digit codes and required country permissions. Server credentials must be supplied privately as described in PHONE_IDENTITY, never in chat/mobile configuration. No provider account/billing action or public deployment was performed.

Known limitations: real provider adapter HTTP contract is mocked in tests; no actual SMS delivery, hosted TLS service or physical-device autofill is proven. Restart-resistant abuse controls, number-recycling/lost-key recovery, key transparency and provider retention review are release work. Existing devices retain manual-code/local-history access while enrolling; no forced destructive migration. Automatic bulk address-book discovery is not implemented. This phase does not resolve previously documented network/background calling or independent protocol-review limits.

Commit: the commit containing this entry, `feat: add phone registration and contact lookup`.

## Registration-only Twilio decision — 2026-09-11

Phase: registration SMS provider and existing-key independence.

Status: architecture decision documented and targeted regression checks PASS. Actual Twilio trial entitlement and real SMS remain unverified.

Implemented: retained Twilio Verify behind the existing provider adapter; documented explicit enrollment/resend scope, no routine SMS login/refresh/reconnect, no SMS-only recovery and the existing explicit new-number enrollment action. Added a test that reconstructs the identity service with an unavailable SMS provider 40 days after enrollment: the original key still obtains status, looks up a peer, changes visibility and unlinks with zero provider calls. The Twilio HTTP contract now also asserts the SMS channel.

Files: README, ARCHITECTURE, PHONE_IDENTITY, this report and `tests/messenger/phone.integration.ts`. Database migrations: none. Security impact: preserves signed existing-key authorization and provider isolation; no runtime authorization or retention policy was weakened.

Tests: TypeScript PASS; lint PASS with zero warnings; repository formatting PASS; **29 device/privacy/phone integration tests PASS**; **2 targeted Jest suites / 8 tests PASS**; `git diff --check` PASS. This is targeted verification, not a fresh run of the complete release suite.

Native checks: no native or mobile runtime changes; no new build/device test performed. Known limitations: no SMS sent, no provider account/payment action, no authenticated trial quota inspected. Public release gates remain closed. The official 30-day trial and Georgia eligibility were checked; general Messaging units must not be presented as guaranteed Verify units.

Commit: the commit containing this entry, `test: verify registration-only Twilio SMS boundary`.

## Alternate SMS trial provider — 2026-09-11

Phase: Vonage Verify V2 trial preparation after the owner's Twilio signup rejection.

Status: server adapter and local automated checks PASS. Provider signup, actual trial entitlement and Magti SMS delivery remain unverified. Public release remains NOT READY.

Implemented: explicit Vonage/Twilio/fixture selection; Vonage is now the `identity:sms` trial default. SMS-only six-digit verification, strict completion/request-ID checks, redacted errors, bounded requests and no automatic provider fallback. A rejected resend preserves the previous local attempt; concurrent sends and verification during replacement are rejected. Registered identities retain the same real-provider registry and remain independent of SMS availability.

Files: `identity/vonage.ts`, `identity/provider.ts`, `identity/service.ts`, phone-identity startup script, package scripts, security source guard, provider/service/security tests, README and architecture/phone/testing/release/QA documentation.

Database migrations: none. No native or dependency changes. No registry contents or credentials were read, migrated or created.

Security impact: provider credentials remain server-only and are forbidden in mobile/config sources by the source guard. HTTP error bodies and transport exception details are not surfaced. OTP success requires provider confirmation for the exact request; delivery alone cannot authorize enrollment. Existing ownership, signed challenge, rate-limit, fixture-isolation and release boundaries remain enforced.

Tests: complete `npm run check` PASS — strict TypeScript, lint zero warnings, formatting, **36 Jest suites / 182 tests**, **37 device/privacy/phone/provider integration tests**, **3 preserved server-utility tests**, source-security/environment/localization/brand checks. Gitleaks 8.30.1 history/source/existing exported bundles PASS with zero findings. `git diff --check` PASS. Logs: `artifacts/vonage-check.log`, `artifacts/vonage-secrets.log`.

Issues fixed: the first TypeScript run caught an optional-property mismatch in the new test request recorder. Its type now explicitly permits undefined; the subsequent complete check passed without weakening strict settings. The provider's concurrent-request behavior exposed the existing resend invalidation bug; regression tests verify the correction.

Native checks: not rerun for these server-only changes. No new Expo Doctor, mobile export, native build, physical OTP/autofill or live SMS result is claimed. The secret scan checked previously generated bundles, not newly exported artifacts.

Known limitations: HTTP provider contract tests use mocked responses. Owner signup and verification of the actual Magti number are the next external prerequisite; no account, billing, credentials or SMS operation was performed. Vonage trial availability, actual receipt and provider retention require verification. A timeout cannot prove remote request state; in-memory abuse controls and pending attempts still reset on service restart. Existing production/security/device blockers remain documented in RELEASE.

Commit: the commit containing this entry, `feat: add Vonage registration SMS trial adapter`.

## Physical-iPhone preflight and further SMS research — 2026-09-11

Phase: owner-requested physical testing preparation while SMS account activation is blocked.

Status: physical build blocked by missing Apple Developer Team selection; phone currently requires unlock. Further SMS candidate researched, not integrated or activated.

Implemented: documented current device availability, precise signing error, local-service reachability limits and the next owner action. Added official Infobip trial/signup findings and Telnyx account-tier comparison. Files: IPHONE_DEVELOPMENT, PHONE_IDENTITY and this report. Database migrations: none. Security impact: no signing credentials, app account registration, secret, network listener or runtime boundary changed.

Tests: documentation formatting and `git diff --check` PASS; no new application test suite was needed or run for these documentation-only changes. Native checks: selected Xcode 26.6 (17F113); paired iPhone 17 Pro Max / iOS 26.6.1; Developer Mode enabled; lock-state reports passcode required. Generic iOS Debug build exited 65 at missing development-team signing, before successful compilation/install. An initial CoreDevice destination lookup was interrupted without a build result. Evidence paths and exact error are in IPHONE_DEVELOPMENT.

Known limitations: no physical install/boot, real OTP, new message/call hardware QA or provider activation. Mac loopback endpoints are not automatically accessible from iPhone. Owner must select the existing Apple team in Xcode and unlock the device; any Apple login must occur in Apple's UI. SMS trial acceptance and Magti delivery still require a real provider test.

Commit: the commit containing this entry, `docs: record iPhone signing preflight and SMS alternative`.

## Apple team selected; agreement blocks provisioning — 2026-09-11

Phase: physical-iPhone development build after owner team selection.

Status: BLOCKED by the Apple Developer Program License Agreement update. Team selection, device unlock and developer disk-image readiness are now confirmed; physical install/boot remain pending.

Implemented: read-only Xcode inspection identified the account-level cause of automatic-signing failure. Files: IPHONE_DEVELOPMENT, BUILD_LOG and this report. Database migrations: none. Security impact: no runtime changes, entitlement removal, credential export or account-level mutation. The owner's generated team selection is preserved.

Tests: documentation formatting and `git diff --check` PASS; no new code test suite run. Native checks: generic iOS Debug build exited **65**, reporting a wildcard profile without Push Notifications / aps-environment. Xcode simultaneously reports **PLA Update available** and requests account-owner agreement acceptance. No successful compilation, install, launch, messaging/call or OTP hardware test is claimed.

Known limitations: Account Holder must review/accept the updated agreement in Apple Developer Account before provisioning can be retried. Whether a correct app-specific profile can then be issued still requires verification. All previously documented physical service-reachability and provider-account limitations remain.

Commit: the commit containing this entry, `docs: record Apple agreement signing blocker`.

## Agreement accepted; App ID registration unavailable — 2026-09-11

Phase: retry physical-iPhone build after owner agreement acceptance.

Status: BLOCKED by unavailable registration of the required `com.mnelo.app` identifier for the selected team. The earlier agreement blocker is resolved.

Implemented: Xcode provisioning-update retry and exact failure documentation. Files: IPHONE_DEVELOPMENT, BUILD_LOG and this report. Database migrations: none. Security impact: no runtime, identifier, entitlement or credential change; no speculative alternative App ID or successful new profile registration.

Tests: documentation formatting and `git diff --check` PASS; no application code changed or application tests rerun. Native check: Debug build for generic iOS with `-allowProvisioningUpdates` exited **65**. Build log and Xcode UI agree on `Failed Registering Bundle Identifier`; wildcard profile capability/entitlement errors remain. No physical install/boot PASS.

Known limitations: account identifier ownership cannot be established from Xcode's unavailable-ID error. Apple registry inspection requires owner access; the agent's browser is at sign-in. Keep the authoritative identifier unchanged while checking the team's existing entries. Physical service-reachability, SMS and device-flow limits remain unchanged.

Commit: the commit containing this entry, `docs: record unavailable Apple app identifier`.

## Authorized native identity replacement and first physical boot — 2026-09-11

Phase: owner-requested replacement of the unavailable Apple identifier and continuation of physical-iPhone setup.

Status: **identity migration, physical build, signature, installation and Welcome rendering PASS**. Full interactive physical acceptance and current Expo maintenance alignment remain open; public release remains NOT READY.

Implemented: migrated iOS bundle and Android package/namespace/applicationId to `com.mnelo.messenger`; preserved name Mnelo, slug/scheme `mnelo`, domain and runtime behavior. Regenerated native projects, reinstalled pods and restored the same owner-selected signing team in ignored iOS files. Apple issued the explicit development profile with push entitlement for the connected iPhone. No unrelated App ID, old sandbox, profile or certificate was deleted. No EAS/Google Play project, cloud build or SMS provider account was created.

Files: app.config.ts, scripts/android.mjs, docs/store/metadata.json, README, current product/release/Android/iPhone/execution/design documentation, historical snapshot labels/cross-references, BUILD_LOG, this report and docs/audits/iphone-identity/verification.json. Native projects and raw logs/screenshots remain ignored. Database migrations: none.

Security impact: new native sandbox/signing identity; no automatic history transfer. Existing explicit backup/restore remains the data migration boundary. Verified app signature and the actual iPhone's inclusion in its embedded development profile without exposing keys or private identifiers. The development Metro session alone uses blank relay/phone endpoints for offline UI inspection; original env file and network/service guards are unchanged. No fictitious successful phone enrollment or provider call.

Tests: `npm run check` PASS — strict TypeScript, lint zero warnings, formatting, **182 Jest tests / 36 suites**, **37 device/privacy/phone/provider integration tests**, **3 preserved server-utility tests**, and existing security/environment/localization/brand guards. Total **222 tests**. Fresh iOS/Android exports PASS. Gitleaks 8.30.1 history/source/fresh bundles PASS, zero findings each. Active tracked code/config/store metadata stale-identifier search returns zero matches; historical reports/archived output remain labelled and unchanged. Final documentation formatting and `git diff --check` PASS.

Official diagnostics: fresh Expo Doctor **20/21**, dependency check exit 1, recommending new patch versions for **25** SDK dependencies. The installed Expo 57.0.21 SDK's bundled ranges accept all **36** checked installed dependencies with zero mismatches. Kept the lockfile stable during identity/native validation; patch alignment is documented follow-up, not a suppressed check or claimed Doctor PASS.

Native checks: prebuild exit 0; the first immediate native attempt failed because prebuild had cleared the CocoaPods workspace. Reinstalled **127 dependencies / 130 pods**, restored signing and rebuilt: **Xcode 26.6 (17F113) BUILD SUCCEEDED, exit 0**, zero compiler errors and 2,141 warning lines. Deep/strict code-signature verification PASS. Installed on **physical iPhone 17 Pro Max / iOS 26.6.1**, launched the development client, loaded LAN JavaScript and inspected the actual Welcome screenshot. No fatal/unhandled JS error observed during this initial capture. Detailed commands and retained warnings: BUILD_LOG. Sanitized evidence: [verification](audits/iphone-identity/verification.json).

Known limitations: Debug app requires reachable Metro; it is not a standalone preview, IPA or TestFlight build. Interactive identity/keyboard, physical OTP, launcher icon, permissions, push, messaging/media, voice/video, reconnect and backup/device acceptance remain pending. SMS activation and reachable secure signaling are not supplied by USB connection. Runtime retains background fetch/notification delegate and upstream logging/event diagnostics; no capabilities were added to hide them. No new Android APK/device result is claimed for the changed package. Historical builds keep their original IDs and results.

Commit: the commit containing this entry, `chore: migrate native identity to com.mnelo.messenger`.

## Primary tab polish and number dialing — 2026-09-11

Phase: owner-reported header inconsistency, missing number dialing and unpleasant tab movement.

Status: implementation and automated QA PASS; current JavaScript visually checked in the iPhone simulator. Real phone-number lookup/calling remains dependent on the unavailable directory/SMS service and a mutually authorized online peer.

Implemented: Chats replaces the Mnelo wordmark in the inbox header; Chats / Calls / Me use the existing approved Inter Semibold / Noto Sans Georgian faces. Fixed the actual Chats header's accidental use of the padded/bordered list-row style, which made it taller than Calls/Me. Unified header minimum height, changed Page to consistent safe-area inset padding, initialized root insets, and stopped collapsing inactive native tab content. All three tabs preserve layout/state and hide inactive accessibility controls. Added Calls/New call → Dial a number, native phone-pad input and full-number lookup through the existing signed directory client. Shared call actions retain voice/video choice and peer authorization. No carrier/PSTN calls or new provider integration.

Files: tab routes/layout, app root/dial-number route, Page/FocusedTab/AppProviders, HomeScreens/CallsScreen/shared CallActions/FindPhoneScreen, phone localization copy, tests/dial-number.test.tsx, UX_FLOW, TESTING, DESIGN_SYSTEM and this report. Database migrations: none. Native identity/dependencies/entitlements: unchanged.

Security impact: number lookup still requires own enrollment; typing/dialing never sends an OTP. Unpinned results require full-key confirmation; pinned keys are not replaced. Blocked/self/hidden/missing identities cannot call. Editing a number invalidates its old result; local blocking is checked again before continuing. Calls still require the existing trusted, online peer and explicit media action. No secrets, uploaded address book, new storage or security exception.

Tests: full `npm run check` PASS — TypeScript, lint, formatting, **191 Jest tests / 37 suites**, **37 device integration tests**, **3 preserved server utility tests**, source/environment/localization/brand guards: **231 tests total**. Nine new number-dialing cases pass, including post-lookup blocking. Existing phone, calls and tab-accessibility regression tests pass. Fresh iOS/Android exports PASS. Gitleaks history/source/fresh bundles PASS with zero findings. Logs: `artifacts/tabs-dial-{check,export,secrets}.log`. Final formatting / `git diff --check` PASS. React component review checked hook ordering, shared action boundaries, state invalidation, text scaling and accessibility; no native dependency update was needed.

Native checks: existing iPhone 17 Pro / iOS 26.5 Development Client loaded the current bundle. Before/after CUA observations confirm the Chats header's extra list-row padding/border is gone and Chats/Calls/Me headers and notices now align on repeated switches. Georgian navigation, Calls dialing entry, full-number field, native numeric keyboard, invalid-number feedback and unavailable-service error state were visually inspected. Direct automation keystroke input initially did not reach the simulator; native field interaction and enabling its software keyboard exposed the actual phone keypad. No keyboard result is inferred from web rendering. The number service returned an error in the simulator; no successful live lookup or call is claimed. The owner also interacted with the simulator during the check, so further automated UI actions were stopped.

Known limitations: fresh physical-iPhone interaction could not be repeated because the lock-state query reports a passcode required. This JS-only change is available through the existing development server; no new native binary, Android device QA, live SMS, phone lookup or real call is claimed. English and enlarged-text behavior retain the existing loaded fonts/scaling and automated checks; this pass's direct visual inspection used Georgian at the current simulator text size. The earlier Expo Doctor 20/21 maintenance advisory remains unchanged and was not rerun or relabelled PASS. Full physical-device responsiveness and service-connected calling remain to be verified.

Commit: the commit containing this entry, `fix: polish tab navigation and add number dialing`.

## New-chat and new-call navigation — 2026-09-11

Phase: owner's request for familiar WhatsApp-style new-chat/new-call navigation.

Status: implementation, automated checks and the described iOS Simulator navigation checks PASS. Real number lookup/calling and fresh physical-device acceptance remain unverified.

Implemented: shared alphabetical contact picker with local name search, explicit full-number actions, New group / Keypad, New contact and user-initiated Invite. Saved contacts open chats directly; call contacts expose voice/video buttons inline. Native modal composer with nested back/close navigation dismisses before opening a chat/call. Adding a contact returns to the picker. Phone/code entry and My Mnelo code are separate screens. Calls keypad includes prefix, digits, deletion and hold-to-clear; a pinned, online number can start voice through the explicit call action without another chooser. Approved Mnelo fonts/colors and Chats / Calls / Me remain intact. See UX_FLOW for the official functional references; no pixel-identical comparison against an installed WhatsApp app is claimed.

Files: app root and new `(compose)` route group; Page; ContactPickerScreen, ContactIdentityScreens, NumberKeypad, composer-navigation; HomeScreens, CallsScreen, CallActions, FindPhoneScreen, SettingsScreens; English/Georgian compose copy; central keypad tokens; composer/calls/dial-number/phone-screen tests; UX_FLOW, DESIGN_SYSTEM, TESTING and this report.

Database migrations: none. Native identity, dependencies, signing and entitlement configuration: unchanged.

Security impact: search filters local saved contacts without number-registry queries or presence probes while typing. Whole-number lookup still requires own enrollment and sends no OTP. Existing key confirmation, pinned-key handling, self/blocked/hidden/missing rejection and online peer authorization remain required. Blocking is rechecked before direct contact actions. Invitations only open the native share sheet after a tap; this QA sent no invitations or SMS and did not upload an address book. Local content/storage boundaries remain unchanged.

Tests: final `npm run check` exit 0 — TypeScript, lint, formatting, **200 Jest tests / 38 suites**, **37 device integration tests**, **3 preserved server utility tests**, security/environment/localization/brand guards: **240 tests total**. Fresh iOS/Android Hermes exports exit 0. Gitleaks 8.30.1 history/source/fresh mobile bundles all PASS with zero findings. Logs: `artifacts/compose-{check,export,secrets}.log`. React review checked hook order, controlled state, action boundaries, virtualization, scalable text and accessible control labels. Call dispatch tests mock the service; they do not prove real media transport.

Native checks: the existing iPhone 17 Pro / iOS 26.5 Development Client loaded the current JavaScript. Direct CUA inspection verified New chat modal → saved contact → conversation → Back to Chats; New call modal with inline voice/video controls; Keypad entry/deletion → Back to picker; nested New contact/code screens → close to Calls; local search empty state/clear; and Me → Contacts → close back to Me. The native check caught an incorrect return to Chats from Me: the initial route-state inference was replaced with an explicit originating-tab parameter, then the full Me path was repeated successfully. It also exposed keypad movement on partial-number validation; the incomplete-entry hint no longer shifts keys during dialing, verified after correction. Round controls and stable Georgian number entry were inspected. Simulator captures: `artifacts/compose-new-call.png`, `artifacts/compose-keypad.png`.

Failures fixed during development: nonexistent close/clear localization keys, one unused import and two tests expecting the superseded contact-then-chooser workflow. A transient Metro missing-module error while route files were being introduced required a clean Metro restart and simulator app relaunch. The final bundle loads; no fresh fatal JS error was observed. Early keypad sizing and a truncated Georgian code-screen title were refined during visual inspection. The number service still displays a redacted failure with calling disabled; this is not reported as a successful lookup.

Known limitations: no new native binary or Android device test in this JS/navigation change. The simulator binary retains its historical `com.mnelo.app` ID while current source/physical development identity remains `com.mnelo.messenger`. This pass does not claim a new physical iPhone install, actual SMS, real number-based call, VoiceOver/TalkBack session, small-screen or enlarged-text visual acceptance. Native visual inspection used Georgian at the existing simulator size; English is covered by automated screen tests. The prior Expo Doctor **20/21** patch-maintenance advisory remains documented and was not rerun or relabeled PASS. Live number/call testing still needs a working directory/SMS setup and a mutually trusted online peer.

Commit: the commit containing this entry, `feat: streamline new chats and calls`.

## Infobip registration SMS — 2026-09-11

Phase: integrate the owner's authenticated Infobip trial into the current device-owned phone enrollment service.

Status: implementation, authenticated provider configuration and simulator service readiness PASS. **Actual SMS delivery/verification is pending owner enrollment; public release remains NOT READY.**

Implemented: server-only Infobip 2FA adapter behind `SmsVerification`; explicit default/alternate provider selection; read-only configuration diagnostic; private environment example and server-child loading; expiring key with only `2fa:manage`; one Mnelo Development application and one ServiceSMS trial template. Remote policy is six numeric digits, single use, ten-minute expiry and five attempts. Configuration is checked before each send. Number Lookup, delivery callbacks, automatic retries and channel/provider fallbacks are not used. No production sender, payment or contacts upload.

Files: `identity/infobip.ts`, `identity/provider.ts`, `identity/.env.example`, `scripts/check-infobip.ts`, `scripts/security-rules.ts`, `package.json`, provider integration and credential-guard tests; README, architecture/security/phone/testing/release/QA documentation. No dependencies, lockfile, native identifiers or product screens changed.

Database migrations: none. The existing isolated real-provider `.local/phone-sms/` registry is used; fictional registrations stay in `.local/phone-fixture/`. Read-only status testing created no phone binding. No conversation information is sent to Infobip.

Security impact: key stored in ignored mode-0600 configuration under a 0700 directory and loaded only by the server child. Exact Infobip HTTPS origins are validated; redirects and raw provider exceptions fail closed. Approval requires a boolean true bound to the exact provider PIN, plus existing device-signed proof. The credential source guard now covers Infobip. Provider OTP/number retention is separate from conversation privacy; it is not described as zero retention.

Tests: full `npm run check` PASS — strict TypeScript, ESLint zero warnings, formatting, **38 Jest suites / 201 tests**, **45 current device/phone/provider integration tests**, **3 preserved server-utility tests**, source/import-graph security, environment, localization and 14 brand exports. Total **249 tests**. Eight Infobip contract tests and one mobile credential guard case are new. Initial TypeScript checks caught narrowing across async closures; extracting the validated configuration fixed all errors before the full passing run. No strictness suppression.

Live service checks: authenticated 2FA resource configuration validation PASS, with no SMS sent. Real loopback identity HTTP plus one-use signed status PASS using an ephemeral development public identity; no number submitted or registration created. Portal displayed 60 trial days and 15/15 free SMS. Resources were listed before creation; no duplicates were created. The current key expires 2026-11-10. Infobip's trial recipient restriction is preserved.

Native checks: iOS and Android Hermes exports PASS (6.5 MB / 6.8 MB reported by Expo). Existing iPhone 17 Pro / iOS 26.5 simulator client loaded the new public endpoint, preserved its local identity/history and opened Me → Phone number without the service-unavailable/error state. Screenshot: `artifacts/infobip-ios-phone-ready.png`. No real number entered, SMS sent, native rebuild or physical-iPhone OTP/receipt/autofill PASS is claimed. Metro emitted only the existing NO_COLOR/FORCE_COLOR environment warning in the inspected log.

Tooling and secrets: Expo Doctor **20/21**, with the pre-existing maintenance-patch recommendation for 25 Expo packages; dependency compatibility check exits 1 for the same recommendation. No exclusion/suppression or unrelated native dependency upgrade was applied. Gitleaks 8.30.1 history/source/mobile-bundles PASS, zero findings. An additional exact-key comparison against 660 source/export files found no provider key; private configuration is ignored and mode 0600. Logs: `artifacts/infobip-{check,readiness,service,doctor,compatibility,export,secrets,metro}.log`; key isolation summary in `artifacts/infobip-key-isolation.json`.

Known limitations: real SMS/OTP acceptance still needs the account owner's deliberate test using the number already verified in Infobip. The Mac service is loopback-only; a physical iPhone requires reviewed HTTPS reachability, which has not been deployed or bypassed. Trial message allowance is not a production entitlement. Provider management/read scope tradeoff, regional sender/retention policy, production hosting and independent protocol review remain documented release work. No source or provider secret is needed in chat.

Commit: the commit containing this entry, `feat: integrate infobip registration sms` (resolve with `git log -1 --format=%H -- identity/infobip.ts`).

## Country code selection — 2026-09-11

Phase: separate registration country/calling-code selection from national-number entry.

Status: scoped implementation, automated verification and iOS Simulator UI checks PASS; physical-device and real-SMS checks are not claimed.

Implemented: reused the localized virtualized country picker as a shared presentation component, with search by name/ISO/calling code, selection indicator, cancel and disabled-while-sending state. Georgia (+995) is selected initially. Complete valid international-number paste splits into visible country/national fields; incomplete or unsupported input remains invalid. Country changes revalidate the preserved input. Added a pure entry parser using the installed phone metadata and existing E.164 validation. The phone form opts into native iOS keyboard insets and keeps intrinsic content height, avoiding a fixed-size form when the keyboard appears. Other Page consumers retain their previous keyboard behavior. English/Georgian copy explains national-only entry.

Files: shared CountryPicker and Page, the retained legacy CountryPicker re-export, PhoneScreen, phone-entry normalization, phone dictionaries, phone entry/screen tests, README and phone/UX/QA documentation.

Database migrations: none. No provider, credential, backend authorization, native dependency or native-identifier changes. Selection/typing performs no SMS request. The active import-graph test still forbids the old auth/backend implementation.

Tests: final full `npm run check` PASS — strict TypeScript, zero-warning lint, formatting, **39 Jest suites / 208 tests**, **45 device/phone/provider integration tests**, **3 preserved server-utility tests**, security/import-graph, environment, localization and brand checks; **256 total tests**. Seven new tests cover national/trunk-prefix normalization, international paste, unsupported/invalid destinations, selection/revalidation, cancelled search and no automatic sending. Existing invalid-OTP and contact lookup tests remain passing. iOS/Android Hermes exports PASS after the keyboard-layout change. Dependencies were unchanged; the preceding documented Expo maintenance advisory was not suppressed or rerun in this scoped UI change.

Native checks: existing iPhone 17 Pro / iOS 26.5 development client displayed Georgian country selection and separate number entry. Native state confirmed `+12025550101` split to United States +1 and `2025550101`; returning to Georgia invalidated that national number and disabled sending. Search for `+995` returned Georgia. The iOS phone keypad, field focus, keyboard dismissal and access to the send action were inspected; the form was reset to Georgia with an empty number afterward. One automation typing operation inserted malformed text, which the form correctly rejected; using the native text-value action verified the intended paste. No SMS button was pressed. No physical iPhone, Android device or new native compilation result is claimed. The React review found no new backend imports, effects for derived normalization, arbitrary design values or unlocalized feature copy.

Secrets: Gitleaks 8.30.1 passed Git history, source and fresh mobile bundles with zero findings. No new credentials or provider configuration were introduced.

Evidence: `artifacts/country-picker-{tests,check,export,secrets}.log`, `artifacts/country-picker-ios-{form,search}-ka.png`. The inspected Metro log contained only the existing NO_COLOR/FORCE_COLOR warning and no runtime error. Real SMS delivery, Infobip trial restrictions and physical-iPhone HTTPS readiness remain as documented in the previous checkpoint.

Commit: the commit containing this entry, `feat: add country selection to phone registration` (resolve with `git log -1 --format=%H -- src/messenger/phone-entry.ts`).

## 2026-09-11 — Chats search, inputs and local attention

Phase: Messenger UI / local notification refinement.
Status: Implemented and verified in automated checks and an iPhone simulator; remote/background delivery remains open.
Implemented: Permanent integrated Chats search; All / Unread / Direct / Groups filters with Unicode-aware local pagination; shared single-line native input metrics without forced Text line-height; compact bounded multiline chat composer; independent unread-message / unseen-missed-call tab counts; generic foreground banners and opt-in local OS alerts; focus/foreground and sequence-bound read acknowledgement. Fixed native group creation on older `group_deliveries` tables without a revision default, and refreshed cached queries when a reopened device database replaces an engine after Fast Refresh.
Files: Shared input/search/count components, tab layout, active messenger screens, engine/call journal, local notification adapter/settings, DeviceProvider, focused regression tests; README and architecture/security/UX/testing/notification/build documentation.
Database migrations: None. Old call records remain readable with unknown direction; new local records retain direction/outcome and unread state in the existing encrypted journal/backup format. Group delivery inserts explicitly supply revision 0, including membership updates.
Security impact: No server queue, message store, remote push registration, new SMS operation or signing change. Generic OS alert payloads exclude private content and contact identifiers. Local deletion remains independent. Rejected blocked messages and duplicate IDs cannot inflate counts.
Tests: `npm run check` PASS: TypeScript, lint, formatting, **44 Jest suites / 226 tests**, **49 device integration tests** (real SQLite/engine/provider/relay contracts) and **3 historical utility tests** = **278 tests**; source security, environment, localization and brand guards PASS. The alert/call unit adapters are mocks, not physical-device transport proof. Gitleaks source/history/mobile-bundle scans PASS, 0 findings.
Native checks: Both iOS and Android Hermes exports PASS. Existing iPhone 17 Pro iOS 26.5 development binary loaded current JS (the simulator's historical bundle is `com.mnelo.app`; configured app identity remains `com.mnelo.messenger`). Native visual QA verified persistent search, clear/no-result filtering, selected chips, Georgian entry, Latin/Georgian fields at normal and accessibility-medium text sizes, compact empty composer, and real iOS permission prompt/allowed state. Explicit temporary **Development attention QA** fixtures used the real local engine/database, not network delivery: tab counts 3 messages / 2 calls rendered; opening Calls cleared only calls; opening the fixture chat then produced counts 0 / 0. A generic locally scheduled iOS notification banner was actually displayed. Existing call history and the original development contact were preserved. Temporary fixtures/alert were removed after QA.
Known limitations: No physical iPhone/Android interaction or real two-peer notification-delivery test this turn; no new native compilation claimed. Closed/suspended-app delivery remains a release blocker. Expo Doctor with the existing CocoaPods PATH/RUBYOPT is **20/21**: one existing check lists 25 recommended Expo maintenance patch updates; `expo install --check` reports the same mismatch. No packages were upgraded or exceptions suppressed. Initial unconfigured-shell Doctor additionally could not find CocoaPods; its configured rerun resolves that check. The debugging log retains failed inspector connections without an Origin header; reconnecting with the expected local Origin resolved inspection. No final query error remained after the database lifecycle fix.
Commit: Included in `fix: refine chat search and local notification badges` (resolve with `git log -1 --format=%H -- docs/QA_REPORT.md`).

Evidence: `artifacts/chat-attention-check.log`, `chat-attention-export.log`, `chat-attention-secrets.log`, `chat-attention-doctor-configured.log`, `chat-attention-compatibility.log`, `chat-attention-badges-ka.png`, `chat-attention-large-type-ka.png`, `chat-attention-notifications-ka.png`; native fixture scripts/manifests remain ignored development-only artifacts. The banner was also inspected in the live simulator screenshot; it is a local test alert, not a push delivery claim.

## Phone-first entry and local profile — 2026-09-11

Phase: integrate country selection into the number field, require verified first entry and move optional profile details to Me.

Status: implemented and verified in automated checks and native Simulator. Real carrier SMS/physical-device acceptance remains pending.

Implemented: inline country-code picker with national-only input; first launch opens number entry with no mandatory name screen; successful OTP gates every feature route, peer mesh and incoming-call UI. Existing unverified keys/history remain intact behind the gate. A persisted origin-bound enrollment reopens offline. Me contains username and optional first/last names and only a Change phone number entry. Changed numbers require verification; previous enrollment and discoverability are retained until success. Privacy retains discovery/unlink; account erasure can explicitly unlink first. Old backup/database shapes remain readable. A local username is not globally reserved/searchable.

Files: root navigator/entry/phone routes; CountryPicker and new PhoneNumberField; device provider/enrollment/engine/model/notification gates; PhoneScreen, new local-profile/privacy components and Me/account screens; English/Georgian copy; enrollment, phone-screen, local-profile, route and device tests; README and architecture/data/security/authorization/phone/UX/testing/release/build/QA documentation. No dependencies, lockfile, native identifiers, signing or provider credentials changed.

Database migrations: local schema 3 adds username/first_name/last_name and phone_enrollment (service origin, fixture flag, verification time, cascading link to phone cache). Existing names are preserved, without guessing first/last boundaries. Phone cache/enrollment are excluded from exported backups; restore retains keys/history/profile but requires verification on the restored installation. Server registry schema unchanged.

Security impact: keys, a typed number, pending/failed OTP, a legacy display cache and imported archives cannot unlock entry. Fixture receipts cannot unlock preview/production or another service origin. Completion checks the expected device key inside the transaction, so an old verification cannot enroll a replacement identity. Server signed-proof/OTP/pinned-peer protections remain in force. No private profile directory, new content store, automatic SMS or credential exposure.

Tests: final full `npm run check` PASS: strict TypeScript, zero-warning lint, formatting, **46 Jest suites / 233 tests**, **52 current device/phone/provider integration tests**, **3 preserved server-utility tests**, source/import-graph security, environment, localization and brand checks; **288 tests total**. Earlier runs caught unused/import ordering warnings, copy assertions/localization and an unlocalized placeholder; fixed without exclusions. Gitleaks 8.30.1 history/source/bundle scans PASS with zero findings. `git diff --check` PASS. Doctor **20/21**; dependency compatibility exits 1 for the same **25 existing Expo patch recommendations**. No exclusions, force-upgrades or claims that Doctor is clean.

Native checks: final iOS and Android Hermes exports PASS. A separately created iPhone 17 Pro / iOS 26.5 development simulator demonstrated: fresh phone-only entry; valid full-number paste; rejection of an internal Chats route before OTP; wrong OTP stays locked; correct fictional OTP opens Chats; Me username/Georgian name save; verified replacement number returns to Me; cold app restart after stopping the identity service retains access/profile without SMS. English/Georgian inputs and accessibility-medium Georgian fields visually checked; no vertical glyph clipping seen. Original simulator still has its pre-existing identity, one conversation and two call entries, now correctly gated as unverified. Normal service endpoint restored to port 8086; fixture server, temporary environment override and disposable simulator removed. No real data was erased.

Known limitations: an initial fictional-number request failed after SDK 57's virtual development environment resolved the saved real-service endpoint instead of the process override. The exact cause and isolation correction are recorded in BUILD_LOG; no successful real-provider SMS or receipt is claimed, and the real registration database still had zero entries. No new native compilation, physical iPhone, Android-device, carrier/autofill or complete screen-reader/airplane-mode PASS. Existing release/security/background-delivery blockers remain.

Commit: the commit containing this entry, `feat: refine phone onboarding and local profiles` (resolve with `git log -1 --format=%H -- src/messenger/enrollment.ts`).

## Minimal Welcome and number-first entry — 2026-09-11

Phase: simplify launch and registration; make phone number the default discovery identifier.
Status: implemented and verified in automated checks and two native iPhone simulators.
Implemented: approved black/lime mark on warm white during font/vault loading, with an automatic short Welcome before routing; large centered approved Mnelo wordmark, inline country code/number field and Continue. No enrollment discovery checkbox, long intro or development-environment paragraph on this screen. Privacy information opens from a small footer link, and fresh installs retain backup restore. Phone discovery defaults on at registration; Me > Privacy can disable it without unlinking/enrollment loss. Number changes preserve the existing choice. Errors, OTP expiry/resend and verification gates remain intact. Fixed the Georgian privacy modal title wrapping and centered multiline footer links at large text sizes.
Files: WelcomeScreen, MneloBrand, PhoneNumberField, Page, typography/tokens, DeviceProvider, PhoneScreen, RegistrationFooter, PhonePrivacySection, phone copy/tests; README, UX_FLOW, PHONE_IDENTITY, BUILD_LOG and this report.
Database migrations: none.
Security impact: no keys/SMS created merely by viewing Welcome/entry/privacy; no automatic send, auth bypass, directory expansion or new private-data storage. Existing local identity and one conversation/two call records remain behind the unverified gate. No signing, native identifier, dependency or credential changes.
Tests: full `npm run check` PASS — strict TypeScript, zero-warning lint, formatting, **46 Jest suites / 235 tests**, **52 device/provider integration tests**, **3 preserved server utility tests**; **290 total**. Source security, environment, localization and brand guards PASS. New tests cover default discovery on verified registration, preserving hidden status during number change, privacy disclosure on demand and disabling discovery without unlinking. Gitleaks history/source/mobile exports: zero findings. Final diff whitespace check PASS.
Native checks: iOS and Android Hermes exports PASS. Existing development binary (`com.mnelo.app`, configured identity remains `com.mnelo.messenger`) ran current JS in iPhone 17 Pro and a disposable iPhone SE 3rd generation, both iOS 26.5. Actual launch mark and automatic transition captured; English/Georgian entry, integrated field, keyboard-visible Continue, privacy open/close, restored input and accessibility-medium Georgian layouts inspected. Expo development tools button was temporarily hidden through its own simulator preference for screenshots. No native fatal/query error observed. Original account/history and service endpoint retained; temporary simulator removed after QA.
Known limitations: no new native compilation, physical-phone/Android-device test, SMS send or carrier verification this turn. Doctor remains **20/21**, reporting the same 25 pre-existing Expo maintenance patch recommendations; dependencies were not changed or checks suppressed. Existing release/security/background-delivery limitations still apply.
Commit: the commit containing this entry, `feat: simplify welcome and phone registration` (resolve with `git log -1 --format=%H -- src/components/WelcomeScreen.tsx`).

Evidence: `artifacts/welcome-{check,export,secrets,doctor}.log`, `welcome-start.png`, `welcome-phone-ka.png`, `welcome-small-keyboard-ka.png`, `welcome-small-large-type-ka.png`, `welcome-privacy-ka.png`. Images are actual simulator captures, not design renders. Provider operations in automated tests use fixtures/mocks; no live carrier delivery is implied.

## Two-iPhone TestFlight preflight — 2026-09-11

Phase: distribution readiness audit for the owner's requested test on two iPhones.
Status: preparation complete; **upload and two-phone testing blocked**, not a release/build PASS.
Implemented: a read-only `testflight:preflight` command that reports environment/profile/review/endpoint/signing prerequisites without printing values, requesting SMS or changing Apple accounts. Added a current distribution/acceptance plan and corrected the physical-device guide's historical name-first startup instructions. The owner completed Apple login. Created Mnelo App Store Connect record **6811153275**, English (U.S.), SKU `mnelo-messenger-ios`, reusing the existing `com.mnelo.messenger` Bundle ID; verified Prepare for Submission and the empty TestFlight Builds page. EAS submission now pins that public app ID. No new App ID, signing credential, hosting project, DNS record, tester invite or upload was created. Opened Hetzner for owner authentication; no paid server ordered.
Files: eas.json, package.json, scripts/check-testflight.ts, README, TWO_IPHONE_TESTING, IPHONE_DEVELOPMENT, RELEASE, BUILD_LOG and this report.
Database migrations: none.
Security impact: preview/production review gate stays intact; no development relabeling or fixture exposure to obtain a store build. Provider credentials remain server-only. No legal/export-compliance declaration was submitted.
Tests: full `npm run check` PASS (**46 Jest suites / 235 tests + 52 device/provider + 3 historical utility tests = 290**), including strict TypeScript, lint, format, source security, environment, localization and brand checks. Gitleaks history/source/existing exports PASS, zero findings. Direct configuration probes confirm preview and production reject with `MESSENGER_SECURITY_REVIEW_REQUIRED` without a network request. EAS CLI 23.2.0 schema validation and exact Apple submission target check PASS. Final read-only preflight exits **1 as expected** for the four recorded blockers, not a native compiler failure. Live `identity:check:infobip` PASS, no SMS sent.
Native checks: Xcode 26.6 (17F113); one available paired physical iPhone; one local Apple Development identity, zero local Apple Distribution identities; selected generated-project team retained. Cached EAS CLI 23.2.0 `whoami`: Not logged in. No new native compilation/export, two-phone interaction, IPA or TestFlight upload; previous app runtime and native identities unchanged.
Known limitations: loopback phone/signaling addresses, no Internet ICE/TURN configuration, second trial-recipient eligibility unverified, actual OTP and two-phone flows untested, development-hosting account access pending; App Store Connect record/TestFlight access now verified, independent protocol review still pending. Local preflight cannot prove remote EAS configuration, hosting or Apple processing. Details and exact next action: TWO_IPHONE_TESTING.md.
Commit: the commit containing this entry, `chore: prepare mnelo testflight distribution` (resolve with `git log -1 --format=%H -- scripts/check-testflight.ts`).

Evidence: ignored `artifacts/testflight-preflight-20260911.json`, `testflight-preparation-{check,secrets,format}.log`, `testflight-infobip-readiness.log`. Existing runtime test/build results are not reclassified as TestFlight readiness.

## First 50 testers — hosting preparation — 2026-09-11

Phase: smallest practical rented development server for the owner's initial cohort.
Status: local preparation verified; **server purchase and deployment pending Hetzner account access**.
Implemented: recorded the owner's authorization for one small development VM near the previously discussed EUR 6/month plus tax budget. Prepared the concrete CX23 EU order plan and deployment sequence, including SSH/firewall, separate services, new development DNS records, provider-secret handling, proxy-aware quotas, TURN and retention validation. Added an isolated loopback integration check for 50 simultaneous synthetic relay identities, 50 route lookups, 50 signed offer deliveries, complete disconnect and 50 successful reconnects.
Files: README, package.json, DEVELOPMENT_HOSTING, TWO_IPHONE_TESTING, this report, BUILD_LOG and tests/messenger/cohort.integration.ts.
Database migrations: none; no live database or registry read/copied/modified by this check.
Security impact: no public port opened, no fixture/SMS endpoint exposed, no secret transferred, no review gate modified, no account contract accepted. The test uses only newly generated ephemeral synthetic keys and no message content or SMS.
Tests: dedicated cohort check PASS (1 test); full `npm run check` PASS (**46 Jest suites / 235 tests + 53 device/provider integration + 3 historical utility tests = 291**, including the new cohort test). Strict TypeScript, lint, formatting and source/environment/localization/brand guards PASS. Gitleaks 8.30.1 history/source/existing mobile outputs PASS with zero findings. No dependencies changed.
Native checks: none required or run for this test/documentation-only change. No new mobile build, installation, live SMS, call or TestFlight result is claimed.
Known limitations: account is still at the Hetzner login page. No server ID/IP/checkout price exists yet. Local 50-peer routing is not proof of remote VM capacity, 50 real phones or 25 simultaneous video calls. Public registration hardening, TURN, provider recipient allowance, independent review and physical acceptance remain open.
Commit: the commit containing this entry, `chore: prepare hosting for first 50 mnelo testers` (resolve with `git log -1 --format=%H -- tests/messenger/cohort.integration.ts`).

Evidence: `artifacts/development-hosting-cohort.log`, `development-hosting-check.log`, `development-hosting-secrets.log`. No cloud bill or remote deployment artifact was created.

## Hetzner development services — 2026-09-12

Phase: first rented development backend.
Status: **VM provisioned; HTTPS identity and WSS signaling checks PASS. Two-iPhone/TestFlight acceptance remains NOT READY.**
Implemented: reused project 16005696 as Mnelo Development; purchased CX23 `mnelo-dev-01` (165553002), Nuremberg, $7.09/month before VAT including IPv4; no paid additions. Added only relay-dev/identity-dev DNS records. Installed separate restricted service users, Caddy TLS, closed backend ports and tested no-swap/dump/request-log configuration. Deployed server-only Infobip settings through encrypted SSH stdin, one actual provider-verified tester admission, and persistent aggregate SMS reservations (10/hour, 15/day). The local registry had zero registrations and was preserved; a separate hosted development registry was created. No chat/media/call storage or actual SMS was introduced/sent.
Files: deploy/hetzner bootstrap/service/proxy files; identity/development-guard.ts; identity HTTP/service entry points; hosting bundle and deployed-service check scripts; seven hosting integration tests; package manifest/lock and current architecture/security/testing/hosting documentation.
Database migrations: separate development sms_budgets schema v1, two aggregate scope rows at most; no phone/IP/device/message fields. Existing phone schema unchanged. No Supabase deployment/migration.
Security impact: trusted proxy header only from loopback, overwritten by Caddy; explicit HMAC-index tester admission before provider requests; quota reservations persist across database reopen and commit atomically before sending. Provider credentials and new index key remain private; no mobile content/key copied. SSH first contact was TOFU, not independently console-verified; later host changes fail closed. Release review gate remains unchanged.
Tests: full check PASS — 46 Jest suites / 235 tests, 60 messenger/provider/hosting tests, 3 historical stream tests (**298 total**). TypeScript, lint, formatting, source-security, env, localization and brand checks PASS. The isolated bundled 50-peer test passed on Mac and VM. Deployed WSS passed invalid-signature, 50-route/50-offer, reconnect/offline cleanup checks including after service restart. HTTPS identity passed signed status, unauthorized lookup/proof, unsupported content route, Origin denial and forged proxy-header quota checks; these never send SMS or create an account. Infobip read-only checks passed locally and remotely. Persistent journal/crash/core directories empty after removing bootstrap-only journals; process swap zero; services active with no unexpected restart at inspected checkpoints.
Native checks: Doctor 20/21 with the documented CocoaPods environment, and compatibility exit 1, for the already-known 25 Expo patch recommendations; initial unconfigured shell 19/21 also lacked CocoaPods PATH. No native build, new mobile export or physical-device pass claimed. No native package was upgraded during hosting work.
Known limitations: local default DNS cached Vercel's old wildcard during the first external WSS test (404); hostname checks from VM and certificate-verified direct-IP/hostname checks from Mac pass. TURN is not installed; app still needs verified hosted development configuration and a new appropriate binary. Infobip 15/15 trial SMS remain and only one recipient is verified; owner billing/second-phone eligibility, carrier OTP, independent protocol review, background delivery, Apple distribution and two-device media remain open. npm audit: 16 moderate, same two advisories, zero high/critical. No forced remediation.
Commit: the commit containing this report, `chore: deploy mnelo development services on hetzner`.
Evidence: ignored artifacts/hosting/manifest.json and bundles; hetzner-provision-check.log, hetzner-remote-check.log, hetzner-identity-check.log, hetzner-provision-doctor.log, hetzner-provision-compatibility.log and redacted secret/audit reports. Runtime hashes are verified before install; a successful backend test is not a native/media capacity claim.

Billing follow-up: owner saved Infobip billing address. UI minimum $6 credit, $0.33 fee, $6.33 total, displayed tax zero; automatic recharge off. Amount prepared only. No card details entered by the agent and no payment submitted. This is a separate SMS payment from the already funded Hetzner account.

## Funded Infobip and first physical registration — 2026-09-12

Phase: activate paid SMS access and admit the owner's two testers.
Status: **first physical iPhone SMS registration verified; second-phone/TestFlight acceptance pending**.
Implemented: verified $20 live balance, pay-as-you-go activation and no configured automatic recharge. Replaced the initial unused tester index with the owner's two canonical phone indexes using an operator-only, atomic update utility. Preserved provider configuration, HMAC key, registration DB and persistent budgets. Restarted identity and confirmed service health. Prepared a private hosted-development endpoint override and restarted Metro for the existing physical development client. After unlocking, the owner received SMS and entered its code; the actual phone capture shows Chats. Server independently records one registration and one reservation in each budget window. Infobip free-message count changed from 15 to 14, balance remained $20. Second iPhone is remote; use TestFlight for its future install/update.
Files: identity/tester-configuration.ts, scripts/configure-hosted-testers.ts, scripts/build-hosting.mjs, four admission-update tests, hosting/two-iPhone/build/QA documentation. Private override, bundle and screenshots remain ignored; no real test number is in tracked source/docs.
Database migrations: none. Existing databases/key byte-checked unchanged during admission update; subsequent owner OTP legitimately created the first identity/budget entry.
Security impact: root-only utility accepts phone input through SSH stdin; no raw phone saved in configuration, argv or source. Rejects production/ambiguous config, invalid/duplicate/oversized phone lists, symlink/shared/insecure files. Exclusive lock and atomic synced rename. OTP and spend limits remain 10/hour and 15/day; no automatic provider send, budget reset, key rotation, release-gate bypass or extra billing.
Tests: full check PASS — **46 Jest suites / 235 tests + 64 messenger/provider/hosting tests + 3 historical utility tests = 302 tests**; strict TypeScript, lint, format and security/env/localization/brand guards pass. Four new tests cover canonical hashing/settings preservation/idempotency and fail-closed configuration/input handling. WSS 50-peer routing/reconnect and HTTPS negative authorization/proxy-quota checks pass from the Mac through normal DNS/TLS after an initial stale-cache failure. Read-only Infobip configuration PASS. Gitleaks source/history/existing mobile exports and new hosting bundle: zero findings. Raw iOS development JS scan: two generic-key matches, investigated as an unused public Supabase publishable key and a non-secret Fast Refresh signature; no suppression or false zero-findings claim.
Native checks: existing signed com.mnelo.messenger 0.1.0 (1), iPhone 17 Pro Max, launched after owner unlock. Actual owner SMS/OTP plus captured Chats render PASS for that first phone. iOS development JS bundled with both hosted endpoints. No new native compilation/IPA/TestFlight upload, other-device/call/background/update-preservation PASS. Doctor was not rerun for this server-only utility; last native checkpoint remains 20/21 with 25 known Expo maintenance recommendations.
Known limitations: remote second phone untested; current app still uses Metro. TURN, review gate, standalone signing/archive, beta review/legal metadata and two-phone media/background flows remain open. A 401 inspector probe was not bypassed; successful registration is substantiated by owner/device/backend evidence instead. No crash-free or protocol-certification claim.
Commit: the commit containing this entry, `chore: enable funded sms testing for mnelo`.
Evidence: artifacts/infobip-paid-check.log, redacted source/hosting/debug-bundle scanner reports, hosted-development-ios.js, hosted-development-metro.log, infobip-paid-iphone-launch.json and infobip-paid-iphone.png. Phone numbers and OTPs are omitted from Git.

## Remote beta installation/update preparation — 2026-09-12

Phase: prepare TestFlight instead of requiring the remote tester's USB connection.
Status: profile prepared; **no build or upload**, review/signing/media prerequisites remain.
Implemented: explicit TestFlight store/Release profile in the preview environment with the existing Apple app target and automatic build-number increments. Production configuration remains separate. App profile mapping recognizes the beta preview; preflight selects a named profile and rejects a development client instead of merely finding any store profile elsewhere. Updated the first physical OTP evidence and documented in-place update requirements.
Files: eas.json, app.config.ts, scripts/check-testflight.ts, README, PHONE_IDENTITY, RELEASE, TWO_IPHONE_TESTING, QA_REPORT.
Database migrations: none; native identity, signing team, vault path/key, history and phone registry unchanged.
Security impact: preview review gate retained, no bypass/fake audit; no tester team access, certificate creation, OTP send, invite, legal declaration or upload. Beta endpoints belong only to the isolated cohort; production does not inherit them.
Tests: installed EAS JSON schema PASS; explicit profile/Apple-target/production-separation assertions PASS. TestFlight preflight correctly exits 1 solely for the protocol-review gate. Development-client selection correctly exits 1 and includes STORE_DISTRIBUTION_PROFILE_REQUIRED. Full check PASS: TypeScript, lint, formatting, 46 Jest suites / 235 tests, 64 messenger/provider/hosting tests and 3 historical utility tests (**302 total**), with security/env/localization/brand guards.
Native checks: none; existing first-phone registration/render evidence is unchanged. No in-place binary upgrade or TestFlight installation PASS.
Known limitations: security review, TURN/Internet media, standalone signing/build, owner compliance information, beta review and remote second-phone acceptance still required. A valid profile is not an uploaded/downloadable app.
Commit: the commit containing this entry, `chore: prepare remote testflight beta updates`.
Evidence: artifacts/testflight-profile-check.json and testflight-beta-profile-check.log.

## 2026-09-12 — Internet relay and functional beta preparation

Phase: Two-iPhone functional beta preparation.
Status: Source/hosted transport checks passed; signed archive and physical acceptance continuing.
Implemented: authenticated one-hour TURN credentials, relay-only hosted ICE, negotiation cancellation/replay controls, bounded receive queue, stale-call failure isolation, scoped functional-preview gate with production still blocked.
Files: identity/turn.ts, messenger ice/peer/call modules, native app configuration, hosted TURN service/config, tests and BETA_SECURITY_REVIEW.md.
Database migrations: none; existing phone index, registry, aggregate SMS budgets and device vault identifiers preserved.
Security impact: no server message persistence; authenticated relay restricted to its own allocation address, quotas, no runtime logs/admin/db/swap. This is an engineering-reviewed functional beta, not independent certification.
Tests: full npm check PASS — 46 Jest suites, 236 tests; 3 historical server utility tests; 70 current messenger/provider integration tests (309 total). Gitleaks 8.30.1 source/history/iOS+Android export: zero findings. Expo Doctor 21/21 PASS using the existing CocoaPods Ruby logger/path setup; dependency compatibility PASS after SDK 57 maintenance patches.
Native checks: clean iOS prebuild and CocoaPods install PASS; iOS and Android Hermes export PASS. Native archive running, not yet claimed successful.
Hosted checks: coturn 4.18.0 builds from pinned official source; RFC5769 tests PASS. From this Mac, UDP and TCP authenticated allocation/cleanup pass; invalid credentials and five disallowed peer destinations fail correctly. Real browser WebRTC text, chunked file, voice/video, mute/end/decline/block and relay/relay candidate selection pass on both normal and TCP-only transports. Synthetic media, not iPhone microphone/camera QA.
Known limitations: see BETA_SECURITY_REVIEW.md; especially foreground-only incoming communication and Apple external beta approval.
Commit: recorded in Git with the relay/beta preparation commit; native outcome follows separately.

### Native beta execution result (September 12)

Phase: Standalone iPhone/TestFlight preparation.
Status: Signed archive/export/upload PASS; first iPhone installed/launched; Apple processing and owner declarations still pending at this checkpoint.
Implemented: 0.1.0 (2) standalone preview with embedded hosted configuration; existing bundle/team/vault identity preserved.
Files: native artifacts under ignored artifacts/, BETA_TEST_PLAN_KA.md, EXPORT_COMPLIANCE_TECHNICAL.md, build/release reports.
Database migrations: none; hosted index key, original registered identity and SMS budgets preserved.
Security impact: no new SMS, no secrets in source/export/native scan; no compliance answer fabricated.
Tests: 309 automated PASS as above; native signature PASS; first-device in-place install/direct launch/process-liveness PASS.
Native checks: Xcode archive PASS, App Store export PASS, Apple upload PASS. Four upstream dSYM warnings are documented in BUILD_LOG.
Known limitations: no post-upgrade screenshot/visual enrollment proof, no second-device QA, no closed-app delivery. Apple build processing, export-compliance owner determination and external beta review are distinct from upload success.
Commit: implementation c2d2f05608ef50124baa934976869bacb88b2d92; final evidence documentation recorded separately.

Owner follow-up: closed/background-app notifications and incoming calls are now mandatory before physical-beta readiness. Build 2 remains a verified archive/upload checkpoint, not a completed two-phone candidate. After explicit owner authorization, the Apple documentation questionnaire was completed with standard third-party encryption and the owner-confirmed current exclusion of France; saved without inventing an approval/document. Build-level compliance and external review remain unverified.

## September 12 — background alerts and native calls on both platforms

Phase: Replacement build 3 with native background communication.
Status: Implementation/automated QA/native compilation PASS; provider activation and physical acceptance pending. NOT READY for the full requested background test.
Implemented: Direct APNs alerts/PushKit/CallKit and FCM/Core-Telecom; native pre-JS ringing, shared/headless runtime, bounded ringing deadline, early-answer/decline/cancel races, timeout-versus-decline accounting, foreground camera gating, generic alerts, signed routing and revocable recipient capabilities. Offline revocations retry while the existing runtime is alive. Main message protocol remains compatible with build 2 through a separate wake data channel.
Files: app config/entry/dependencies; modules/mnelo-calls and native vault; notifications; identity; messenger runtime/calls/wake/UI; hosting/preflight/security scripts; provider/device/native-bridge tests and architecture/operations guides.
Database migrations: Additive local capability/revocation tables excluded from backups; separate server push-routes.db. No Supabase migration, platform conversation queue, reset or participant-history copy.
Security impact: Minimal persistent token/platform/public-identity routing and opaque capability hashes. No sender/content in provider payloads. APNs expiration/FCM TTL zero, fixed provider URLs, bounded bodies/timeouts/quotas/concurrency, ownership/rotation/revocation controls. Secrets remain server-only. Same iOS SQLCipher key migrates to device-only accessibility after first unlock; locked-screen access intentionally changes and needs physical acceptance.
Tests: npm run check PASS: 47 Jest suites / 243 tests + 79 device/provider integration + 3 historical server tests = **325**. TypeScript, zero-warning lint, formatting, environment, source security, localization and brand PASS. Doctor **21/21**, compatibility PASS. Both mobile exports PASS. Gitleaks history/source/exports/archive Hermes printable strings: **0 findings**. npm audit: **16 moderate, zero high/critical**, same two advisory families. Native Maven transitive vulnerability audit is not implied by npm audit.
Native checks: Xcode 26.6 signed Release archive/export of 0.1.0 (3) PASS. Original app/team, min iOS 16.4, archive development APNs and exported Production APNs verified; signatures PASS. Android ARM64 development APK PASS: min API 26 / target 36. Native Swift/Kotlin errors encountered during development were fixed in source; upstream warnings retained. No physical receipt/audio/camera PASS inferred.
Known limitations: Production APNs download needs owner action; Firebase terms/project/configuration pending. First phone needs unlocked build-3 launch/migration. Second phone not installed. Apple processing/external beta access unconfirmed. Generic push is not content delivery; sender's reachable local copy remains necessary. Without an authenticated invitation a generic call push cannot create a named local missed-call record. Independent protocol review, force-stop/permission/network and other release limits remain explicit.
Evidence: artifacts/background-check-verified.log, background-doctor-final.log, background-compatibility-final.log, background-export-verified.log, background-secrets-verified.log, background-native-secret-scan.json, background-ios-final-archive.log, background-ios-export.log, background-android-verified-build.log, background-native-verified.json, background-export-entitlements.json.
Commit: included in `feat: add native background alerts and call handling`; later deployment checkpoint records its resolved hash.

Native distribution follow-up: build 3 in-place installation on the existing first iPhone **PASS** at 03:41 Tbilisi; no uninstall/key reset/OTP. Phone was passcode-locked, so first unlocked launch, visual enrollment preservation and background acceptance remain unverified. Apple upload **PASS** at 03:42:51; four vendor dSYM warnings remain. Upload is not completed processing/beta availability. Server/provider deployment is recorded separately after verification.

## September 12 — live credential mount correction

Phase: Hosted background routing activation.
Status: Initial deployments safely rolled back; diagnosed systemd credential-file mode mismatch.
Implemented: Descriptor-based credential reader accepts systemd's root-owned, read-only 0440/0550 ACL mount only at CREDENTIALS_DIRECTORY under /run/credentials. Ordinary group/world-readable files and symlinks remain rejected. No source-directory permission relaxation.
Files: notifications/credential.ts, scripts/phone-identity.ts, tests/messenger/credential.integration.ts, PUSH_OPERATIONS.
Database migrations: none beyond the previously recorded empty routing database; existing identity registry/key/SMS admission and counters retained. Deployment validates logical database records, since an isolated fixture proved identical user_version assignment rewrites SQLite headers.
Security impact: Preserves root-only credential sources and systemd delivery; no secret output, no new SMS, no exposed key. Actual Linux probe reports only metadata and EC curve, never contents.
Tests: Four added file-permission/symlink tests; final results and successful deployment recorded in the next checkpoint. Native app unchanged from build 3; no additional native compilation is claimed for this server-only correction.
Commit: included in fix for protected systemd credential loading; deployment checkpoint records resolved hash.

## September 12 — final hosted/native checkpoint

Phase: Background communication implementation and deployment checkpoint.
Status: Code/native builds/server health PASS; **NOT READY** for full two-phone background acceptance until the remaining owner/provider/device steps are complete.
Implemented: Native source commit `9624aa4c3f8e25b9dc84172caf9876729c739f6d`; protected credential fix and deployed server source `5b8197a97ea25508ae70caa3a4e776e0652f38d5`. Bundled server manifest is clean and hash-verified; code-only rollback retained. Identity alone restarted, with root-private APNs Sandbox LoadCredential and no directory permission expansion.
Files: current deployment, testing, release and operations documentation; implementation files in the two commits above.
Database migrations: Push routing database created empty; zero routes/zero grants because updated phones have not yet registered tokens. One existing phone identity retained. Logical identity/SMS budget records and byte-identical index key/provider/tester configuration verified unchanged.
Security impact: No additional SMS, user enrollment, token exposure, history copy, public release or Firebase terms acceptance. Root source key/environment mode 0600 and source directory 0700; registry owned by dedicated identity user mode 0600. Temporary browser TURN harness stopped and its expired local credential file removed. Unused production key attempts revoked; final scoped key ZF78N9555B is left unclicked for the owner's Download action.
Tests: **329 PASS** — 47 Jest suites/243 tests, 83 device/provider/credential tests and 3 historical server tests. Full check includes type/lint/format/security/environment/localization/brand. Final source/history/mobile-export Gitleaks: zero findings. Doctor 21/21 and compatibility remain the verified native-dependency checkpoint; server-only fix changes no native dependency or binary. Public HTTPS test PASS: signed status, unregistered lookup/TURN denial, forged signature denial, no content route, origin rejection and proxy quota protection. Live WSS test PASS: 50 concurrent synthetic peers, 50 signed offers, reconnect and offline cleanup; no media/SMS.
Native checks: Build 3 signed archive/export/upload PASS; upload delivery **6efc5bee-6a17-4cb3-a093-dd4b51d7b330**, Apple app 6811153275. Existing iPhone install PASS and installed 0.1.0 (3) confirmed through CoreDevice. Phone remains locked; unlocked launch/vault migration/retention/permissions/background receipt are unverified. Android development APK compilation PASS, actual FCM/Telecom phone QA pending. Four upstream dSYM upload warnings retained.
Known limitations: Apple TestFlight still displays No Builds after refresh despite successful upload; no processing completion/external tester link asserted. Owner must download the prepared Production APNs key; Firebase initial terms acceptance/project/client/server configuration pending. Two-phone content/audio/video/background acceptance, independent security review and documented delivery/privacy limits remain open. The explicit coturn systemd unit is mnelo-turn; querying coturn by the wrong unit name initially returned inactive and is not evidence that the actual service stopped. All four actual units (identity, relay, mnelo-turn, Caddy) were checked by their correct names.
Evidence: artifacts/background-deployment.json, background-deployment-final.log, background-sqlite-guard-proof.json, background-check-deployment-final.log, background-hosted-identity-check.log, background-hosted-relay-check.log, background-hosted-services-final.log, background-iphone-install.log, background-iphone-installed.json, background-ios-upload.log, background-secrets-final.log. No credential values in reports.
Commit: this documentation checkpoint follows the two resolved source commits above; final git status and commit are reported to the owner.

## September 12 — Production APNs activation and Firebase project setup

Phase: Provider configuration for native background testing.
Status: Production APNs configuration/deployment PASS; Firebase project created; Android sender/client setup and actual physical delivery remain incomplete. **NOT READY** for the complete two-phone background acceptance.
Implemented: Downloaded scoped Production key UHS939BXXT via native Chrome after the owner's in-app download of ZF78N9555B yielded no accessible file; revoked only that unused predecessor. Sandbox key 5G4XS8J4XY preserved. Added Production LoadCredential to the existing identity service with code-only/runtime state unchanged. Owner-confirmed Firebase terms; Chrome completed Firebase on the already partially created mnelo-development Cloud project, number 657690934155, with Analytics off. No duplicate project or paid-product/billing upgrade.
Files: README.md, PUSH_OPERATIONS.md, TWO_IPHONE_TESTING.md, BETA_TEST_PLAN_KA.md, DEVELOPMENT_HOSTING.md, RELEASE.md, BUILD_LOG.md and this report. Private key files/configuration are outside Git.
Database migrations: none. Byte-identical index/provider/admission/Sandbox-key checks and logical identity/SMS budget/push-record checks passed across identity restart. One existing iOS Sandbox VoIP route and zero grants; no alert route. No tester/account creation, OTP, message history or device-key extraction.
Security impact: Production source key root-owned 0600, /etc/mnelo 0700, systemd credential delivery; local key 0600 outside source. No broad Firebase Admin SDK private key generated. Google Cloud's attempted dedicated mnelo-push-sender creation failed with tracking c50707889250639; refreshed service-account inventory still shows only the default Firebase Admin SDK service account with no keys. Existing Google projects and the owner's other Apple app remain untouched.
Tests: public HTTPS identity check PASS — signed unregistered status, unauthorized lookup/TURN, forged-proof rejection, no content endpoint, browser-origin rejection and proxy-quota bypass rejection; no SMS sent. All four hosted services active. Repository formatting/source-security/diff-whitespace checks PASS; Gitleaks 8.30.1 history/source/existing mobile exports PASS with zero findings. No application/dependency change: TypeScript/unit/Doctor/native rebuild were not rerun in this configuration checkpoint; the prior 329-test/21-of-21 Doctor/build results remain dated evidence.
Native checks: original iPhone unlockedSinceBoot=true/passcodeRequired=false at 12:26:58 Tbilisi; existing app launch PASS at 12:29:12, PID 15541. Subsequent filtered process check failed because CoreDevice could no longer locate that phone (error 1011); ongoing process liveness/visual retention/permissions/receipt are not claimed. No reinstall/reset/new native artifact. Refreshed TestFlight still asks to submit a build; uploaded build 3 is not proven available to testers.
Known limitations: native Chrome stopped returning window controls despite owner confirmation that Chrome is open; in-app Firebase reports project/app permission failure while Google Cloud confirms owner/project access. Resume Android setup in a functioning Chrome session from the existing Firebase General page, check for partial registration/sender state, configure only FCM sending, then rebuild/test Android. Two-phone message/media/call/background acceptance, alert permission/capability exchange, Apple distribution and independent review remain open. FCM carries only generic wake events, but Google processes installation/routing/delivery metadata; no zero-metadata guarantee is made.
Evidence: artifacts/apns-production-deployment.json, push-followup-iphone-lock.json, push-followup-iphone-launch.json, push-followup-format.log, push-followup-security.log and push-followup-secret-scan.log. Credential/token contents are excluded.
Commit: recorded with the provider configuration documentation commit following a3a8ca1; resolved hash is in Git.

## September 12 — build 3 Apple rejection / build 4 repair

Apple's 03:43 email was read in Mail with the owner's authorization. Build 3 was rejected after upload: ITMS-90683, missing NSMotionUsageDescription. The source cause was `expo-location` configuration removing the purpose string while still linking native Core Motion APIs. The supported configuration now supplies truthful EN/KA copy without requesting motion access. iOS build number is 4; bundle identity, enrollment, database and signing team remain unchanged.

Executed for this repair: `npm run check` PASS, including TypeScript, lint with zero warnings, formatting, 47 Jest suites / 243 tests, source security, environment/localization/brand guards, 3 preserved server utility tests and 83 current device/provider tests. Total **329 tests PASS**. No physical test is included in that count. Expo Doctor initially reported a CocoaPods PATH error (20/21); with the already documented scoped Ruby/PATH environment it passes **21/21**. No dependency change was needed; Expo compatibility PASS.

Both current iOS/Android Hermes exports PASS. Gitleaks source/history/current exports: **zero findings**. Native permission artifact check fails against preserved build 3 with the precise missing-key error and passes against regenerated configuration (six purpose strings, EN/KA matching, no always/background location). New archive/export/Apple processing outcomes follow after completion; no second-iPhone or background notification/call PASS is claimed.

Build 4 archive/export verification **PASS**: final .app and exported IPA contain the six required purpose strings and matching EN/KA translations; signature/team/app identity and Production APNs entitlement pass. Sixteen privacy manifests are syntactically valid. Native Hermes printable secret scan: zero findings. App Store Connect now confirms upload **Complete** for 0.1.0 (4), ID `57da4fb6-155b-46fd-9667-ce705fd8a5e5`; builds 2/3 are explicitly Failed. The ITMS-90683 delivery blocker is resolved. Distribution configuration and real two-device acceptance remain separate.

Build-specific compliance cleared using the owner's authorized standard-encryption / France No answers. The internal group contains only build 4 and the existing account holder, automatic distribution off. The owner confirms the TestFlight installation opened and notifications were enabled. These are user-reported physical observations, not automated full-device QA. At 13:19:53 Tbilisi, read-only hosted counts show one identity, one iOS Production alert route, one iOS Production VoIP route and zero peer grants. No push was sent by this check. Actual receipt, history retention and two-phone connectivity remain untested.

The external group has the second tester and no available build. Its review requires working reviewer access under the current two-number admission. The owner has now authorized separate isolated review accounts, but they are not implemented/deployed at this checkpoint. No authentication bypass or team-role workaround was introduced. Evidence: `artifacts/build4-{check,doctor,compatibility,exports,secrets,archive,export-ipa,upload}.log`, `build4-artifact.json`, `build4-upload-summary.json`, `build4-push-registration.json` and `build4-native-secrets.json`. The preceding dependency audit remains 16 moderate / zero high-critical; it was not rerun for this permission-only change. No new Android native build or physical Android test was performed.

Commit: `fix: resolve TestFlight motion permission rejection` (the commit containing this entry).

## September 12 — isolated Apple reviewer access, local checkpoint

Phase: Owner-authorized reviewer enrollment and cohort separation.
Status: Local implementation/QA PASS; hosted deployment, build 5 archive/export/upload and external review submission remain pending.
Implemented: Two reserved fictional review numbers with separate expiring 128-bit credentials; server stores hashes, no SMS for review. Masked review entry and Me disclosure; normal SMS remains six-digit. Current registry-derived scope controls lookup, relay authentication/presence/signed offers and wake recipient authorization. Hosted routing shares the current identity policy in one process; standalone local fixtures remain separate. Native build number 5.
Files: identity/service/registry/access, notifications/service, relay/server, hosted startup/operator scripts and systemd drop-ins; mobile phone protocol/enrollment/screens/copy; security guards, reviewer/UI tests and APPLE_REVIEW_ACCESS.
Database migrations: none; existing phone schema preserved. Only explicitly authorized review registration/push metadata will use the existing tables after deployment; no chat content or device key copies.
Security impact: Real SMS admission/budgets unchanged; no client role trusted, no hosted local-fixture bypass. Cross-cohort discovery, presence, signed message/call offers and valid foreign push capabilities denied. Unknown/expired review routes denied. Credentials outside source/mobile code with 14-day expiry; public release gate remains.
Tests: Full check PASS: **340 tests** (47 Jest suites / 246 tests, 91 current device/provider integration, 3 historical utility tests). TypeScript, zero-warning lint, formatting, source security, environment, localization and brand PASS. The first new negative UI test used an incorrect expected error string; actual denial was correct, assertion aligned to the existing copy and both targeted suites pass (17 tests). Initial TypeScript caught startup initialization order and two new test typings; corrected without suppressions. Eight review integration tests pass, including real loopback WebSockets. Expo Doctor 21/21; dependency alignment and iOS/Android exports PASS; history/source/export Gitleaks zero findings.
Native checks: Incremental iOS prebuild PASS and six permission descriptions/EN-KA translations PASS. Signed build 5 archive/export and final IPA permission/signature checks PASS; no Apple processing, physical review login or two-phone background/media PASS claimed here. No dependency versions changed.
Known limitations: Apple's external review and two real iPhones remain untested together. Review isolation is application authorization on shared development infrastructure, not a separate TURN network or independent security certification. Expiration leaves local device history intact; later review-only metadata cleanup must be explicit.
Commit: `feat: add isolated Apple review accounts` (the commit containing this checkpoint).

## September 12 — reviewer deployment and build 5 delivery

Phase: Hosted review access and TestFlight preparation.
Status: Deployment and signed archive/export/upload PASS; Apple processing and external review pending at this checkpoint.
Implemented: Deployed clean source `ef2894d70a18948527b7d6a8f19fcb45132d7588` on the existing development server; saved actual private review sign-in information in App Store Connect. No public store release, team-access expansion or new paid infrastructure.
Files: deployment/identity/relay/mobile changes in ef2894d; delivery/security/architecture/phone documentation updated afterward.
Database migrations: none.
Security impact: Existing identity, SMS budget, index/provider/APNs keys and push records preserved. A two-review-account hosted probe self-unlinked its own new identities; the original one identity, two Production routes and zero grants remain. No review keys, SMS codes, push tokens or private keys were printed or committed.
Tests: Full 340-test suite remains PASS. Post-deployment real HTTPS reviewer registration/lookup/TURN and signed WSS message/call offers in both directions PASS; authenticated cleanup PASS. Hosted HTTPS negative authorization/origin/proxy-quota checks PASS; WSS forged and valid-unregistered signature rejection PASS. These are synthetic protocol checks, not real media or APNs receipt.
Native checks: Build 5 signed archive, distribution IPA, Production push entitlement, non-debuggable signature, 16 privacy manifests, hosted endpoints, all six purpose strings and EN/KA translations verified. Native Hermes secret scan zero findings. Upload succeeded at 14:07:07 Tbilisi; Apple ID fc21f388-12f0-4c99-9f92-5467fb617612, initially Processing. Four existing missing vendor dSYM warnings remain.
Known limitations: First iPhone remains user-confirmed TestFlight 4; second iPhone installation and all two-phone delivery/audio/media acceptance remain pending. No new Android artifact or Android FCM completion. Latest dependency audit remains 16 moderate/zero high-critical and was not repeated for this no-dependency-change work.
Commit: implementation ef2894d; delivery checkpoint follows.

Build 5 final Apple checkpoint (approximately 14:16 Tbilisi): **upload processing Complete**, owner-authorized compliance answers applied, actual private reviewer credentials and instructions saved, **external Beta App Review submitted**. Build `fc21f388-12f0-4c99-9f92-5467fb617612` is assigned to Mnelo Development (one internal tester) and Mnelo Preview (one external tester). The external group shows **Waiting for Review** with build 5, and **Automatically notify testers** was checked during submission. No external email delivery, approval, second-phone installation, or physical two-phone PASS is claimed. First-phone build 4 remains the last owner-confirmed installation. Reviewer implementation commit: ef2894d; this delivery evidence is committed separately.

### Phase: September 12 build 6 TestFlight preparation

Status: Release archive, export and upload PASS; Apple processing observed, availability tracked in BUILD_LOG.
Implemented: packaged committed profile/photo/business-card/QR features and automatic notification enrollment after verified registration. No product-code changes in this build step.
Files: generated native projects and ignored artifacts; BUILD_LOG, RELEASE and QA_REPORT evidence.
Database migrations: device-vault version 4 already included by a8e110c; no server migration or service configuration changed.
Security impact: existing encryption/release gate preserved. Production APNs, expected App ID/associated domains and debug-disabled distribution entitlements verified. Secrets scans zero.
Tests: 384 tests PASS (283 Jest + 3 server + 98 device), typecheck/lint/format/security/env/localization/14 brand checks PASS; Doctor 21/21; dependency compatibility PASS.
Native checks: clean regenerated iOS plus Pods, signed Release archive, exported IPA, purpose strings on archive/export, final entitlements and upload PASS.
Known limitations: Apple approval and physical two-phone acceptance remain separate. Four pre-existing vendor dSYM warnings; no independent crypto audit; no new Android binary.
Commit: see dedicated build-6 delivery evidence commit.

Final Apple result: build 6 processing Complete, compliance cleared with existing owner answers, What to Test saved, and existing one-tester internal group assigned. External group is disabled by Apple until pending build 5 is approved; no cancellation of that review. Website companion update is LIVE at mnelo.com, dedicated website commit `7f9d6a9`; its separate browser/build/3-test/audit-zero evidence is in that repository.

## September 12 — soft UI typography and compact navigation

Phase: focused design refinement after TestFlight build 6.
Status: implemented and verified in the existing native Simulator development client; not uploaded as a new TestFlight binary.
Implemented: bundled DM Sans/FiraGO; lighter optical weights and heading tracking; active whole-tab lime fill; dark/white attention badges; tab bar content 10 points shorter at default text size with the full bottom safe inset retained. Shared text measurement refreshes when the loaded face, Dynamic Type or cap changes. Navigation/title scaling capped at 2×; two-line tab labels supported. Content/inputs retain full scaling; the development notice has a separate 1.5× cap.
Files: theme, font assets/OFL/provenance, AppText, CountBadge, shared Page header, tabs, design documentation and brand-generation comment.
Database migrations: none.
Security impact: none; no account, identifier, messaging, delivery, permission or cryptographic changes. Fonts are loaded locally. No real SMS or new test account was created.
Tests: full `npm run check` PASS — TypeScript, lint with zero warnings, formatting, **53 Jest suites / 283 tests**, security/environment/localization/brand guards, **3 server tests** and **98 device-messenger tests** (384 total). Expo Doctor **21/21** with the documented CocoaPods PATH/Ruby environment; dependency compatibility PASS. First doctor shell reported 20/21 because `pod` was absent from PATH; no dependency was upgraded to resolve that environment issue. Gitleaks source/history/existing bundles: 0 findings.
Native checks: actual iPhone 17 Pro / iOS 26.5 Simulator screenshots and interactions for Chats, Calls, Me; EN/KA language changes; Georgian search with keyboard and typed glyphs; ordinary/maximum OS text sizes; cold relaunch restored the same local account. Selected-tab semantics preserved in the accessibility tree. Safe area and bar location stable across three tabs. Both iOS and Android Hermes exports include the six new local font assets. Existing build-6 native client provides Expo Font; no fresh Xcode archive or native dependency rebuild is claimed.
Known limitations: this pass is not physical iPhone/Android acceptance, a new TestFlight delivery, or a full accessibility certification. Extremely enlarged ordinary content still needs scrolling; the largest empty-inbox copy does not fit entirely in one viewport. Initial hot refresh retained stale line-box measurements; cold startup and text remount checks distinguished this from font glyph clipping. Build 6 remains the previously delivered artifact; build 5 external review was not altered.
Commit: this report accompanies `feat: soften mnelo typography and compact tab navigation`.

## September 12 — typography/navigation TestFlight build 7

Phase: owner-requested distribution of the latest app design.
Status: signed Release archive, App Store export and upload PASS; Apple upload table confirms Processing.
Implemented: package the previously tested `353d5c7` typography/tab-navigation changes as 0.1.0 (7). Identity remains `com.mnelo.messenger`, team `CS6GJ2BMS9`; no keychain, database, enrollment service or protocol migration.
Files: app.config.ts build number; this build evidence and QA/release notes.
Database migrations: none.
Security impact: original encrypted vault, hosted preview endpoints, release gate and isolated test admission preserved. EXPO_NO_DOTENV=1 and explicit testflight/preview environment used for prebuild and archive. No production public-release claim.
Tests: full npm run check PASS: 53 Jest suites/283 tests, 3 server utility tests, 98 device/protocol tests = 384. TypeScript, lint, formatting, security/environment/localization and brand checks PASS. Expo Doctor 21/21; compatibility up to date.
Native checks: prebuild + CocoaPods PASS; Xcode 26.6 Release archive PASS; export and upload PASS. Archive and actual exported Payload both pass all six iOS purpose strings/EN+KA checks. Exported code signature PASS, production APNs, get-task-allow=false, exact identity/team and both mnelo.com associated domains verified. Compiled Hermes includes hosted endpoints and new DM Sans/FiraGO asset references; printed bundle scan zero Gitleaks findings.
Artifact: artifacts/Mnelo-0.1.0-7.xcarchive; artifacts/Mnelo-0.1.0-7-export/Mnelo.ipa, 27,851,601 bytes, SHA-256 `2329554cdf27b3ea036123905f54ce24af86167fe409520dde890a096be0744d`.
Apple build ID: `a811a289-d128-4966-8b62-2c7a9e9bbde9`, upload September 12 at 18:37 Tbilisi.
Known limitations: the existing four vendor framework dSYM warnings remain (React, ReactNativeDependencies, WebRTC, hermesvm). Native vendor crash symbolication is incomplete. No physical build-7 installation, retention, message/call/media/notification PASS is claimed. Apple processing/compliance/group delivery are separate gates. Build 5’s external review was not cancelled or replaced.
Commit: build reservation and evidence committed with this distribution task; subsequent Apple checkpoint recorded below.

Build 7 Apple delivery checkpoint: Processing completed. Reused the already-authorized standard-encryption and France No answers; Missing Compliance cleared. Saved build-specific What to Test notes and added existing **Mnelo Development (Internal, 1 tester)**. Apple explicitly disables Mnelo Preview external selection while version 0.1.0 build 5 is Waiting for Review. That review and both existing tester memberships remain unchanged. No public store submission or physical build-7 installation is claimed. Upload source reservation/evidence commit: `c2593c1`.

Final build-7 internal-group table explicitly shows **Testing**, iOS, expiry in 90 days. The owner’s tester row still reports installed build 6 at this observation; build-7 installation is not claimed.

## September 12 — bottom navigation empty-space correction

Phase: focused correction from the owner's physical-iPhone screenshot.
Status: source and native Simulator QA PASS; build 8 distribution follows separately.
Implemented: removed the automatic second-line reservation above a 1.25 text scale. The shared tab bar now uses native text measurements, grows only when a label actually wraps, and discards obsolete measurements after width, language or text-size changes. Existing safe-area clearance, 48-point minimum targets, full selected-tab color and attention counts remain.
Files: app/(tabs)/_layout.tsx, tests/tab-layout.test.tsx, app.config.ts (build 8), QA/build documentation.
Database migrations: none.
Security impact: none; no identity, storage, enrollment, notification or messaging changes.
Tests: full npm run check PASS — 54 Jest suites / 287 tests, 3 server utility tests and 98 device/protocol tests (388 total). TypeScript, zero-warning lint, formatting, security/environment/localization and 14 brand checks PASS. Four new regression tests cover enlarged single-line text, actual wrapping and contraction, width/text-scale invalidation, and no-bottom-inset devices. Initial test-only hoisting, Dimensions mocking and display-name issues were corrected without weakening checks. Expo Doctor 21/21; dependency compatibility up to date.
Native checks: reproduced the excess space at iOS extra-extra-extra-large text size on the existing iPhone 17 Pro / iOS 26.5 Simulator development client. The selected pill shrank from 256 to 185 physical pixels (about 24 points); its lower edge and the 34-point home-indicator inset were unchanged. Actual Chats, Calls and Me captures all have identical selected-pill bounds (y=2335–2519 at 1206×2622), so switching tabs does not resize the bar. Georgian labels inspected at the maximum OS accessibility size; default text sizes restored on both QA simulators. No fatal error in the current Metro log; existing NO_COLOR/FORCE_COLOR warning remains. Evidence: artifacts/tab-spacing-*.png and tab-spacing-check.log.
Known limitations: this is Simulator evidence, not an owner-confirmed physical build-8 install. No new Android device acceptance or two-phone communication result is claimed. Native release archive/upload status is recorded separately in BUILD_LOG. Empty call history remains empty; no artificial calls or decorative filler were added.
Commit: fix: size bottom navigation to its visible labels.

Owner follow-up before build-8 upload: lower the menu further. iOS bottom padding is now capped at the centralized 18-point home-indicator clearance, moving the buttons down another 16 points on the tested iPhone (34-point system inset). Android retains its full inset; zero-inset devices receive no artificial bottom space. The pill's height is unchanged by this follow-up. Enlarged English and maximum-accessibility Georgian native screenshots inspected (`artifacts/tab-lower-calls.png`, `tab-lower-maximum-ka.png`); simulator text-size preferences restored. Final full check: **389 PASS** (54 Jest suites / 288 tests, 3 server, 98 device), including the new Android-inset regression. TypeScript/lint/format/security/env/localization/brand PASS. Build 8 compilation was deliberately interrupted before packaging to incorporate this request and restarted with the corrected source; no intermediate binary was uploaded.

Final delivery checks: iOS/Android Hermes exports PASS; source/history/bundle secret scans zero. Signed iOS archive, App Store IPA export, final signature/permissions/production-APNs/associated-domain/native-Hermes checks and upload PASS. Apple build `9e4f7ebe-a3ac-44bb-8d3b-7a52d58fcb08` received at 19:33 Tbilisi, initially Processing. Artifact checksum and the four pre-existing vendor dSYM warnings are recorded in BUILD_LOG. Measured final enlarged-text pill y=2383–2567 at 1206×2622, height unchanged at 185 pixels; bottom clearance reduced from 102 to 54 pixels (34 to 18 points). Source commit `4caf344`.

Final availability: Apple processing Complete; existing owner-approved compliance answers reused, test notes saved, existing Mnelo Development internal group assigned. Its table confirms **0.1.0 (8) Testing** at approximately 19:40 Tbilisi. External build 5 remains Waiting for Review; no physical build-8 install/gesture/communication acceptance claimed. Delivery documentation commit: chore: deliver compact navigation as TestFlight build 8.

## 2026-09-12 — Smaller selected bottom-tab surface

Status: implementation verified; distribution build 9 in progress.
Implemented: selected background now hugs icon and label instead of filling one third of the screen. Baseline maximum width is 80 pt, increases with Dynamic Type, and is centered in each tab's share of the bar. A 16 pt horizontal safe-area margin keeps the first/last surface away from curved screen corners. Previous low menu position and measured label height remain.
Files: app/(tabs)/_layout.tsx, src/theme/tokens.ts, app.config.ts.
Database migrations: none. Security impact: none; no service, permission or data changes.
Tests: full npm run check PASS — 54 Jest suites / 288 tests, 3 server utility tests, 98 device/protocol tests (389 total). TypeScript, lint, format, security/env/localization and brand checks PASS. Expo Doctor 21/21; dependency alignment PASS.
Native checks: actual iPhone 17 Pro simulator inspection on Chats/Calls/Me at XXXL text size and Georgian Chats at standard size. Whole selected background and labels fit, edges are inset, navigation works. Both QA simulator text preferences restored to Large. Screenshots in artifacts/pill-small-*.png. Native distribution evidence follows after upload.
Known limitations: these are simulator observations, not new two-iPhone physical QA. Android native device QA not repeated for this styling change.
Commit: this implementation checkpoint; build 9 delivery recorded separately.

Build 9 delivery checkpoint: signed archive/export/upload PASS; iOS + Android bundle and history/source/compiled-JS secret scans PASS. Artifact and signing evidence in BUILD_LOG.md. App Store Connect session expired; final Apple processing/compliance/group assignment awaits owner login. Build 9 is **uploaded, not yet confirmed available to testers**. No new physical-device PASS is claimed.

## September 12 — physical second iPhone build 9 installation

Phase: USB installation to unblock real two-phone testing during external TestFlight review.
Status: native build/install/launch and actual registration-screen render PASS. Second-phone enrollment and two-way messaging/calling remain pending.
Implemented: normal Xcode automatic provisioning for the owner's iPhone Air, after owner-confirmed and tool-verified Developer Mode. Existing version 0.1.0 (9), bundle/team and hosted preview endpoints retained. First-phone build 9 was confirmed installed and left unchanged.
Files: build/QA/testing/release-readiness documentation only; generated artifacts remain ignored.
Database migrations: none. Security impact: one additional device in the development provisioning profile; no identity/vault reset, credential disclosure, server mutation or public-release gate change.
Tests: previously completed 389 automated tests apply to unchanged mobile source. New compiled Hermes scan: 0 secret findings. Native signature and second-device provisioning match PASS; all six iOS purpose strings plus EN/KA and no always/background location PASS. Embedded JavaScript and hosted endpoints verified. No repeat Android build or new device QA claimed.
Native checks: Xcode 26.6 Release build completed with zero compiler errors; upstream warnings retained. devicectl install and launch succeeded, running app process verified. Actual iPhone Air screenshot shows the phone-registration form and native keyboard; no clipping/fatal overlay observed on that screen. This does not establish all-screen or runtime-log cleanliness. Xcode's previous pre-Developer-Mode destination timeout is preserved as a failed attempt followed by a successful build.
Known limitations: second-phone SMS code completion/notification permission and all two-phone communication/background acceptance await physical interaction. Both APNs environments must be tested: first-phone TestFlight production and second-phone USB development/sandbox. No push acceptance is inferred from provider configuration or server route counts. Public Store submission is not ready; see PUBLIC_RELEASE_READINESS.
Commit: this checkpoint accompanies `chore: install build 9 on second physical iPhone`.

Second-phone enrollment checkpoint: the owner reports entering the app and finding the first account by phone. Read-only checks confirm both admitted numbers registered and new sandbox alert + VoIP routes for the second phone. SMS code/credentials were never collected. Zero peer wake grants at this checkpoint; real content/push/calls are not yet PASS. The owner found that new-chat search does not handle national numbers and phone discovery exposes a full-key/manual-name confirmation flow. This UX issue is now the active follow-up; no protocol test has been removed.

# September 12 — contact and chat interaction checkpoint

Phase: physical-test fixes before delivery migration.
Status: source checks pass; updated two-phone acceptance pending.
Implemented: inline phone lookup/country choice, opt-in local address-book names, bounded incoming contact requests, native QR companion pod, same-chat foreground alert suppression, compact bubbles and actions, leaf receipts/drag-to-reveal time, inline voice recording/preview, photo viewer/share, map provider choice, quoted replies and attachment icon grid. Call presentation is consolidated and diagnostic stages added; the reported call connection failure is **not yet proven fixed**.
Files: messenger runtime/screens/components, native calls module, Expo config, shared inputs, dictionaries and related tests; full change list is in Git.
Database migrations: local schema version 5 adds phone bindings and incoming requests, preserving histories. Backup compatibility includes optional phone bindings; pending requests are not exported.
Security impact: no server content queue in this checkpoint. Incoming introductions are authenticated through the existing phone directory and require local acceptance; blocks and key-change checks remain enforced. The transient relay must receive the compatible schema update before a client sends extended introductions. Contact names stay local. Reply lookup cannot cross conversation boundaries.
Tests: `npm run check` PASS — TypeScript, lint, formatting, security/env/localization/brand guards; **59 Jest suites / 297 tests**, **3 server tests**, **105 device/protocol integration tests** (405 total). Logs: `artifacts/contact-fix-full-check.log`.
Native checks: build 10 native compilation and linked QR-provider guard PASS; latest JS incremental rebuild/install still pending. Expo Doctor 21/21 and dependency compatibility passed earlier in this same dependency-unchanged fix set.
Known limitations: gallery Save Image via system share, physical QR, final layouts, voice/camera playback, calls and background lifecycle need updated-device testing. Existing direct-only offline availability is being replaced under the owner's subsequent instruction. No public release PASS.
Commit: this contact/chat checkpoint commit; see Git history by its title.

# September 13 — Native Signal and durable delivery foundation

Phase: owner-authorized migration from direct-only content transport.
Status: verified foundation; integration in progress, not active on the hosted service or phones.
Implemented: pinned native Swift/Java Signal wrappers, signed public prekey directory, authenticated bounded ciphertext mailbox, transactional device journal, rollback/replay tests. Additional chat fixes retain failed voice previews and duration, focus/swipe Reply, remove empty image padding and size the fullscreen photo to its viewport.
Files: modules/mnelo-signal, src/messenger/delivery, identity delivery/directory services, phone API, Android helpers, chat/media components and tests.
Database migrations: opt-in server ciphertext/prekey SQLite stores and local SQLCipher journal tables; not activated in installed apps. No existing identity, history, push token or SMS budget was reset.
Security impact: official vendor protocol, recipient-only ACK, immutable identity pins, no server private keys/plaintext, finite ciphertext retention. License, recovery, native interoperability and remaining transport/media/call work remain release gates.
Tests: TypeScript/lint/format/security/environment/localization/brand PASS; 297 Jest + 3 server utilities + 115 device/protocol integration = 415 PASS.
Native checks: Release iPhone build PASS; Android Signal Kotlin module compile PASS. No physical-call PASS or completed new Android APK claimed.
Known limitations: see [Signal implementation checkpoint](SIGNAL_IMPLEMENTATION.md); all owner-reported physical flows must still be verified after integration.
Commit: this checkpoint accompanies `feat: prepare native signal delivery and crash-safe message journal`.

# September 13 — resumable encrypted attachments

Phase: delivery migration, media subsystem.
Status: seven media tests pass; not yet activated in the mobile runtime or hosted server.
Implemented: private AES-GCM object descriptors, ciphertext-only server chunks, reservation quotas, resumable upload/download, bounded two-chunk steps, durable local consumption/ACK and expiry cleanup.
Files: identity/media-store.ts, delivery/media-* modules, authenticated phone API wiring and media integration tests.
Database migrations: opt-in server delivery-media.db and local SQLCipher delivery_media_* tables. Existing deployed databases remain unchanged.
Security impact: content keys/filenames stay inside the Signal payload; recipients alone fetch/ACK, tampering fails, server objects disappear after ACK/expiry/block/unlink. No plaintext upload path.
Tests: full check passed with 297 Jest + 3 server + 121 device/protocol tests; after adding one capacity regression test, device/protocol suite reran with 122 PASS (422 tests total across suites). Signed-HTTP media tests cover response loss, commit failure and resumable chunks. Logs: artifacts/media-full-check.log, artifacts/media-device-final.log, artifacts/media-transfer-tests.log.
Native checks: no native dependency/source change in this checkpoint; preceding iPhone link and Android module compilation evidence remains applicable. No additional native/device PASS claimed.
Known limitations: application scheduling/projection, account cleanup/recovery, native interoperability, both-phone acceptance, license decision and deployment still pending.
Commit: this checkpoint accompanies `feat: add resumable encrypted attachment delivery`.

# September 13 — application delivery and call-control boundary

Phase: apply the encrypted queue to messenger history and independent call signaling.
Status: integration fixtures pass; mobile runtime activation and deployment remain pending.
Implemented: ApplicationDelivery projects real Signal text/media into DeviceMessenger, recipient number verification tied to an addressed pending envelope, permission-respecting local contact-name lookup, transactional read/reaction outbox, reaction ordering, local media-key cleanup, offline block synchronization, round-robin inbox/outbox pages and content-free live delivery hints. Call invite/accept can use a durable path independently of the message data channel; cancelled/expired invites do not ring again. Signed SDP can use the encrypted application adapter.
Files: src/messenger/delivery/application.ts and call-control.ts, engine/model/calls/peer-mesh, authenticated delivery services, relay and related tests.
Database migrations: device version 6 is selected only when the new adapter initializes; old builds reject the migrated vault instead of opening it as version 5. Additional local control/reaction/block/call-tombstone tables preserve histories. No real phone vault has been migrated in this checkpoint.
Security impact: first-contact verification requires registration, a pending envelope addressed to the caller, an exact sender/number match, cohort/block policy and per-device/envelope limits. No public reverse-phone endpoint. Deleted accounts clear Signal state and private media descriptors. No live JSON fallback is allowed once the new socket mode is selected.
Tests: full check PASS — TypeScript/lint/format/security/env/localization/brand, 299 Jest + 3 server utilities + 125 device/protocol integration = 427 tests. Logs: artifacts/application-full-check.log. Real signed HTTP/Signal fixtures prove offline sender delivery into chat history, no reciprocal manual add, local names, delivered/read distinction, repeated reactions, local deletion, blocked delivery and account key cleanup. Call boundary tests prove control does not require a message channel, not that physical audio/video works.
Native checks: none repeated for this TypeScript/server checkpoint. Swift/Java compilation evidence is unchanged; current JS has not been installed on either phone.
Known limitations: shared runtime mount, native interoperability, key replenishment/rotation/recovery, queued push lifecycle, poison-message quarantine, fairness under large adversarial queues, profile-card synchronization and real-device audio/video remain gates. Earlier direct-only production copy is not yet updated because the deployed path is unchanged. License obligations remain unresolved before distribution.
Commit: this checkpoint accompanies `feat: integrate durable messaging with local histories and call signaling`.

# September 13 — shared runtime and durable push lifecycle

Phase: enable an opt-in mobile delivery runtime and preserve background notification intent.
Status: implementation checkpoint; not enabled on the hosted server or either phone.
Implemented: shared native Signal runtime, downgrade guard, foreground/connectivity retry, queued-call availability, persistent server push jobs, bounded APNs/FCM retention, stale-call-to-missed-alert conversion and local pending-call recovery. No server message plaintext or content keys.
Files: messenger runtime/delivery/call screens, notification services/worker, server bootstrap, Android missed-call strings and related tests.
Database migrations: optional notification hint column in device outbox and server ciphertext spool; server push jobs are foreign-key coupled to the spool. Local incoming-call journal preserves original deadlines. Existing real accounts, SMS budgets, signing and installed vaults remain unchanged.
Security impact: notification metadata is explicit; content-free pushes are bounded by original expiry. Provider acceptance is never treated as message receipt. Recipient ACK/block/unlink removes pending server work. Incoming call history survives ordinary process restart without duplicate rings/history.
Tests: full check PASS: 59 Jest suites / 299 tests, 3 server utilities and 129 device/protocol integration tests, 431 total. TypeScript/lint/format/security/env/localization/brand checks pass. Signed HTTP/Signal and provider fixtures cover push restart/failure, offline sender, no reciprocal wake grant, missed-call expiry, altered notification header rejection, APNs expiration, FCM 28-day cap and local call recovery. Log: artifacts/runtime-push-full-check.log.
Native checks: fresh iOS and Android exports with the opt-in runtime PASS (artifacts/runtime-push-export.log). Android native missed-call module compilation PASS (artifacts/push-android-compile.log); not a full APK or physical-device test. No iOS native-source changes in this checkpoint; existing earlier Release build has not been reinstalled with this JS.
Known limitations: no updated physical-phone PASS; native protocol interoperability, key lifecycle/recovery, malformed-envelope isolation, profile synchronization, licensing and deployment remain gates. Public Store is not ready.
Commit: this checkpoint accompanies `feat: preserve encrypted delivery and background notification intent`.

# September 13 — receipt accuracy, retry isolation and profile delivery

Phase: remove queue stalls and retain existing profile functionality during the transport migration.
Status: source checks pass; hosted/phone activation still pending.
Implemented: exact-ID read receipts for out-of-order messages, bounded per-item retry state that survives restart, wake-during-send latch, and encrypted profile/avatar synchronization with monotonic revisions. A malformed ciphertext or application packet remains unacknowledged; valid items behind it can proceed. Local address-book names take precedence over incoming profile names. Profile packets never produce message alerts.
Files: device engine/model, delivery adapter/journal/pump, localized queue-error state and protocol integration tests.
Database migrations: device-only retry and profile revision tables. No changes to deployed accounts or phone data.
Security impact: no false receipt for unread/missing content, no identity-pin bypass or plaintext fallback, no discard/ACK of failed ciphertext. Profile payloads are validated and encrypted; older revisions cannot overwrite newer ones. Protocol payload cap is 60,000 UTF-8 bytes, within the existing ciphertext/request bounds. Native key lifecycle/recovery and license gates remain open.
Tests: full check PASS — TypeScript/lint/format/security/env/localization/brand, 299 Jest + 3 server + 130 device/protocol tests = 432. Log: artifacts/delivery-resilience-full-check.log. Tests cover malformed-item isolation, persistent backoff, a wake during an active cycle, exact read IDs, encrypted avatar/profile delivery and preserved saved names.
Native checks: no native source changed; current JS has not been built/installed on the two phones. Prior compiled-bundle secret scan had zero findings; a fresh final bundle scan remains required.
Known limitations: per-item failure is surfaced and retried, not silently quarantined/acknowledged. Physical calling/background behavior, key replenishment/rotation/recovery, native interoperability, license decision and safe server rollout remain gates. Not ready for public release.
Commit: this checkpoint accompanies `fix: isolate delivery retries and preserve precise read receipts`.

# September 13 — native protocol execution and safe update preparation

Phase: prove the native Signal bridge on both platforms and prepare an account-preserving hosted update.
Status: native interoperability and source QA PASS; no new physical-phone install or server activation in this checkpoint.
Implemented: low-water prekey replenishment with monotonic IDs, lost-publication-response recovery and a 200-retained-key bound. Leased private keys are retained; a capacity problem fails closed instead of reusing keys. Isolated native protocol probe and a code-only hosted release operator were added. Android's vendor-required core library desugaring is generated by the Expo plugin, without changing Expo/RN or JVM targets.
Files: native probe/script; Signal pump and real vendor test adapter; with-signal plugin; TURN network checker; deploy/hetzner/update-release.py and update-runtime.py; QA/build/Signal documentation.
Database migrations: none in this checkpoint. Existing local Signal state advances transactionally; the live identity, push and SMS stores were read only.
Security impact: private prekeys are not retired merely because an HTTP response was lost. No private native state or fixture key is logged. The synthetic native probe is a separate local entry and must never be uploaded or installed as the product. The release operator checks clean source, an exact seven-file allowlist and SHA-256 before switching code; preserves account/configuration state; and rolls back code without restoring an old database over newer activity.
Tests: full check PASS — 60 Jest suites / 300 tests, 3 server utilities, 130 device/protocol tests = 433. TypeScript, lint, formatting, security/environment/localization/brand pass. Four independent Python deployment-guard tests PASS. Doctor 21/21 and Expo dependency compatibility PASS. Logs: native-final-check.log, release-update-guard-tests.log, native-final-doctor.log, native-final-dependencies.log.
Native checks: iOS Xcode 26.6 Release simulator build PASS; Android complete ARM64 Release probe APK PASS. Actual native execution on iPhone 17 Pro / iOS 26.5 Simulator and API 36 Android emulator passed 10 checks each: key generation, wrong identity, tampered ciphertext, decryption, replay, one-time consumption, replies, out-of-order delivery, refill identity preservation and Node-to-native messages. Independent official Node/libsignal decryption of each native reply also PASS. Logs: native-signal-interop-result.log, native-signal-android-interop-result.log. These are protocol probes, not physical-call, full UI, storage or background acceptance.
Network checks: live own-server TURN UDP and TCP allocation/authentication, denied-peer-range policy, cleanup and bidirectional synthetic relay datagrams PASS (six checks, turn-current-network.log). No customer call or audio was recorded. SSH update --check PASS: combined identity active, standalone relay inactive, 3 existing identities; no SMS or configuration change.
Known limitations: full signed-key rotation, safe old-key retirement, recovery semantics, distribution license obligations, real UI/QR/media and two-phone audio/video/background acceptance remain unresolved. Fresh product-native builds are still required. The Android probe has a local debug signing key and is not a store artifact. Gradle reports upstream deprecations for Gradle 10; none were suppressed.
Commit: this checkpoint accompanies `chore: verify native signal interoperability and safe server updates`.

# September 13 — hosted delivery enabled and independent call media verified

Phase: existing-server rollout and call transport verification.
Status: hosted code/route/opt-in PASS; no new physical-phone installation or public distribution.
Implemented: preserved-account code update, scoped delivery route/flag operator with code/config rollback, transport-consistent English/Georgian retention copy, invalid-flag rejection and a real WebRTC harness using independent asynchronous controls. No product features added.
Files: deploy/hetzner/enable-delivery.py, delivery-mode/copy/runtime, browser QA script/harness and current rollout documentation.
Database migrations: new isolated signal-directory.db, delivery-spool.db, delivery-media.db created with private file permissions; real account/push/SMS stores retained. Post-enable aggregate counts are zero in the new stores; no real client migrated.
Security impact: bounded signed delivery endpoint, proxy-overwritten source IP, encrypted content only, rollback never rewinds user databases or ratchets. All three registered identities and existing provider/reviewer configuration preserved. No SMS sent.
Tests: full 437-test source check PASS; seven Python operator guards PASS. Separate Chromium/TURN media tests pass 17 assertions over normal UDP/TCP and 17 over forced TCP. The retained first static-canvas video fixture timeout was fixed by providing continuous synthetic frames; it is not counted as a pass. No browser exception reported in successful runs. Secret scan history/source/exports zero findings at native-final-secret-scan checkpoint.
Native checks: full signed product iPhone build is being prepared; preceding native crypto probe evidence is separate. No physical audio/video, latest UI or camera scan PASS is claimed.
Known limitations: distribution license decision, key rotation/retirement/recovery and physical two-phone acceptance remain release gates. New protocol is not WhatsApp proprietary code or wire compatible. See DELIVERY_ROLLOUT for exact current state.
Commit: this checkpoint accompanies `feat: enable encrypted delivery service and verify independent calls`.

Final packaging/restore checkpoint: full source QA **438 tests PASS** (304 Jest / 61 suites, 3 server, 131 device/protocol). The 304 Jest tests also pass with the new delivery flag enabled. Migrated exports are explicitly version 2, contain no live Signal ratchets and cannot be incorrectly restored as complete legacy recovery. Backups/Restore shows the current limitation instead of proceeding into a broken registration. This guard does not claim to implement recovery.

Xcode 26.6 final signed **product** iPhone Release build 0.1.0 (10) PASS, including the latest chat/contacts/media changes, new delivery runtime and recovery guard. Signature validates; `com.mnelo.messenger`, team `CS6GJ2BMS9`, development APNs and a profile covering two devices are confirmed. Six purpose strings with EN/KA translations and the defined QR scanner class PASS. The final Hermes product entry contains both hosted endpoints and delivery/recovery copy; it does not contain the isolated probe entry. Native secret scan has zero findings. No upload, installation or physical UI/call acceptance is implied.

## Open-source preparation — September 13, 2026

Phase: Open-source authorization and publication preparation.
Status: Source prepared and locally verified; public repository publication is recorded separately.
Implemented: Owner-authorized AGPL-3.0-only for original work; original Expo MIT notice retained; native module license metadata; contribution/private-security-report guidance; dependency notices and inventory; Me → Settings → Open source with locally bundled AGPL text and source links in English/Georgian. Future donations documented as intent, without a payment integration.
Files: LICENSE, NOTICE, CONTRIBUTING.md, SECURITY.md, docs/OPEN_SOURCE.md, docs/licenses, module manifests/podspecs, package metadata, open-source screen/route/copy, provenance and rollout docs.
Database migrations: None.
Security impact: No cryptographic/session/server change. No secrets, phone data or build artifacts enter public source. Source/history/bundle Gitleaks scans return zero; 2,246 historical blobs were additionally checked for known tester identifiers/private-key blocks. Tracked QA images depict synthetic development users. Private design conversation URLs/workstation paths removed from current source; original history preserved locally.
Tests: Full check PASS: 304 Jest tests in 61 suites, 3 server tests, 131 device/protocol tests (438 total); TypeScript, lint, formatting, source-security, environment, localization and brand checks PASS. Expo Doctor 21/21 and dependency compatibility PASS. npm audit: 16 moderate, 0 high/critical; unchanged dependency set.
Native checks: Both delivery-mode Hermes exports PASS; AGPL text matches installed pinned vendor LICENSE byte-for-byte; three podspec Ruby syntax checks PASS. No new Xcode/Gradle binary build or physical phone acceptance in this change.
Known limitations: Initial checks caught stale generated route types, wrong route guard placement and untranslated literal/legal headings; corrected without removing or relaxing tests. Initial Doctor lacked CocoaPods on PATH; documented Ruby/CocoaPods environment passed. Recovery/key lifecycle, binary distribution compliance and two-phone acceptance remain open.
Commit: See the commit containing this checkpoint; public snapshot commits record the original source revision.

## Open-source publication — September 13, 2026

Phase: Public source distribution.
Status: COMPLETE for source publication; native/store release remains NOT READY.
Implemented: https://github.com/Mneloapp/mnelo-app is PUBLIC with AGPL-3.0 recognized by GitHub; private vulnerability reporting enabled. Existing website repository and original local Git history are unchanged.
Files: Audited current source snapshot, including native bindings, server, CNG/build scripts, lockfile, legal notices and fictional test fixtures.
Database migrations: None.
Security impact: No service credential, user data, build artifact or private design-discussion link published. Final separate snapshot Gitleaks scan: zero findings. No service/account configuration changed.
Tests: 438 local automated tests and source checks PASS; Expo Doctor 21/21, dependency compatibility and both delivery-mode mobile exports PASS. GitHub CI is separate and was still running when this record was written; no remote PASS is inferred.
Native checks: No new phone installation or Xcode/Gradle binary in this publication step. Both real phones remain on build 9.
Known limitations: Public source does not certify cryptography, complete recovery/key lifecycle, solve the reported physical call failure by itself, or establish App Store license compatibility. Donation support remains future intent, without payment processing.
Commit: Initial public `0d97fc563d74e018a98a2fea4e8cdd2bd36b54d1`; original source `c6140fe1ac7354b64c1bb702905d31a6a65e86af`; tree equality verified as `a1f578af5ce7a7c1f883a5d00f9559303cb4b2b8`.

# September 13 — TestFlight 0.1.0 (11)

Status: signed archive, App Store export/upload and Apple processing PASS. Build 11 is assigned internally and submitted externally, Waiting for Review with automatic tester notification. The obsolete build 5 review was replaced. [Apple disposition](BUILD_LOG.md). This is an owner-requested functional beta. Physical acceptance and independent security review are still pending.

- Source: `58665f4c5aae5a32ec950a7fe971212a82a13e7d`; exact public corresponding source tag `ios-0.1.0-11`.
- Full source checks: TypeScript, lint, formatting, security/environment/localization/brand PASS; 304 Jest tests in 61 suites, 3 server checks and 131 device/protocol checks (438 total). Public CI independently PASS.
- Expo Doctor: 21/21 PASS. Native dependency versions remain aligned and unchanged.
- Clean generated iOS project and pod resolution: PASS after using the correct native working directory; first failure retained with its cause in BUILD_LOG.md.
- Xcode 26.6 archive / App Store-signed IPA / upload: PASS, build 11, existing com.mnelo.messenger identity and team. Production APNs and associated domains verified; debugging disabled in the IPA.
- Permissions/QR: six purpose strings, EN/KA translations and real linked provider definition PASS in both archive and exported app. Corrected verification of stripped symbols; old build 9 remains a failing negative control.
- Secrets: final native app scan and 49.93 MB disassembled Hermes scan both zero findings. No credentials or phone data added to public source.
- Upload warnings: missing upstream dSYMs for React, ReactNativeDependencies, WebRTC and hermesvm limit crash symbolication; Apple upload succeeds. The app's own matching dSYM exists.
- No device data reset or uninstall. Both phones must receive build 11 before testing the new protocol. Do not infer physical call, QR, media, background or migration PASS from these build results. Key rotation/recovery and public-release gates remain documented.
