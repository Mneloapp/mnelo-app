# Mnelo execution QA

**2026-09-09 privacy acceptance reset:** the [new device-owned data requirements](PRIVACY_ARCHITECTURE.md) are not satisfied by the existing Supabase/RLS test results below. E2EE, relay non-retention, private metadata removal and optional encrypted Drive/iCloud restore checks are all pending. No runtime or native PASS is claimed for this migration.

## Device-owned privacy decision — 2026-09-09

Phase: privacy architecture revision.
Status: owner requirements documented; runtime migration not implemented.
Implemented: authoritative prohibition on persistent communication copies, including ciphertext and private metadata; mandatory reviewed E2EE; device outbox/history; opt-in, device-encrypted user Drive/iCloud backup and recovery requirements; no silently retained Auth/Connect/safety exception; truthful delivery, endpoint and traffic-visibility limits.
Files: README and eleven architecture/security/data/RLS/UX/testing/release/execution/QA documents, including the new PRIVACY_ARCHITECTURE.md.
Database migrations: none; existing local fixtures and migration history preserved.
Security impact: old RLS/native passes cannot authorize release under the new privacy requirement. No crypto library, provider account, key material, app encryption flag or runtime behavior changed.
Tests: Prettier PASS for all twelve changed Markdown files; 125 local documentation targets and the new acceptance anchor checked; git diff whitespace PASS. Formatting and whitespace were rechecked after adding this report.
Native checks: not run; documentation-only change. TypeScript, lint, unit/integration and security suites were not rerun and are not claimed as new evidence.
Known limitations: E2EE, relay non-retention, local history, optional backup/recovery and the identity/Connect/safety redesign remain pending; an absolute interception-proof guarantee is explicitly rejected. Current application is not compliant with the new requirements.
Commit: containing commit, `docs: define device-owned privacy and relay requirements`.

The full V1 execution brief supersedes earlier phase stop boundaries. Each phase is implemented, checked and committed without a routine approval pause. External/native checks remain explicitly pending until executed. A commit is not a claim of store or device readiness.

## Execution baseline

Branch `main`, clean at start. Prior commits: foundation `99fd6fe`, audit `c71c634`, branding `ae8d345`. No historical commit is rewritten. Owner confirmed and authorized native identity migration.

## Native identity migration

Phase: native identity prerequisite
Status: implemented and verified configuration; native compilation externally blocked
Implemented: owner-authorized `com.mnelo.app` identity on both platforms; clean CNG regeneration; active stale-name removal.
Files: app config, README, identity/release/iPhone documentation, historical snapshot labels, BUILD_LOG and sanitized native evidence.
Database migrations: none.
Security impact: no external account mutations or credential creation; existing generic signing material preserved.
Tests: TypeScript/lint/format/source/env PASS; 4 suites / 27 tests PASS; Doctor 21/21; compatibility PASS; iOS and Android exports PASS; active stale-name audit PASS.
Native checks: both prebuilds and Pods PASS; selected Xcode 26.2 build FAIL, two ExpoModulesJSI compiler errors, exit 65. No device-render pass.
Known limitations: supported Xcode upgrade or authenticated EAS build remains necessary; no account auth available.
Commit: `ff14c30` — `chore: migrate native identity to com.mnelo.app`.

## Phase 1 — product interface

Phase: 1
Status: interface implemented; native visual/keyboard acceptance pending supported toolchain
Implemented: authentication UI, exactly Chats / Connect / Me tabs, new message/group, conversation and message actions, Need/Offer interpretation/results/profiles, contextual requests, profile/settings/account surfaces, explicit call/media preview controls; typed service boundary and local-only fixtures. Fixed disabled-reachability false-offline behavior, small chat header overflow, inverted empty-chat state and semantic radio selection.
Files: app routes/layout; shared UI/theme/i18n; domain/repository/query/session boundaries; auth/chat/connect/profile/call/media screens; fixture/connectivity regressions; README, architecture, security, UX, testing and execution ledger.
Database migrations: none; Phase 2 follows immediately.
Security impact: configured/release environments never authenticate through preview fixtures; no real OTP/session credentials or private remote data handled yet; account deletion cannot report false completion.
Tests: TypeScript, ESLint (zero warnings), formatting, environment and source guard PASS. Jest 5 suites / 39 tests PASS. Expo Doctor 21/21 PASS; dependency compatibility PASS. iOS and Android Metro exports PASS.
Native checks: Xcode 26.2 remains unsupported for SDK 57 and fails the documented ExpoModulesJSI compilation; no native launch or physical-device PASS. Clipboard is Expo-aligned and awaits native regeneration on a supported build path.
Supplementary browser QA: isolated Chrome local preview at 390×844; welcome → phone → invalid OTP → valid local OTP → identity → skip capabilities → Chats; sent/visible message; Connect electrician/Vake interpretation → two data-backed results → request sent; accepted incoming sample request → new conversation; Me/privacy defaults inspected. Empty conversation rechecked at 320×568 after fixes: document width equals viewport (320), controls measured 48×48, empty text upright. Privacy additionally rendered at 430×932. Browser error log empty, only React development informational messages. Screenshots are ignored local artifacts, not device evidence.
Known limitations: fixtures are in memory; real backend/media/calls/push/session deletion follow later phases. Georgian feature translations, native keyboard, Dynamic Type and Android layout acceptance remain later QA. Production readiness is not claimed.
Commit: `d5fd3ef` — `feat: build complete mnelo v1 product interface`.

## Phase 2 — local Supabase and authorization

Phase: 2
Status: local backend foundation implemented and verified
Implemented: 30 application tables / three internal tables, normalized identities and relationships, constraints/indexes, RLS and explicit grants, private buckets, Realtime policy foundation, caller-scoped profile/privacy/block/request operations, atomic acceptance and relationship locking. Isolated local runtime and guarded commands; CI database job prepared.
Files: two versioned SQL migrations, local Supabase configuration, pgTAP authorization tests, local command wrapper/guards, dependency lock, CI, local setup/data/RLS/security/testing/release documentation.
Database migrations: `20260907000100_foundation.sql`, `20260907000200_authorization.sql`.
Security impact: private phone remains in Auth; exact message locations/attachments require membership; no client verification/reputation/admin writes; no unreserved uploads; global inherited function grants explicitly revoked. Initial permission test failure was fixed, not suppressed.
Tests: clean local start and reset PASS; pgTAP 52 tests PASS (including positive controls); database lint public/private PASS with no schema errors. TypeScript/lint/format/source/env PASS; Jest 6 suites / 42 tests PASS. Expo Doctor 21/21 PASS; dependency compatibility PASS. Loopback-only API binding verified through Docker and host listener inspection. PostgreSQL version 17.6 verified.
Native checks: no new mobile native module in this phase; prior SDK 57 / Xcode 26.2 compiler failure remains an external native gate. No device claim.
Known limitations: cloud project unprovisioned; real phone OTP integration follows Phase 3 (CLI disables phone login without a provider despite test-code map). Messaging/media/call/push mutation implementations and end-to-end service tests follow their phases. Current database tests do not prove LiveKit token authorization or physical-device behavior. Remote CI is prepared but has not run because no Git remote exists.
Commit: `b78fceb` — `feat: establish local supabase backend and authorization`.

## Phase 3 — secure authentication

Phase: 3
Status: real local Auth implemented and verified; production SMS and native persistence acceptance pending
Implemented: phone normalization and searchable country selector; real Supabase OTP, verified restore, refresh and logout; segmented native SecureStore adapter with atomic rotation; foreground refresh lifecycle; bounded transport and redacted errors; local reserved accounts and a no-delivery SMS hook.
Files: Auth screens/country picker, Supabase client/Auth/storage/error adapters, auth routing/provider integration, local environment helper, SQL hook/config, integration and unit tests, CI and authentication/security/setup documentation.
Database migrations: `20260907000300_auth_delivery_gate.sql`.
Security impact: no service credential in the mobile environment; tokens remain outside Zustand/query caches; browser sessions are memory-only; invalid local numbers cannot send SMS; server logout and refresh revocation are checked; raw Auth errors are never displayed or logged.
Tests: TypeScript/lint/format/source/env PASS; Jest 10 suites / 60 tests PASS; real local Auth integration 1 test PASS including invalid code, 429 resend denial, verified restore, refresh, logout and revoked refresh denial; pgTAP 52 PASS; database lint no errors; Expo Doctor 21/21 PASS and compatibility PASS. iOS and Android Metro exports PASS.
Native checks: native compilation remains blocked by the proven SDK 57 / Xcode 26.2 mismatch. No native SecureStore, OTP autofill, keyboard or device pass is claimed.
Supplementary browser QA: 390×844 real local Auth, invalid code then valid reserved code reaches identity; searchable country modal filters United States and updates +1; second reserved identity authenticates successfully; browser errors empty. No SMS was delivered.
Known limitations: cloud Auth/SMS not provisioned; CLI's local OTP TTL is 6000 seconds and reserved test codes are intentionally local-only (cloud requires 300 seconds and no test map). Offline logout and device revocation follow later phases. Profile completion follows immediately in Phase 4. No physical-device or production authentication acceptance claim.
Commit: `a2ed2e4` — `feat: implement secure mnelo authentication`.

## Phase 4 — identity and profiles

Phase: 4
Status: local profile and avatar services implemented and verified; native picker/device acceptance pending
Implemented: real profile creation/editing, unique/reserved username enforcement, capability/language records, privacy-filtered bounded search and summaries, actual review/verification aggregates, expiring availability, private processed avatars and authorized short-lived image access.
Files: profile repository/validation/components; auth and profile/search routes; avatar Edge Function/shared bounded reader; server lockfile/type check; app config/native dependencies; two migrations/types; profile unit/integration tests; CI and profile/security/data/testing documentation.
Database migrations: `20260907000400_profiles.sql`, `20260907000500_availability_expiry.sql`.
Security impact: no client-selected profile owner or trusted reputation; pending-request participants get narrowly scoped profile access with blocks taking precedence; server image decoding/re-encoding strips metadata; client upload/finalization denied; avatars remain private. Signed URLs have a documented 60-second revocation window.
Tests: TypeScript/lint/format/source/env PASS; Jest 11 suites / 64 tests PASS; two real profile/avatar integration tests PASS; pgTAP 52 PASS; database lint no errors; Edge Function Deno type check PASS; Expo Doctor 21/21 PASS, compatibility PASS; iOS and Android exports PASS.
Native checks: clean iOS/Android prebuild PASS; Pods install PASS (116 pods), with Ruby 2.6 precompiled-config warnings/source fallback recorded in BUILD_LOG. Xcode 26.2 remains below the SDK 57 minimum; no native build/boot/picker PASS.
Supplementary browser QA: 390×844 reserved real OTP → Georgian display name/username → capability → Me; persisted profile fields visible; English/Georgian speaking preferences and availability saved with confirmation; approximate area saved. Browser error log empty. Chats currently displays the honest unavailable state until Phase 5 transport is connected.
Known limitations: cloud deployment unconfigured; native picker/permission acceptance pending; availability uses next UTC midnight until timezone-specific refinement. Need/Offer publication follows Phase 8. General API abuse hardening and orphan maintenance follow later phases. No production/device readiness claim.
Commit: `f8f82f3` — `feat: implement mnelo identity and profiles`.

