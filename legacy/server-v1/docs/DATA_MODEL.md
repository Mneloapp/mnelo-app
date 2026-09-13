# Mnelo data model

**2026-09-09 privacy decision:** the tables below describe the currently implemented schema, not the approved target retention model. [Required device-owned data migration](PRIVACY_ARCHITECTURE.md) covers message/media/history/relationship data and requires review of Auth, Connect and safety records without silently exempting them. No schema or existing data has been deleted by this decision.

Mnelo is the official product name. The 62 PostgreSQL migrations under `supabase/migrations/` are authoritative and have been replayed on the local backend. Mobile feature adapters and operational functions are integrated; the phase checkpoints below describe their evolution. No mobile cloud project has been provisioned.

| Area                | Relational records                                                                      | Rules                                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity            | `profiles`, `usernames`, `reserved_usernames`, `profile_languages`, `user_capabilities` | Auth UUID owns profile; unique normalized username; reserved-name enforcement through controlled profile mutation. No private phone or precise position in profiles.                    |
| Privacy             | `privacy_settings`                                                                      | Relevant discovery, hidden phone and never-public exact location by default.                                                                                                            |
| Connect             | `matching_requests`, `user_needs`, `user_offers`                                        | Raw input preserved alongside typed interpretation; normalized Need/Offer ownership; bounded text and state.                                                                            |
| Ranking             | `matching_candidates`, `matching_reasons`                                               | Internal integer score, human rank label, version, expiration and source-backed reasons. Clients cannot write candidate data.                                                           |
| Relationships       | `connection_requests`, `connections`, `connection_completions`                          | Pending pair uniqueness, participant-only transitions, ordered pair uniqueness and atomic accepted conversation creation. Completion/reviews remain explicit service/business concepts. |
| Conversation        | `conversations`, `conversation_members`                                                 | Direct/group distinction, active membership, admin role and read cursor. Sender/receiver pairs are not the message storage model.                                                       |
| Messages            | `messages`, `message_reactions`                                                         | UUID identity and client idempotency key; unique sender/client key; `(created_at,id)` cursor index; reply constrained to same conversation; soft deletion fields.                       |
| Media               | `message_attachments`, `message_locations`, `message_contacts`                          | Private object reservation metadata with ownership/type/size; exact coordinates exist only inside authorized message context; shared contacts reference profiles.                       |
| Notifications       | `devices`, `push_tokens`, `notification_preferences`                                    | Session-bound device identity, separate tokens, private previews by default and explicit categories.                                                                                    |
| Calls               | `call_sessions`                                                                         | Conversation-scoped lifecycle and participant identities; no LiveKit secret or bearer token stored in an exposed row.                                                                   |
| Trust               | `reviews`, `verification_status`                                                        | Reviewer/subject distinction, unique per connection/author, bounded rating. No client writes to verification or reviews outside eligibility-checked functions.                          |
| Safety              | `blocks`, `reports`, `account_deletion_requests`                                        | Owner-only block/report/deletion visibility; subject cannot enumerate reports; backend owns workflow status.                                                                            |
| Internal operations | `private.rate_limits`, `private.moderation_actions`, `private.notification_outbox`      | No exposed API schema or client table access. Outbox contains event IDs, not copied private message bodies.                                                                             |

Every public table has a UUID primary key, explicit constraints and foreign keys. Time fields use `timestamptz` (the optional requested calendar day uses `date`). Private rate buckets use a composite `(user_id,action,window_start)` key. Important owner, relationship, candidate, message cursor and pending outbox paths are indexed. Critical relations are not generic JSON blobs.

Phone numbers remain in Supabase Auth. There is no public phone column to accidentally reveal through a row policy. Account cleanup removes owned private records and turns authored messages into anonymous empty tombstones. The ordered server deletion workflow coordinates conversation membership, Storage, calls and actual Auth removal; schema cascades alone do not establish completion. Local integration and UI checks confirmed this workflow.

Stored candidate reasons are audit records; the matcher and read policies recheck current evidence, expiry and profile/privacy changes. Profiles with relevant-only discovery require a valid owned match or an existing connection; everyone visibility remains authenticated-only. No anonymous directory is exposed.

## Phase 4 profile integration

See [profile and avatar implementation](PROFILES.md). Migrations `20260907000400_profiles.sql` and `20260907000500_availability_expiry.sql` add bounded privacy-filtered summaries/search, expiring availability and owner-only avatar reservations. The authenticated Edge image processor exclusively writes private avatars; client finalization/upload is denied. `npm run test:profiles` exercises the real local service boundary; `npm run check:edge` checks server TypeScript. Native picker/device and cloud deployment acceptance remain pending.

