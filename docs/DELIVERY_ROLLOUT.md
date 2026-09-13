# Current delivery rollout — September 13, 2026

Status: **server enabled; physical clients not migrated; NOT READY for public release**.

The owner's current scope is a simple Chats / Calls / Me messenger without AI. Temporary encrypted offline delivery replaces the previous direct-only requirement. This is an application integration of official Signal primitives and WebRTC, not WhatsApp proprietary code or wire compatibility.

## Actual hosted state

The existing combined identity/relay service now runs clean source `c7edcb9c3acd438cbf85830613d8d34360ddff11`. The code-only operator preserved all **3 registered identities**, index key, SMS budget, push routes, reviewer isolation and provider configuration. The standalone relay remains disabled; combined identity, Caddy and TURN are active. No SMS was sent by this rollout.

A separate scoped operation inserted only the `/delivery` POST route (250,000-byte bound, source-IP header replaced by the proxy) and `delivery-v2.conf`. The opt-in is enabled. Caddy validation and actual HTTPS unauthorized-request rejection passed. Database files use owner-only permissions. Read-only aggregate observation after activation: 0 published Signal identities, 0 ciphertext envelopes, 0 media objects. Neither real phone has silently switched protocol.

Rollback swaps code/configuration only. Never restore an older account database over newer activity, delete participant histories or reuse an older Signal ratchet state. The older code-only updater preserves whatever delivery flag is currently configured; turning off an activated delivery service pauses queued clients and is not a transparent protocol fallback.

## Data boundary

| Location                    | Data                                                                                          | Retention / access                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Participant SQLCipher vault | History, media, private identity/session/prekeys, outbox, receipts, contacts, profile         | Device owner controls local history; no peer-delete operation                                                 |
| Identity directory          | Phone lookup index, registered public routing identity, registration and access policy        | Separate from conversation content; not anonymous/no-metadata                                                 |
| Signal directory            | Public identity/signed keys/one-time bundles, bounded lease records                           | Authenticated access, identity pins, monotonic one-time-key watermark                                         |
| Delivery spool              | Ciphertext, sender/recipient routing identifiers, opaque event IDs/timing, notification hints | Original maximum 30-day expiry; ciphertext removed on recipient ACK or expiry; bounded idempotency tombstones |
| Media store                 | Encrypted chunks, size/digest and routing metadata                                            | Key/nonce/filename inside Signal content, never a public file URL; recipient ACK/expiry cleanup               |
| Push routing                | Per-device provider tokens and generic event identifiers                                      | No message body, profile, contact name, number or decryption key in APNs/FCM payload                          |
| TURN                        | Live encrypted media packets                                                                  | No stored audio/video; standard DTLS/SRTP transport                                                           |

No claim of zero server metadata, guaranteed OS background execution, forensic erasure or independent security certification is made. Delivery stores must remain excluded from backups. Existing build 9 still requires a reachable sender; the server rollout alone does not change installed clients.

## Verification

- Full source check: **438 tests** (304 Jest in 61 suites, 3 server utilities, 131 device/protocol integration), TypeScript/lint/format/security/environment/localization/brand PASS.
- Native iOS and Android protocol probes: **10 checks each**, plus independent official Node/libsignal reply decryption on each platform. Actual native execution; synthetic identities only.
- Complete Android ARM64 Release probe APK and iOS Release simulator probe builds PASS. These isolated probe artifacts are not product distribution builds.
- Hosted TURN UDP/TCP network checks PASS. Separate real Chromium WebRTC test: **17 assertions in normal UDP/TCP mode and 17 in TCP-only mode**, including selected relay/relay pairs, bidirectional audio packets/video frames, no capture before accept, mute, hangup, decline, permission denial and peer cleanup. Its control transport is an in-memory asynchronous queue, not a physical phone or a substitute for the separately tested Signal HTTP path.
- The first video harness run timed out waiting for RTP because its synthetic static canvas stopped producing frames. The fixture now continuously draws synthetic frames. The retained initial failure is not counted as a pass. No camera/microphone of a real person was used.
- Deployment transformation/manifest guards: **7 Python tests PASS**. A real failure/rollback drill was not performed on the live server.
- Doctor 21/21, dependency alignment, both Hermes exports and secret scan (source/history/bundles) PASS at their recorded checkpoints. Final product native packaging is logged in BUILD_LOG.

Evidence: `artifacts/delivery-hosting-deploy.log`, `delivery-enable-result.log`, `delivery-hosted-state.json`, `delivery-final-full-check.log`, `delivery-enable-guard-tests.log`, `queued-calls-udp-results.txt`, `queued-calls-tcp-results.txt`, `native-signal-interop-result.log`, `native-signal-android-interop-result.log`.

## Remaining gates

1. Official libsignal 0.102.2 is AGPL-3.0 and unsupported for external consumers. The owner has explicitly authorized AGPL-3.0-only open-source distribution, including reuse/forks, and a future donation-supported model. Source publication is documented in [OPEN_SOURCE](OPEN_SOURCE.md). This resolves the owner's licensing choice; corresponding-source packaging, all third-party notices and App Store distribution compatibility still require verification before a new store binary.
2. Signed-key rotation, safe retirement of leased private keys and account/device recovery are incomplete. Current refill preserves identity and unused/leased material, with a hard 200-private-prekey bound. Exhaustion fails closed. This is acceptable evidence of a bounded development implementation, not production lifecycle readiness.
3. Migrated history exports use archive version 2 and omit live Signal ratchets. The new build explicitly blocks incomplete device recovery before any account/history mutation and explains the limitation in Backups/Restore. Existing version-1 legacy restore tests remain intact. Full recovery and device replacement still require implementation; an export alone is not proof of restored messaging access.
4. The real iPhone product Release build 10 and final signature/permissions/hosted bundle checks now pass. After resolving distribution obligations, update both phones in place and perform physical QR, contacts, media, voice recording, maps, replies, receipts, audio/video, interrupted network and locked/background-call tests. Neither phone has been reinstalled or erased in this checkpoint.
5. Do not replace the existing public website's direct-only description with claims about installed build 9. Coordinate the customer-facing transition and release notes with actual new-client rollout. In-app retention copy now follows the same flag as its transport.