## Phase 5 — direct messaging

Phase: 5
Status: real local messaging implemented and verified
Implemented: authorized conversation summaries, 40-message/30-conversation cursor pages, persistent client UUID idempotency, reply/reaction/soft deletion, sender read state and unread counts, private Realtime/inbox subscriptions, reconnect recovery and ephemeral retry queue. Read receipts are based on visible messages in an active conversation/app.
Files: chat repository/screens/cursor/pending-send hooks, infinite query and inbox hooks, query error handling, five SQL migrations/generated types, messaging integration and cursor/retry tests, CI and messaging/data/security documentation.
Database migrations: `20260907000600_direct_messaging.sql` through `20260907001000_message_reaction_pages.sql`.
Security impact: sender and membership remain server-derived; unknown users cannot create arbitrary direct chats; nonmembers cannot join private conversation topics or read/send; blocked pair sends denied. Reaction toggles avoid unfiltered DELETE payloads. Pending message data clears on signout.
Tests: TypeScript/lint/format/source/env PASS; Jest 13 suites / 69 tests PASS; real messaging integration 1 PASS including three-user negative authorization, private-topic denial, Realtime delivery, reply/reaction, idempotency, unread/read, reconnect, cursor ties and blocking; pgTAP 52 PASS; database lint no errors. Doctor 21/21 PASS; compatibility PASS; both mobile exports PASS. Initial SQL argument ambiguities and a React ref lint error were fixed without disabling checks.
Native checks: no new native dependency; documented SDK 57 / Xcode 26.2 compiler gate remains. No native keyboard, airplane-mode or physical-device claim.
Supplementary browser QA: real local account at 390×844 opened an authorized development conversation, displayed unread state, sent text, received the second user's reply through Realtime and changed its sent message to Read. The second user's authenticated SDK independently read the exact sent text. Screenshot inspection caught a long-name header wrapping mid-word; chat titles are now limited to one line with native truncation while preserving their accessible name. Browser error log empty. Fixture connection creation was explicitly local test setup, separate from the integration-tested request acceptance procedure.
Known limitations: pending queue is memory-only until Phase 19; attachment/group/call transports follow. Cursor refetch deduplication is implemented; final concurrency/performance/device stress acceptance remains later. No E2EE or production-readiness claim.
Commit: `256a093` — `feat: implement realtime direct messaging`.

## Phase 6 — private media and voice messages

Phase: 6
Status: implemented and locally verified; native capture/playback acceptance pending
Implemented: opt-in photo/camera/files, recording/cancel/preview/playback, explicit location and Mnelo contact sharing, private upload claims, authorized forwarding, media previews and deletion lifecycle. Fixed nested message buttons and missing expo-asset peer/plugin found by QA.
Files: media feature components/repository, chat presentation, upload/forward Edge Functions, five migrations/types, native config/dependencies, integration fixtures/tests, CI and media/security/data/release documentation.
Database migrations: `20260907001100_private_media.sql` through `20260907001600_media_previews.sql`.
Security impact: ownership and conversation/block checks are server-enforced; unsent metadata is owner-only; server strips JPEG metadata and parses AAC duration; privileged finalization requires the current unique upload claim; exact location/contact payloads disappear on deletion. Generic files remain untrusted, without malware scanning; signed URL revocation can take 60 seconds.
Tests: TypeScript/lint/format/source/env PASS; Jest 13 suites / 69 tests PASS. Real media integration 1 PASS covering image/file/AAC, idempotency, unsent/private access, spoofing/nonmember denial, parsed duration, private forwarding, location/contact and deletion. pgTAP 52 PASS; database lint no errors; all three Edge Function Deno checks PASS. Doctor 21/21 PASS after explicit peer/plugin correction; dependency compatibility PASS; both mobile exports PASS. npm audit 15 moderate / zero high or critical; additional tooling ancestor documented, runtime URI advisory remains a release blocker.
Native checks: clean iOS/Android prebuild PASS; Pods install in this phase resolves 121 pods with the existing Ruby 2.6 precompiled-config/source-fallback warnings. SDK 57 still requires supported Xcode; no native build/boot/recorder/permission PASS.
Supplementary browser QA: real local account at 390×844 selected a development text fixture, previewed/sent it, saw the persisted caption and file in the conversation, and opened its exact content through authorized access. Headless picker automation injected the file with an absolute path and intercepted native cancel; no picker behavior is claimed on a physical device. A fresh session after fixes had no browser errors or warnings beyond normal React development info. Screenshot inspected. Fast Refresh during screen editing invalidated a FlatList callback and required a reload; the fresh-session flow passed. Temporary diagnostic logging was removed.
Known limitations: native camera/mic/location/contacts/voice playback not exercised; foreground-only recording; cloud services remain unconfigured; offline persistence/orphan maintenance and full security/performance acceptance follow later phases. No production readiness claim.
Commit: `5aedec4` — `feat: add secure chat media and voice messages`.

## Phase 7 — private groups

Phase: 7
Status: implemented and locally verified; native device acceptance pending
Implemented: group creation with connection search and idempotency, bounded member roster, sender names, rename/private photo, admin promotion/demotion, add/remove/leave, admin succession and removal-event delivery. Group call controls are hidden because V1 has no group calls.
Files: group routes/screens/repository, chat/inbox hooks, domain and generated types, two migrations, group integration test/CI, GROUPS and architecture/data/security/UX/release documentation.
Database migrations: `20260907001700_private_groups.sql`, `20260907001800_membership_revocation_events.sql`.
Security impact: only existing connections can be added; admin role and blocks are checked server-side; former members lose data access. Own tombstones permit a narrow revocation event. Avatar purpose prevents reuse as message content. Full-history sharing and no forced rejoin are explicit policies.
Tests: TypeScript/lint/format/source/env PASS; Jest 13 suites / 69 tests PASS; five-user real group integration 1 PASS including actual Realtime removal event; pgTAP 52 PASS; database lint no errors; Expo Doctor 21/21 PASS; dependency compatibility PASS; iOS/Android Metro exports PASS. Group test assertions completed in about 1.3 seconds; the process took about 62 seconds including SDK connection cleanup.
Native checks: no new native module; previous Pods/prebuild preparation remains applicable. Xcode 26.2 is still below SDK 57's supported minimum; no native group/device PASS.
Supplementary browser QA: 390×844 real local account selected two development connections, created a group, sent a persisted message, renamed the group, promoted another member and confirmed leaving. Chats then excluded the departed group. Group details screenshot inspected; browser errors empty and console contained only standard React development info. Fixture connections were explicitly local setup; backend integration separately uses real request acceptance.
Known limitations: native layout/keyboard/accessibility and cloud deployment pending; no rejoin invitation or group calls; already downloaded history cannot be recalled. Final offline/security/performance checks follow later phases.
Commit: `c53bac0` — `feat: implement mnelo group messaging`.

## Phase 8 — deterministic Connect requests

Phase: 8
Status: request interpretation/publication implemented and locally verified
Implemented: server IntentInterpreter for six concepts, English/Georgian rules, bounded clarifications, coarse-area validation, timezone-aware dates, exact raw-text/answer provenance, atomic idempotent Need/Offer publication and paginated ownership/lifecycle UI.
Files: pure interpreter and Edge endpoint, Connect repository/screens/domain, needs pagination and request lookup, two migrations/types, interpreter unit/integration tests, CI and CONNECT/architecture/security/data/UX/release documentation.
Database migrations: `20260907001900_connect_requests.sql`, `20260907002000_interpretation_provenance.sql`.
Security impact: Auth-verified actor, rate consumption before parsing, strict payload schema, service-only publication, owner-only raw text, no client-selected trusted metadata or AI secret, no exact location extracted into matching fields.
Tests: TypeScript/lint/format/source/env PASS; Jest 14 suites / 87 tests PASS including 18 new rule tests. Real Connect integration 1 PASS including two-user negative authorization, provenance, idempotency/conflict, Need/Offer normalization and status transitions. pgTAP 52 PASS; database lint no errors; all four Edge Deno checks PASS; Doctor 21/21 PASS; dependency compatibility PASS; both mobile exports PASS. Lint/format and a missing JSX close were corrected before completion.
Native checks: no new native module; supported Xcode and physical-device acceptance still pending, with no new native PASS claimed.
Supplementary browser QA: real local account at 390×844 entered “I need an electrician”, received only an area clarification, answered Vake, reviewed/published and found the exact original request under My needs & offers; pause/reactivation worked. Screenshot inspected; duplicate raw detail in the summary was removed afterward and automated checks/exports rerun. Browser errors empty and only React development console info. The results screen correctly remained unavailable because matching transport is Phase 9, not a fabricated successful result.
Known limitations: bounded rule vocabulary, no general language model, requests crossing midnight should be reinterpreted; matching, relevant public-safe need summaries, cloud deployment and native acceptance follow. No production-readiness claim.
Commit: `24947e1` — `feat: implement mnelo connect requests`.

## Phase 9 — explainable matching

