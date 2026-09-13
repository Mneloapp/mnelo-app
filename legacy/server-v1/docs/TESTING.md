# Testing

**Additional mandatory acceptance, 2026-09-09:** the [privacy migration test matrix](PRIVACY_ARCHITECTURE.md#acceptance-evidence-required--all-pending) covers E2EE, no persistent relay/metadata copies, offline acknowledgments, optional cloud archives and safe recovery. All are pending. Existing RLS/integration/native passes describe the former storage architecture and are not proof of compliance.

Mnelo is the official product name. See [product identity](PRODUCT_IDENTITY.md) for naming, positioning and native identifiers.

## Current automated checks

`npm run check` runs strict TypeScript, ESLint with zero warnings, formatting, Jest, a source/credential-file guard and environment validation. Tests cover release/local environment boundaries, URL and key rejection without secret echo, safe error records, bounded query retries, no automatic mutation retries, English/Georgian launch rendering and accessible retry interaction. React Native Testing Library uses Expo's Jest preset and its documented SafeArea mock; these tests do not emulate native binaries.

`npm run doctor` and `npx expo install --check` check Expo configuration and package compatibility. `npm run export:mobile` verifies that Metro can produce both platform bundles. Bundling is not proof of successful native compilation or boot. `npm audit` is separate from tests. CI includes separate application and local database jobs. A CI workflow runs these checks on pushes to main and pull requests once hosted; it has not been executed remotely merely by creating its file.

Run `npm run test:coverage` to inspect coverage. Do not infer product security from unit-test count. See [QA_REPORT](QA_REPORT.md) for current checks and [Phase 0](PHASE_0_REPORT.md) / [Phase 0.1](PHASE_0_1_REPORT.md) for explicitly historical checks.

## Historical native Phase 0 acceptance

- Build and open the development client on an iOS simulator; capture the rendered launch screen and inspect runtime logs.
- Build and open on an Android device/emulator; verify the same source and layout.
- Confirm the app boots without Supabase, LiveKit, SMS or production credentials.
- Confirm no permission prompt appears for features not yet implemented.
- Exercise missing-route recovery and foreground/background behavior.
- Check large system text and reduced motion; VoiceOver/TalkBack remain explicit manual QA.

Native tool installation, simulator boot, compilation and app rendering are separate outcomes. Record the actual failure if one prevents a later check. Never replace a failed native gate with a web preview.

## Product and service suites

The preview repository tests validate fixture isolation, invalid/expired OTP states, duplicate sends, request acceptance rules, data-backed matching explanations, blocking and honest deletion failure. These are UI-contract regressions, not database authorization proof.

Phase 2 adds `npm run db:test` (transactional pgTAP denial/positive tests) and `npm run db:lint` (database function lint); Phase 3 adds `npm run test:auth` against real local Auth (reserved identities, wrong OTP, resend throttling, restore, refresh, logout and revoked refresh denial). SecureStore tests exercise segmentation, rotation failure, concurrent writes and cleanup. Subsequent phases add private Realtime/Storage, server-authorized calls, devices and two-user integration. The authoritative 30-phase scope is tracked in [EXECUTION.md](EXECUTION.md), superseding the initial eight-phase outline. Device QA includes native keyboard, Dynamic Type, VoiceOver/TalkBack, airplane mode/reconnect, push, camera, microphone and two-device calls. Do not infer those outcomes from web or Jest tests.

## Supplementary interface checks

Run the local-only web preview from README and use an isolated browser profile. Verify signup → Chats → send → Connect → interpretation → actual matches → request → accept. Exercise invalid OTP, empty chat, privacy defaults and small layouts. Inspect console errors and document viewport sizes. Inverted message lists must not invert their empty-state text. Radio selection exposes semantic checked state and a visible checkmark. This preview is not the product website and is not a native build substitute.

## Identity rename QA

Search tracked/reviewable source and configuration for the former working name. Label retained historical records and intentional identity exceptions explicitly; generated projects, caches and dependencies are separate from source. Verify resolved Expo configuration and regenerated iOS/Android display names, schemes and native identifiers. The launch test must show Mnelo with editable provisional positioning in both dictionaries. Do not turn a successful Metro export into a native launch claim.

## Phase 4 profile integration

See [profile and avatar implementation](PROFILES.md). Migrations `20260907000400_profiles.sql` and `20260907000500_availability_expiry.sql` add bounded privacy-filtered summaries/search, expiring availability and owner-only avatar reservations. The authenticated Edge image processor exclusively writes private avatars; client finalization/upload is denied. `npm run test:profiles` exercises the real local service boundary; `npm run check:edge` checks server TypeScript. Native picker/device and cloud deployment acceptance remain pending.

## Phase 5 direct messaging

See [message transport and actual tests](MESSAGING.md). Versioned migrations 006–010 add bounded conversation/history RPCs, idempotent text sends, visible-message read cursors, RLS-filterable reaction toggles and private inbox topics. `npm run test:messaging` runs real two-user Realtime and negative authorization checks. Messages, reactions and memberships remain normalized and client writes are restricted to controlled operations.

## Phase 6 media checkpoint

Phase 6 adds `npm run test:media` against the local backend and running Edge Functions. It checks real JPEG/file/AAC uploads, idempotency, private access, actual parsed duration, forwarding ownership, exact-location access, deletion, and typed inbox previews. `npm run check:edge` validates all three Edge Function entrypoints. The generated AAC fixture contains no personal recording.

## Phase 7 group checkpoint

`npm run test:groups` passes one five-user local integration test covering group creation/idempotency, unknown-user denial, admin changes, messages, private avatar, blocked pairs, actual removal delivery, former-member access denial and admin succession. Browser create/send/rename/promote/leave was also exercised, separate from native QA.

## Phase 8 Connect checkpoint

Phase 8 adds 18 deterministic interpreter unit tests and `npm run test:connect` (one real two-user backend/Edge integration test). They cover six intent categories, Georgian, negation, ambiguity, dates/timezones, coarse location, preservation/provenance, idempotency, strict ownership and request lifecycle. All four Edge entrypoints are typechecked.

## Phase 9 matching checkpoint

`npm run test:matching` exercises seven local Auth users and the actual matching SQL/Edge publication path. It covers ranking/evidence, current-source validation, hidden/blocked users, TTL/status/privacy changes, score/write denial, existing-connection/review facts, opposite Need/Offer direction and raw-text privacy. Profile and Connect integration regressions plus pgTAP were rerun. Related fixture cleanup is sequential to avoid competing cascades; lifecycle concurrency remains a release gate.

Phase 10: `npm run test:connections` runs a four-user real local Auth integration, including the PostgreSQL-ready handshake, request/response authorization, exact context, retries, expiry and cursor ties. Matching and messaging regressions and all 52 pgTAP checks were rerun. Two separate browser accounts completed matching → request → accept → reply → reopen; this supplements, rather than replaces, native testing.

Phase 11: `npm run test:reputation` exercises three real local Auth users, unilateral/social/outsider denials, concurrent confirmation, immutable/idempotent review, projection privacy, aggregate moderation and scoped verification. Temporary verification fixtures are removed. Matching/request regressions and 52 pgTAP assertions passed. Two-account browser completion/review flow also passed at 390×844; native acceptance remains pending.

Phase 12: `npm run test:privacy` uses four real local Auth users. Three ContactDetails tests cover deliberate reveal, timeout, late-response discard and background clearing; coarse-area mobile/server parity tests include Georgian. Profile/Avatar, Connect and matching regressions plus 52 pgTAP assertions were rerun. A missing service-validator grant was exposed by the profile expiry test; the fixture write now has an explicit success assertion, and both profile tests pass after the narrow grant fix.

Phase 13: `npm run test:moderation` covers four real users, actual database-ready Realtime access events, private report evidence/roles/rate limits and blocking/unblocking. `route-guards.test.ts` enumerates feature route files so automatic unguarded routes fail CI. Privacy/group regressions and 52 pgTAP assertions pass. Two-browser report/block/unblock and anonymous navigation checks passed; final report choices were inspected at 390×844.

## Phase 14 checkpoint

Phase 14 adds `npm run test:notifications`: real local database/auth/queue integration plus injected Expo transport test, including five event categories and negative session/token/destination checks. It performs no real APNs/FCM delivery. Payload unit coverage rejects supplied URLs/routes; pgTAP now expects token SELECT denial. CI includes notifications. See [NOTIFICATIONS](NOTIFICATIONS.md) for actual-device acceptance prerequisites.

Phase 15: `npm run calls:start`, restart `npm run functions:serve`, then `npm run calls:worker` and `npm run test:calls`. The call test uses actual local rooms and signaling, scoped grants and durable block eviction; browser synthetic media is supplementary and is not physical-device QA. CI prepares the same pinned server; remote CI has not been run here. See [CALLS](CALLS.md).

Phase 16 adds `npm run test:devices`, four session-lifecycle unit tests and a 53rd pgTAP restrictive-policy assertion. Shared Realtime readiness now waits for both channel authorization and PostgreSQL subscription registration; cleanup runs even when assertions fail. See [DEVICES](DEVICES.md).

Phase 17 adds test:account, six deletion worker tests and five receipt recovery tests. Real local Auth/Storage removal and call-room cleanup are asserted. Integration fixture timestamps are advanced only after the real settlement gate is tested; browser elapsed-time QA is separate. Group Realtime setup now waits for channel authorization plus PostgreSQL registration and always closes test sockets.

Phase 18 adds two real security integration scenarios, three Node server-stream tests and four strengthened/new pgTAP assertions (57 total). `npm run check` includes server-stream tests. CI scans full Git history, current source and both exported bundles with `npm run scan:secrets`. Detailed boundaries and limitations are in SECURITY_TEST_MATRIX.md.

Phase 19 adds outbox recovery/concurrency/capacity/session unit tests and `npm run test:offline`, which uses real Auth/PostgreSQL to test lost-acknowledgment replay and new-session isolation. Two-browser offline/reconnect QA verifies zero copies before reconnect, one ordered copy afterward and read recovery. Physical airplane-mode/keychain checks remain pending.

Phase 20 adds `npm run test:performance` (guarded 2,000-row local fixture, real recipient adapter request counts/cursor/enrichment/denial). Unit tests cover refresh coalescing and late-event preservation, lazy audio and background cancellation. Timing is diagnostic, never a CI pass threshold. See [PERFORMANCE](PERFORMANCE.md).

Phase 21: `npm run check:accessibility:web -- <browser-session> <checkpoint>` audits the actual local web QA surface with pinned Axe Core. Seven native-rendered unit cases cover shared controls/motion/tab visibility/contrast. See [ACCESSIBILITY](ACCESSIBILITY.md) for exact results and the distinction from physical screen-reader QA.

Phase 22: npm run check includes 138 Jest tests / 26 suites plus the inline-copy guard and three server-stream tests. npm run test:localization exercises two actual sessions, captured generic EN/KA delivery and three local-midnight zones. See LOCALIZATION.md and QA_REPORT.md for runtime fallback and native limits.

Phase 24 adds actual native Android Development Client evidence: API 36 emulator boot/install, native OTP/keyboard, two-user messaging/read, private camera/file uploads, permission denial, secure session/outbox process-stop restoration and Georgian/large text. See QA_REPORT and BUILD_LOG for exact artifact/hash and limitations. The Hermes country-name regression brings Jest to 139 tests. This does not replace iPhone, real audio/push, TalkBack or remaining full E2E gates.

## Phase 26 complete automated gate

Start the guarded local database and LiveKit, apply a clean reset, then serve the nine Edge Functions before `npm run test:integration`. The runner executes all 19 real-backend suites sequentially, requires a nonzero passing test count and retains each actual exit code/log and a machine-readable summary under ignored `artifacts/local-qa/`. It never resets data itself or chooses a cloud endpoint. Related fixture cleanup stays sequential. Realtime tests wait for PostgreSQL registration as well as the WebSocket subscription; a socket join alone does not prove change delivery is ready after a database restart.

`npm run check:db-types` regenerates from the guarded local database, formats using the repository configuration and compares without modifying source. CI now includes this drift check and the complete integration runner. `npm run audit:server` checks the separate Deno lockfile. Native compilation, boot, hardware QA and cloud CI execution remain distinct from these automated results.

Phase 27 adds the guarded `npm run db:seed -- --reset-demo-users` fixture setup and [real end-to-end observations](END_TO_END_QA.md). Phase 27 unit baseline: 155 tests / 30 suites, plus three server-stream tests. Native call permission errors, partial tracks, stopped recorder duration and user-file-safe cache cleanup have regression coverage. Full backend baseline remains Phase 26.

## Final available local QA

Phase 30 final application baseline is **164 Jest tests / 32 suites plus three server-stream tests**, with strict TypeScript, lint, formatting, source/environment/localization checks passing. Seven release-isolation cases and two optimized-local/hosted notice cases were added after Phase 27. Nine Edge entrypoints, generated database type drift and database lint pass at the final checkpoint. Doctor 21/21 uses the documented installed CocoaPods environment; compatibility and both mobile JavaScript exports pass.

The complete real-backend baseline is Phase 26: **19 suites / 22 scenarios, 57 pgTAP assertions and 62 migrations replayed twice**, unchanged by later native/UI/configuration edits. Phase 27 additionally passed 13 focused native media cases and one real media scenario. Do not add these subset reruns into an invented unique test total. Remote CI, cloud providers and physical-device acceptance have not been completed.

The final Android Development Client and embedded local diagnostic APK both compile, install and render. Standalone cold/warm malformed native input, actual local OTP and process-restart Auth restoration pass without Metro. Bounded process logs show zero fatal/React Native error lines. The embedded diagnostic bundle/strings, mobile exports, source and history scan with zero secret findings. At that September 8 checkpoint iOS compilation still failed on unsupported Xcode 26.2; the September 9 continuation below supersedes that toolchain state. Exact artifacts, hashes, failures and limitations are in BUILD_LOG.md and RELEASE_REPORT.md.

September 9 SDK 57 maintenance checkpoint: the full application check was rerun after the three recommended direct package updates and their native transitive updates. Actual results remain 164 Jest tests / 32 suites plus three server-stream tests, with strict TypeScript/lint/format/source/env/localization PASS. Doctor is back to 21/21 and compatibility PASS after the initial 20/21 recommendation mismatch; both mobile exports and all secret-scan scopes pass. CocoaPods resolved 125 dependencies / 128 pods. At the maintenance checkpoint the iOS platform download still gated compilation. The subsequent full original-framework and app builds now pass under Xcode 26.6; the isolated header probe is kept separate from that evidence.

September 9 iOS native continuation: actual signed Development Client compilation, signature verification, installation and iPhone 17 Pro Simulator / iOS 26.5 rendering PASS. Real local invalid/valid OTP, SecureStore process-restart restoration, three tabs, profile, request interpretation, actual development candidates and their evidence were exercised. Software English/Georgian keyboard rendering, input and dismissal were checked; full keyboard/accessibility/device acceptance is not implied. The initial unsigned diagnostic app failed Keychain entitlement initialization; normal simulator ad-hoc signing fixed it without a storage fallback. Full build/OS warnings remain in BUILD_LOG and the native evidence. No Apple/EAS account mutation or physical-phone test is claimed.

The subsequent standalone iOS diagnostic passed cold/warm 6,153-byte malformed native inputs with both Metro loopback connections refused. Auth restored, Chats rendered, the warm process survived and post-input Me/Connect actions responded. Signature verification and runtime warnings are recorded in native-result.json; no physical-device, E2EE, zero-warning or removed-advisory claim is implied.

## Design refinement

The owner-selected visual reference, actual simulator screenshots and remaining visual checks are tracked in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) and [DESIGN_QA.md](DESIGN_QA.md). Automated checks do not establish final visual acceptance. The new brand assets, populated iOS chat/composer/sheets and Android Welcome render have direct visual evidence. Full calls/media, all enlarged-text interactions and Android interaction coverage still require the dedicated final design matrix; physical iPhone testing is explicitly deferred until design refinement. The pre-design packaged native artifacts must not be used as evidence of the revised interface.

