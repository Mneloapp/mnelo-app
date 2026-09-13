# Direct messaging

Text messages now persist in Supabase before Realtime delivery. Direct conversations are associated with an accepted connection; callers cannot insert arbitrary membership or bypass contextual requests. The Phase 5 browser fixture uses an explicitly local test connection; the real accept/request procedure is separately exercised by the two-user integration test.

`send_text_message` derives the sender from Auth, locks/rechecks membership and blocks, validates an optional same-conversation reply, rate limits new sends to 60/minute and uses a unique sender/client UUID for idempotency. Retrying an unchanged send returns the same row; reusing its UUID for a different payload or conversation fails. The client keeps pending/failed/acknowledged sends in an ephemeral memory queue and offers retry with the original UUID. Query reconciliation removes duplicates. Durable process-restart resilience follows Phase 19.

History is paginated in 40-row pages using PostgreSQL's exact timestamp text plus UUID tie-breaker. The app never converts a cursor through a millisecond Date representation. Conversation summaries use 30-row pages. Virtualized lists request older pages near the end and deduplicate IDs across refetches. Summaries expose bounded previews and authorized unread counts. A server-checked read cursor advances only through an actual message in that conversation; the app submits messages observed as visible while the conversation and app are active. A failed receipt remains visible as an unsent confirmation.

Reactions toggle among six supported emoji and retain an `active` state so Realtime updates can be filtered and RLS checked. Soft message deletion blanks text and disables reactions; no unrestricted DELETE payload is broadcast. Forwarding text uses a fresh idempotency UUID and the destination's normal permission checks. Private media forwarding follows the media phase.

## Realtime and access

Conversation channels are private and require active authorized membership. Inbox topics are scoped to the authenticated user's UUID. Persisted Postgres changes are RLS filtered; clients cannot publish arbitrary private content or presence. Subscribers refresh authorized state on subscription/reconnection, so missed network events do not lose stored messages. Read cursors and reactions trigger refreshes. Query retries now recognize both repository and application authorization/rate-limit errors and do not retry those denials.

Blocking immediately prevents new sends and removes the pair's conversation from authorized queries under the documented conservative shared-group policy. Previously downloaded content remains on the viewing device until cache/session cleanup; Phase 18/19 review that lifecycle. No E2EE is claimed.

## Actual tests

`npm run test:messaging` creates three explicitly local reserved users, establishes a request/accept connection, verifies private-topic denial for a stranger, real two-user Realtime delivery, idempotent retry, unread/read state, sender-only deletion, reaction, reply, unsubscribe/reconnect recovery and block denial. A 45-row equal-timestamp development fixture proves two-page pagination recovers all 48 messages without duplicates. Real tests and database lint caught ambiguous PL/pgSQL argument references; a versioned correction fixes them.

Reaction rows are aggregated into at most 40 message-level transport records, avoiding the API row cap silently dropping reactions. Authoritative data remains relational. Group members are capped at 100 in transport; group policy and performance refinements follow Phases 7/20. Native keyboard, airplane mode, multi-device and background acceptance remain unrun until supported builds are available.
