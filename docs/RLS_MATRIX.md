# Mnelo authorization matrix

> September 12 local card addition: no new exposed server table or RLS policy. DeviceMessenger binds received cards to a trusted, unblocked channel peer; users cannot assign another profile author. Node integration tests exercise unknown/blocked/spoofed authors and backup boundaries. [Current architecture](PROFILE_CARDS_QR.md).

The active messenger no longer stores messages or profiles in Supabase, so RLS is not its authorization boundary. Historical RLS policies and negative tests remain preserved for audit continuity; their previous PASS is not proof for the new protocol.

| Operation                                | Enforced boundary                                                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Open local storage                       | OS device key plus mandatory SQLCipher; no plaintext fallback                                                                       |
| Authenticate relay route                 | Ed25519 signed nonce challenge; no duplicate live displacement                                                                      |
| Register phone alias                     | Single-use signed request challenge plus approved, expiring OTP bound to that device; existing other identity cannot be overwritten |
| Lookup complete number                   | Own registered public key proof; no partial/bulk query; discoverability; per-device/source quotas                                   |
| Change phone visibility / unlink         | Signed proof of the current bound key; no caller-supplied owner ID; direct SQL access unavailable                                   |
| Open peer/call channel                   | Pinned peer, signed recipient/session/expiry/SDP fingerprints                                                                       |
| Receive text/media                       | Known unblocked sender, own and sender conversation membership                                                                      |
| Mark delivered/read                      | Authenticated recipient's own delivery row only                                                                                     |
| Change group                             | Existing pinned owner; increasing complete revision                                                                                 |
| React                                    | Conversation membership; local own reaction identity                                                                                |
| Block                                    | Device refuses sender and closes active links/call                                                                                  |
| Delete history                           | Device-local operation only; no remote deletion packet                                                                              |
| Restore backup                           | User recovery key, AEAD integrity, strict table/column validation, identity check, atomic transaction                               |
| Self-verify / reputation / admin reports | Removed; no active feature or endpoint                                                                                              |

Current executable negative tests: `tests/messenger/*.integration.ts`. Production device/security tests are listed in [release requirements](RELEASE.md).

App entry: local identity alone cannot access feature routes, peer transport or notification listeners. A successful OTP stores a local origin-bound enrollment; signed server actions still enforce their independent registry authorization. Imported archives and display caches contain no valid enrollment. This is device-local gating, not PostgreSQL RLS. Username and optional names have no remote lookup or global uniqueness claim.