Phase: 9
Status: implemented and locally verified
Implemented: indexed deterministic aliases/evidence, privacy/block/date/request-route filtering, recorded reasons and source validation, internal weighted ranking, up to three current results, live expiry/invalidation and safe profile intent summaries.
Files: four migrations/types; matching repository/domain; localized reason component and result/profile state handling; seven-user integration test; CI and MATCHING/architecture/security/data/RLS/UX/release documentation.
Database migrations: `20260907002100_matching_evidence.sql` through `20260907002400_evidence_based_rank.sql`.
Security impact: no fabricated scores/facts, no raw text or GPS in discovery, no client score access or candidate writes; relevant profile grants depend on live evidence. Source/expiry/privacy/block changes invalidate access. A SQL variable ambiguity was fixed after lint caught it.
Tests: TypeScript/lint/format/source/env PASS; Jest 14 suites / 87 tests PASS; matching integration 1 PASS after related fixture cleanup was serialized; profile regressions 2 PASS; Connect regression 1 PASS; pgTAP 52 PASS; database lint no errors. Doctor 21/21 PASS, compatibility PASS; both mobile exports PASS. The earlier concurrent fixture-deletion run failed with observed 40P01 deadlocks, documented for the Phase 17 lifecycle implementation; it is not counted as a pass.
Native checks: no new native dependency; SDK 57 still requires supported Xcode. No device/boot acceptance claimed.
Supplementary browser QA: 390×844 real local account opened its persisted electrician/Vake request, received three actual development profiles with evidence-based ranks, and opened the highest-ranked profile with matching reasons, actual capability and no verification/reviews. Result screenshot inspected; browser errors empty and only React development console info. Development fixtures are explicitly labeled and local-only.
Known limitations: finite alias vocabulary/exact fallback, transaction-snapshot ranking, cohort performance testing and safe lifecycle retry pending. Cached/downloaded data cannot be recalled; new backend access is denied after invalidation. Connection-request UI integration follows Phase 10 immediately; cloud and native acceptance remain pending.
Commit: `84055d2` — `feat: implement explainable mnelo matching`.

## Phase 10 — contextual connection requests

Phase: 10
Status: implemented and locally verified
Implemented: reviewed canonical context, live relationship preflight, durable request retry key, explicit accept/decline/cancel, expiry/cooldown, atomic conversation creation with invitation preservation, paginated requests, connection search and private inbox events.
Files: migration 025/types; connections repository/feature components; chat/profile routing and Realtime hook; locales; integration/error tests; CI and connection/security/data/UX documentation.
Database migrations: `20260907002500_contextual_connections.sql`.
Security impact: no unrestricted unknown-user chats, no silent raw-text disclosure, server actor/action/context checks, blocks override retries, private participant-only events. No RLS weakening.
Tests: TypeScript/lint/format/source/env PASS; Jest 14 suites / 88 tests PASS. Four-user connections integration 1 PASS; matching regression 1 PASS; messaging regression 1 PASS; pgTAP 52 PASS; database lint no errors. Doctor 21/21 PASS, dependency compatibility PASS; iOS/Android Metro exports PASS. Initial fixture vocabulary mismatch was corrected. A real delivery test failed because channel join preceded PostgreSQL readiness; the app now refetches at database-ready, and the test waits for that explicit handshake before sending. No failed run is counted as a pass. The first Doctor invocation could not resolve CocoaPods from the default shell path; the documented Ruby/CocoaPods environment produced 21/21 PASS.
Native checks: no new native dependency; Xcode 26.2 remains below the SDK 57 supported minimum. No native build/boot/physical-device PASS claimed.
Supplementary browser QA: two actual local OTP accounts at 390×844; recipient created a capability/profile in Vake and became a real relevant match; sender reviewed and sent request; recipient's open inbox updated without refresh, showed correct name/context/message, accepted and opened chat; recipient replied; sender reopened via the Message action and saw reply plus read state. Request and incoming layouts inspected. Both browser error logs empty; normal React development console info only.
Known limitations: production push, cloud deployment, final abuse/concurrency/offline testing and native device acceptance remain pending. Current privacy can restrict historical profile labels. No production readiness claim.
Commit: `1f34ed8` — `feat: implement contextual connection requests`.

## Phase 11 — trust and reputation

Phase: 11
Status: implemented and locally verified
Implemented: explicit mutual completion for service/business connections, optional immutable eligible reviews, public-safe review projection, shared published-review aggregates, scoped current verification, private completed history and completion Realtime updates.
Files: reputation repository/screens/routes, connection/profile/chat navigation, inbox cache handling, two migrations/types, integration/regression fixtures, CI and REPUTATION/security/data/UX documentation. Corrected the connection-expiry documentation to the actual 14-day database default.
Database migrations: `20260907002600_connection_reputation.sql`, `20260907002700_published_reputation_evidence.sql`.
Security impact: no self-awarded verification/reputation; both actual participants confirm before reviewing; no social rating; raw reviewer/connection identifiers are hidden; review author/subject derive from Auth/connection. Server-only hidden reviews leave aggregates. No claim that reviews prove independently verified transactions.
Tests: TypeScript/lint/format/source/env PASS; Jest 14 suites / 88 tests PASS; three-user reputation integration 1 PASS including deliberate concurrent confirmations; matching regression 1 PASS with complete eligible local review fixtures; connections regression 1 PASS; pgTAP 52 PASS; database lint no errors. Formatting was corrected before final checks. Doctor 21/21 PASS with documented CocoaPods environment, compatibility PASS, both mobile exports PASS.
Native checks: no new native dependency. Supported Xcode/native boot/device acceptance remains pending; no new native PASS.
Supplementary browser QA: two real local OTP accounts confirmed their existing service connection; the first saw waiting state, then the peer's confirmation unlocked review without refresh. Published a 4/5 explicitly labeled development review, opened the profile's review list, and saw the exact persisted comment. Completion/review screenshot inspected at 390×844; both browser error logs empty and console contained normal React development info only.
Known limitations: one reviewed original connection per pair, no repeat transaction model, no external verification provider, immutable reviews, final moderation/abuse/retention/performance/native acceptance pending. No production-readiness claim.
Commit: `7c80c06` — `feat: add mnelo trust and reputation`.

## Phase 12 — privacy controls

Phase: 12
Status: implemented and locally verified
Implemented: validated/rate-limited privacy settings with clear audience semantics, optional confirmed-phone reveal for existing connections, ephemeral UI handling and server-enforced coarse-area validation. Fixed singular review copy found during visual QA.
Files: privacy feature screens/contact component; profile repository/validation; interpreter validator; three migrations/types; component/unit/integration/regression tests; CI and PRIVACY/security/data/UX documentation.
Database migrations: `20260907002800_privacy_controls.sql` through `20260907003000_privacy_constraint_service_grant.sql`.
Security impact: defaults remain relevant/nobody/never/relevant; phone stays outside normal DTOs and is checked on every deliberate reveal; blocks/revocation deny new reads; late responses cannot repopulate a departed view. Shared validator imports initially violated the mobile/server source guard and were separated with parity tests. A service write failed with `42501 permission denied for function valid_coarse_area`; the pure validator received the narrow service-only grant and the previously unchecked expiry fixture now asserts success.
Tests: TypeScript/lint/format/source/env PASS; Jest 15 suites / 93 tests PASS; privacy integration 1 PASS; profile/avatar regressions 2 PASS after the grant fix; Connect regression 1 PASS; matching regression 1 PASS; pgTAP 52 PASS; database lint no errors; four Edge Deno checks PASS. Doctor 21/21 PASS with documented CocoaPods environment, compatibility PASS; both mobile exports PASS. The initial failed profile regression is recorded, not counted as a pass.
Native checks: no new native dependency. Supported Xcode/native build/boot/physical-device checks remain pending.
Supplementary browser QA: two real local OTP accounts at 390×844; selected Connections for phone visibility, saved/reopened and verified persisted choice; existing connection explicitly revealed the development number; owner restored Nobody and a new lookup showed no shared number. Settings screenshot inspected; both error logs empty and normal React development console info only. No production phone was used.
Known limitations: 30-second display lifetime cannot recall copied data; coarse text validation is not geocoding; native lifecycle/cloud/final abuse/security acceptance remains pending. No production-readiness claim.
Commit: `ff9afd8` — `feat: implement mnelo privacy controls`.

## Phase 13 — blocking and moderation safeguards

Phase: 13
Status: implemented and locally verified
Implemented: private profile/message reports, context/actor/rate validation, idempotent receipt, service-only moderation status/audit, block/unblock management, generic access-refresh events and stale-view clearing. Added missing navigator guards for newer feature routes and readable vertical report choices.
Files: moderation repository/screens/routes; shared Choice layout; profile/chat/privacy actions and inbox handling; migration/types; moderation/route-guard tests and CI; MODERATION/security/data/UX documentation.
Database migrations: `20260907003100_moderation_safeguards.sql`.
Security impact: reporter identity/content is not exposed to subjects or other clients; no client moderation authority; blocked access remains backend-enforced. Minimal own-blocked identity projection enables management. Generic access events contain no blocker identity or private content. Newer routes previously relied on backend enforcement; navigator guards now cover them explicitly.
Tests: TypeScript/lint/format/source/env PASS; Jest 16 suites / 94 tests PASS; four-user moderation integration 1 PASS; privacy regression 1 PASS; five-user group regression 1 PASS (about 62 seconds including SDK cleanup); pgTAP 52 PASS; database lint no errors. Doctor 21/21 PASS with documented CocoaPods environment, compatibility PASS, both mobile exports PASS. Missing JSX title typing and the observed report-label wrapping were fixed before verification.
Native checks: no new native module. Supported Xcode/native/device and real LiveKit call eviction remain pending; ending a stored call record is not a live-room PASS.
Supplementary browser QA: anonymous blocked/connection/group URLs showed the welcome gate. Two real local OTP accounts at 390×844: submitted a message report; blocked peer; conversation disappeared for blocker and peer's open profile cleared without refresh; own blocked list showed only the intended person; unblocking restored permitted access. Report reason Other disabled submission until explanation. Corrected vertical choices inspected at 390×844. Browser errors empty; normal React console info. One visual recheck lost its browser surface to about:blank and was rerun from a fresh page; it is not counted as successful QA.
Known limitations: no staffed production moderation service/admin account, final evidence retention/abuse/native/device acceptance pending. Previously copied content cannot be recalled. No production-readiness claim.
Commit: `5d5435e` — `feat: add blocking and moderation safeguards`.

## Phase 14 — push notifications

