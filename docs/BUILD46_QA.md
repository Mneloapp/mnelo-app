# iOS 0.1.0 (46) test build

This build is for the existing TestFlight cohort, not public App Store release. Build 37 and all later retained archives/IPAs remain available. The final public security/protocol review and production readiness work are separate from this regression pass.

## Changes

- Call signaling can advance between receipt/media operations without breaking the serialized encrypted transport. A native answer no longer holds the system event drain while capture starts, so a subsequent hangup is handled promptly.
- Voice playback owns an explicit audio-session lease, plays with the Silent switch enabled, routes to the receiver near the ear, preserves external devices, and yields to recording or CallKit. Expo's delayed player deactivation no longer disables a newly started call session.
- The pinned WebRTC camera implementation now applies camera selection constraints and awaits the switch. Source/version guards prevent silently applying this patch to an unknown dependency.
- Native message intent replies have a separate signed extension, exact account/phone/call validation, encrypted durable sending, and cancellation-aware database closure. See [native reply validation and limitations](IOS_NATIVE_MESSAGE_REPLY.md). System Message-button visibility has not yet been established on physical phones.
- Albums use explicit rows to avoid small-screen pixel-rounding wrap failures. Attachments have larger icons; Location selects an arbitrary MapKit place, while My location shares an explicitly requested current fix.
- Shared contact cards use phone numbers. Legacy key-based cards are sanitized for display and require an existing local phone binding for forwarding.
- Ordinary reactions replace a user's prior emoji; poll votes retain their independent semantics.
- Swiping an outgoing message left opens Message info. Direct messages show receipt times; groups separate readers, delivered recipients and pending recipients. An opposite swipe still replies. Receipt times are local observations, historical unknown times stay unknown, and original recipients are preserved through future membership changes.
- Message menus dismiss from blank side, gap and bottom areas. The canvas is white with soft gray controls. Contacts without photos have varied rings consistent across chats and calls for the current launch.
- Contact info no longer briefly advertises Save to phone Contacts before an already-saved contact is recognized.
- Contact and group info export local history into a ZIP with Chat.html, Media/, Links/ and Documents/. The transcript opens offline in a normal browser. Files are streamed, text/paths are escaped, passive media stays local, and unavailable attachments are marked. The starting message boundary excludes later arrivals; edits/deletions during export abort and remove the partial archive. Cache cleanup also runs on startup and local account erasure. ZIP32 limits (under 4 GiB and 65,534 entries) fail explicitly instead of truncating history.

## Host verification

- The final full check passed 871 tests: 655 Jest tests in 111 suites, 3 server tests and 213 device integration tests. TypeScript, ESLint, formatting, environment, localization and brand checks also passed. Signed artifact hashes are recorded in the ignored build46 release evidence.
- Actual native camera probe, voice-routing lease probe and iPhone SDK typechecks passed. Native SiriKit routing/completion probes and four real SQLCipher cancellation/rollback probes passed.
- Native Yoga album regression: 1,086 combinations across 320–500-point viewports, pixel scales and album counts passed; the former wrapping layout reproduced 106 failures.
- Actual component browser checks at 320/393 points in English/Georgian covered Message info, menus, avatars and contrast. Export tests extracted real ZIP files, checked CRC/binary roundtrips, 305 chronological messages, Unicode, safe paths/HTML, cancellation and concurrent changes. An independent file:// browser check loaded the exported image and navigated transcript links offline.
- A modeled receipt backlog moved call-upload position from 21 to 2 (3,200 to 160 ms of queue time at a modeled 160 ms/request). This is not an iPhone answer-to-audio measurement. The idle signed-delivery fixture did not show a material latency improvement.

The compiled source is private commit `70edb05ee0af706608a182893d548e7cee8e7f94`. Its public source tag `ios-0.1.0-46` points to `37e198322a7c64020b293123b828e588785f8d71`. The archive and exported distribution IPA passed artifact verification. Xcode uploaded build 46 on September 19 at 23:57 Tbilisi. Apple processing reported warning 90626: missing INSendMessageIntent example phrases in English and Georgian. Build 46 was not assigned to tester groups; build 47 adds the localized vocabulary metadata before the physical pass.

## Physical TestFlight checks still required

1. Upgrade both phones from build 45 to successor build 47, which includes these changes. Confirm the existing account, contacts and history remain available, and startup neither crashes nor shows the phone-service-unavailable screen.
2. With Mnelo closed or the phone locked, receive a message and check that the app badge updates before opening it. Tap the notification and confirm the exact sender's chat opens. In the foreground, confirm there is one banner rather than a generic banner followed by a named duplicate.
3. Send messages in both directions at roughly one-second intervals, including while the receiving chat is open. Check arrival order and delay, the uncolored delivery leaf and its transition to green after reading.
4. Try voice and video calls from locked, background and foreground states. Measure answer, first audible speech and first rendered remote frame; collect the retained call-phase diagnostics immediately afterward. Confirm the correct caller name appears on the first incoming screen, Calling changes to Ringing when appropriate, ringback is audible, the speaker button matches the actual route, and the timer tracks the connected call.
5. Reject an incoming call before answering using the system UI. Confirm no crash, no duplicated incoming screen/notification, and immediate termination on the caller. Check whether the system Message action is present and whether a reply reaches the correct caller exactly once.
6. Switch front/back cameras repeatedly during a video call. Confirm the remote phone sees each change.
7. Play a voice message with the Silent switch enabled, move the phone near/far from the ear, repeat with Bluetooth/headphones, and receive a call during playback. Check playback/recording cancellation on leaving the screen.
8. On the smaller phone, inspect albums, Message info, reaction replacement, white/gray surfaces and menu dismissal. Check arbitrary-place selection versus My location.
9. Export a chat using Save to Files, unzip it, open Chat.html and its local media/links/documents. Confirm message counts/order, Georgian text and cancelled-export cleanup.

No physical result or public-release readiness is claimed by host tests alone.
