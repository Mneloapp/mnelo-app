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
- The signed native archive, distribution verification, exact-source publication,
  Apple upload and TestFlight processing will be recorded after they complete.

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
