# iOS 0.1.0 (55) — Focus refinements

This beta removes the extra Mnelo label from internal headers, uses lime for the
new-conversation action, restores pull-down search without a separate search
icon, and aligns the message field with its attachment and Send/Voice controls.
Headings and profile actions are more restrained. Native multiline drafts grow
within their bounds and return to compact height after sending or clearing.
Details and bounded design evidence are in [FOCUS_DESIGN](FOCUS_DESIGN.md).

The existing TestFlight environment, app identifier, signing team, account/vault
identifiers, call media and message transport remain unchanged. Update in place
without deleting the app. This is a beta for the two existing tester groups,
not a public App Store submission or a new claim about call connection latency.

## Frozen source and checks

Private source: `75098249792f18bb657ed3d7578d403740ee7a4b`; exact tree:
`400d27dde1eeacdbabe1b911fad05400ddcbfdec`. Corresponding source is published at
[ios-0.1.0-55](https://github.com/Mneloapp/mnelo-app/tree/ios-0.1.0-55), public
commit `f5c4cd6765958a057b84ff95f384433db3d8f3a5`, with the identical tree.
The public update preserves public history and includes no private development
history, local artifacts, generated native projects or signing material.

The frozen source passed 711 Jest tests across 122 suites, TypeScript, ESLint,
formatting and localization checks. The device/protocol suite passed 244 tests
and the server regression suite passed three. Source security, environment,
brand and pinned secret scans passed. These are bounded checks, not a full
independent security audit.

Design checks covered Georgian/English browser layouts at 320/393/430 pixels,
22 accessibility runs with no automated violations, and the current composer
components on a disposable iPhone SE simulator at native font scales 1.00 and
1.79. Browser layout branches do not reproduce native glyph measurement. The
bounded native fixture does not verify the full release app, real delivery,
physical keyboard behavior or VoiceOver acceptance.

The signed archive passed all five bundle versions/signatures, capabilities,
endpoints, permissions, Siri vocabulary, source offer and own dSYM checks.
Native call markers and Focus/ComposerAction markers are present in actual
Hermes/native binaries; design QA scaffolding is absent. Archive secret scans
found no credential literals: two minified extension matches were individually
proved runtime constructor/identity expressions.

## Distribution checkpoint

Apple Distribution export passed all five bundle signatures/production
entitlements, archive/IPA binary and payload equality and matching own dSYMs.
All 95 non-signing resources match. IPA size: 152,198,633 bytes; SHA-256:
`107be152139fe4969a550a21d357849cdb00aa90f33122e0cf4de3457cbb933e`.
Hermes SHA-256:
`b816bd798968f5c689c1d96168dcf4838412b3c4af573c79246005b75e6e861a`.

Apple upload succeeded October 7; App Store Connect records the upload created
at 13:41 Asia/Tbilisi, with processing complete and the build's processed upload
date at 13:43. Both existing groups individually confirm **0.1.0 (55) — Testing**:
Mnelo Development (one internal tester) and Mnelo Preview (two external testers),
with 90 days remaining. The existing standard-encryption / France-No beta
answers and What to Test are saved. Automatic external tester notification is
enabled. No testers or public links were added, and no public App Store
submission was made. Internal Apple metadata already records an installed build
55; that is installation evidence, not physical functional acceptance.

The four existing vendor-symbol warnings remain
for React, ReactNativeDependencies, WebRTC and hermesvm. Own application/extension
symbols match. Earlier archives, including build 37, are preserved.

Evidence is retained in `artifacts/build55-evidence.json`, archive/distribution
verification reports, `artifacts/build55-source.json` and
`artifacts/build55-independent-validation.json`. Upload proof:
`artifacts/build55-processing.png`. Availability proof:
`artifacts/build55-development-testing.png`,
`artifacts/build55-preview-testing.png` and
`artifacts/build55-testflight-testing.png`.

Exact-source CI is tracked at
[run 37600169570](https://github.com/Mneloapp/mnelo-app/actions/runs/37600169570).
Clean installation and the full application check passed (958 tests). Doctor
passed 20/21 checks and failed on 17 newer Expo patch recommendations; this CI
run is **not green**. The compatible-package check also fails on those patch
recommendations. Independent native iOS/Android exports and host libsignal pin /
import smoke checks passed; host checks do not prove phone behavior.

A fresh dependency audit remains **failed** with 1 critical, 50 high and 17
moderate affected entries. New advisories concern
[shell-quote](https://github.com/advisories/GHSA-pqg4-j6r4-53mv),
[source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) and
[sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).
The scoped assessment finds them in development/build tooling: both native
production module graphs exclude those packages, corroborated by the actual
archive Hermes and extension-JS checks. No newly affected shipped-native high
or critical path was identified. The existing moderate runtime decoder remains
present with its previously verified external-link boundary. Build-tool risks
and compatible dependency remediation remain open; package manifests and
lockfile are unchanged. This assessment permits only the existing small beta
cohort and does not approve public production release. No gate is disabled.

## Physical acceptance

Install build 55 in place on both tester phones. Check retained registration,
history and media; Chats/Calls pull-down search; smaller/larger screens and long
Georgian headings; one-line/multiline typing, Send/reset with keyboard open,
attachment/keyboard transitions and larger accessibility text. Confirm profile
actions, contact cards, message information, export and VoiceOver. Recheck voice
and video calls and background notifications with both phones on build 55.
Physical acceptance remains pending.
