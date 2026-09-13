# September 12 functional beta engineering review

The owner explicitly requested preparation for two real iPhones, using TestFlight for the remote device. This review permits **functional testing of the isolated development cohort**, not public release or an audited-security claim. `privacyRelease.reviewed` remains false. Production stays blocked. No independent cryptographic certification has occurred.

Earlier repository documentation required an independent protocol audit before _any_ preview build. That overbroad restriction prevented the owner-requested physical tests needed to gather lifecycle evidence. The reviewed exception now accepts only preview with the exact development HTTPS identity and WSS relay endpoints. It does not relabel a store binary as development, use an environment variable claiming an audit, or authorize production. The hosted SMS admission list still contains exactly the two owner-specified test numbers; this update neither broadens admission nor sends SMS.

## Boundaries reviewed

- Device vault: mandatory SQLCipher, device-only Keychain key and protected backup-excluded native directory. Build 3 deliberately permits local background access after first unlock, including while locked; see [the accessibility migration](BACKGROUND_DELIVERY.md). Existing key name, bundle identifier, database filename, service origin and history are preserved. Missing keys do not replace existing history.
- Identity: one-use device-signed challenges, real OTP before binding, registered-device lookup and TURN issuance, quotas, hidden-number indistinguishability, no phone/public-key replacement through a fresh OTP. Provider secret and TURN shared secret stay server-side.
- Peer authentication: pinned Ed25519 keys sign the full recipient/session/purpose/expiry/SDP. WebRTC validates the signed SHA-256 DTLS fingerprint. Modified signatures/fingerprints and unrelated recipients fail existing negative tests. Added bounded two-minute replay suppression; no unauthenticated negotiation is accepted.
- Negotiation: delayed credentials cannot resurrect stopped/blocked connections or cancelled calls. Concurrent probes coalesce; stale callbacks cannot remove a replacement peer. Added receive-queue bounds. Call failure callbacks are scoped to the originating call.
- TURN: official coturn 4.18.0 source pinned to commit `23c6c1d32a3d2b21a56cee65d3203bcc4ea82d2b`; source tag is unsigned, not claimed verified-signature provenance. Standard REST HMAC credentials expire for new allocations after one hour, are cached in device memory with a five-minute refresh margin, and contain a keyed pseudonym instead of a phone/public key. Already authenticated allocations may continue until closed: expiry is not an immediate session revocation mechanism.
- Forwarding: relay-only ICE for hosted clients. The server denies every peer address except its own allocation address. Wrong credentials and five forbidden destination ranges were rejected over both TCP and UDP in live checks. The service has no database drivers, admin/CLI/metrics listener, swap, durable logs, message queue, recording or history endpoint. Forwarded data remains native DTLS/SRTP ciphertext; TURN still observes live network metadata.
- Retention: runtime logs discarded; volatile system service-status journal only. Identity registry/index key, aggregate SMS budgets and the new minimal push-token/wake-capability routing registry are persistent exceptions. No conversation content/history queue is added. Provider-level metadata retention is not independently certified.

## Evidence and limits

Automated device/provider tests and hosted network checks are reported in QA_REPORT. Real browser WebRTC tests through Hetzner passed text, chunked file, voice/video tracks, consent-before-capture, mute, hangup, decline, block and selected relay/relay candidate pairs, using both normal UDP/TCP selection and TCP-only access. The media is synthetic; this is not physical iPhone audio/camera QA.

The first iPhone already completed real SMS registration. Standalone binary upgrade, second-phone OTP, actual microphone/camera/audio routing, foreground/background, interrupted calls and network changes still require physical acceptance. Native build/upload/Apple processing are recorded separately; this document does not assert they succeeded.

## Restrictions for this beta

Use non-sensitive test conversations with the admitted participants. Build 3 implements native APNs/CallKit and FCM/Telecom paths, but production provider setup and two-platform physical background acceptance remain required. Offline pending history remains on the sender's device, with no server delivery queue; push acceptance is not content delivery. Carrier networks blocking port 3478 may fail; TURN-over-TLS/443 is not configured. Automatic Drive/iCloud sync and simultaneous multi-device use of one identity are unsupported. Do not uninstall to update: local history belongs to that installation.

Public release still requires independent protocol review, stronger authenticated-peer disk/abuse controls, group revocation/recovery review, durable reaction/read retries, large-media/backup memory review, complete two-platform lifecycle QA, and owner-approved legal/export/privacy disclosures. These are explicit residual issues, not silently accepted production readiness.

## Coturn advisory disposition

4.18.0 incorporates the vendor's subsequent 4.13–4.17 security fixes. Two older advisories have no patched-version metadata: [IPv4-mapped ACL](https://github.com/coturn/coturn/security/advisories/GHSA-j8mm-mpf8-gvjg) and [randomness regression](https://github.com/coturn/coturn/security/advisories/GHSA-fvj6-9jhg-9j84). The pinned source now canonicalizes embedded IPv4 before range comparisons and uses OpenSSL RAND_bytes for randomness; its legacy fallback on RNG failure remains a production-review item. The deployed service supports only AF_INET and denies all non-relay peers, reducing the former advisory's exposure. Do not treat empty advisory metadata as proof of either a current exploit or zero risk. [Vendor releases](https://github.com/coturn/coturn/releases/tag/4.18.0).
