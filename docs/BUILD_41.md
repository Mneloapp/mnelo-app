# iOS 0.1.0 (41): release configuration and communication latency

Post-release update: **0.1.0 (41) is available in both existing TestFlight
groups**. Signed archive/export verification, exact-source CI and the live
server deployment passed. One paired iPhone was updated in place, launched
successfully and negotiated authenticated delivery-sync. Both-phone voice/video
acceptance remains pending. A final review also found an older intermittent
`0xdead10cc` suspension crash; build 41 does not claim to fix it. See the final
September 19 entries in [BUILD_LOG](BUILD_LOG.md) for evidence and remaining
acceptance work. The preparation checkpoint below is retained as release history.

September 19, 2026 preparation checkpoint. Source checks pass and the Release
archive is building. Apple upload, tester availability and final two-phone
acceptance are not yet verified.

## Changes

Build 39's unavailable-phone-service screen was caused by missing public service
configuration in the native JavaScript bundle. Build 40 supplied it through a
local Xcode environment file. Build 41 makes that correction repeatable: Expo
prebuild carries the selected public configuration into the native build, and a
guard immediately before bundling rejects missing endpoints, missing reliable
delivery, stale local overrides and incompatible build profiles. The current
archive is deliberately launched without caller-supplied Expo variables to
exercise that handoff. Details: [native build environment](RELEASE_BUILD_ENVIRONMENT.md).

Call preparation now overlaps outgoing invite delivery. A rapid answer can use
media preparation already underway. Native offer/answer negotiation and TURN
credential waits no longer block the authenticated message inbox, allowing a
decline, hangup or unrelated message to be processed while media setup continues.
Per-call SDP work remains serialized and bounded; ended calls cannot resume
negotiation. Existing consent, caller authentication, CallKit audio ownership
and speaker-route behavior remain in place.

The delivery protocol adds an authenticated, capability-negotiated exchange that
combines an optional outgoing envelope, up to 20 acknowledgements and inbox
retrieval. It removes separate HTTP work between successive messages and
receipts while preserving serialized Signal journal writes, retryable
ciphertext and recipient-scoped acknowledgements. Older clients receive the
same status response; newer clients fall back when talking to an older server.
Share-extension outgoing-only behavior remains supported.

The negotiated client request budget supports sustained interactive chat while
retaining capacity for urgent calls and receipts. The server's registered-device
challenge/delivery limit is 360 commands per minute; the client remains below
that at 240 per minute plus a bounded 48-token capacity. Unknown-identity,
SMS, lookup and prekey protections are retained. Foreground and connectivity
events explicitly request inbox retrieval instead of waiting for idle polling.
These improvements require deployment of the corresponding server code.

Thirteen reviewed SDK 57 patch packages are aligned without changing React
Native 0.86.3, React 19.2.3 or the LiveKit/WebRTC versions. Expo modules continue
to build from source, preserving the correction for the unavailable Testing
framework. [Dependency review and validation](BUILD_41_DEPENDENCIES.md).

## Executed validation

The complete source check passed **698 tests**: **529 Jest tests across 99
suites**, **3 server checks** and **166 device/protocol tests**. TypeScript,
lint, formatting, source security/environment/localization checks and brand
validation passed. The test suite includes release-configuration failure cases,
call cancellation during pending media setup, SDP ordering, capability fallback,
bounded acknowledgements, cross-recipient isolation and sustained chat traffic.
Evidence: `artifacts/build41-check.log`.

Expo Doctor passed **21/21** after patch alignment and CocoaPods toolchain
configuration; the dependency compatibility check passed. Dependency audit
reported **no high or critical findings and 16 moderate findings**. The moderate
findings remain recorded; a clean audit is not claimed. Evidence:
`artifacts/build41-doctor-final.log`, `build41-dependency-alignment.log`,
`build41-lock-alignment.log` and `build41-audit-final.log`.

iOS and Android JavaScript exports passed. Gitleaks scans of source, history and
the exported bundles reported zero findings (`artifacts/build41-export.log` and
`build41-secret-scan.log`). The in-progress signed archive requires its own final
artifact checks.

The controlled local fixture uses real Signal encryption, signed HTTP,
WebSocket wakes and the production request scheduler, with 80 ms of simulated
delay per HTTP request. The final source run measured:

| Measurement                                                          |     Time |
| -------------------------------------------------------------------- | -------: |
| Send to receiver projection                                          |   343 ms |
| Receiver projection to sender's delivered state                      |   353 ms |
| Mark-read to sender's read state                                     |   342 ms |
| Voice accept → encrypted offer → encrypted answer                    | 1,046 ms |
| Video accept → encrypted offer → encrypted answer                    | 1,045 ms |
| Maximum receiver projection delay across 60 messages, one per second |   383 ms |
| Maximum send-to-read delay across that sequence                      |   959 ms |

The sequence retained message order. These are local protocol measurements,
not iPhone answer-to-audio, first-video-frame or APNs latency measurements.
Native media capture, TURN connectivity and rendering require a separate
physical call. Metrics are recorded as `LATENCY_MS` in `build41-check.log`.

Expo clean prebuild completed with the explicit TestFlight configuration, and
CocoaPods installed 142 pods from 138 dependencies. The generated environment
and bundle guard are present. Evidence: `artifacts/build41-prebuild.log` and
`build41-pods.log`. The in-progress bare Xcode archive is logged in
`artifacts/build41-archive.log`; archive/export verification is pending.

## Release and device acceptance still pending

At this checkpoint the hosted service still runs the build-37 deployment
`0fc9ed96f2b83bb5b32a9122a9114c6cd412bd5d`. Deployment of the reviewed server
changes and live compatibility checks have not yet been recorded. The source
offer points to the intended `ios-0.1.0-41` release tag; publication and
exact-source CI are also pending.

After archive completion, verify app/extension versions, public endpoints,
shared-vault/keychain identity, permissions, signatures and embedded libraries.
Distribution APNs and debug entitlement checks belong to the exported App Store
application. Upload/processing/compliance and both existing TestFlight groups
must then be verified separately.

Both phones still require an in-place update and fresh acceptance: cold launch
with retained history, notification tap into the correct chat, closed-app badge,
one-second message sequences in both directions, declined-call termination,
voice answer-to-audio and video answer-to-first-frame timing, and actual speaker
output. The owner's earlier 36.3 improvement report is not acceptance of this
new binary. No fresh build-41 physical test result is claimed here.
Both phones were disconnected when the latest device inventory was checked.
