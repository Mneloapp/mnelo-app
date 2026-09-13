# Mnelo security

**New release blocker, 2026-09-09:** the owner requires [no platform-persisted private communication, reviewed E2EE and optional user-owned encrypted backup](PRIVACY_ARCHITECTURE.md). Current access controls do not meet that requirement. E2EE is now required before release, rather than an optional future enhancement. No temporary ciphertext delivery queue or metadata-retention exception is approved.

Mnelo is the official product name. These controls are implemented locally, with the full Phase 26 security suite and subsequent native checks recorded in QA_REPORT.md. Cloud and physical-device release acceptance remain separate. The client is untrusted. No E2EE claim is made.

## Identity and private data

Supabase Auth verifies phone OTP and issues sessions. Native session material uses segmented OS SecureStore; the browser QA adapter is memory-only. Restore verifies both Auth identity and live session state. Logout is confirmed server-side before retryable credentials are discarded. Expired/revoked sessions cannot use private tables, RPCs, Edge operations or join private Realtime topics. See [AUTH](AUTH.md) and [DEVICES](DEVICES.md).

Every exposed application table has RLS, explicit grants and a restrictive live-session policy. Server functions derive identity from verified Auth and database membership. They do not accept client authority over roles, verification, rating, ownership or moderation. Definer functions set an empty search path. Private tables/helpers are absent from exposed API schemas. Table/function defaults deny new client authority. [RLS_MATRIX](RLS_MATRIX.md) and [SECURITY_TEST_MATRIX](SECURITY_TEST_MATRIX.md) document actual negative tests.

Raw profile/username/capability/language reads are owner-only; other profiles use bounded, rate-limited, privacy-checked projections. Phone is private in Auth and only revealed through explicit connection-only consent with a fresh check. Matching uses coarse areas and current, explainable evidence. Precise coordinates belong only to deliberately shared conversation messages; the matcher never reads them. Free text is user-authored and is not a geocoding guarantee. Relevant-only discoverability and hidden phone/location are the defaults.

Connections gate unknown-user messaging. Membership, blocks, request expiry/cooldown and current privacy are enforced server-side. Groups have bounded membership and server-managed administration. Blocks deny discovery, requests, new messaging and calls; active rooms are removed by the durable call worker. Shared groups suspend access when a blocked pair is present, as documented in [GROUPS](GROUPS.md). Reporters/evidence are private; clients cannot perform moderation. Reviews require appropriate mutually completed connections and cannot self-award reputation. Verification uses actual server records only.

## Storage, transport and privileged services

Avatars and chat media use private Storage buckets. Authenticated Edge processing reserves ownership, enforces size/MIME/container checks and strips JPEG metadata by decoding/re-encoding. Request streams have a byte ceiling and 30-second read deadline. Short-lived signed access is policy-checked; unsent media is owner-only. Generic files are untrusted and no deployed malware-scanning service is claimed. See [MEDIA](MEDIA.md).

Private Realtime topics verify current actor/membership. Messages persist before events; IDs and retries are idempotent. Push uses per-device session ownership, private leased jobs, current access/preference checks and generic payloads without private message/location text. LiveKit grants are short-lived, actor/room scoped and issued only after current authorization and consent. Privileged room creation/eviction and token signing stay server-side. See [NOTIFICATIONS](NOTIFICATIONS.md) and [CALLS](CALLS.md).

Account deletion freezes ordinary mutations, hides the profile, removes actual Storage files, terminates rooms, transfers group administration and deletes Auth. The app reports completion only through a durable random receipt after backend confirmation. Authored messages become empty tombstones; other people's content remains theirs. Retention, retries and limits are detailed in [ACCOUNT_LIFECYCLE](ACCOUNT_LIFECYCLE.md).

## Secrets and logging

Only explicit public configuration enters the mobile bundle. Server-role Supabase keys, LiveKit/SMS/provider secrets, Apple signing material and Expo credentials never belong in EXPO_PUBLIC variables, source or client state. Environment validation rejects privileged keys, malformed/credential-bearing URLs, nonlocal cleartext endpoints and preview/production misconfiguration. Local helpers target only the reserved local project and remove inherited cloud credentials. Local seed/OTP values cannot be used as a production authentication bypass.