`npm run check:brand` verifies the 14 vector/raster exports, PNG hashes/dimensions, opaque iOS icon resources and Android adaptive safe-circle containment. Regenerate with `npm run brand:generate` after editing canonical geometry or palette. Production reference pixels are never embedded.

### Native visual regression checks (September 9, 2026)

See [DESIGN_QA](DESIGN_QA.md) for the actual simulator matrix and explicit untested device states. New unit regressions exercise iOS Hermes without `Intl.NumberFormat.formatToParts`, bounded authorized Recent people (including access revocation/network error), selected-row accessibility, and native contact picker cancellation/denial. `npm run check` now runs 173 Jest tests in 34 suites plus three server stream tests.

For repeat visual testing use only guarded local Supabase fixtures, the Expo Development Client and normal account login. Do not silently substitute Expo Go, static web rendering or preview data for a native/backend result. Restore OS text-size changes and any temporary local service pause. Large-text headers may truncate long person names to two lines while exposing their complete accessible name; labels and controls must remain reachable. Check no-results and permission-denied paths as well as populated forms. During media upload verify that selection, cancellation and caption edits cannot change an in-flight request. Native iOS contact getters may request permission after the system picker: denial must show contacts guidance, not a generic backend-outage message.

The final QA used an auto-resuming loopback gateway interruption, not airplane mode. Its successful message recovery and database count of one do not prove background/hardware reconnect. The remaining manual VoiceOver/TalkBack, physical camera/GPS/push/call and full interactive Android matrix stays mandatory before release.

Country-picker modal regression: open the full-screen native picker on a notched iPhone, verify title/close are below the clock/status area, search an unknown country, then select a real country with the software keyboard open. The modal needs its own SafeAreaProvider; root-screen insets alone did not protect it on the tested runtime. The native pass also completed disposable-account deletion after the existing two-minute upload-settlement barrier, with actual server confirmation and retention of the primary fixture.
