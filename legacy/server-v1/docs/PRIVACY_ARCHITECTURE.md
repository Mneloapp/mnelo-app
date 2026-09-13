# Mnelo device-owned data and relay architecture

Decision date: 2026-09-09. Status: **owner requirements accepted; migration NOT implemented**. This decision supersedes the original V1 permission to persist private messages on Supabase and to defer E2EE. Existing implementation and QA remain evidence of the previous architecture, not evidence of compliance with this decision. Public release remains **NOT READY**.

## Authoritative requirements

- Mnelo infrastructure must not persist private communication data, in plaintext or ciphertext. There is no offline delivery queue on Mnelo servers, even with a short TTL.
- Conversation history belongs on the participants' devices: text, media, voice notes, shared locations/contacts, reactions, replies, receipts, group details/membership and call history. Apply the same restriction to derived conversation graphs and identifying delivery records.
- Communication must use independently reviewed end-to-end encryption with device-held keys and authenticated peers. Mnelo and transport providers must not have content-decryption keys. Transport encryption alone does not meet this requirement.
- Optional backup synchronization is user-initiated and off by default. Backups go directly from the device to the user's own Google Drive or iCloud account, encrypted on the device before upload. Mnelo must not proxy, own, copy or index these backups or retain recovery material.
- Do not silently exempt Auth accounts, phone numbers, profiles, usernames, Connect data, connections, blocks, reports, reviews, devices or push tokens from the owner's broader rejection of platform-held information. Existing persistent implementations need redesign. Any proposed retained directory or account information requires an explicit, narrow owner decision before adoption; none is approved by this document.
- Do not describe these requirements as implemented, add an encryption badge, or promise that nobody can ever intercept or obtain information by any means.

## Meaning of a relay

An active network relay necessarily processes packets and routing information in transient memory. The target permits only bounded buffering needed to forward traffic during a live connection; it does not permit holding packets for an offline recipient. Disconnects or process restarts discard undelivered relay buffers; the sending device owns retries.

No payload, private metadata or stable conversation graph may be written to a database, object store, cache with persistence, spool, durable broker, request log, tracing system, crash/core dump, packet capture, swap/snapshot or infrastructure backup. Provider defaults must be audited, not assumed compliant. Non-identifying aggregate operational metrics may be considered only when they cannot reconstruct people, content or relationships. The technical design and deployed audit are still pending.

E2EE protects content, not absolute anonymity or device integrity. A relay or network observer may observe connection IP addresses, timing and traffic volume while a connection exists. A compromised/unlocked endpoint, a malicious recipient, screenshots, exported copies, compromised software updates or stolen recovery keys can expose content. Peer authentication, key-change warnings, secure update/dependency practices and independent review are required; they do not justify an absolute guarantee.

## Delivery and local history

1. The sending device writes to its protected local outbox and encrypts for authenticated recipient devices using the selected reviewed protocol.
2. A live transport forwards ciphertext without retaining it for later delivery. If the intended recipient is unavailable, the item remains pending only on the sending device.
3. The receiving device authenticates/decrypts, durably records the message locally and returns an authenticated acknowledgment. A relay accepting bytes is not proof of delivery.
4. The sender stores per-recipient acknowledgment state locally. Stable message identities and recipient-side deduplication handle lost acknowledgments and reconnects without a server message index.
5. Groups require delivery/retry per intended recipient and safe membership/key changes. A partially delivered group message must not be presented as delivered to everybody.

The initial target does not introduce unrelated peer storage or use somebody else's cloud backup as a delivery queue. Both the sending device and recipient need an opportunity to run and communicate; mobile background execution cannot be assumed. Delivery when the sender has gone offline, immediate killed-app ringing and uninterrupted multi-device synchronization are not guarantees of this architecture.

Full offline history, search, previews and call history move to an encrypted local database/media store. The current bounded SecureStore pending-text outbox is not a complete local history engine. Database selection, OS key protection, storage limits and media lifecycle need implementation and physical-device verification. Do not disable existing strict types or authorization tests to make that migration appear complete.

## Optional user-controlled backup synchronization

The proposed settings path is Me → Settings → Backup. No backup toggle or provider integration is implemented yet.

- Default is off. Provider sign-in and explicit consent enable a selected account. Show the destination, included data, last successful backup and failures; only a completed provider write can update success state.
- Encrypt an authenticated, versioned archive on the device, including private archive metadata and filenames. Use a reviewed backup format/cryptographic implementation; do not invent a cipher or encryption protocol.
- Keep the recovery secret under the user's control and verify recovery setup before enabling backups. Neither Mnelo nor the cloud provider should receive an unwrapped archive-decryption key. Logging into a phone number or cloud account alone must not bypass the archive's encryption. The precise recovery mechanism remains to be reviewed.
- Upload/download directly using the user's provider authorization and least-privilege access. Provider credentials stay on the device. Google Drive's app-specific folder is a possible storage interface, not an E2EE guarantee. iCloud requires an app entitlement/container design and owner account setup; no account or container has been created.
- Exclude live message databases, media, keys and temporary plaintext from implicit OS cloud backups unless included through the explicit encrypted backup flow. Verify iOS resource flags and Android backup/device-transfer rules on supported OS versions; a UI switch alone does not enforce consent.
- Interrupted uploads must not destroy the last verified backup. Restore verifies integrity/version/ownership before changing local history; corrupted archives or the wrong key must fail without partial data replacement.
- Restoring an archive must not blindly replay old ratchet/session state or resurrect revoked devices. Protocol-specific handling must prevent key/nonce reuse, unsafe group rollback and silent identity changes. History restoration and enrollment of a new device are separate operations.
- Turning backup off stops new synchronization. Removing an existing cloud copy is a distinct explicit action with provider-confirmed results; provider retention/versioning limitations must be disclosed. No remote deletion promise applies to another participant's device or backup.
- If the only device is lost and no usable backup and recovery material remain, Mnelo cannot recover history. Cloud quotas, failed synchronization and account access also affect recovery. Cross-platform iCloud/Drive restore compatibility is not yet established.

