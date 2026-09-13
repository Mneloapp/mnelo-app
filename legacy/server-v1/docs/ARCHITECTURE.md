# Architecture

**Required architecture revision, 2026-09-09:** [device-owned data and relay requirements](PRIVACY_ARCHITECTURE.md) supersede persistent private communication storage and deferred E2EE in the original V1 plan. The implementation below describes the existing system; its private data/control-plane stores require migration. No cloud backup or cryptographic transport is implemented by this documentation change.

Mnelo is the official product name. See [product identity](PRODUCT_IDENTITY.md) for naming, positioning and native identifiers.

## Current implementation

The V1 UI and feature transports are implemented against real local Supabase and LiveKit. Routes are thin entries; feature screens compose shared primitives, query hooks, forms and typed repository operations. `MneloRepository` separates presentation from authentication, identity, messaging/media/groups, Connect/matching/requests, privacy/trust/moderation, notifications, calls, devices and account deletion. The database has 62 versioned migrations and tested private Storage/Realtime boundaries. `createPreviewRepository` contains explicitly marked, in-memory development fixtures and refuses release execution; selection additionally requires a local environment with no backend configured. A configured backend never silently falls back to fixtures.

Android native builds and local two-user media/call flows have been exercised; account deletion completed through the real worker. Xcode 26.6 now compiles the iOS Development Client. Physical-device/cloud acceptance remains open. Push transport tests do not establish APNs/FCM delivery. See RELEASE_REPORT.md for current results and limitations; the phase checkpoints below preserve implementation history.

## Dependency direction

`app/` routes compose `src/components/` and `src/features/`. Features own their use cases and query hooks; `src/services/` owns external SDK access. Presentation must not create database clients or privileged tokens. Shared types and validation belong under `src/types/` and `src/lib/`; avoid service-to-screen imports.

| Directory                                | Responsibility                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `app/`                                   | Expo Router layouts and small route entries                                                        |
| `src/components/`                        | Token-based, accessible presentation primitives                                                    |
| `src/features/`                          | Auth, chat, calls, connect, profiles, connections, reputation, notifications, moderation, privacy  |
| `src/services/`                          | Repository contract, explicit preview adapter, Supabase feature transports and LiveKit integration |
| `src/lib/`                               | Environment parser, providers, safe errors and query defaults                                      |
| `src/theme/`                             | Semantic colors, Inter/Georgian typography, spacing, sizes, radii                                  |
| `src/i18n/`                              | Typed English and Georgian dictionaries                                                            |
| `src/stores/`                            | Small local UI state only                                                                          |
| `src/hooks/`, `src/types/`, `src/utils/` | Shared code when a real reuse case exists                                                          |
| `supabase/`                              | Versioned schema, RLS, Storage/Realtime policies, local config and pgTAP tests                     |
| `tests/`, `scripts/`                     | Verification and local quality checks                                                              |

The presentation layer uses the [approved visual system](DESIGN_SYSTEM.md), a bundled-font provider and a call-only dark appearance context. Service and database contracts do not depend on brand colors or fonts.

## State and forms

TanStack Query owns server state; its cache is memory-only. Query retries are bounded and authorization failures are not retried. Mutations are not automatically replayed without feature-specific idempotency. AppState and native network observations feed query focus/online state. A separate session-bound SecureStore outbox persists at most 20 pending text messages; it reconciles ambiguous acknowledgments by client UUID. The Supabase transport uses a 15-second request timeout.

Zustand holds locale preference, minimal current-session/profile metadata, ephemeral phone input and the active interpretation draft. It contains no tokens or message history. React Hook Form and Zod validate phone and identity forms; Zod also validates build and runtime environment input. TanStack Query holds fetched profile and conversation data.

## Platform model

Expo SDK 57, React Native 0.86, React 19.2, Expo Router, native development clients and EAS. iOS and Android share code. The blank template was used to avoid shipping sample tabs. React Native's native system fonts are used; Dynamic Type is not disabled. Scrollable safe-area layout accommodates smaller screens and larger text. No motion is required by the launch screen.