Phase: 14
Status: implemented and locally verified; external delivery pending
Implemented: persisted categories, opt-in native permission/registration, session-bound device/token ownership, token rotation, generic push payloads, authenticated tap resolution, transactional five-category outbox, leased delivery/retry/receipt processing and inactive guarded scheduler.
Files: notification feature/repository/locale, native config and aligned packages; five migrations/types; Edge dispatcher/shared transport; integration/payload/RLS tests and CI; NOTIFICATIONS and checkpoint documentation.
Database migrations: `20260907003200_push_notifications.sql` through `20260907003600_push_matching_actor.sql`.
Security impact: bearer token SELECT denied even to owner; actual live Auth session enforced; blocks/member/read/preference/token state rechecked; no private message/name/location payloads or client dispatch authority. Server matching uses the stored recipient without impersonating a user JWT; client wrappers preserve ownership. Scheduler stays inactive and missing Vault configuration performs no transport.
Tests: TypeScript/lint/format/source/env PASS; Jest 17 suites / 95 tests PASS. Push integration/transport 2 PASS including all five event categories, concurrent claims, token/session ownership, retries and receipts; pgTAP 52 PASS; messaging regression 1 PASS; matching regression 1 PASS; database lint no errors; five Edge Deno endpoints check PASS. Doctor 21/21 and dependency compatibility PASS; both Metro native exports PASS. Initial scheduler migration hit reserved SQL variable `authorization`, fixed before application. A match delivery test exposed JWT-dependent server evaluation; actor-scoped private helpers fixed it and regression tests passed. The old pgTAP token read expected an empty result but now receives 42501; its assertion was strengthened without restoring access. These failed runs are recorded, not counted as passes.
Native checks: clean both-platform prebuild PASS; CocoaPods 122 dependencies / 124 pods PASS with existing legacy Ruby precompiled fallback warnings. Notifications 57.0.17 and device 57.0.1 align with SDK 57. Xcode 26.2 compiler/boot limitation remains; no APNs/FCM or actual physical-device PASS.
Supplementary browser QA: actual local OTP account at 390×844 disabled relevant matches, saved, left/reopened and observed persisted false, then restored true. Enable on this device showed the truthful mobile-only registration state. Screenshot inspected; errors empty and normal React console info only. Default web Switch coloring was aligned with centralized tokens.
Known limitations: EAS/APNs/FCM/cloud scheduler and device delivery require owner credentials; receipts indicate provider acceptance only. Token ownership is not independent device attestation, submitted pushes cannot be recalled and transport duplicates remain possible. Standard push does not guarantee background call wakeup. Retention/full device lifecycle/security/locale/performance follow later phases. No production-readiness claim.
Commit: `841db72696383247a2fad7541a7b1f34509ab5e9` — `feat: add mnelo push notifications`.

## Phase 15 — authorized voice and video calling

Phase: 15
Status: implemented and locally verified; native/cloud acceptance pending
Implemented: actual local LiveKit rooms, session-bound consent and short-lived scoped tokens, voice/video controls, private incoming events, observed presence, durable room teardown, call history, exact conversation metadata and inactive cloud cleanup schedule.
Files: calls feature/platform media surfaces/repository; chat/header/call copy and permissions; scripts/config/packages/CI; eight migrations/types; calls and push regression tests; CALLS and checkpoint documentation.
Database migrations: `20260907003700_authorized_calls.sql` through `20260907004400_call_push_category.sql`.
Security impact: no token before consent, no outsider/group/admin authority, exact participant session binding, no client secrets, no client presence assertions; blocked/ended rooms removed through real server API. Local auto-create disabled and old valid-token recreation actually denied. Queue observations are fair and failures cannot block all terminal cleanup. Cloud scheduler remains inactive without protected configuration.
Tests: TypeScript/lint/format/source/env PASS; Jest 17 suites / 95 tests PASS; call integration 1 PASS with actual signaling/rooms, scoped grants and block eviction; push regression 2 PASS; messaging regression 1 PASS; pgTAP 52 PASS; database lint no errors; seven Edge endpoint checks PASS. Initial token-TTL assertion incorrectly assumed `iat`; verified SDK uses `nbf`, corrected assertion. Push regression exposed duplicate message notifications from call-history insertion, fixed and regression passed. A ref-based callback stability fix tripped the React ref lint rule and was replaced with a stable state initializer; strict rules remain enabled.
Native checks: clean both-platform prebuild PASS, 125 Podfile dependencies / 128 pods PASS; generated iOS camera/microphone copy and background audio checked; Doctor 21/21 and compatibility PASS; both JavaScript exports PASS. Legacy Ruby fallback warnings and unsupported Xcode 26.2 remain; no native compile/boot or physical-device PASS.
Supplementary browser QA: two actual local OTP users exchanged synthetic voice and 640×480 video through the real local server. Mute, camera off/on, camera-track restart, >90-second call presence, hangup and chat return exercised. Local-audio echo, duplicate Realtime subscription, viewport overflow, stale history time and callback identity were fixed. Final fresh call showed live tracks/playback and chat return without the FlatList crash. Permission denial left the conversation with clear recovery text; 390×844 screenshots inspected. SDK data-channel/closed-peer warnings during forced room teardown are recorded and not suppressed; hardware/native lifecycle acceptance remains pending.
Known limitations: no authenticated LiveKit Cloud/EAS/APNs/FCM, CallKit/Android foreground telecom or physical audio/video QA; loopback endpoint is not phone-reachable. Worker throughput/queue monitoring, platform background handling, final security/load/device acceptance remain release gates. No production-readiness claim.
Commit: `410e34256bf4fd5273bba7ca63f0ad759009e50e` — `feat: add secure voice and video calling`.

## Phase 16 — devices and live sessions

Phase: 16
Status: implemented and locally verified
Implemented: actual session/device listing with cursor pagination and current-device lookup; foreground metadata/validity checks; supported current/other-session logout; server-first logout sequencing; restrictive session enforcement on private data and Realtime joins; unique private call topics.
Files: privacy device screen/info/lifecycle hook, auth/device/call repositories, shared UI/error handling, migrations/types, unit/integration/pgTAP tests, CI and DEVICES/checkpoint documentation.
Database migrations: `20260908004500_device_session_access.sql` through `20260908004800_private_call_topics.sql`.
Security impact: live sessions supplement existing RLS and definer/Edge checks; stale JWTs cannot continue private reads or channel joins. Other-session logout preserves the current account session and does not affect a different account. No client Auth-table deletion, session tokens or privileged keys are displayed. Installed SDK failed-logout behavior is handled without dropping retryable credentials prematurely.
Tests: TypeScript/lint/format/source/env PASS; Jest 18 suites / 99 tests PASS; device integration 1 PASS with real dual sessions, 23-session pagination fixture, stale REST/RPC/Edge denial, refresh revocation, Realtime delivery before logout and denial afterward, and rejoin rejection. Auth 1, messaging 1, notifications 2, calls 1, profiles/avatar 2, media 1, matching 1 and groups 1 PASS. Call regression verifies actual private event receipt and wrong-account topic rejection. pgTAP 53 PASS; database lint no errors; seven Edge checks PASS. The old raw-device read expectation failed after its grant was removed and was strengthened to expect denial. An initial socket test used an unauthorized topic and a helper that resolved PostgreSQL registration before channel authorization; both were corrected, cleanup added and the test passed. Formatting/unused-import failures were fixed without disabling checks.
Native checks: no new native module. Doctor 21/21, dependency compatibility and iOS/Android JavaScript exports PASS. Supported Xcode/native build/physical device gates remain pending.
Supplementary browser QA: real local OTP account listed actual sessions, confirmed logout-all-others, retained only the current device and showed backend-confirmed completion. Then current-device logout returned to welcome. A 390×844 screenshot was inspected. Empty optional device subtitles initially emitted native-web text warnings; fixed in the shared Row, then browser errors/console were empty on the final flow.
Known limitations: metadata is client-reported; remote revocation UI detection is foreground/30-second polling, while new backend data access is denied immediately. Cached/copied content and previously signed media URLs cannot be recalled. Native/cloud session/device checks, final security/load/retention acceptance remain pending. No production-readiness claim.
Commit: `25bca6abc4d3c93e77989bde3d46832f5286f9e1` — `feat: add mnelo device management`.

## Phase 17 — account lifecycle

Phase: 17
Status: implemented and locally verified; native/cloud acceptance pending
Implemented: typed-confirmation deletion, persisted random receipt and navigation gate, truthful server status, leased cleanup, real private Storage/Auth removal, group succession, call eviction prerequisite, authored-content tombstones, upload settlement and late-object retention/retry.
Files: account repository/progress/gate/copy; shared navigation and subscription gates; two Edge endpoints and worker; ten migrations/types; receipt/worker/integration tests and CI; ACCOUNT_LIFECYCLE and required checkpoint documentation.
Database migrations: `20260908004900_account_deletion_jobs.sql` through `20260908005800_pending_deletion_receipts.sql`.
Security impact: verified live actor only, no client cleanup/completion authority, hashed random completion capability without identity disclosure, hidden closing profile and denied mutations/calls. Existing sessions lose data access when Auth is removed. Active-room removal and actual file deletion precede Auth removal. Pending receipts do not expire into apparent non-submission. Legal/backup/copied-content limits are documented.
Tests: TypeScript/lint/format/source/env PASS; Jest 20 suites / 110 tests PASS. Account integration 1 PASS with concurrent related accounts, actual LiveKit room teardown, exact group admin, real Storage/Auth removal, private receipt/worker denial, late-file sweep and aged pending receipt. Auth 1, profiles/avatar 2, media 1, groups 1, messaging 1, devices 1 and moderation 1 PASS. pgTAP 53 PASS; database lint no errors; nine Edge checks PASS. An ambiguous receipt parameter failed database lint and was fixed; cron interval syntax failed and was corrected before application. Two integration fixtures initially omitted required caption/MIME values, then were fixed. A group test missed an update because it did not await PostgreSQL registration; strengthened readiness and unconditional cleanup fixed the regression. Formatting was corrected without weakening checks. These failed runs are not counted as passes.
Native checks: no new native module. Doctor 21/21, dependency compatibility and both mobile JavaScript exports PASS. Xcode/native boot and physical-device gates remain pending.
Supplementary browser QA: reserved local OTP account created its profile, opened Account, typed DELETE, showed actual processing during the two-minute settlement window, then showed server-confirmed deletion and returned to welcome. Auth absence was independently checked. Processing/completion screenshots at 390×844 were inspected; final browser errors and console were empty. The integration test accelerates only its reserved job timestamps after asserting the gate; the browser flow used real elapsed time.
Known limitations: native SecureStore persistence/lifecycle and cloud worker activation remain unverified on device; the web QA adapter is memory-only. Existing copies/forwards/backups cannot be recalled through this flow. Production retention/legal review and final security/load checks remain release gates. No production-readiness claim.
Commit: `ff9cb9e4dab33ffcc33c6ce9fb90060681f4afbd` — `feat: implement account lifecycle controls`.