## Connect, identity, calls and safety impact

The current server-side matcher reads stored profiles/capabilities, Need/Offer records, relationships and reputation. Moving chat alone does not satisfy an all-information prohibition. Interpretation can be moved to devices, but candidate discovery still requires a specified way for willing users to exchange discovery information. A live opt-in discovery design needs an explicit privacy/abuse/performance review; an offline central directory is not silently retained. No claim is made that current global matching works without these records.

Phone-based Supabase Auth, unique usernames, persistent blocks, report investigation, reputation, notification routing and cross-device account management currently depend on server records. Their replacements and tradeoffs remain part of the migration. Do not silently remove promised safety functions or retain their private records under a different name. In particular, sending report evidence to an administrator discloses that selected content; the existing retained report workflow is not an approved exception to this policy.

Calls need media E2EE with authenticated device-controlled key distribution, transient authorization/routing and local history. The current LiveKit room is created without E2EE options; its authorization, SQL call lifecycle and durable cleanup records do not meet this decision. LiveKit signaling is a separate visibility boundary even when media E2EE is enabled. Evaluate the entire control plane, not just a media-encryption switch. No recording/transcription is permitted.

APNs/FCM/Expo notifications and SMS providers have their own storage/metadata boundaries. Generic wakeups would still need a routing design compatible with the policy; existing durable notification jobs and token records are not grandfathered. Never put messages, contact identities, group names or locations in notification payloads. Reliable background behavior requires actual iOS/Android testing and an honest supported-behavior statement.

## Current gaps and ordered migration

The repository at `589d4c3` sends `text_body` to `send_text_message` in `src/services/supabase/chat-repository.ts`; migrations persist it in `public.messages.body`. `media-repository.ts` uploads readable bytes through `chat-upload` and obtains private Storage signed URLs. `connect-repository.ts` sends raw requests to `connect-intent` and reads persisted `matching_requests`. `useCallRoom.ts` creates a LiveKit Room without content E2EE. These are concrete implementation gaps, not configuration switches.

1. Inventory every message, metadata, identity, discovery, provider and recovery data path. Select and review a maintained native-capable E2EE/peer-authentication solution and a compatible transient relay design. No new cryptographic dependency is selected by this decision.
2. Implement protected device-owned history/media, peer/device key management and delivery acknowledgments. Keep existing local fixture behavior identifiable during migration; prevent real-user rollout on the old data path.
3. Replace persistent messaging/media/group/call transports and control-plane records. Preserve backend-denial test coverage while replacing obsolete persistence assertions with correct relay/local-storage tests.
4. Redesign identity, Connect discovery and safety operations within the agreed retention boundary. Document any feature tradeoff before changing its promised behavior; no retained-data exception is implied.
5. Implement opt-in encrypted backup synchronization and recovery. Validate provider permissions and both OS backup rules; use no Mnelo-held cloud credentials or recovery secrets.
6. Audit providers, logging, memory/disk behavior, backups, delivery failures, endpoint keys and supply chain. Independently review cryptography and perform physical two-user/multi-device acceptance before updating public claims.

Existing migrations/history, local fixture data and useful UI are preserved. This decision does not authorize destroying unknown data or rewriting Git history. A later migration must verify destinations, remove prohibited active paths and document removal of old private copies/backups before release. The current null release-environment registry remains unchanged; this document adds a required release acceptance gate, not a new automated enforcement mechanism.

## Acceptance evidence required — all pending

- Two-user direct/group/media flows establish E2EE, authenticated identity, safe key changes and actual recipient acknowledgments; a relay/admin with server credentials cannot decrypt content.
- An offline recipient leaves no durable message or metadata copy on any Mnelo/provider delivery component; sender restart, relay restart, duplicate retries and partial group delivery behave honestly.
- Database/object/cache/log/trace/crash/snapshot/backup inspection finds no prohibited persistent data. Record the exact deployment/providers inspected; do not extrapolate from a unit test.
- Calls use media E2EE and do not retain participants/history in a server store; signaling and live traffic visibility are documented, without an anonymity claim.
- Backup is off until explicit consent. Provider data consists only of locally encrypted archives; Mnelo has no archive, provider token, recovery key or backup index. OS backup/device-transfer exclusions are physically verified.
- A damaged-device scenario restores from a user-authorized cloud archive and recovery material on a replacement device. Wrong-key, corruption, quota, interrupted-write, lost-key, device-revocation and stale-session restoration tests pass safely.
- Discovery, identity, blocks, reports, reputation and notification behavior are verified against a reviewed no-retention design or an explicitly approved revised scope. None inherits a PASS from the former Supabase architecture.
- Independent security review and native hardware QA support bounded public wording. Do not publish “unhackable,” “no information ever exists anywhere,” or “only on the author's phone.” Recipients and explicitly enabled user-cloud backups have copies.

## Primary implementation references

Checked 2026-09-09; these establish provider capabilities/limitations, not Mnelo compliance:

- [Google Drive application data folder and scoped access](https://developers.google.com/workspace/drive/api/guides/appdata).
- [Apple iCloud data security and Advanced Data Protection](https://support.apple.com/en-us/102651).
- [Apple backup exclusion flags](https://developer.apple.com/documentation/foundation/urlresourcekey/isexcludedfrombackupkey).
- [Android Auto Backup and device-transfer configuration](https://developer.android.com/identity/data/autobackup).
- [LiveKit media E2EE and signaling visibility](https://docs.livekit.io/transport/encryption/).