Native folders are regenerated from configuration. Camera, microphone, location, contacts and notification permissions are requested through explicit feature actions. The launch screen does not request these permissions. Expo development tools have their own local networking behavior.

## Service boundaries

- Local Supabase provides Auth, PostgreSQL, private Realtime, private Storage and Edge Runtime. Every application table has RLS and explicit grants. Cloud deployment remains separate. Execute denial tests before shipping each feature.
- Auth uses a bounded, serialized two-slot SecureStore adapter with segmented values, rotation and deletion tests. Browser layout previews keep sessions in memory only. See AUTH.md; native device backup/restore behavior remains a device acceptance gate.
- Chat repositories persist first, paginate by stable cursor, deduplicate by client message ID, and subscribe only to authorized conversation topics. A future independently reviewed encryption boundary would transform message/media envelopes; no placeholder cryptography or E2EE claim is made.
- A server endpoint authenticates identity, checks conversation/call permission, and returns a short-lived scoped LiveKit participant token. Local native/browser signaling and synthetic media were exercised. Cloud configuration, hardware quality and background delivery require separate acceptance.
- Notifications use an Expo Push transport interface with session-bound device registration and a private leased dispatch queue. Local integration tests use an injected transport. Actual provider delivery and protected cloud schedules remain unconfigured.

## Product constraints

The brand is Mnelo; Connect is an action, not an alias for the brand. The tabs are exactly Chats, Connect, Me. Calls start in chat. The core journey is Match → Connect → Chat. No feeds, public follower counts, ads, fake match percentages, public exact location, or additional dashboards.

## Identity and editable copy

`app.config.ts` owns the app display name, slug, URL scheme, native identifiers and website metadata. Visible brand and provisional positioning live in the typed `src/i18n/` dictionaries. No marketing slogan is embedded in service contracts, environment keys or theme tokens. Keep copy editable and preserve the semantic, brand-neutral theme names. Future links use `mnelo://` and web identity uses `https://mnelo.com`; production universal/app links and website hosting are not configured.

## Phase 4 profile integration

See [profile and avatar implementation](PROFILES.md). Migrations `20260907000400_profiles.sql` and `20260907000500_availability_expiry.sql` add bounded privacy-filtered summaries/search, expiring availability and owner-only avatar reservations. The authenticated Edge image processor exclusively writes private avatars; client finalization/upload is denied. `npm run test:profiles` exercises the real local service boundary; `npm run check:edge` checks server TypeScript. Native picker/device and cloud deployment acceptance remain pending.

## Phase 5 direct messaging

See [message transport and actual tests](MESSAGING.md). Versioned migrations 006–010 add bounded conversation/history RPCs, idempotent text sends, visible-message read cursors, RLS-filterable reaction toggles and private inbox topics. `npm run test:messaging` runs real two-user Realtime and negative authorization checks. Messages, reactions and memberships remain normalized and client writes are restricted to controlled operations.

## Phase 6 media checkpoint

Phase 6 adds a media repository plus authenticated upload/forward Edge Functions. Server claims give each processing attempt a distinct object path; only the matching claim can finalize a private object. Message sending remains a caller-authorized atomic RPC. Native recording and media presentation stay in dedicated feature components.

## Phase 7 group checkpoint

Group screens and their repository wrap narrow SQL procedures; they reuse conversation membership, Realtime and media. Group controls are separated from the chat screen. Minimum roster identity is returned by a scoped procedure without making full profiles public.

## Phase 8 Connect checkpoint

A pure server IntentInterpreter and a strict authenticated Edge endpoint handle interpretation/publication. Mobile can supply raw input and explicit answers, but cannot choose ownership or trusted interpreter metadata. Service publication atomically writes the request and normalized Need/Offer. Provider substitution remains server-only and optional.

## Phase 9 matching checkpoint

Matching runs in a narrow owner-authorized PostgreSQL procedure using indexed canonical keys, privacy/block eligibility and source-backed reasons. Client DTOs contain profiles, rank labels and typed facts; numerical scores stay server-side. Source invalidation and live reason validation protect relevant-profile grants.

Phase 10 adds a dedicated connections repository/feature boundary. Relationship preflight and exact direct-conversation lookup replace UI assumptions based on loaded chat pages. PostgreSQL-ready system events trigger a second snapshot after channel join; see [CONNECTIONS](CONNECTIONS.md).