## Phase 18 — security hardening

Phase: 18
Status: implemented and locally verified; production deployment gates explicit
Implemented: owner-only raw identity policies, bounded profile projection quotas, raw verification denial, request-stream deadlines, no-store/nosniff responses, bounded Auth headers, strict forward input, reproducible redacted secret scanner and complete negative-test/rate matrix.
Files: shared Edge HTTP/auth and input handling; discovery migration; pgTAP, security and server tests; scanner/script/CI; rewritten current SECURITY and matrix/checkpoint docs.
Database migrations: `20260908005900_discovery_api_boundaries.sql`.
Security impact: closes raw-table discovery quota bypass while retaining authorized profile projections. Streaming byte/deadline checks limit stalled input; current actors cannot gain service/private-schema authority. No RLS weakening, strict-mode suppression, secret disclosure or homemade encryption. Transaction rollback and perimeter limits are documented honestly.
Tests: TypeScript/lint/format/source/env PASS; Jest 20 suites / 110 tests PASS; server-stream tests 3 PASS; security scenarios 2 PASS including concurrent quota enforcement and seven abuse surfaces; pgTAP 57 PASS; database lint no errors; nine Edge checks PASS. Auth 1, profiles/avatar 2, matching 1, reputation 1, privacy 1, media 1, account 1, calls 1, messaging 1 and moderation 1 PASS. Gitleaks 8.30.1 scanned 22 Git commits, current tracked/nonignored source and both exported bundles with zero findings. Initial scanner extraction used an unavailable Python option and was replaced with verified named-member extraction; initial lint missed an explicit Buffer import and was fixed. A grant test named a nonexistent push RPC, then corrected to the actual `claim_push_work`; it did not find a permissive grant. No failed run is counted as a pass.
Native checks: no new native module. Doctor 21/21, compatibility and both mobile JavaScript exports PASS; bundles secret-scanned. Supported Xcode/native boot/device gates remain pending.
Known limitations: transactional quotas do not persist rejected-transaction increments or provide DDoS protection. Production Auth/CAPTCHA/SMS billing, perimeter/cost controls, cloud workers, backup/legal retention and physical media/background checks remain unverified. Generic files are untrusted without malware scanning; runtime decoder advisory is tracked for Phase 25. No E2EE or production-readiness claim.
Commit: `7bf279f23516fa35dbf870de8a8445e3a92595b4` — `security: harden mnelo v1`.

Phase 18 follow-up: tracing message rendering exposed a contact-label regression after raw profile reads were restricted. Migration 060 adds a bounded message-scoped contact projection with current message/profile authorization; the mobile adapter uses it. Real media integration now asserts the actual name/username payload, unrelated-conversation denial and blocked-contact hiding. Media integration 1, pgTAP 57, database lint, TypeScript/lint/format, Jest 110 and server-stream tests 3 PASS; both mobile exports PASS. Generated types were refreshed after an initial typecheck caught the missing new RPC signature. This fixes rendering without restoring raw discovery access. Commit: `5c0fbcb` — `fix: preserve authorized shared contact rendering`.

## Phase 19 — offline resilience

Phase: 19
Status: implemented and locally verified; physical lifecycle acceptance pending
Implemented: bounded native SecureStore text outbox, durable-before-composer-clear sequencing, stable draft/client IDs, current account/session binding, serial delivery, same-conversation ordering, backoff/manual retry, truthful pending removal and cached-content visibility during reconnect errors.
Files: outbox engine/platform storage binding/root lifecycle hook; message composer/pending projection; current-session repository projection and copy; unit/real-backend tests/CI; OFFLINE and required checkpoint docs.
Database migrations: none. Existing PostgreSQL sender/client UUID uniqueness and authorization remain authoritative.
Security impact: no plaintext persistence or authorization bypass; queued text cannot replay into a new login or another account. Ambiguous local writes require exact readback or block writes until reload. Late/wrong acknowledgments cannot remove/repopulate unrelated messages. No E2EE claim.
Tests: TypeScript/lint/format/source/env PASS; Jest 21 suites / 122 tests PASS, including 12 outbox interruption/concurrency/identity/capacity cases; server-stream tests 3 PASS. Offline integration 1 PASS with actual committed-message replay and Auth-session change; device regression 1 and messaging/reconnect regression 1 PASS; pgTAP 57 PASS. A mock's widened status literal initially failed strict TypeScript and was corrected. No tests or strict checks were disabled.
Native checks: existing modules only. Doctor 21/21, dependency compatibility and both mobile JavaScript exports PASS; history/source/bundle secret scans zero findings. Native SecureStore durability, supported Xcode build/boot and physical airplane-mode tests remain pending.
Supplementary browser QA: two real local OTP users; disabled networking, queued two text messages and independently verified zero committed copies. The peer sent a reply during the outage. Reconnect committed the pending texts exactly once and in order, fetched the missed reply and recovered read state. Pending/reconnected 390×844 screenshots inspected. Both browser error logs and the sender console were empty. This is not physical-device airplane-mode QA.
Known limitations: outbox capacity is 20 messages/24,000 Unicode characters including metadata; full history is memory-only, cold-start Auth needs connectivity and large media transfers are not durably queued across process death. Old encrypted snapshots can require later cleanup after a storage failure, but new-session replay is denied. Native/cloud/load acceptance remains pending.
Commit: `2a8cbe5` — `feat: improve mnelo offline resilience`.

## Phase 20 — performance

Phase: 20
Status: implemented and locally verified; native profiling pending
Implemented: conditional message enrichment, indexed client-side joins, memoized message rows/data, reduced message render window, coalesced Realtime refresh with a follow-up for in-flight events, event-driven outbox scheduling, bounded acknowledgment projection and on-demand voice loading with fresh private access.
Files: chat repository/message-page adapter, chat presentation/audio/outbox, query hook/refresh utility, tests/CI/scripts and PERFORMANCE/checkpoint documentation.
Database migrations: none; existing message cursor index and authorization retained.
Security impact: no weaker RLS, public media URLs or plaintext history cache. No voice download on mount; delayed access cannot start playback after backgrounding. All pending entries are retained independently of the 40-acknowledgment UI bound.
Tests: TypeScript/lint/format/source/env PASS; Jest 23 suites / 126 tests PASS; server-stream 3 PASS. Performance integration 1 PASS against 2,000 local messages: five 40-message pages, no tied-timestamp duplicates, exactly 3 requests per text page (previous adapter made 6), 5 for contact/location mixed content; reaction/read/contact/location projections and block denial verified. Local median 9.1 ms, max 11.4 ms over 5 page reads, not a production benchmark. Offline 1, media 1, messaging 1 and groups 1 regressions PASS; pgTAP 57 PASS. Strict checks caught explicit-undefined prop types, unchecked benchmark array entries and import order; corrected without disabling checks.
Native checks: Doctor 21/21 with documented CocoaPods PATH/RUBYOPT, compatibility and both mobile exports PASS; redacted history/source/bundle scans zero findings. Initial Doctor without the CocoaPods environment failed its tooling check; that failed run is retained. No native timing/frame-rate or physical playback claim.
Supplementary browser QA: actual two-user local message delivery/read state, event-driven send and stored AAC playback elapsed-time progression at 390×844. Screenshot inspected, browser errors/console empty. Audio fixture was uploaded through the authenticated local API; this does not claim browser/native recording or file-picker PASS.
Known limitations: loaded cursor pages are revalidated on reconnect/updates for correct deletions/reactions/read state; deeply scrolled active histories therefore cost more than one page. Idle cache expires after five minutes; no automatic full-history fetch. Native list fill rate, cold startup, low-memory and hardware audio profiling remain device gates. Backend benchmark is a small loopback fixture, not capacity certification.
Commit: `830148b` — `perf: optimize mnelo mobile performance`.

## Phase 21 — accessibility

Phase: 21
Status: implemented and locally verified; native assistive-technology acceptance pending
Implemented: visible keyboard focus, linked input error/guidance, contrast-safe control borders and pressed states, named scrollable action sheets/escape, live Reduce Motion, scalable tab layout, real 48-pixel tab hit areas, inactive-tab focus isolation and conversation/action labels including message context and unread state.
Files: shared UI/focus/sheet/tab wrappers and motion hook; tabs/root, country picker, chat/group/profile controls and dictionary/tokens; axe helper/dev dependency and seven new unit cases; ACCESSIBILITY/checkpoint documentation.
Database migrations: none.
Security impact: no authorization or data changes; inactive tabs cannot expose actionable hidden controls through keyboard traversal. Accessibility speech contains the same authorized content shown on screen; diagnostics do not export tokens or app state.
Tests: TypeScript/lint/format/source/env PASS; Jest 25 suites / 133 tests PASS; server-stream 3 PASS. Seven added cases cover field guidance/error, focus/disabled state, choices, live motion, sheets, contrast and preserved-but-inaccessible inactive tabs. Axe Core 4.13.0 actual browser WCAG A/AA checks on phone error/country/Chats/chat/actions/Connect/Me/privacy report zero violations; final Connect/Me/phone/country/privacy have no incomplete checks. Remaining glyph-only contrast review uses the tested accent/background tokens. Earlier inactive-tab focus/overlap review exposed seven hidden tab stops; fixed, then measured zero. Initial duplicate JSX attribute, subscription mock type and unused import failures were corrected; no checks were disabled.
Native checks: Doctor 21/21 with documented CocoaPods environment, compatibility and both mobile exports PASS; history/source/bundle scans zero findings. No VoiceOver, TalkBack, native Dynamic Type or switch hit-area device PASS.
Supplementary browser QA: 320×568, 390×844 and 768×1024 layouts inspected; narrow action-sheet controls enlarged to 200%, Cancel remained scroll/focus reachable and Escape dismissed. Keyboard Enter activates Me; input invalid state references the actual error node. The tab target measured 32 pixels with old padding; final fresh load measures all three at 48 pixels. No horizontal page overflow at 320; long content remains scrollable. Browser error log empty. A development Expo CLI/client synchronization warning occurred during hot updates; fresh reload restored the final configuration. Normal React development info is not a runtime failure.
Known limitations: browser axe/layout results do not certify native screen-reader focus/rotors, hardware keyboards, largest OS fonts or physical touch precision. Default native switches retain their OS behavior with enlarged hit slop; device checks remain required. No accessibility conformance or production-readiness claim.
Commit: `591001b` — `feat: improve mnelo accessibility`.

