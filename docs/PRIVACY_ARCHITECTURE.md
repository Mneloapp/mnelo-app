# Mnelo device-owned privacy contract

> September 12 owner-required correction: both platforms must support background/closed-app notifications and native incoming calls. See [BACKGROUND_DELIVERY](BACKGROUND_DELIVERY.md) for the new routing/privacy boundary, locked-device migration, lifecycle requirements and remaining delivery limits. Earlier no-push-registry/foreground-only notes are historical implementation checkpoints, not the accepted target. Build 2 is not ready under this acceptance requirement.

Owner decision: 2026-09-10. This supersedes the former working product and the server-backed V1 model.

- No private messages, media, voice notes, call recordings/history, contact/group graph, profile directory, block lists or reports may be durably stored on Mnelo infrastructure, even encrypted.
- Updated owner decision (2026-09-10): phone registration and exact-number discovery are now requested. This authorizes one narrow identity-directory exception: a keyed phone index, public device identity, discovery preference and verification time. This is personal identity metadata, not anonymous data. SMS providers receive the destination phone number; the service sees it transiently during registration/search. The former blanket "no phone accounts / no information stored" promise is superseded. See [phone identity](PHONE_IDENTITY.md).
- September 12 background-delivery requirement adds minimal push routing: installation token/platform/channel, public identity binding, update time and opaque revocable wake-capability hashes/expiry. It stores no sender/contact graph or conversation history. Apple/Google observe delivery metadata. This necessary routing exception and zero-offline-TTL payloads are described in [BACKGROUND_DELIVERY](BACKGROUND_DELIVERY.md).
- The relay may process bounded live routing packets in RAM. It must not queue offline delivery. Hosting must disable payload/access logs, identifying traces, packet capture, durable caches, dumps, swap, snapshots and backups that could retain private material.
- Content-decryption and recovery keys belong only to users' devices. Transport providers must not receive them. Public identity exchange must authenticate the actual participant, independent of relay assertions.
- Each participant owns their own history. Local message/history/device deletion affects only that device. There is no delete-for-everyone protocol command. Deduplication tombstones prevent transport retries from resurrecting locally deleted content.
- Users choose, protect and restore their own copies. Optional backups are off by default and encrypted before export to a user-selected Drive/iCloud/file location. Mnelo has no backup or recovery escrow. Automatic provider synchronization remains unimplemented.
- Connect, matching and recommendation/discovery features remain removed. Exact-number contact lookup is the new, separate exception; it does not authorize restoring former social/matching data.

## Honest promise

Target wording, pending independent protocol and deployment verification:

“Your conversations belong to their participants. Mnelo does not keep conversation history or the keys needed to read it. Each person controls their own copies and backups.”

The owner accepts responsibility for recipient/device/key safety. This architecture focuses on removing platform content access and durable platform storage. It does not claim zero observable network metadata: routing addresses, timing and packet sizes exist transiently in a network connection. No blanket anonymity claim or absolute interception guarantee is added.

## Implemented versus release evidence

The mobile runtime is migrated to local SQLCipher and authenticated direct WebRTC, with user-held encrypted backup export/restore. The local relay has no storage implementation. This is **not yet proof that a future hosted provider meets the contract**, nor an independent review of Mnelo's identity/fingerprint/call integration. Release remains blocked on those checks; see [QA](QA_REPORT.md).

Deletion does not undo a backup or another participant's copy. Recovery into a fresh local identity does not silently resend old pending items. Restoring the same identity onto multiple live devices is unsupported; one live relay route per identity prevents silent displacement. Multi-device synchronization needs a separate reviewed device-key model.
