# Mnelo authorization matrix

**Privacy scope update, 2026-09-09:** this matrix tests access to existing server-held records. RLS does not make content unreadable to the service operator or prove non-retention. The [device-owned data decision](PRIVACY_ARCHITECTURE.md) adds separate E2EE, relay, metadata and backup acceptance gates; current authorization checks must be preserved during migration.

Mnelo is the official product name. `20260907000200_authorization.sql` defines the initial policies and grants. Every exposed application table enables RLS. Clients receive only explicitly granted reads; mutations go through narrowly granted functions that derive `auth.uid()`, validate eligibility and fix `search_path`. Anonymous users receive no application-table privileges. Database owners/service roles remain server-only.

| Records                                        | Client read                                                                                    | Client mutation                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| profiles/usernames/languages/capabilities      | Raw rows owner-only; peers use bounded, privacy/block-checked projections                      | Caller-only validated profile operations                                                     |
| reserved_usernames                             | None                                                                                           | None                                                                                         |
| privacy_settings                               | Owner                                                                                          | Caller-only validated settings; exact-location public mode remains Never                     |
| matching_requests / user_needs / user_offers   | Owner raw data; permitted profile summaries exclude private request details                    | Checked caller lifecycle RPCs; service-only interpretation/publication                       |
| matching_candidates / matching_reasons         | Request owner with current source, privacy, block and expiry checks; numeric score not granted | Server matcher only                                                                          |
| connections / completions                      | Nonblocked participants                                                                        | Recipient acceptance; eligible participant completion operations                             |
| connection_requests                            | Nonblocked sender/recipient                                                                    | Checked send/accept/decline/cancel with context, expiry, audience and locking                |
| blocks                                         | Owner only                                                                                     | Caller-only block/unblock; own minimal blocked-identity management projection                |
| conversations / members / messages / reactions | Active authorized membership; removed member can read only own membership tombstone            | Checked messaging/group/reaction operations; no direct row mutation                          |
| attachment metadata                            | Pending/unsent owner only; live attachment authorized conversation members                     | Authenticated reservation; service-only processing/finalization; checked send/forward/delete |
| message locations                              | Authorized conversation only; absent from matching                                             | Explicit validated location-sharing operation                                                |
| message contacts                               | Authorized conversation plus current contact-profile/block visibility                          | Checked contact send and bounded display projection                                          |
| devices / push_tokens                          | Raw rows denied, including owner; device list/current projections expose safe metadata only    | Live-session registration/logout operations; no raw token writes                             |
| notification_preferences                       | Owner                                                                                          | Validated caller-only changes                                                                |
| call_sessions                                  | Authorized participant projection; internal session/room readiness fields withheld             | Actor-checked initiation/accept/end; service-only room/token/cleanup operations              |
| reviews / verification_status                  | Raw SELECT denied; narrow visible-profile projections                                          | Eligible immutable review RPC; verification and aggregate moderation server-only             |
| reports                                        | Reporter only; subject/others cannot enumerate                                                 | Validated caller report; moderation service-only                                             |
| account deletion                               | Authenticated request; opaque receipt status via server, private job tables denied             | Verified actor begins; cleanup/confirmation/retention service-only                           |
| private rate/moderation/outbox/job tables      | None                                                                                           | Trusted server/database functions only                                                       |
| Storage chat-media                             | Unsent owner or ready attached object with current member authorization                        | Edge-controlled upload/forward lifecycle; client cannot claim/finalize another upload        |
| Storage avatars                                | Policy-checked private profile/group avatar access                                             | Server image processing with owner reservation                                               |
| Realtime private topics                        | Live authenticated session and authorized actor/membership                                     | No arbitrary client broadcast/presence write; persisted row events retain table RLS          |

A block denies discovery, requests, profile access and direct-conversation access in both directions. In a shared group, the conservative policy makes the conversation unavailable to both affected users while both remain active members. Other participants retain their authorized access. Group UI explains this suspension; group/moderation integration tests enforce it.

Security-definer helpers live in `private`, absent from PostgREST's exposed schemas. PostgreSQL may evaluate required policy helpers; clients cannot call them as API RPCs. All security-definer functions fix their search path, revoke public/anonymous execution and use explicit relation names. Server-owned fields have no direct client UPDATE/INSERT grant.

The pgTAP suite includes positive controls and denials for private phone, unrelated messages/membership/attachments/locations, message tampering, role escalation, reports, blocks, device tokens, self-verification/rating, admin writes, unauthorized call insertion and blocked requests/discovery. It also checks all application-table RLS flags, private buckets, function search paths and idempotent request acceptance. Exact executed results are in QA_REPORT; existence of the file is not a test pass. The full local suite also executes LiveKit token authorization, real Auth HTTP flows and media finalization denials. Cloud configuration and physical-device release checks remain separate gates.

References: [Supabase RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization).

## Phase 4 profile integration

See [profile and avatar implementation](PROFILES.md). Migrations `20260907000400_profiles.sql` and `20260907000500_availability_expiry.sql` add bounded privacy-filtered summaries/search, expiring availability and owner-only avatar reservations. The authenticated Edge image processor exclusively writes private avatars; client finalization/upload is denied. `npm run test:profiles` exercises the real local service boundary; `npm run check:edge` checks server TypeScript. Native picker/device and cloud deployment acceptance remain pending.

## Phase 5 direct messaging