Mobile source guards reject secret references and unreviewed logs/persistence. Error telemetry accepts a fixed code and discards arbitrary exception payloads; no telemetry vendor is configured. Edge responses use stable redacted errors and no-store headers. Do not log OTPs, tokens, private message bodies or precise locations. Native library diagnostics still require physical-device review.

`npm run scan:secrets` uses checksum-verified Gitleaks against Git history, a disposable snapshot of tracked/nonignored source and required iOS/Android bundles, with fully redacted reports. The source guard is complementary and neither scan proves absence of every encoded secret. Intentional ignored local server credential files are excluded from the source snapshot. No credentials are printed by the workflow.

## Abuse and deployment gates

[SECURITY_TEST_MATRIX](SECURITY_TEST_MATRIX.md) lists verified actor-scoped limits for search/discovery, messages, requests, reports, uploads, calls, Connect and matching. OTP throttling is enforced by Auth, not just UI timers. Transactional counters bound committed operations; failed transactions roll back their increments. These are not a claim of comprehensive DDoS protection. Cloud perimeter/cost controls, CAPTCHA, SMS billing/rate settings and real provider behavior must be validated before release. CORS is not authorization.

Cloud push/call/account cleanup schedules remain inactive until protected configuration and owner-authorized deployment exist. Worker failures and queue lag need production monitoring. Signed URLs can remain valid until expiry; previously copied/downloaded/forwarded data cannot be recalled. Production backup/legal retention and physical background-call behavior remain acceptance gates. [DEPENDENCY_AUDIT](DEPENDENCY_AUDIT.md) records the completed re-audit and remaining runtime decoder concern: Android standalone cold/warm mitigation checks passed; iOS validation is pending. No destructive force-fix was used.

## Required E2EE migration boundary

The existing implementation relies on TLS, authenticated access, RLS, private Storage/Realtime and OS SecureStore; Supabase's at-rest encryption is an infrastructure property to verify for the deployed service. This is not end-to-end encryption. The now-required independently reviewed E2EE design must introduce per-device identity keys, authenticated device enrollment, key change/revocation handling, encrypted message/media transport and group key management. Server-side plaintext search, previews, retention and moderation need deliberate redesign. The owner's relay requirement additionally rejects persisted ciphertext and private communication metadata; merely encrypting the existing database records would not comply. Do not add homemade cryptography or a cosmetic encryption flag. See [the authoritative decision](PRIVACY_ARCHITECTURE.md).

Phase 19 adds only bounded pending-text snapshots to OS SecureStore. Account/backend/session binding prevents replay after a new login, and late acknowledgments cannot repopulate a different account. The outbox confirms ambiguous writes by exact readback and otherwise stops writes until recovery. Storage is not E2EE; see OFFLINE.md.

Phase 22 adds checked per-session presentation language only; raw device/token and dispatcher access remain denied. Generic notifications contain no new personal data. IANA timezone input controls local-day expiry, not public exact location.

Phase 25: external native links are launch-only through +native-intent; all untrusted path/query data is discarded before the installed Router query decoder. Internal authorized navigation is separate. This mitigates a known dependency availability exposure without changing SDKs or overriding module formats. The dependency finding remains a public-release gate pending complete native cold/warm validation or compatible upstream remediation. See DEPENDENCY_AUDIT for all 16 entries and exact native test limits. The local browser preview is not a production web deployment.

Preview/production builds fail until their public origin/EAS UUID is registered in config/release-environments.json, and reject a different environment backend or shared origins. This guards accidental environment mixing; it does not replace server authorization or cloud operational verification.

The optimized local diagnostic Android build is explicitly labelled and cannot be built by its helper with a hosted app environment. Its CNG network policy permits cleartext only to localhost/127.0.0.1; hosted release configuration removes that exception. This does not expose local services to the LAN: adb reverse supplies the test tunnels. The local fixture phone allowance is bound to appEnv=local, not to a JavaScript development-mode flag, so an embedded diagnostic bundle remains honestly usable without creating a production test-account bypass.
