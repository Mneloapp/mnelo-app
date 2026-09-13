# Mnelo Development hosting — first 50 testers

## Actual state — 2026-09-12

The owner authorized the small rented development server, completed Hetzner registration/verification, credited **$25**, and completed the separate Cloud Console login. Reused the empty Default project, renamed it **Mnelo Development**, and purchased exactly one VM. This supersedes the September 11 account-access-pending checkpoint.

| Setting                   | Verified value                                                    |
| ------------------------- | ----------------------------------------------------------------- |
| Project                   | Mnelo Development, `16005696`                                     |
| Server                    | `mnelo-dev-01`, ID `165553002`                                    |
| Location                  | Nuremberg (`nbg1`), Germany                                       |
| Plan                      | CX23, x86_64, 2 vCPU, 4 GB RAM, 40 GB disk                        |
| OS                        | Ubuntu 24.04.5 LTS                                                |
| Public IPv4               | `46.225.169.127`                                                  |
| IPv6 network              | `2a01:4f8:c2c:a65d::/64`                                          |
| Actual checkout           | **$6.49/month VM + $0.60/month IPv4 = $7.09/month excluding VAT** |
| Included outbound traffic | 20 TB/month shown at checkout                                     |
| Paid additions            | None: no backups, snapshots, volumes or load balancer             |
| Firewall                  | `mnelo-dev-firewall`, ID `11610044`; applied                      |
| Runtime                   | Node 24.18.0 / npm 11.16.0; Caddy 2.11.4                          |
| Services                  | `mnelo-relay`, `mnelo-identity`, `caddy`; active, enabled at boot |
| Signaling                 | `wss://relay-dev.mnelo.com/`                                      |
| Phone registration        | `https://identity-dev.mnelo.com`                                  |
| Current SMS admission     | Two owner-selected testers; phones/indexes omitted from Git       |

