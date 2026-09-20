# Public launch preparation — 21 September 2026

Status: **in progress; not a public release approval**. The owner authorized real-number registration and public iOS/Android distribution, then added message send/receive reliability and latency. Starting source: `4688397`, following TestFlight 0.1.0 (53). Original archives and participant state are preserved.

## Message flow changes

- Successful partial media transfers request the next serial delivery cycle immediately, eliminating the three-second idle polling interval between two-chunk steps. Uncertain responses and failed durable writes retain backoff.
- Delivery/read receipts proceed between media requests and projected messages. Calls retain higher priority and burst fairness. Encryption, durable journal commits and idempotent retries are unchanged.
- Advancing bounded outbox/inbox pages continue without artificial idle gaps. Deferred, blocked or failed work alone does not trigger a busy loop.
- Notification workers remember wakes arriving during provider requests and immediately drain subsequent due pages. Provider retries retain individual backoff; push acceptance never consumes message ciphertext.

The new autonomous integration uses real libsignal, signed HTTP, SQLite journals, production pacing, a relay-equivalent wake, a 13-part encrypted attachment and concurrent text. No manual polling drives the measurement. This is a synthetic network model, **not physical phone latency**.

| Measurement, 40 ms per HTTP request       |    Before |    After |
| ----------------------------------------- | --------: | -------: |
| 13-part attachment visible                | 19,889 ms | 4,524 ms |
| Maximum gap between downloaded chunks     |  3,113 ms |   114 ms |
| Concurrent text visible                   |    599 ms |   604 ms |
| Concurrent text delivered acknowledgement |    945 ms |   958 ms |

The full suite also uses real WebSocket wakes with 80 ms/request: text visible 350 ms, subsequent delivery receipt 360 ms, read receipt 371 ms. Sixty one-second messages had maximum visible latency 377 ms and maximum read latency 947 ms. These are regression measurements, not production guarantees.

`npm run check`: **934 tests passed** (696 Jest / 119 suites, 235 device/protocol integrations, 3 server utilities), plus type, lint, format, security-boundary, environment, localization and brand checks. Scenarios cover offline reconnect, attachment byte integrity, once-only projection, lost responses, failed commits, call preemption, poison ciphertext, review isolation and notification retries. The new notification race test drains 26 jobs without idle page delays.

Evidence: ignored `artifacts/public-launch-message-baseline.log`, `public-launch-message-after.log`, `public-launch-message-regression.log`, `public-launch-full-check.log`.

## Server checks

Read-only inventory (20 September UTC / 21 September Tbilisi): identity, TURN and Caddy active, zero recorded restarts; standalone relay intentionally inactive because routing is combined with identity. Four identity records, three admitted indexes. Configuration files are mode 0600, application services have hardening and memory limits, swap is absent, and about 34 GiB remains free.

HTTPS/WSS probes passed: forged signatures, unknown registration, browser origins and forged proxy-address headers cannot bypass tested boundaries. No SMS, account, push or call was created by these probes. This is not a load test or independent infrastructure audit.

Evidence: ignored `artifacts/public-launch-20260920-server-audit.json`, `public-launch-hosted-identity.log`, `public-launch-hosted-relay.log`.

## Outstanding public release requirements

1. **Registration:** country availability and SMS spending ceiling await owner answers. Existing service still uses development admission and persistent aggregate SMS quotas. Public registration needs persistent number/device/source limits, a global budget, verified provider capacity and a reviewed number/key recovery process. SMS alone must not silently replace a pinned encryption identity.
2. **Production:** `privacyRelease.reviewed=false`; dedicated production origins/configuration are missing. Automated engineering tests do not satisfy the existing independent protocol review gate. Do not relabel a preview binary or disable this gate to publish.
3. **Android:** owner chose a new personal Google Play account. Registration started with developer name Mnelo. Owner authorized the existing payments profile, but Google's embedded selection dialog currently fails automated interaction. Account completion, identity verification, USD 25 registration fee and required testing remain. Server has APNs but no FCM sender credential. Signed AAB and physical Android acceptance are missing.
4. **Apple:** version 1.0 remains Prepare for Submission, with no screenshots, selected public build, copyright or review/contact fields. English description was corrected and saved for encrypted offline delivery and readable chat ZIPs. Build 53 is TestFlight testing, not a production submission.
5. **Security:** fresh npm audit reports 16 moderate affected package entries, zero high/critical, across the existing decoder/UUID advisory families. See `DEPENDENCY_AUDIT.md`. Native-intent mitigation and the tooling-only UUID disposition are not a clean dependency audit. Independent protocol/deployment review remains incomplete.
6. **Disclosures:** obsolete no-offline-queue website claims were corrected in English/Georgian and deployed to mnelo.com from website commit `3cc28d4`. Local type, lint, test and production-build checks passed; browser checks verified both languages, support search and the live privacy notice. Deployment: `mnelo-idy2qy9fo-mnelo.vercel.app`. Public support/operator details, terms, privacy/data-safety forms, age rating, territories and a usable public account-deletion support route still need completion. Private contact details cannot be assumed public.
7. **Physical QA:** no instrumented two-phone acceptance of 53 or these messaging changes is recorded. Final iOS/Android binaries need immediate first-word, locked/background call, Wi-Fi/cellular, media, receipt, offline restart, notification-routing and update-retention checks.

Current references: [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/), [Google personal-account testing](https://support.google.com/googleplay/android-developer/answer/14151465), [Google account deletion](https://support.google.com/googleplay/android-developer/answer/13327111). Verify the actual Play account's required testing and production access before promising a date.
