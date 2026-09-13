# Mnelo execution report

Phase: Device-owned messenger architecture migration, 2026-09-10.

Status: Implemented and locally verified; public release NOT READY.

Implemented: Removed Connect/routes/copy. Replaced active backend/auth/messaging/call paths with local identity, pinned contacts, SQLCipher history, direct/group messaging and direct WebRTC calls. Added transient signaling, independent deletion, user-held encrypted backup export/restore, development-only release gates and current negative tests.

Files: app routes; src/messenger; native MneloVault module; relay; app.config.ts; package/lock; current/legacy CI; scripts; i18n; authoritative docs. Former UI/docs remain under legacy/server-v1. Native identifiers remain com.mnelo.messenger.

Database migrations: No server migration. Device SQLite schema version 2; initialization adds missing local columns and rejects unsupported newer schema. Legacy Supabase data was not automatically imported or deleted.

Security impact: No active platform message store, durable relay queue, phone account or server recovery key. Peer identity/SDP/call integration requires independent review before distribution; production gate closed. Participant deletion never mutates somebody else's copy.

Tests: 173 Jest, 17 current integration and 3 preserved server utility tests PASS; strict types/lint/format/security/env/localization/brand PASS; Doctor21/21 and compatibility PASS. Real browser PeerConnection harness16 assertions PASS. Details and prior failures in QA_REPORT.md.

Native checks: iOS Simulator build/boot/local storage and native↔browser text/voice transport verified. Android ARM64 APK build/install/boot/local storage verified. No physical-device claim.

Known limitations: Hosted no-retention relay/TURN, independent protocol review, background execution, two-phone QA, multi-device keys, automatic Drive/iCloud synchronization and remaining resilience/security work described in RELEASE.md.

Commit: `a2a028427a7087278a7e4a214a610a258954e4e1` — `refactor: migrate mnelo to device-owned messaging`.
