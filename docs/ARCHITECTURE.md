> **Current September 13 state:** the development ciphertext delivery service is deployed and enabled, while both physical phones remain on build 9. [Current rollout, data boundaries, evidence and open release gates](DELIVERY_ROLLOUT.md) supersede historical no-queue/undeployed statements below. Native iOS/Android Signal probes and separate TURN voice/video checks passed; physical migration, key lifecycle/recovery and distribution licensing remain unresolved.

# Mnelo architecture — 2026-09-10

> September 12 delivery review: after physical-test failures, the owner authorized replacing direct-only message delivery with [asynchronous end-to-end encrypted mailboxes and independent call signaling](DELIVERY_ARCHITECTURE_REVIEW.md). The temporary-ciphertext exception is now the target; migration is in progress and has not been deployed. The direct-only implementation described below remains the current runtime, not the final accepted delivery model.

> September 12 profile/QR update: local profile schema version 4, optional bounded peer card channel, public in-memory invitation preview and browser-only download fallback. No server content/profile persistence or offline-queue change. [Current profile architecture](PROFILE_CARDS_QR.md).

> September 12 reviewer update: two owner-authorized, expiring Apple review accounts use separate access keys, with server-enforced isolation from the real SMS tester cohort. The hosted identity and transient relay share the current registration policy; no message/history queue was added. See [review access and verified boundaries](APPLE_REVIEW_ACCESS.md). Ordinary registration still uses SMS.

> September 12 owner-required correction: both platforms must support background/closed-app notifications and native incoming calls. See [BACKGROUND_DELIVERY](BACKGROUND_DELIVERY.md) for the new routing/privacy boundary, locked-device migration, lifecycle requirements and remaining delivery limits. Earlier no-push-registry/foreground-only notes are historical implementation checkpoints, not the accepted target. Build 2 is not ready under this acceptance requirement.

The authoritative product is a standard secure messenger without Connect. Active routes use `DeviceProvider` and `DeviceMessenger`. The old Supabase repository factory always returns unavailable; its environment variables cannot reactivate persistence. An automated import-graph test follows the active route tree and rejects imports into legacy persistence, auth, Connect, connections or reputation.

## Data and trust flow

1. First-launch phone entry creates an Ed25519 device identity on Send; SMS verification gates the navigator and peer runtime. The private key and local profile are in SQLCipher, whose key is in device-only SecureStore. A persisted, service-bound enrollment receipt permits offline reopen; local keys alone never unlock features.
2. Participants exchange/pin public identity codes through a trusted channel. Exact-number lookup uses the minimal OTP identity directory; it does not replace trusted peer-key verification. There is no silent key replacement endpoint.
3. An authenticated WebSocket challenge opens a transient route. Signed, recipient-bound, expiring SDP binds WebRTC certificate fingerprints to pinned identities. The relay cannot silently substitute an accepted fingerprint.
4. Direct WebRTC data channels encrypt peer traffic using DTLS. Separate direct PeerConnections carry voice/video through DTLS-SRTP. No LiveKit SFU Room or server-issued room token is used.
5. A message is committed to the sender's local database before transport. The recipient commits its own copy before acknowledging. Per-recipient delivery rows, stable UUIDs and deduplication support retry. No relay acknowledgment is interpreted as message delivery.
6. Optional backup export uses AES-256-GCM with a random user-held recovery key and random nonce. The encrypted archive goes directly to the chosen system share destination. Mnelo never receives it.

These are standard primitives and WebRTC protocols, with a **new Mnelo integration that has not been independently audited**. Expo/RN support alone is not a security certification. [RFC 8827](https://www.rfc-editor.org/rfc/rfc8827.html) describes fingerprint authentication requirements. [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/) provides SQLCipher native configuration.

## Implementation boundaries

- `src/messenger/engine.ts`: serialized local transactions, identity/contacts/chats/groups/media/history, receipt authorization, independent local conversation deletion, authenticated author message edits/deletion, backup/restore.
- `src/messenger/peer-mesh.ts`: bounded live peers, signed signaling, DTLS channel lifecycle, file chunking and call negotiation. Up to 16 simultaneous direct links; contact probes rotate in batches. Open conversations are prioritized.
- `src/messenger/calls.ts`: consent, ringing, accept/decline, tracks and call lifecycle. No content recording on a server.
- `modules/mnelo-vault`: backup-excluded native directory. iOS file protection; Android noBackupFilesDir.
- `relay/server.ts`: loopback-only signaling, bounded RAM, authentication/rate limits, no disk/storage clients. The development instance runs behind Caddy; deployment evidence remains separate from source checks.
- Screens use query hooks for local data, shared tokens and English/Georgian dictionaries.
- `identity/`: the phone-registration exception, separate from conversation storage. Signed device proof plus provider OTP approval binds the keyed number index to a public identity. Infobip is the configured development adapter; Vonage/Twilio remain selectable, with no automatic fallback. The mobile `phone_registration` cache alone is not authorization; `phone_enrollment` records the verified origin, fixture flag and time, excluded from backups. No per-open SMS or network dependency. Restored installations verify again with the recovered key. Local profile username/name fields do not enter this registry. See [PHONE_IDENTITY](PHONE_IDENTITY.md).
- Navigation is Chats | Calls | Me. Calls reads existing local call messages through an indexed 40-row cursor query; its contact picker invokes the same authenticated peer call service as conversations. It introduces no server call log or identity service.

Groups use one pinned owner to authorize complete membership revisions. Updates may skip missed offline revisions but cannot roll back or change the owner. Removed/left participants retain existing history; their device rejects new sends after receiving removal or locally leaving. No protocol can retroactively erase their copies. Offline peers cannot apply a membership update before they receive it. There is no automatic forwarding of old group history to new members.

## Migration boundary

Historical Supabase migrations, functions, integration tests and fixtures are retained and labeled historical. No production backend was deployed or purged during this migration. Existing local fixtures were not silently deleted. Any historical infrastructure must be decommissioned and its data retention verified before making a global no-storage claim. Runtime legacy OTP, discovery, persistent messages, storage uploads, push tokens and moderation reports are disconnected.

Hosted development transport uses authenticated coturn with relay-only ICE. Real browser relay tests pass; physical Internet/audio/background acceptance remains open. Native wake/call handling is implemented for both platforms. Group calling, multi-device key rotation/sync, automatic cloud backup and production infrastructure review remain open.

## Local attention indicators

The active messenger now derives chat unread and missed-call counts from SQLCipher, with focus/foreground-gated acknowledgement. Chat search scans bounded local metadata pages with Unicode normalization; kind/unread filters run before pagination. The device alert adapter combines generic local alerts with native APNs/FCM routes. Minimal token/capability registration is separate from conversation storage; CallKit/Telecom owns the system call lifecycle. See [NOTIFICATIONS](NOTIFICATIONS.md) for behavior and remaining background delivery blockers.

## Development service deployment — September 12

One Hetzner CX23 runs isolated services: Caddy terminates TLS, the transient relay listens on loopback 8084, and the minimal phone identity service listens on loopback 8086. The identity service alone has writable application state (phone registry/key, aggregate send counters and push routing metadata). Hosted mode requires explicit HMAC-index tester admission and an overwritten proxy source header. No chat/media/call history or legacy Supabase backend was deployed. Coturn additionally forwards authenticated encrypted peer traffic. See [deployment evidence and outstanding release work](DEVELOPMENT_HOSTING.md).