## Phase 22 — English and Georgian

Phase: 22
Status: implemented and locally verified; native language/permission QA pending
Implemented: complete explicit Georgian copy, persisted device preference, localized push presentation, country/date/number formatting, canonical interpretation labels and local-midnight availability. Central source guard rejects inline UI copy. Native language and permission resources generated.
Files: i18n dictionaries/formatters/CLDR subset/native resources; preference storage/lifecycle; affected shared UI, country picker, dates and device/profile adapters; migrations/types, tests/CI and LOCALIZATION/checkpoint docs.
Database migrations: `20260908006100_device_notification_locale.sql`, `20260908006200_availability_local_day.sql`.
Security impact: locale is a two-value presentation preference per live session; raw devices/tokens and dispatcher remain inaccessible. Push copy stays generic with only an opaque notification ID. No user content translation, exact location inference or change to private Auth storage. Availability accepts a validated IANA zone and computes the next local midnight server-side.
Tests: TypeScript/lint/format/source/env/localization guard PASS; Jest 26 suites / 138 tests PASS; server-stream 3 PASS; localization integration 1, notifications 2 and profiles 2 PASS; pgTAP 57 PASS; database lint no errors; nine Edge checks PASS. Locale test covers separate real sessions and English/Georgian captured provider requests, invalid/client access, and three exact local-midnight zones. It does not claim real Expo delivery. Initial short fake-token validation and empty-queue assumption failed; corrected fixture and bounded batch processing passed. Performance fixture now cleans up its own reserved accounts. An unused variable was removed without relaxing lint.
Native checks: clean iOS/Android prebuild PASS; CocoaPods 125 dependencies / 128 pods PASS with existing Ruby source-fallback warnings. Generated en/ka InfoPlist.strings, CFBundleLocalizations and Android locales_config/resources checked. Doctor 21/21, compatibility, both mobile JS exports and history/source/bundle secret scans PASS. Xcode/native boot/device gates remain pending.
Supplementary browser QA: Georgian Account, Me/navigation, Connect and real interpretation; 320×568, 390×844 and 768×1024 screenshots inspected. Account, small Connect, interpretation and invalid-phone axe runs have zero violations/incomplete checks. Language persists through fresh reload and document language is ka. Browser initially lacked Georgian ICU and displayed an English month; a pinned licensed CLDR subset fixes dates, numbers and all supported phone-country labels, with a regression test. Final interpretation shows 8 სექ. 2026 and preserves raw Georgian text. This is not native Georgian glyph/VoiceOver or OS permission-dialog QA.
Known limitations: owner/native-speaker editorial review and physical Georgian font/keyboard/permission checks remain release gates. In-app choice does not control the OS permission-dialog language. User-written content, brand/protocol identifiers and client-reported device metadata remain unchanged. English defaults until preference restoration. No production-readiness claim.
Commit: `570a3db194384eb27d2e07d6c5b5a2a99ec77d75` — `feat: add mnelo localization`.

## Phase 23 — iPhone preflight

Phase: 23
Status: external native/device acceptance blocked; independent engineering continues
Implemented: repeated current-host and Expo authentication preflight; updated exact owner path and physical acceptance checklist.
Files: IPHONE_DEVELOPMENT, BUILD_LOG, EXECUTION and this report.
Database migrations: none.
Security impact: no signing material exposed, external identity created, Apple team guessed or account authentication attempted.
Tests: EAS CLI 23.2.0 whoami reports Not logged in. npm run preios exits 1 with IOS_TOOLCHAIN_UNSUPPORTED. These are actual failing prerequisites, not passing builds.
Native checks: selected /Applications/Xcode.app/Contents/Developer, Xcode 26.2 (17C52), Swift 6.2.3; paired iPhone 17 Pro Max now unavailable according to devicectl. Existing fresh clean compile exit 65 remains documented. No native app installed or physical flow verified.
Known limitations: owner must install/finish first launch of supported stable Xcode 26.4+ for the local path; alternatively EAS login is the first cloud action. Device must later be connected/unlocked and signing verified. Local backend/LiveKit loopback endpoints are not physical-phone reachable. APNs, CallKit/background lifecycle, hardware media and full checklist remain unverified; no iPhone PASS.
Commit: `754959e` — `chore: record iphone validation prerequisites`.

## Phase 24 — Android native development

Phase: 24
Status: native development APK build and core emulator verification complete; physical/full E2E gates remain
Implemented: isolated reproducible Java/SDK scripts, real ARM64 development APK, emulator boot/install, temporary identity assets and fixes from native layout/auth/media QA.
Files: app config/assets, Android setup/build helpers and guide; shared safe-area/keyboard/tabs, country CLDR formatter, permission copy, phone glyph and empty-caption rendering; localization regression and checkpoint docs.
Database migrations: none.
Security impact: development ports remain loopback via explicit adb reverse; debug signing only; no external app identity, account or production credential created. Private media and session enforcement unchanged. Denied camera/location permission now gives localized recovery guidance. Synthetic camera and reserved test accounts only.
Tests: final shared check PASS: TypeScript, lint, formatting, security/env/localization guards, Jest 26 suites / 139 tests and server-stream 3 tests. Added Hermes country-name regression covers all supported phone countries with Intl.DisplayNames absent. Doctor 21/21 and dependency compatibility PASS. Both mobile JS exports and history/source/bundle Gitleaks scans PASS. Android helper bootstrap rerun PASS. Git diff whitespace check PASS. Database queries confirm exactly one committed row for all four new text fixtures, including process-stop retry. An ad-hoc verification script first failed because CJS disallowed top-level await; renaming that ignored helper to .mts resolved it.
Native checks: actual :app:assembleDebug first failed on missing splashscreen_logo; corrected authoritative splash image config, regenerated, then built successfully. Final APK 105,374,301 bytes, SHA-256 `4f2e0a23edfab55432061140aba9c7f250ad4733e1fba923485b713ebb0bc3f4`, debug signed ARM64 Development Client. Signature/zip alignment and 25/25 native ELF alignment checks PASS. AOSP API 36 emulator actually booted, installed and rendered Mnelo; local OTP, keyboard send, two-user delivery/unread/read/reply, camera denial/capture/private photo, system document picker/private file, microphone denial, Devices, native Auth/outbox restore, reconnect/missed reply and Georgian persistence/layout exercised. Current native process log: zero fatal exceptions, ReactNativeJS errors or warnings. Detailed commands, failed runs and build timings in BUILD_LOG.
Supplementary QA: native 1080×2400 and 840×1680 with system font scale 2; fixed nav overlap, hidden composer, Hermes country names, colored phone emoji and Georgian tab truncation. Large text remains scrollable and full two-line tab visible; settings restored. Browser peer received photo/file and text; empty-caption View warning fixed and reopened conversation console empty.
Known limitations: virtual Ethernet survives emulator airplane mode, so the verified outage removed the API tunnel. This is not physical airplane-mode QA. Headless emulator audio was disabled and camera synthetic. No physical Android, audible/native recording/call quality, FCM delivery, TalkBack, 16-KiB runtime page test or OEM background/killed-app QA claimed. Native call/location/contact/notification flows continue in final E2E QA. Xcode 26.2 still blocks iOS; no iOS build/boot PASS. APK is development-only, not a signed production AAB.
Commit: `6b41b69` — `fix: complete android device compatibility`.

## Phase 25 — dependency security audit

Phase: 25
Status: audit complete; residual runtime release gate explicitly retained
Implemented: full per-entry npm disposition, resolved Deno server audit, installed caller/bundle inspection and external native launch-only mitigation using official Router hook.
Files: app/+native-intent.tsx, native-intent and route-classification tests, DEPENDENCY_AUDIT and machine-readable evidence; architecture/security/UX/checkpoint docs.
Database migrations: none.
Security impact: no external path/query reaches the known Router decoder through the new hook. No package force fix, SDK downgrade, unsafe major override or advisory suppression. Thirteen UUID tooling entries are accepted with controlled build inputs; three runtime decoder entries remain a public-release gate until full native validation/upstream remediation.
Tests: npm audit reports 16 moderate, zero high/critical, from two underlying advisories; non-breaking fix dry run changed zero packages. Deno 2.9.6 audit of server lockfile reports no known vulnerabilities. TypeScript/lint/format/source/env/localization PASS; Jest 27 suites / 144 tests PASS; server-stream 3 PASS. Five new cases exercise the installed Router cold sync/promise and warm event handling for iOS/Android plus malformed/private/oversized input. Initial tests used a matcher absent from Jest 29 and an incomplete event-subscription mock; corrected to supported assertions and an actual subscription. The route guard initially classified +native-intent as a screen; updated only the root framework module exclusion, matching installed Expo getRoutesCore. All feature-route guards remain enforced.
Native checks: real 6,178-byte malformed warm Android intent returned to Chats, with a subsequent tab interaction; cold custom-scheme launch opened the Development Client launcher and did not test app JS. iOS cold/warm not run. Both mobile JavaScript exports and Gitleaks history/source/bundle scans PASS. Existing compiled APK remains available; no new native dependency or generated-code patch.
Known limitations: mitigation does not remove dependency audit findings. Standalone Android cold launch and supported iOS cold/warm checks remain pending; controlled internal testing only. Browser hook is native-only and the local messenger preview must not be publicly deployed. Deno audit does not certify OS/container/CocoaPods packages. SDK-preserving upstream remediation must be revisited before release.
Commit: `d26e911` — `security: audit dependencies and constrain native links`.

## Phase 26 — complete automated QA

