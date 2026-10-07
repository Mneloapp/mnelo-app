# iOS 0.1.0 (54) — Focus design

This TestFlight update implements the approved Focus visual direction across
Chats, Calls, conversations, My space, contact/group information, profile/group
editing, message information and Mnelo's active-call controls. It uses a white
canvas, gray controls, soft lime sections and dark navigation with a lime selected
tab. The implementation is described in [FOCUS_DESIGN](FOCUS_DESIGN.md).

Pinned conversations are functional account-scoped preferences, persisted on
native devices with SecureStore. They do not duplicate the ordinary unfiltered
chat rows. Existing search, filters, message actions, contact saving, export,
group-owner controls and call destinations remain available.

The TestFlight environment, application identifier, signing team, keychain and
vault identifiers remain the existing ones. This is an in-place beta update for
the current tester groups; it is not a public App Store submission. No new call
latency improvement or physical audio measurement is claimed by this design
change. Both test phones should run the same build for call acceptance.

## Engineering checks

- The integrated application passed 711 Jest tests across 122 suites, TypeScript,
  ESLint, formatting and localization checks. Device/protocol integration passed
  244 tests; the server regression suite passed three tests.
- Source-security policy, environment and brand checks passed. These are bounded
  engineering checks, not a complete independent security audit.
- The real-component browser fixture passed 26 accessibility runs, using fictional
  in-memory data at 320/393 pixels in Georgian and English. The larger-text branch
  check does not reproduce native Dynamic Type measurement.
- The Release archive and Apple Distribution export passed signature, entitlement,
  endpoint, source-offer, Siri vocabulary and compiled-feature checks. All five
  native binaries/dSYMs match the archive; 95 non-signing resources are identical.
  Secret scans found no embedded credentials; two packaged matches were separately
  proved runtime expressions rather than credential literals.
- Corresponding source is published at
  [ios-0.1.0-54](https://github.com/Mneloapp/mnelo-app/tree/ios-0.1.0-54), public
  commit `db744f32ffc06473d5aa1158d184f690fa9f599c`, exact tree
  `771ab1e8fcd0ca09f831683daee3e97a012277e9`. The compiled private source is
  `c942bf3cfb901ae860f9490435d57156d36bb012`; no private Git history was published.
- [Exact-source CI](https://github.com/Mneloapp/mnelo-app/actions/runs/37337066186)
  passed installation and the full application check, but Doctor stopped on newer
  Expo patch recommendations (20/21 checks). Package manifests and lockfile are
  unchanged from build 53. This CI run is **not green**.
- A fresh dependency audit also failed: 52 high and 12 moderate affected dependency
  entries. The underlying high-advisory packages are build/test tooling, with no
  identified affected implementation in the shipped native JavaScript. Moderate
  `decode-uri-component` is present at runtime; the existing native external-link
  gate is compiled into this artifact and 16 boundary tests pass. Findings remain
  open and require compatible remediation. This bounded assessment permits the
  existing small beta cohort; it is not public-release security approval. Evidence:
  `artifacts/build54-native-dependency-reachability.json`.

## Distribution evidence

Apple upload completed October 5 at 20:08 Asia/Tbilisi. Build ID:
`12225e13-7cf9-429c-bb53-f127448f4663`. TestFlight processing is **Complete**, with
the processed upload dated October 5 at 20:17 Asia/Tbilisi. Existing standard
encryption / France-No beta answers and What to Test were saved.

On October 7, authenticated App Store Connect access was restored. Actual group
membership was checked before retrying: neither group had been added by the
earlier interrupted attempt. Both existing groups were then added separately and
their build lists each visibly confirmed **0.1.0 (54) — Testing**: Mnelo Development
(one internal tester) and Mnelo Preview (two external testers), with 89 days
remaining. Automatic external tester notification was enabled. No additional
testers or public App Store submission were made. Proof is retained in
`artifacts/build54-development-testing-20261007.png`,
`artifacts/build54-preview-testing-20261007.png` and
`artifacts/build54-testflight-testing-20261007.png`.
The four existing vendor dSYM warnings remain
for React, ReactNativeDependencies, WebRTC and hermesvm; application/extension
symbols are retained. Earlier archives, including build 37, are preserved.

Exported IPA: 152,199,253 bytes, SHA-256
`811ddc7724175e9f3e61f16623f1be0c3cc833d17c9b2996db5cd3158d133e94`.
Hermes SHA-256:
`bf38beedbea74dfdab4ea9b62e3908d304aaac4c54ecf5d79fa7f5554885494c`.
Build evidence is retained in `artifacts/build54-evidence.json` and the build54
archive/distribution/compiled-feature verification reports.

Independent validation of the exact public source passed clean installation, both
native exports, source/public-history/export secret scans and 16 link-boundary
tests. Dependency recommendations and the security audit remain failed as above;
no gate was disabled. See `artifacts/build54-independent-validation.json`.

## Physical acceptance

Update in place without deleting Mnelo. Confirm retained registration, chats,
media and calls. Check the following on both a smaller and larger iPhone:

1. Chats, Calls and My space: long Georgian names, scrolling, search, filters,
   selected tabs, unread/missed counts and system home-indicator clearance.
2. Pin and unpin a chat with a long press; reopen Mnelo and confirm the preference
   remains. Verify pinned direct and group chats open and remain searchable.
3. Conversation: keyboard/attachment transitions, all eight attachment actions,
   contact-card actions, photos/albums, links, message information and export.
4. Group and profile editing: photos, names, member controls and cancellation.
5. Voice and video calls, locked-screen answering, first-word audibility, camera
   switching, speaker switching, decline/cancellation and foreground/background
   notifications. Browser screenshots do not verify these native flows.
6. Larger accessibility text and VoiceOver, including independent contact-card
   actions and message long-press actions.

Physical acceptance remains pending until the new TestFlight binary is installed
and exercised on the phones.