[Server console](https://console.hetzner.com/projects/16005696/servers/165553002/overview). The earlier EUR estimate was EUR 5.99/month before tax; this account's checkout uses dollars. The server bill is separate from Infobip. Stopping a VM does not end billing. Any future deletion must also account for the separately billed IPv4 and intentionally preserve/dispose of the registration state. No total project spending cap or unlimited capacity is implied.

## Access and transport

A dedicated `mnelo-development-admin` Ed25519 public key was added. Its private key remains only on the owner's Mac at `~/.ssh/mnelo_dev_ed25519`, mode 0600; it was never placed in cloud-init, Git or the server. Administration uses `mnelo-admin` with key authentication. Root/password/keyboard-interactive SSH login is disabled. SSH port 22 is restricted at both firewalls to the administrator's current IPv4 /32. If that address changes, update the existing rule; do not expose SSH to every address.

The server's Ed25519 host fingerprint is `SHA256:WfvF0byC9kUxmuCek6uM+tsgwy4WzdaJ+BPD0jJLaAY`. First SSH contact used **trust on first use**, to the IP assigned in the authenticated Hetzner Console, and pinned it in `.local/hosting/known_hosts`; subsequent commands enforce `StrictHostKeyChecking=yes`. An independent out-of-band console fingerprint check was **not** completed: the Console action did not expose its console window in the in-app browser. Do not describe the first-use pin as an independent verification or automatically accept a later changed key.

Only TCP 80/443 are public application ports. The provider firewall also permits ICMP for network diagnostics. The relay and identity listen on **127.0.0.1:8084/8086**. No database, Metro, Caddy admin API or TURN ports are exposed. Caddy obtains/renews TLS certificates and proxies only the selected service paths. No change was made to the `mnelo.com` website, its root/wildcard records or Vercel nameservers. Added only the previously unused `relay-dev` and `identity-dev` A records, TTL 60. The explicit records override the existing website wildcard for those two names only.

Authoritative Vercel DNS and public resolvers returned the new relay address. The Mac's default resolver retained the previous wildcard response during initial tests; its first WSS probe therefore reached Vercel's 404, not this VM. TLS verified from the Mac when connecting to the assigned IP with the correct hostname; ordinary hostname WSS/HTTPS checks passed from the VM. Do not count the stale-DNS Mac probe as a successful external test. A subsequent Node OS-resolver lookup returned the VM address; the full WSS relay and HTTPS identity checks then passed from the Mac using ordinary DNS and TLS, without an IP override or certificate bypass. Device-network resolution still needs physical acceptance.

## Private identity configuration

`deploy/hetzner/configure-identity.mjs` is a one-time bootstrap for a new service. It receives an allowlisted set of server-only Infobip settings through encrypted SSH stdin, generates a fresh HMAC index key on the server, writes root-only `/etc/mnelo/identity.env`, and admits approved phone **HMAC indexes**, not plaintext numbers. It refuses to overwrite existing configuration/registry. The local registry had **zero registrations**, was preserved, and was not migrated; no device vault or content was uploaded. The hosted development registry is a separate environment.

The identity user alone can write `/var/lib/mnelo-identity`, with directory mode 0700 and database/key modes 0600. Only the phone-index/public-key/discoverability/verification-time registry and anonymous SMS budget counters persist. The Infobip key is server-only; no credential is embedded in Expo configuration or bundles. Read-only provider configuration checks passed both on the Mac and VM, with **no SMS sent**.

Public registration is limited to explicitly admitted testers (at most 50 configured indexes). It also requires the existing signed device challenge and provider OTP. Unadmitted sends fail before calling the provider. Aggregate reservations are capped at **10/hour and 15/day**, persist in `sms-budget.db` across restarts, and are committed before a provider request. Failed/uncertain sends consume a reservation. This is a conservative development send cap, not a currency cap or a claim of 15 free SMS every day. Existing per-phone/device/source limits and nonce/OTP state remain memory-only. The Caddy source header is overwritten with the actual client socket address; hosted mode requires that valid header from loopback, ignores client-supplied standard forwarding headers, and fails closed on malformed/multiple addresses.

The owner completed a one-time top-up. The live Infobip billing page now verifies **US$20.00 available balance**; both automatic-payment options remain unconfigured. The onboarding page explicitly confirms pay-as-you-go messaging is enabled, initially with **15 free SMS remaining**. After the owner completed the first real registration, the portal showed **14 of 15 remaining** and the balance still $20. The earlier $6 credit / $6.33 checkout was a quoted minimum, not the completed payment. The total card debit/fee on the owner's $20 top-up was not independently checked. No additional payment or branded sender registration was made.

The guide still displays verified-recipient wording in its example 2FA flow despite the pay-as-you-go account banner. Georgia's sender section offers free-form sending after adding funds, with possible operator rewriting of the sender name. The owner subsequently confirmed actual SMS receipt and successful code entry on the first iPhone; the hosted registry contains one identity and both aggregate budget windows show one reservation. The second number remains untested. Do not buy a sender or enable automatic recharge to resolve an untested delivery assumption.

After the owner specified the two actual test numbers, replaced the initial unused trial admission with exactly those two HMAC indexes. Immediately after the update, the registry and SMS reservations were both zero. Read-only checks and configuration updates did not send a code. The owner then initiated one real registration from the iPhone, which succeeded as recorded above. Existing index key, registry, budget database and provider settings were byte-checked unchanged before restarting identity.

For later intentional cohort changes, build `scripts/configure-hosted-testers.ts` with `npm run hosting:build` and deploy the hash-verified `configure-testers.mjs`. Run it as root on this development VM with a JSON array of canonical phone numbers through encrypted SSH stdin, never command arguments, a committed file or shell history. It replaces the full admission list (1–50 unique valid numbers), refuses non-development/ambiguous configuration, and preserves other settings. File checks reject symlinks, shared links and insecure modes; an exclusive lock and atomic synced rename prevent partial configuration. Restart only `mnelo-identity` afterward; do not rerun the fresh-registry bootstrap, rotate its key, erase registration data or reset SMS budgets. Admission is not ownership verification: each device must still complete its own provider OTP.

## Retention and isolation actually checked

The relay uses a dynamic non-root user, a read-only filesystem, no writable data directory, loopback-only network access, no capabilities, bounded memory/tasks and zero core/swap allowance. Identity runs under a separate non-login user with only its state directory writable. Caddy/relay/identity request and process output logs are disabled; Caddy config autosave/admin API are disabled. System journals are volatile; rsyslog is disabled; UFW logging is off; swap is absent. Apport is masked and the kernel core pattern is `/dev/null` in addition to process dump limits. The two bootstrap-only persistent journal files were removed before admitting traffic. A later scan found no files in the persistent journal/crash/coredump locations.

Cloud-init schema validation and the security-update reboot succeeded. Inspection caught Ubuntu's vendor `syslog.conf` overriding the original journald forwarding flag; the final `zz-mnelo.conf` sorts after it and `ForwardToSyslog=no` is effective. No private provider data was present during bootstrap. No infrastructure snapshots were created.

These checks establish this development configuration, **not** independent protocol certification, provider-wide compliance or anonymity. The host/ISP necessarily processes IPs/timing; Infobip receives registration numbers and has its own retention. No server message, attachment or call-history database, durable forwarding queue, recording or content key is deployed.

## Repeatable verification

- `npm run hosting:build` creates explicit, dependency-bundled runtime/check files in ignored `artifacts/hosting/`; no directory-wide upload, dotenv embedding, mobile state, native projects or legacy Supabase code. The manifest records source commit/dirty state, versions and SHA-256 values. Remote bytes were verified against it before installation.
- `npm run test:relay:cohort` remains a local synthetic 50-peer test. Its compiled form also passed on the VM.
- `npm run hosting:check:relay -- --url wss://relay-dev.mnelo.com/` tests the deployed relay with synthetic keys: invalid signature rejected, 50 simultaneous authenticated routes, 50 signed offers, reconnect, and all routes offline after disconnect. Run only deliberately against development. Also passed after a service restart.
- `node artifacts/hosting/check-identity.mjs --url https://identity-dev.mnelo.com` tests signed status, unregistered lookup rejection, forged-proof rejection, missing content API, browser-origin rejection and rejection of rotating spoofed proxy addresses. **Never sends/verifies an OTP or creates an account.** It intentionally uses that source's challenge quota; allow one minute before a second run.
- The full local suite passed **298 tests**: 235 Jest, 60 messenger/provider/hosting and 3 historical stream utility tests. Seven new tests exercise admission, persistent/atomic budgets, clock rollback and proxy boundaries. TypeScript/lint/format/source/security/env/localization/brand checks pass.
- Expo Doctor with the documented Ruby/PATH setup returns **20/21**, due to the already documented 25 Expo patch recommendations. Compatibility check also fails on those recommendations. The first invocation without CocoaPods PATH was 19/21. No native dependency alignment, native build or device QA was performed for this server change; do not relabel these results as Doctor/build PASS.
- npm audit remains **16 moderate affected entries / two underlying advisories / zero high or critical**. Promoted the already installed `esbuild@0.28.2` to an exact direct development dependency; no existing package version changed. See [dependency disposition](DEPENDENCY_AUDIT.md).

The relay used approximately 35 MB and identity approximately 35 MB in the observed idle/post-check snapshots, with no unexpected restarts; these are not peak-load sizing guarantees. The tests do not establish 50 real phones, 25 video calls, WebRTC media throughput, SMS delivery, mobile background behavior or production readiness.

## Remaining work toward two iPhones

Configure authenticated, expiring TURN credentials and test its media path; currently no TURN service is installed/open. Confirm the second phone's actual SMS eligibility and deliberate receipt. Configure/verify mobile development endpoints and resolve existing Expo maintenance recommendations before the next rebuilt binary. Preserve the preview/production protocol-review gate. Independent protocol review, Apple distribution, notifications/background behavior and physical two-device acceptance remain open. See [two-iPhone readiness](TWO_IPHONE_TESTING.md).

Official runtime sources: [Node 24.18.0](https://nodejs.org/en/download/archive/v24.18.0), [Caddy installation](https://caddyserver.com/docs/install), [Hetzner pricing](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/), [IPv4 pricing](https://docs.hetzner.com/general/infrastructure-and-availability/ipv4-pricing/). The Node archive checksum was checked against the official HTTPS-published SHA-256; no GPG signature verification is claimed.

## September 12 TURN follow-up

The same VM now runs coturn 4.18.0 as mnelo-turn, with public TCP/UDP 3478 and UDP 49160–49759 allowed in both Hetzner firewall and UFW. 40 allocations per pseudonymous user, 400 total, 1 MiB/s per session and 10 MiB/s service bandwidth caps. Forwarding peer ACL permits only 46.225.169.127 (the relay allocations), denying other public/private destinations. Hosted mobile clients must use relay-only ICE; older clients without TURN cannot interoperate across unrelated networks and must update.

The shared secret is generated only on the VM. /etc/mnelo-turn/turnserver.conf is root:mnelo-turn 0640 inside 0750; /etc/mnelo/turn-identity.env is root-only 0600 and supplied through an identity service drop-in. It is separate from existing provider/tester configuration. No secret is committed, sent to the app, put in command arguments or printed. The app receives only expiring REST credentials. Runtime stdout/stderr go to null, no logs/admin/metrics/database listener is enabled, coredumps/swap remain disabled. Exact config is deploy/hetzner/turnserver.conf.template and systemd files. This is development transport evidence, not a provider-wide retention certification.

## September 12 — background routing deployment

Active code bundle source: `5b8197a97ea25508ae70caa3a4e776e0652f38d5`, verified clean manifest under /opt/mnelo/releases; /opt/mnelo/runtime points to it, with the prior code retained for rollback. Identity now supports signed minimal push routing, using the existing phone registry/service origin. All existing identity/index/SMS budget/admission state was verified preserved; one registered identity remains, zero new SMS. The new routing database is initially empty and contains no messages/history. Only identity restarted; the actual TURN unit is mnelo-turn.

APNs Sandbox uses a root-only source key and systemd LoadCredential. The initial file guard rejected systemd's root-owned read-only ACL mount; deployment rolled back, the guard was narrowly corrected, and deployment/HTTPS/50-peer WSS checks then passed. Source directory stays 0700; key/env files 0600; push-routes.db 0600 owned by mnelo-identity. A later September 12 update added Production APNs key UHS939BXXT through a separate LoadCredential, preserving Sandbox, all existing registry/budget/key/admission and push records. All four services and public no-SMS HTTPS checks pass. One Sandbox VoIP route exists; no alert route/peer grants or actual delivery are established. Firebase project mnelo-development now exists, but Android client/sender credentials are unfinished. See [operations and exact pending actions](PUSH_OPERATIONS.md). No additional server, paid cloud product, identity reset, SMS or message storage was introduced.