See [message transport and actual tests](MESSAGING.md). Versioned migrations 006–010 add bounded conversation/history RPCs, idempotent text sends, visible-message read cursors, RLS-filterable reaction toggles and private inbox topics. `npm run test:messaging` runs real two-user Realtime and negative authorization checks. Messages, reactions and memberships remain normalized and client writes are restricted to controlled operations.

## Phase 6 media checkpoint

Phase 6: pending/ready-but-unsent attachment rows and objects are readable only by the owner. Live attached objects are readable by authorized conversation members; blocks take precedence. Clients cannot claim/finalize objects or attach another owner’s upload. Forwarding validates both source readability and destination membership and copies bytes into a new owner reservation. Integration tests cover all these negative cases.

## Phase 7 group checkpoint

Groups require current membership and obey shared-group block suspension. A removed user can read only their own membership tombstone, enabling a Realtime revocation event; conversation/messages/roster/media remain denied. Admin mutations use server role checks. Current group avatar access is limited to authorized members. See GROUPS.md and the five-user integration test.

## Phase 8 Connect checkpoint

Connect raw requests, confirmation answers and normalized Need/Offer rows remain owner-only. Direct writes and service publication from authenticated clients fail; state changes enforce caller ownership. Candidate expiration follows pause/close. The real Connect integration test proves cross-user reads, mutations and forged service publication are denied.

## Phase 9 matching checkpoint

Matching candidates/reasons require owner scope and current eligible source evidence. Expiry, block, privacy change and source removal deny access immediately in the backend. The numerical score column is not granted to authenticated clients. Relevant profile grants depend on current results; public-safe intent summaries exclude raw text/details and require profile access.

Phase 10 retains participant-only request SELECT and no client request/connection writes. Narrow RPCs enforce sender/recipient actions, live candidate context, blocks and expiry. Four-user integration verifies outsider request read/response denial and unknown/blocked direct-conversation denial; existing 52 pgTAP assertions remain passing.

Phase 11: authenticated direct SELECT on reviews is revoked; public-safe review RPC checks subject visibility and returns no author/connection IDs. Client review/completion writes remain denied. Participant-only completion and immutable eligible review RPCs derive actors. Raw confirmation history stays connection-private. Verification remains server-written and returns only current scopes.

Phase 12: default/private phone stays inaccessible. `profile_phone` permits a confirmed number only to its owner or a currently connected, unblocked viewer when the owner explicitly selected Connections; otherwise null. Normal public-safe projections never contain phone/GPS. Four-user tests cover settings ownership, request audience, mutual block filtering, opt-in/revocation and exact-location mode denial.

Phase 13: reports remain reporter-only SELECT with no client write/moderation grant; resolve_report is service-only. user_access_state is owner-only SELECT and server-only write. A minimal own-blocked-identity RPC enables management without full profile access. Tests reject subject/stranger report enumeration, client admin operations, other-user access-state reads and undoing another actor’s block.

## Phase 14 checkpoint

Phase 14: `push_tokens` is client-denied for SELECT and mutation; registration uses live-session RPCs. `devices` and `notification_preferences` remain own-only reads with narrow validated RPC writes. `private.push_deliveries`, outbox, lease/receipt operations and scheduler are server-only. The pgTAP token test now requires a 42501 permission failure rather than an empty selectable result; no grant was restored. Server matching evaluation is private; client ownership boundaries remain unchanged.

Phase 15: call participant projection excludes internal Auth session IDs/readiness/observation. Start/accept/end/token RPCs enforce live sessions and appropriate actor roles; service-only room readiness, presence and cleanup cannot be invoked by clients. Exact conversation lookup returns no row to nonmembers. Actual local signaling tests deny outsiders, pre-consent token access, caller acceptance, blocked token issuance and expired-room recreation.

Phase 16: all public tables add RESTRICTIVE live-session policies; private storage and Realtime joins also require an active session. Definer RPCs check the session before membership/data work. Raw device rows are denied even to their owner; list/current-device projections expose only display metadata and pagination IDs. Revoked access JWTs cannot read profiles/messages, call RPCs or privileged Edge endpoints, or receive/join private Realtime data.

Phase 17: deletion job/receipt/object tables are private and have no client grants. Authenticated begin-deletion uses the verified live actor; all cleanup/receipt lookup/retention RPCs are service-only. Closing accounts cannot mutate through ordinary RPCs, publish uploaded media or be discovered/called. Existing private reads remain session-scoped until Auth deletion; receipt status exposes no identity.

Phase 18 adds restrictive raw-owner policies on profiles, usernames, capabilities and languages. Other profiles remain accessible through authorized bounded projections. Verification SELECT is denied; current verification is exposed through a narrow server function. pgTAP now has 57 assertions. See [SECURITY_TEST_MATRIX](SECURITY_TEST_MATRIX.md).

Migration 060: shared-contact labels use a maximum-40-message projection, rechecking conversation membership, deletion and the contact's current profile/block visibility. Embedded raw identity joins are not restored. Real media integration verifies display data and negative access.

Phase 19 does not relax authorization for offline replay. Every send still uses the current authenticated message RPC. A new session cannot replay an older queue; actual duplicate prevention is tested against PostgreSQL.

Phase 22 preserves device and push ACLs: authenticated users register only their current live session with en/ka; raw devices and privileged delivery work remain denied. Local integration asserts those denials and distinct session locales.