## Phase 5 direct messaging

See [message transport and actual tests](MESSAGING.md). Versioned migrations 006–010 add bounded conversation/history RPCs, idempotent text sends, visible-message read cursors, RLS-filterable reaction toggles and private inbox topics. `npm run test:messaging` runs real two-user Realtime and negative authorization checks. Messages, reactions and memberships remain normalized and client writes are restricted to controlled operations.

## Phase 6 media checkpoint

Migrations 011–016 add attachment client UUIDs, service-only processing claims, strict media message procedures, normalized location/contact sending, structured forwarding, unsent attachment privacy and typed conversation preview kinds. Media deletion rejects the attachment and removes exact location/contact child records; retain the message tombstone.

## Phase 7 group checkpoint

Migrations 017–018 add conversation creation UUIDs and avatar attachment references, attachment purpose, bounded group procedures, and own membership tombstone visibility for removal events. No new application table is introduced.

## Phase 8 Connect checkpoint

Migrations 019–020 add client UUID/fingerprint, detail text, timezone and separate confirmation answers to matching_requests. The service publication procedure creates a user_needs or user_offers row atomically. Existing RLS keeps these owner-only; no new table is added.

## Phase 9 matching checkpoint

Migrations 021–024 add indexed canonical matching keys, evaluation timestamps and typed review evidence values, plus alias/invalidation/source-validation helpers and matching/profile-intent procedures. Existing candidates/reasons retain the current evaluated decision with source IDs and expiry; no new table is introduced.

Migration 025 adds connection_requests.client_id with sender uniqueness and a sender cursor index. It replaces request/response procedures and adds relationship preflight, paginated request reads and authorized direct lookup. Accepted invitation text is inserted once into messages; connection interaction_type derives from trusted matching intent. See [CONNECTIONS](CONNECTIONS.md).

Migrations 026–027 add reviews.status and review/history indexes, a private published_reviews view, completion/review/projection functions and connection/completion Realtime publication. Existing confirmation/review tables remain normalized. Profile and matching aggregates use only valid published reviews. See [REPUTATION](REPUTATION.md).

Migrations 028–030 add the profiles coarse-area CHECK, validated/rate-limited privacy mutation and isolated confirmed-phone projection. Phone remains in auth.users with no public phone column. No new table is introduced; the service role receives only the pure CHECK-validator execute grant needed for trusted writes.

Migration 031 adds report client UUID uniqueness, a block cursor index and user_access_state (UUID identity, unique owner, revision, timestamp, own-account RLS). It adds report/unblock/list/moderation procedures and block-triggered generic refresh. There are no reporter/content fields in the access signal; private.moderation_actions records trusted status changes.

## Phase 14 checkpoint

Phase 14 migrations 032–036 add private push delivery state/leases/retries/receipt timestamps, outbox expiry, event triggers and inactive scheduler. Existing devices bind to Auth sessions; notification preferences are persisted. Server actor-scoped matching evaluation is separated from authenticated-client wrappers. See [NOTIFICATIONS](NOTIFICATIONS.md).

Phase 15 migrations 037–044 add call idempotency, bound Auth sessions, room readiness/observations, unique call-history linkage, private leased room cleanup, exact conversation metadata and an inactive cleanup scheduler. Terminal history updates inbox ordering without duplicate push. All schema changes are migrations.

Phase 16 migrations 045–048 add live-session helper/policies and narrow list/current-device RPCs. Auth remains the session authority; no new token table. Device activity is approximate and metadata client-reported. Raw device SELECT is revoked; listing is actor-scoped.

Phase 17 migrations 049–058 add private deletion jobs, hashed receipts and object manifests; final authored-message tombstones, upload settlement barriers, closing visibility, bounded deferral, retention and an inactive scheduler. Jobs survive Auth deletion; identity/path retention is bounded after remaining objects are clear. See [ACCOUNT_LIFECYCLE](ACCOUNT_LIFECYCLE.md).

Phase 18 migration 059 restricts raw identity reads to their owner, revokes raw verification reads and adds actor-scoped profile projection quotas. Private/server normalization and existing relationships remain intact.

Phase 19 adds no server migration. The client outbox is a versioned bounded snapshot containing actor/session scope, text-message UUIDs and retry metadata. The existing server message idempotency constraint remains authoritative.

Migrations 061–062: devices.locale is checked en/ka with default en. register_device accepts a defaulted locale; privileged claim_push_work includes it. update_profile_preferences accepts a defaulted validated IANA time_zone and sets next-local-midnight availability.