Phase: 26
Status: all available application/backend automated gates pass; iOS compilation and physical/cloud gates remain external
Implemented: one sequential integration runner with per-suite exit codes/logs/counts, generated-schema drift verification, CI wiring for both and server dependency audit, refreshed current README.
Files: scripts/qa-local.mjs, scripts/check-db-types.mjs, package.json, CI, messaging integration test, README and testing/checkpoint docs.
Database migrations: no new migration; all 62 replayed successfully twice from an empty local database. A private ignored local database snapshot was retained before reset; no cloud data touched.
Security impact: no RLS, test denial or strict setting weakened. Local-only runner/type generation use guarded container configuration. Logs stay ignored; no credentials printed or committed.
Tests: final TypeScript/lint/format, source/env/localization guards PASS; Jest 27 suites / 144 tests and server-stream 3 tests PASS. All 19 integration suites / 22 scenarios PASS after the second clean reset. pgTAP 57 PASS; database lint no errors; nine Edge Functions typecheck PASS; regenerated types match exactly. Doctor 21/21, dependency compatibility, iOS/Android JavaScript exports and history/source/bundle Gitleaks scans PASS. npm audit: 16 moderate, zero high/critical; Deno audit: no known vulnerabilities. npm audit exits 1 for these retained moderate advisories, not a clean audit claim. Initial complete run exposed a messaging test sending after socket join but before PostgreSQL registration. Reusing the real registration readiness helper fixed it; isolated rerun and final clean-reset full suite both pass. Initial types comparison omitted formatting because artifacts are ignored; normalized comparison and committed drift command both pass with no type-source change.
Native checks: current iOS preflight exits 1, IOS_TOOLCHAIN_UNSUPPORTED on Xcode 26.2; existing clean native compile exit 65 remains unresolved locally. Actual Phase 24 Android development APK/build/boot evidence retained; no new native binary built in this phase. Standalone final Android artifact follows Phase 30.
Known limitations: remote CI has not run. Local integration, browser and emulator results do not certify physical push/calls, iOS, cloud Auth/SMS, production workers or load. Runtime decoder mitigation still has native cold/iOS release gates. No store-readiness claim.
Commit: `49d4c98` — `test: validate mnelo v1 automated quality gates`.

## Phase 27 — end-to-end product QA

Phase: 27
Status: available local/native E2E exercised; physical iPhone/cloud delivery gates remain
Implemented: guarded repeatable development seed, native permission error classification and incomplete-track denial, retained recording duration before native reset, lazy voice duration, abandoned app-cache media cleanup, GPS-capable explicit location share and contact invitation copy cleanup.
Files: seed script/package command, seven chat/call runtime components/helpers, four native media test files, END_TO_END_QA and build/testing/checkpoint documentation.
Database migrations: none. Only reserved development fixtures changed; Mariam was actually deleted by the account worker.
Security impact: denied microphone/video constraints cannot start partial calls; app-owned cache cleanup excludes user document/content URIs. Exact GPS is acquired only on an explicit foreground conversation action and shared only with authorized members. No privacy/RLS or rate-limit weakening; production seed probe refuses execution.
Tests: strict TypeScript, lint, formatting and source/env/localization guards; 155 Jest tests / 30 suites, three server-stream tests, 13 focused native media cases and one real media integration scenario passed. Doctor 21/21 after applying the documented installed CocoaPods environment; compatibility, mobile exports and history/source/bundle secret scans passed. Initial default-shell Doctor reported CocoaPods unavailable; retained as a failed run, then corrected environment. Prior Phase 26 all 19 integration suites / 22 scenarios, 57 pgTAP tests and 62 clean migration replay remain the full backend baseline. No new database behavior introduced.
Native checks: real local OTP on Android; native Connect interpretation/ranked evidence/request/accept; hidden phone; two-user text/read state; actual private 66-second voice delivery/playback; contact; explicit GPS point sent/received; permission denial and fixed native call guidance; device listing/other-session logout; blocked inbox and username discovery. Actual LiveKit voice/video connected with two ACTIVE publishers, remote native-camera frames, mute/speaker/camera switch/toggle, decline/end/room cleanup, and voice background/foreground recovery. Browser logout/relogin and real account deletion completed. Detailed A–G coverage and evidence in END_TO_END_QA; Phase 24 camera/file/reconnect/process-stop checks and Phase 26 negative tests supplement this run.
Known limitations: synthetic headless Android audio/video, no audible hardware quality, physical Android/iPhone, APNs/FCM/SMS, killed-app incoming-call or native screen-reader claim. LiveKit ping/ICE/closed-peer warnings during background/end were observed; recovery worked in the tested voice case. AOSP GPS provider was unavailable; Google image plus GPS request resolved explicit location. iOS exit 65 remains blocked by unsupported Xcode. No production-readiness claim.
Commit: `ea415ff` — `test: verify mnelo end-to-end product flows`.

## Phase 28 — release environment configuration

Phase: 28
Status: prepared and guarded; no cloud environment created or deployment claimed
Implemented: build-only public environment registration, independent Supabase origin enforcement, EAS project match and clear development/preview/production flow. Unconfigured development clients remain buildable before backend authorization.
Files: config/release-environments.json, config/release-environment.ts, app.config.ts, scripts/check-env.ts, .env.example, release/environment tests and documentation.
Database migrations: none.
Security impact: preview/production cannot build against an unregistered or mismatched backend/project; registered environments cannot share a backend origin. Registry contains no key and all actual registrations remain null. Local test settings/OTP are prohibited from cloud configuration. No native identifier/signing/account change.
Tests: TypeScript/lint/format/source/env/localization PASS; 162 Jest tests / 31 suites and three server-stream tests PASS. Seven new release-isolation cases pass. Actual config probes reject unregistered production and profile mismatch with exit 1 and their expected stable codes; unconfigured development config exits 0. Actual local Expo config evaluation, compatibility and Doctor 21/21 PASS.
Native checks: local config still resolves Mnelo/com.mnelo.app; no native dependency changed or binary built in this phase. Android development APK and Phase 27 boot evidence remain; iOS compiler gate unchanged.
Known limitations: null registry means cloud preview/production are intentionally blocked. Actual EAS/Supabase authorization, correct project registration, SMS/LiveKit/push/workers and signing still require external setup. A public registry is not proof of cloud service settings.
Commit: `f471de5` — `chore: guard mnelo release environments`.

## Phase 29 — store readiness preparation

Phase: 29
Status: engineering checklists prepared; submission is blocked by explicit owner/service/device gates
Implemented: Apple/Google metadata and permission/data inventory, account-deletion/UGC/privacy/age-rating/reviewer/screenshot checklists, null legal/live URL placeholders and removal of unused Face ID purpose text.
Files: STORE_READINESS.md, docs/store/metadata.json, app.config.ts and checkpoint/release docs.
Database migrations: none.
Security impact: no legal answer, contract, signing credential, age rating or live policy is invented. Generated iOS config no longer suggests unused biometric access. Real collected/shared exact-location attachments and server-readable messages are explicitly disclosed in the engineering inventory; no E2EE claim.
Tests: TypeScript/lint/format/source/env/localization PASS; 162 Jest / 31 suites and three server-stream tests PASS. Official current Apple/Google policy pages reviewed and linked. Native permission inventory assertion confirms five actual required iOS descriptions and absence of NSFaceIDUsageDescription.
Native checks: incremental iOS CNG prebuild without install PASS. This is configuration generation, not compilation or device QA. Local Xcode blocker and signing gates unchanged.
Known limitations: final legal policy/terms/support/deletion website, age/content rating, export/privacy declarations, provider settings, UGC filtering/response operations, final artwork and store review access require owner/operational completion. No store app created or submitted.
Commit: `45d75b3` — `chore: prepare mnelo store readiness`.

## Phase 30 — final artifacts and external handoff

Phase: 30
Status: final local Android development/standalone artifacts verified; iOS/cloud/physical acceptance remains externally incomplete
Implemented: local-only standalone diagnostic helper, CNG loopback-only network policy, optimized local build test notice/phone flow, current native stack inventory, final release report and safe integration plan for the existing website. Current architecture/data/RLS/UX summaries now distinguish implemented services from historical phase notes.
Files: app.config.ts, plugins/with-local-network.cjs, scripts/android.mjs, package.json, shared Page/auth screens, two notice tests, docs/audits/phase-30/installed-stack.json, README and final architecture/security/data/RLS/UX/testing/build/release/audit/web/checkpoint documentation.
Database migrations: none; all 62 migrations and local backend data preserved.
Security impact: hosted builds deny the local cleartext resource; actual compiled local policy allows only loopback. Local diagnostic helper rejects production. Reserved local test identities stay bound to local configuration and never become hosted Auth bypasses. No credentials/signing/cloud resources changed. Existing website and backend remain untouched.
Tests: final application check PASS: strict TypeScript, lint, formatting, source/environment/localization guards, 164 Jest tests / 32 suites and three server-stream tests. Two optimized-local/hosted notice regressions pass. Edge nine-entrypoint typecheck, database type drift and database lint PASS (zero errors). Doctor 21/21 and Expo dependency compatibility PASS. iOS/Android JS exports and redacted history/source/bundle scans PASS, zero findings. Actual embedded Android diagnostic bundle/strings also scan with zero findings. npm audit retains 16 moderate / zero high/critical; Deno audit zero known vulnerabilities. The full unchanged backend baseline remains Phase 26: 19 suites / 22 real scenarios, 57 pgTAP assertions and 62 migrations replayed twice. Final direct/native installed inventory matches the lockfile.
Native checks: final assembleRelease diagnostic PASS 6m46s / 904 tasks; assembleDebug Development Client PASS 3m44s / 533 tasks. Both APK signatures/ZIP alignment pass; diagnostic 24/24 native ELF LOAD alignment >=16 KiB. Standalone Mnelo boot, actual local OTP and Auth process-restart restore without Metro PASS. Cold and warm 6,153-byte malformed native URI recovery PASS; warm process survived. Fresh Development Client installation, Auth restore, Chats/Me and viewed native screenshot PASS. Captured standalone/development process logs have zero fatal/React Native error lines. iOS config prebuild/permission inventory passed in Phase 29; actual iOS compile remains failed exit 65 / unsupported Xcode 26.2. No iPhone/IPA/cloud preview/production AAB PASS.
Known limitations: EAS login pending; isolated cloud backend creation/plan authorization unavailable; real SMS/push/LiveKit cloud, signing, physical hardware/background/screen-reader/16-KiB runtime QA, final website/legal/store operations remain open. Both APKs are debug-signed local ARM64 builds. Initial disk preflights failed before compile; only task-generated caches/AVD/Pods outputs were removed with artifacts/locks/backend retained, then builds/boot succeeded. Upstream deprecation and earlier call transport warnings remain documented. No SDK version changed, native generated-code hack, force upgrade, store submission or paid action occurred. Release recommendation: NOT READY.
Commit: `964bf8f6c537b28d6ecf315dfe2bccb1fe1ba5a1` — `chore: produce mnelo development build artifacts`.

## September 9 — native toolchain and cross-platform continuation

