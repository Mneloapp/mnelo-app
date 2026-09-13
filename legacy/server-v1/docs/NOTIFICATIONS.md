# Mnelo notifications

Mnelo is the official product name. Push is opt-in per device, with account-wide message, connection-request/acceptance, relevant-match and incoming-call preferences. There are no engagement notifications. System text is generic; private messages, people’s names, phone numbers and locations never enter the push payload. The only custom data is an opaque notification ID.

## Registration and access

`expo-notifications@57.0.17`, `expo-device@57.0.1` and the config plugin support development/release builds. EAS project ID comes from validated app configuration. Android channel creation precedes the permission prompt. Registration is an explicit Me → Notifications action. Already-granted permission is refreshed on foreground, throttled to five minutes, and native token rotation triggers re-registration. Web layout QA does not register mobile tokens. The foreground app uses Realtime updates instead of duplicate banners.

A device is bound to the verified JWT session ID and an existing unexpired `auth.sessions` row. Revoked devices cannot re-register. A client cannot supply another actor/session or read any `push_tokens` row, even its own. Registration is limited to 20/hour; device refresh and preferences to 60/hour. Same-token refresh is idempotent; token rotation invalidates stale queued deliveries. A token cannot be taken from another live account. Token possession alone is not independent device attestation; generic payloads and server-side destination authorization reduce the consequences. Enhanced Expo push security must be enabled before external testing.

Notification taps are resolved by `resolve_notification` for the current authenticated owner and current access. Arbitrary routes/URLs from a payload are ignored. An old-account notification cannot navigate to that account’s content after account switching. Blocked/revoked destinations cannot open cached private content.

## Queue and transport

Database triggers enqueue messages, requests, accepted requests, actual matching results and ringing call records transactionally. Matching refresh emits at most one event per owned request; no unsolicited background search or fabricated result notification. This initial matcher runs when a user evaluates a request. A private actor-scoped evidence helper supports server evaluation; client matching helpers still require the authenticated request owner.

Each outbox event is unique per recipient/type/entity. The server snapshots eligible registered tokens into private delivery rows. Claiming uses row locks, SKIP LOCKED, 50-row batches and two-minute leases. Five HTTP requests run concurrently. Membership, blocks, message read/deletion state, preferences, token version and live Auth session are checked at claim and again before transport. Messages use the same `(timestamp, UUID)` read cursor as the chat. Calls expire at their ringing deadline; other events expire within a day and matches within their recorded evidence lifetime.

Transient HTTP errors use bounded exponential retry (eight attempts); successful tickets are polled after 15 minutes. Receipt failures never imply device delivery. `provider_received` means APNs/FCM accepted the handoff, not that a human or device received it. An unregistered-token receipt disables only the version that was sent; it cannot disable a replacement token. Missing receipts expire after the bounded retry window. Transport and process failures may produce a duplicate because Expo delivery is at least once; neither this queue nor receipts are claimed to be exactly once. Already submitted pushes cannot be recalled after a block or logout.

The Edge endpoint accepts only server authorization, requires a server `EXPO_ACCESS_TOKEN`, exposes redacted errors/counts, and has no mock-success fallback. Integration tests inject an explicit local provider into the shared dispatcher and never call Expo/APNs/FCM.

## Deployment prerequisites

Migration 035 installs pg_cron/pg_net and creates **inactive** job `mnelo-push-dispatch`. No external request occurs with absent Vault configuration. The guarded function accepts only a hosted Supabase project origin. It does not accept a URL from the mobile client.

After cloud project authorization and deployment:

1. Link the intended Mnelo environment in EAS; set its real `EAS_PROJECT_ID`. Enable enhanced push security in the EAS dashboard. Store its Expo access token in Supabase Edge secrets as `EXPO_ACCESS_TOKEN`, never in app variables.
2. Deploy `push-dispatch`. In Supabase Vault, privately create `mnelo_push_project_url` (the same project’s HTTPS origin) and `mnelo_push_dispatch_authorization` (that project’s server service-role credential). Do not paste credentials into chat, migration files, SQL history or source. Use the dashboard’s protected secret inputs.
3. Configure APNs credentials for `com.mnelo.app` and FCM v1/Android Google services through EAS. Generate and install a new development build, grant notifications deliberately, and complete actual receipt/device tests.
4. Activate the existing job in Supabase Cron after configuration is verified. Its 10-second cadence supports the 60-second ringing window. Monitor redacted queue states, due-age, permanent provider failures and receipt timeouts. The scheduler invokes the function only when work is due.

There is no authenticated EAS project, APNs/FCM delivery validation or physical-iPhone notification PASS in this repository checkpoint. Full account/device revocation and retention continue in Phases 16–18. Standard push is not a substitute for CallKit/Android telecom integration or guaranteed background call wakeup; Phase 15 must state the actual call limitations.

## Evidence and sources

Phase 14 tests cover all five event categories, private token reads, wrong-device registration, live-token theft denial, duplicate claims, lease ownership, generic payloads, current blocks, category suppression, token rotation, session logout, stale-JWT registration denial, receipt handling and server endpoint denial. Explicit call-record fixtures test notification plumbing only; they are not real LiveKit calls. The 390×844 browser check verified persisted preferences and the truthful web registration state.

Implementation follows [Expo setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [Expo tickets/receipts and enhanced security](https://docs.expo.dev/push-notifications/sending-notifications/), [Supabase scheduled Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions) and [Supabase Cron](https://supabase.com/docs/guides/cron/quickstart), checked during this phase. Native artifacts remain local and ignored.

Migration 061 stores each verified device language. The server sends generic English/Georgian copy with the same opaque notification ID and current authorization. Captured-transport integration verifies both; no live-provider/device-delivery pass is claimed.
