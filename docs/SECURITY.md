> **21 September checkpoint:** TestFlight 53 is available. [Public launch preparation](PUBLIC_LAUNCH_2026_09_21.md) records the current engineering checks, messaging improvements and outstanding production requirements. The [encrypted delivery rollout](DELIVERY_ROLLOUT.md) supersedes historical no-queue statements below. Engineering verification does not constitute an independent protocol audit. See also [source licensing](OPEN_SOURCE.md).

# Mnelo security — current architecture

> September 12 profile/QR delta: bounded JPEGs, explicit URL opening, trusted-peer author binding, block recheck, bounded native link validation before Router decoding and explicit contact confirmation. No automatic trust from QR. [Threat boundaries and limits](PROFILE_CARDS_QR.md).

> September 12 reviewer update: two owner-authorized, expiring Apple review accounts use separate access keys, with server-enforced isolation from the real SMS tester cohort. The hosted identity and transient relay share the current registration policy; no message/history queue was added. See [review access and verified boundaries](APPLE_REVIEW_ACCESS.md). Ordinary registration still uses SMS.

> September 12 owner-required correction: both platforms must support background/closed-app notifications and native incoming calls. See [BACKGROUND_DELIVERY](BACKGROUND_DELIVERY.md) for the new routing/privacy boundary, locked-device migration, lifecycle requirements and remaining delivery limits. Earlier no-push-registry/foreground-only notes are historical implementation checkpoints, not the accepted target. Build 2 is not ready under this acceptance requirement.

> Current September 12 update: the owner-authorized functional TestFlight beta has a scoped engineering review in [BETA_SECURITY_REVIEW](BETA_SECURITY_REVIEW.md). Exact development endpoints and the existing two-number admission are required; production and independent-audit claims remain blocked. Earlier blanket preview-blocking and absent-TURN statements below are historical. Hosted TURN now passes real browser UDP/TCP data/media tests; physical-device and Apple-distribution results are recorded separately.

Private history and identity keys live on devices. Mnelo's active runtime does not call Supabase Auth/Database/Storage or LiveKit room/token endpoints. The owner's later phone-registration request adds a minimal number/public-key registry, with an authenticated unlink operation. Erasing only a device is distinct from unlinking that registration. Legacy infrastructure is not silently migrated or purged.

Phone directory security and limitations are in [PHONE_IDENTITY](PHONE_IDENTITY.md). OTP ownership and one-use device signatures are both required for binding. Search requires own registration and obeys quotas/discoverability. The directory is not a trusted replacement for peer-key verification. Phone indexing is not anonymity; SMS provider retention is disclosed. Infobip is configured with a server-only, expiring 2FA-scoped key and verified single-use/six-digit policy; the mobile source guard rejects its credential name and the active import graph excludes the server adapter. No raw provider response logging or automatic retry is used. Development hosting now adds persistent aggregate SMS reservations and explicit tester admission; production rollout, phone-number recycling and independent review remain release blockers. See [hosting controls](DEVELOPMENT_HOSTING.md).

SQLCipher is mandatory. Its random 256-bit key is stored using device-only SecureStore. Build 3 migrates the existing iOS key to AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY and matching native file protection for locked-screen call initialization. This deliberately permits app-local background access after first unlock; first unlock after reboot is still required. Native startup verifies cipher availability and fails closed on missing/wrong keys. MneloVault uses iOS protected, backup-excluded Application Support and Android noBackupFilesDir. Android allowBackup is false. Never replace an existing database with a new key after a key-loss error.

Contacts pin Ed25519 public keys. Relay authentication signs a domain-separated nonce. Entire SDP is signed with recipient, session, purpose and expiration; SHA-256 certificate fingerprints are checked before WebRTC accepts remote descriptions. DTLS/SRTP content keys remain in native/browser peer transports. Call acceptance is required before capturing the recipient's camera/microphone. No recording, transcription or server call history exists in the active path.

These mechanisms establish a concrete development implementation, **not independent certification of the new protocol integration**. Do not label it audited, ship an encryption badge or enable preview/production until review resolves identity/fingerprint binding, replay/negotiation races, group revocation, recovery and mobile lifecycle behavior. A code-reviewed release gate rejects preview/production; an environment flag cannot assert review happened.

## Device authorization

Unknown/blocked peers cannot write local messages. Conversation membership is checked inside serialized transactions. Only a pinned owner may update a group; clients cannot overwrite another owner's group. ACK/read updates affect only the authenticated recipient's delivery. Local deletion has no remote command. File chunks and packet schemas are bounded; attachments stay inside encrypted local storage and are materialized into a device cache only for explicit playback/open/share.

## Relay and deployment

The relay has authentication, per-connection rate/payload/buffer limits and no persistence imports or message endpoint. Recipient-offline signaling is rejected, not queued. Production deployment must separately prove no identifying access logs, payload traces, dumps, swap, snapshots or durable forwarding buffers. Source inspection alone does not prove provider compliance. Live routing necessarily observes addresses and timing transiently; do not claim anonymity.

Historical checkpoint: the initial ICE configuration had no STUN/TURN service. A production TURN path must relay only encrypted peer transport with no content keys, no recording and verified operational retention controls. The September 12 development VM deployment is documented in DEVELOPMENT_HOSTING.md; The September 12 follow-up deploys coturn; current controls are in BETA_SECURITY_REVIEW.md.

## User copies

Backup uses noble AES-256-GCM with random nonce, versioned associated data and a random user recovery key. Restore validates integrity, identity and allowed relational columns atomically; pending items are held. Mnelo has no recovery escrow. A share sheet handoff is not proof of a saved Drive/iCloud file. Automatic cloud sync and multiple live devices sharing one identity are unsupported.

## Open release work

Independent security review; full two-phone voice/video and interrupted/background tests; quotas for authenticated peer abuse/local disk pressure; signed group-state/revocation protocol review; durable reaction/read-receipt retry; streamed large backup/media memory behavior; reviewed device key rotation/multi-device model; Internet ICE/TURN deployment; no-retention hosting audit; final legal/store disclosure review. Old server RLS tests remain historical, and are not substituted for these checks.

Gitleaks and dependency results are recorded in [QA](QA_REPORT.md). Never log identity secrets, recovery keys, message bodies or exact location. No plaintext or ciphertext history is authorized on Mnelo servers.

## Device-local notification privacy

Generic local alerts contain no sender names, message previews, phone numbers, identity keys, locations or attachments. Notification taps accept only fixed event kinds, never a payload URL. OS permission is explicitly requested in settings. Signed enrolled-device requests register APNs/FCM tokens with the identity service; hashed recipient capabilities authorize wakes, with bounded quotas and revocation. Server provider credentials never enter the client. Unread state changes only for a focused foreground screen and its captured message sequence. Counts and call history remain in the encrypted participant journal. Background/killed-app delivery is still a release blocker; see [NOTIFICATIONS](NOTIFICATIONS.md).

First-entry enforcement (2026-09-11): every feature route, peer mesh and incoming-call overlay requires a service-bound verified enrollment, not merely local keys. Notification observers are inactive while the enrollment gate is locked and visible OS alerts/badges are cleared. This enrollment state is distinct from the physical screen lock; an enrolled phone may receive native incoming calls after its first passcode unlock. Persisted verification supports offline reopening; fixture receipts are rejected outside local builds. Backup import and old display-only caches never unlock features. Local profile input is validated and cannot alter private keys, phone ownership or another participant's history. SMS remains device enrollment/number-change only. The local guard is not an OS-compromise defense or a new server-side authorization claim.
