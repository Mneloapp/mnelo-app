# Build 43 — local contact names on cold launch

The chat list previously queried the vault before the asynchronous phonebook
projection was ready. It displayed a Mnelo profile name or phone number, then
replaced that title with the device's saved contact name a second or two later.

Name-dependent `ContactView` queries now wait for the initial local phonebook
read. The app shell, network, message processing and notification navigation
continue independently. Identical concurrent name lookups, including the caller
cache warm-up and chat projection, share only the in-flight Contacts scan. Later
reads recheck permission and current names after that scan settles. This change
adds no persistent address-book cache; the existing native caller-ID cache is
unchanged.

The projection is scoped to the engine, own phone number and enabled session.
Permission changes, failed reads and cleanup discard its names. A Contacts
change during the first scan suppresses that obsolete result. Denied access or
a failed read releases the query to its existing profile/number fallback. An
exceptional hung read releases after five seconds, while a later successful
read can still refresh the name. Thus a native read that takes more than five
seconds can still show a fallback before the local name; ordinary initial
reads resolve before the first chat-title result.
A native scan that never settles remains coalesced for the same numbers until
process restart; the five-second fallback keeps the UI usable but does not
restart that native request.

Outgoing call targets and call-action trust checks now use raw local identity
queries under separate query keys. They cannot be delayed by name presentation;
incoming answer, media playback and decline remain available while labels load.
Pending call labels use the localized loading text. Protocol identity, contact
permissions and the build-42 media negotiation remain unchanged.

## Verification checkpoint

- Full checks pass: **738 tests** (558 Jest in 101 suites, three server tests and
  177 device/protocol tests), TypeScript, lint, formatting and source guards.
- Eleven phonebook-hook tests cover the cold query, refresh/revocation, failed
  and stalled reads, stale-session isolation, cleanup and StrictMode replay.
- A provider test verifies that the network and app shell start while the first
  name query waits, and its first displayed result is the phonebook alias.
- A real SQLite contact-view test preserves aliases and protocol identity while
  resolving the initial name asynchronously.
- Native adapter tests cover concurrent scan deduplication, independent result
  maps, fresh subsequent reads and recovery after rejection.
- The final 34 focused call/dial tests pass without console warnings, including
  immediate outgoing start, incoming answer/playback and blocked-contact safety
  while presentation queries remain pending. The full suite's initial dial test
  warning was corrected by awaiting its new independent trust query.
- Both mobile JavaScript exports pass. Gitleaks history, source and bundle scans
  report zero findings. No dependencies or server deployment changed.

Native archive, distribution and TestFlight availability are pending at this
checkpoint. The reported cold-launch sequence has been reproduced with delayed
Contacts responses in tests; the owner's physical-phone result remains to be
confirmed. Prior builds, including 37 and 42, remain preserved. The previously
documented intermittent suspension crash is not claimed fixed by this release.

## Signed artifact and corresponding source checkpoint

The preserved private source is
`b327383a3f583b10014acfdb0e4bde5e86ba415d`, tree
`8e9d1114e292608c02d37b319af79ad07107f3c7`. Corresponding public source is
`0aae9b848529b399e7a460479916ab3d43083876`, immutable tag `ios-0.1.0-43`.
Exact-source [CI 35453961875](https://github.com/Mneloapp/mnelo-app/actions/runs/35453961875)
completed successfully.

The signed archive and distribution export pass all four bundle versions and
identities, signatures, service endpoints, source offer, shared-vault identity,
permissions and absence of unavailable Testing-framework imports. The exported
application also passes production entitlement checks. Archive and exported
Hermes bundles match, SHA-256
`71807c7547a4ea71a92ac88d5efb94a4a6173374244a79d4eb6a22ea56252dc7`.

The IPA is retained at `artifacts/Mnelo-0.1.0-43-export/Mnelo.ipa`,
**121,088,488 bytes**, SHA-256
`b6bdae735ed4fce7831ee1950edb9889c9d8303becb1be9a3c63d99d9adf0f6f`.
The packaged secret scan reports zero findings. Evidence:
`artifacts/build43-archive-verification.json`, `build43-ipa-verification.json`,
`build43-ipa-regressions.json`, `build43-ipa-secrets.json` and `build43-ci.json`.

## TestFlight release completed

At approximately 20:28 Asia/Tbilisi on September 19, 2026, App Store Connect
separately confirmed **Testing** for build 43 in Mnelo Development (one internal
tester) and Mnelo Preview (two external testers). Apple build ID:
`4d8375e9-4d31-4221-9a52-f6ce63712ee5`. Test instructions are saved and automatic
tester notification was enabled. The existing standard-encryption declaration
and France-distribution answer were retained; no tester or access scope changed.

Xcode confirmed the upload completed. Its four existing missing vendor dSYM
warnings (React, ReactNativeDependencies, WebRTC and hermesvm) did not block
Apple processing; vendor crash symbolication is still limited for those images.
Full local evidence is retained in `artifacts/build43-evidence.json`.

No build-43 phone installation or launch was attempted because the owner cannot
connect a phone now. Physical cold-launch acceptance remains pending. The
existing suspension crash and the native Contacts limitations above remain
explicitly unresolved; this release does not claim to fix them.