Phase 11 separates reputation screens/repository from profiles and chats. A private published-review view is the single aggregate/evidence source. Connection completion uses participant confirmations and pair serialization; see [REPUTATION](REPUTATION.md).

Phase 12 moves privacy controls to their feature boundary. Explicit phone reveal is a separate Auth-backed RPC and short-lived component state, outside profile/search DTOs and query persistence. Mobile/server validators stay on their own sides of the import boundary with parity tests. See [PRIVACY](PRIVACY.md).

Phase 13 adds the moderation repository/feature boundary and generic own-account access revision events. Block changes reset cached queries without disclosing the blocker. Feature-route inventory now enforces the explicit authenticated-profile navigator guard. See [MODERATION](MODERATION.md).

## Phase 14 checkpoint

Phase 14: notification repository and platform registration adapter feed a private Postgres outbox/delivery queue. A bounded server Edge dispatcher uses Expo push with receipts; inactive pg_cron/pg_net scheduling is prepared. Client tap routing resolves an opaque ID against current backend access. See [NOTIFICATIONS](NOTIFICATIONS.md).

Phase 15: conversation-only LiveKit calls use a dedicated repository, call/media controllers and platform-specific media surfaces. Auth-bound RPCs control lifecycle; Edge functions create rooms and scoped tokens, and a private queue reconciles terminal rooms. See [CALLS](CALLS.md). Exact conversation metadata is fetched independently of inbox pagination.

Phase 16: device metadata is independent of push opt-in. Foreground session validation and server-first logout are centralized; the repository lists cursor-paginated live Auth sessions with a separate current-device projection. See [DEVICES](DEVICES.md).

Phase 17: a persisted deletion receipt gates navigation independently of Auth restore. Server-owned leased deletion jobs coordinate Storage, group continuity and Auth removal, with independent retention and call cleanup. See [ACCOUNT_LIFECYCLE](ACCOUNT_LIFECYCLE.md).

Phase 18: profile discovery uses bounded RPC projections; raw identity tables are owner-only. Shared Edge input streams have a total deadline and byte cap. The repository includes checksum-verified source/history/bundle secret scanning and an explicit future E2EE transport boundary.

Phase 19: pending text persistence lives in a small outbox engine behind injected storage/transport ports. The root hook binds it to the verified current Auth session and observes connectivity/foreground state. Zustand holds its UI projection only; TanStack history remains memory-only. See OFFLINE.md.

Phase 20: the message-page adapter conditionally loads bounded relational projections and uses keyed joins; Realtime refresh is coalesced with in-flight follow-up. Message rows/data are memoized and voice content loads on demand. See [PERFORMANCE](PERFORMANCE.md) for actual bounds and remaining native profiling.

Shared accessibility boundaries: FocusPressable, ActionSheet, FocusedTab and useReducedMotion. These do not change repositories, backend access or product routes. Native text scaling stays enabled; see [ACCESSIBILITY](ACCESSIBILITY.md).

Locale is a persisted en/ka preference independent of Auth; shared formatters use a small pinned CLDR subset when presenting Georgian. Each verified device carries its own notification language. See [LOCALIZATION](LOCALIZATION.md).

External native link boundary (Phase 25): +native-intent discards supplied routes/queries and opens `/`. Auth/profile guards then select the allowed landing flow. Typed in-app navigation and authorized push actions remain separate. No arbitrary external conversation links/universal links are implemented; expanding this contract requires the runtime decoder security review in DEPENDENCY_AUDIT.

Release config uses a build-only public project registry under config/. app.config.ts and check:env require the selected hosted Supabase origin and EAS UUID to match it; configured backend origins cannot overlap. Local runtime credentials and provider secrets are never stored in this registry. See RELEASE.md.

`plugins/with-local-network.cjs` owns the generated Android loopback-only diagnostic network policy. Release-style local builds embed JS and retain development labels; EAS preview/production are distinct hosted profiles. No native generated source is the permanent home of these changes. The separate existing website is preserved; see WEB_PRESENCE.md.