Phase: 23 / 30 native validation follow-up; Phase 0.1 compiler comparison completed.
Status: local iOS compiler/simulator gate resolved; current-lock Android artifacts revalidated; physical iPhone and hosted distribution remain open.
Implemented: verified owner's Xcode 26.6; installed official iOS 26.5 runtime and repaired its single unusable duplicate registration with the asset/data preserved; reproduced successful compilation of the original JSI framework; built, signed locally and booted iOS Development Client and embedded simulator diagnostic; rebuilt both Android APKs against the same maintenance source; corrected the former mandatory-EAS-login handoff. No product screen/business-logic/database change. Temporary layout probe reverted completely.
Files: README; BUILD_LOG, EXECUTION, IPHONE_DEVELOPMENT, ANDROID_DEVELOPMENT, RELEASE, RELEASE_REPORT, DEPENDENCY_AUDIT, END_TO_END_QA, CALLS, TESTING and this QA report; redacted compiler/native/installed inventory under docs/audits/ios-26.6.
Database migrations: none. Local database/seed history preserved; a development-only Connect request was exercised through the app.
Security impact: normal simulator signing resolves actual missing Keychain entitlement (-34018); no insecure storage fallback. Current iOS standalone cold/warm malformed native inputs passed with Metro stopped, responsive Me/Connect interactions and preserved warm process. Android current-binary cold/warm dispatch/rendering also passed after a clean OS boot; its post-link tap regression was not rerun. No credential export, other-app mutation, EAS/Apple registration, cloud project or public backend exposure. One extra CLI-created IPv6 Metro listener was removed; the restored listener is IPv4 loopback only. Runtime/OS warnings and initial failures are retained.
Tests: npm run check PASS: strict TypeScript/lint/format/source/env/localization, 164 Jest tests / 32 suites and three server-stream tests. Expo Doctor 21/21 and compatibility PASS. Both mobile exports PASS. Gitleaks history/source/exports and actual iOS/Android embedded bundles/strings: zero findings. npm audit: 16 moderate / zero high/critical, same two advisories. Exact installed inventory: 68 direct / 48 native package entries verified against their lockfile paths. Unchanged backend baseline remains Phase 26: 19 integration suites / 22 scenarios, 57 pgTAP assertions and 62 migrations replayed twice; it was not needlessly reset/rerun for this native/documentation checkpoint.
Native checks: original JSI 57.0.8 framework PASS (18 seconds). Full iOS unsigned diagnostic compile PASS (837.79 seconds), but runtime FAIL Keychain -34018; normal ad-hoc signing rebuild PASS (44.56 seconds) and actual native Auth/restore/profile/Connect checks PASS. iOS standalone compile PASS (450.93 seconds wall) and cold/warm native input plus post-input interactions PASS without Metro. iOS warning counts 955 / 519 / 1,032, zero compiler errors on those successful builds. Android diagnostic PASS (869.55 seconds / 904 tasks), development PASS (647.38 seconds / 533 tasks); signatures, ZIP alignment and all 24 native ELF alignments PASS. Initial Android System UI and other OS-service ANRs predated Mnelo launch; first launch timed out and was not counted as PASS. Rebooting the preserved AVD alone after compilation removed those events; both current APKs then rendered authenticated Chats. No physical phone or store-distribution artifact PASS.
Known limitations: paired iPhone is disconnected although Developer Mode is enabled; Xcode shows an existing Admin team but Mnelo-specific provisioning is unverified and provisioned-device lookup fails. Expo/EAS cloud build is optional for local compilation; the chosen Expo Push/hosted registry still needs real project/provider setup. The phone cannot use Mac loopback backend URLs without an authorized secure reachable development backend. Full iOS media/call/accessibility/physical flows, cloud SMS/push/LiveKit, store/legal/website and final distribution regressions remain open. No new Android toolchain installed. No SDK major change, force upgrade, generated native-code hack, warning suppression or release submission. Recommendation remains NOT READY for release.
Commit: this checkpoint — `chore: validate native ios development environment`; the handoff records the resulting hash. Application build input is maintenance commit `14312ca`; this follow-up changes documentation/evidence only.

## September 9 — approved visual direction, shared presentation pass

Phase: Design refinement before physical testing.
Status: Shared UI implemented and checked; complete brand assets and final visual acceptance pending.
Implemented: Light/Acid Lime tokens, bundled Inter/Georgian typography, consistent control icons, three icon/label tabs, Connect hierarchy and CTAs, message colors, settings rows, dark call controls, accessible contrast and live Dynamic Type remeasurement. [Detailed scope and actual observations](DESIGN_QA.md).
Files: theme/font/appearance providers, shared components, auth/chats/connect/connections/profiles/calls presentation, package/lock, contrast tests, design and release documentation, font package notices.
Database migrations: None.
Security impact: No auth, RLS, service contracts, identifiers, native-intent behavior, credentials or cloud resources changed. Fonts are packaged local assets. Source/history/export scans report zero findings; npm retains the same 16 moderate package findings.
Tests: strict TypeScript, lint, formatting, 164 Jest tests / 32 suites, three server tests and source/environment/localization guards PASS; Doctor 21/21 and dependency compatibility PASS. Both mobile exports PASS.
Native checks: Xcode 26.6 Debug simulator build PASS, installed and rendered. Actual local OTP, invalid-code error, empty Chats, Connect/keyboard, English/Georgian settings, existing results/profile and request form inspected. Live enlarged-text reflow verified after fixing stale text measurements; complete large-text interaction signoff remains pending. No new Android APK or physical iPhone test in this pass.
Known limitations: The requested chat exposed its text but not the approved Light icon/leaf render. Temporary M asset remains; final vector/wordmark/icon/splash work and the full design QA matrix are open. Physical testing is deferred per owner instruction. Earlier archived native artifacts contain the pre-design interface.
Commit: `feat: apply mnelo light and lime visual system` (commit containing this entry).

## September 9 — approved visual identity and native artwork

Phase: Approved design implementation before physical-device testing.
Status: Brand/presentation implementation verified; final full visual/device acceptance remains open.
Implemented: Read all six Mnelo render boards and the final 102-section brief; reconstructed selected vector symbol/wordmark, generated fourteen asset pairs, integrated native launcher/splash/header/Welcome identity, removed placeholders, refined unread badges, chat avatar, send/voice controls, message/attachment sheets, call layout and post-send composer resizing.
Files: app config; assets/brand and reference provenance; shared brand/UI components; auth/chats/calls presentation; central tokens; export/check scripts and package lock; design/native/release/test/audit reports and verification metadata.
Database migrations: None. Service contracts, RLS and backend data unchanged.
Security impact: No identifier, external registration, signing credential, native-intent policy or private media authorization change. Development-only Sharp added; no existing installed dependency version changed. Reference pixels are excluded from production artwork. Temporary fixture environment removed; original local environment retained.
Tests: TypeScript/lint/format, 164 Jest tests / 32 suites, three server tests, security/env/localization guards and fourteen brand export checks PASS. Doctor 21/21, compatibility and final mobile exports PASS. Secret scans zero findings. Dependency audit unchanged at 16 moderate / zero high/critical. Active former-identity search zero. Existing backend integration/RLS baseline not rerun for this presentation change.
Native checks: iOS CNG/Pods PASS; Xcode 26.6 Debug build/signature/install/render PASS, zero compiler errors / 1,980 warning lines. Android ARM64 development APK build/signature/ZIP alignment/install/Welcome render PASS. Actual iOS Welcome, preview signup/profile, empty/populated Chats, Connect, mixed-language long messages, keyboard send/shrink, sheets/reply and installed app icon inspected. [Evidence and limits](DESIGN_QA.md).
Known limitations: Full media/call/state/small-screen/enlarged-text/assistive-technology matrix and physical devices remain open. Android window was absent from the supported native UI inventory, so only build/install/render is claimed here. Cloud, signing/distribution, legal/store and provider gates remain unchanged. Physical iPhone testing is deferred by the owner. Release remains NOT READY; the implemented identity is ready for design review.
Commit: `feat: implement approved mnelo visual identity` (commit containing this entry).

## Native visual QA and corrections — September 9, 2026

Phase: post-branding visual QA.
Status: native simulator defects corrected and verified; full physical/Android interaction matrix remains open.
Implemented: modal country-picker safe-area/empty-search fix; iOS Hermes Georgian number-format crash fix; resilient conversation names/Recent people; bounded media bubbles; compact/large-text layouts; centered profile identity; group/contact selected-state semantics; explicit empty search/contacts-permission recovery; frozen media selection/caption while uploading.
Files: shared UI/tokens, chats/media/voice/contact/recent services, Connect profile, localization/error type, regression tests and QA/build/testing evidence.
Database migrations: none.
Security impact: authorized inbox/profile reads remain bounded and RLS-controlled; no broader contact permission or address-book upload, no new native permissions/dependencies, no external credentials or projects. All interaction fixtures remained loopback-only.
Tests: TypeScript, ESLint, Prettier, source security/environment/localization and 14 brand exports PASS; **173 Jest tests / 34 suites**, **3 server tests** PASS. Expo Doctor 21/21; compatibility and iOS/Android exports PASS; secret scans zero findings.
Native checks: iPhone SE and iPhone 17 Pro on iOS 26.5, normal/enlarged text and English/Georgian; real local authentication/chat/media/Connect/request/review/call-signaling observations in DESIGN_QA. Xcode 26.6 incremental Debug build/signature PASS, 0 errors/3 warning lines. Android ARM64 Debug build PASS in 26s, 533 tasks; signature/ZIP alignment PASS, actual restored populated inbox rendered.
Known limitations: backend baseline not relabelled as rerun; no physical device, complete interactive Android, manual VoiceOver/TalkBack, real two-device audio/video or push delivery PASS. Native controller cannot address the running Android emulator. Release remains NOT READY for the existing documented external/device gates.
Commit: containing commit — `fix: resolve native visual qa regressions`; predecessor `4ff7f2dfcffb95247e7c68a0b9eb04ee8cc62b69`.

Detailed scope, before/after evidence and remaining acceptance: [DESIGN_QA](DESIGN_QA.md), [manifest](audits/design/visual-qa-verification.json).

Supplementary native observations in this pass: new reserved-user signup (invalid OTP, identity validation, country search/safe area, capability Skip, empty inbox), empty Requests/Needs, real completed-connection history, system file picker Cancel, and disposable account Processing → Deleted → Continue. Guarded local Auth verification confirmed the disposable account removed and the primary account retained. The country-picker before/after and final screens are retained in the evidence manifest.
