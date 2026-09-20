# iOS 0.1.0 (50)

## Changes

- Group title opens an information page with a group avatar, description, call/message actions, media, member list and export. Profile/photo/name editing and adding members have separate routes. Only the owner can edit membership; removal requires confirmation. Engine operations read fresh membership inside the mutation transaction, preserve unrelated members, reject untrusted additions/self removal, and keep the 16-person limit. Removed members cannot use the chat composer or start calls from group info.
- Chats support a left swipe revealing red Delete and green Export & delete, with equivalent VoiceOver actions. Deletion clears only this device's messages/media and hides the conversation; contacts, group membership and other people's history remain. New messages restore the conversation. Old message IDs remain forgotten so delivery retries cannot resurrect deleted history.
- Export & delete uses an iOS Files export picker, not ordinary share-sheet dismissal, as its save signal. Cancellation, failure, unavailable attachments, account replacement and leaving the screen retain the chat. After a completed save, deletion verifies the archive's canonical message snapshot under the database transaction. New messages or edited/deleted content prevent deletion; delivery/read receipts do not. Ordinary Export chat keeps its existing share flow.
- Shared contact cards lay out the timestamp below the content, giving the three icon actions the card's full width. Labels stay on one line at normal text sizes; larger text uses stacked actions. Save opens the native editable create-contact form. Existing contacts show the phone's alias and open the actual existing contact editor instead of creating a duplicate. Address-book access remains contextual and local.
- System quick replies can enter confirm/handle without the custom recipient token produced by Siri's resolution pass. The handler now resolves such requests against the native short-lived incoming-call selector and the authenticated encrypted call before sending. Invalid tokens, a changed number/account, blocked contacts, expired calls, and a different call remain rejected. Only durable server acceptance is reported as success. The user's build-49 report (preset selected, call declined, no Mnelo message) still needs a physical retest; this is a covered failing path, not a claim that device traces identified the sole cause.

## Validation

Host checks passed: 681 Jest tests in 117 suites, 225 device integration tests and 3 server tests (909 total), plus TypeScript, ESLint, formatting, localization, environment, source security and brand checks. SQLite integration checks cover deletion/replay/new activity, archive-save races, receipt traffic, owner permissions and membership preservation. Native Swift probes exercise the actual CallKit answer completion, voice audio-session handoff and SiriKit request handler with an iPhone SDK typecheck. The new direct preset path resolves and uploads before reporting success. Isolated React Native Web fixtures visually verified the real message bubble/contact card at 320/393-point widths in English and Georgian, the saved alias/action, and the group information/member layout. This is not a replacement for physical iPhone testing.

## Physical acceptance

1. Update both phones. Open group info, edit name/photo/description, add and remove a member; verify changes on the other phone and that a removed member cannot send or start a group call.
2. Swipe a disposable chat left. Cancel Delete, cancel Export & delete in Files, and verify history remains. Save the ZIP, inspect Chat.html and Media/Documents/Links, then verify the chat disappears. A new incoming message must restore the conversation. Receiving a new message during saving must preserve the chat.
3. Share a contact: test an unsaved number (editable native form, Cancel and Save) and an existing number (local nickname, open existing contact). Check smaller screens and enlarged text.
4. With the receiving app open, backgrounded and phone locked, select an iPhone preset reply. Verify one message in both Mnelo chats and the caller stops ringing. Repeat once offline and reconnect; no duplicate reply.
5. Recheck voice/video answer-to-audio, phone at ear, camera switching, cancellation and decline. Build 49's timing optimization remains; no millisecond latency claim is supported without physical measurement.

## Release evidence

- Private source commit: `41fd860db659c224fd117f472bd65c8f8f244dbb`; matching public source tag `ios-0.1.0-50` at `4cbc79a43464194979b6154adf7d9cde27237a17`. GitHub checks run `35475990728` passed.
- Archive: `artifacts/Mnelo-0.1.0-50.xcarchive`; signed IPA: `artifacts/Mnelo-0.1.0-50-export/Mnelo.ipa`, SHA-256 `38edb2e278457c0991083aaf6a56b3c9aa22e0237bc6bd3adcd3447f966d0d83`.
- Distribution signature, production APNs, shared keychain/app group, service endpoints, Siri vocabulary and source offer passed verification. Main app and all four extensions match the archive executable sections and their own dSYM UUIDs; 95 packaged resource files match. Decoded Hermes scan has no findings; the two packaged minified-JS scanner matches were verified by AST as runtime identity expressions, not embedded secrets.
- Apple upload and processing completed. Build `1639ed1e-8b22-4ae4-91a4-f1f373f13fdc` is **Testing** in Mnelo Preview (2 external testers) and Mnelo Development (1 internal tester), expiring in 90 days. Automatic tester notification is enabled. The four pre-existing vendor dSYM warnings (React, ReactNativeDependencies, WebRTC, Hermes) remain; Mnelo and extension symbols are retained and verified.

Prior signed archives/IPAs, including build 37, remain retained. Physical acceptance is pending. This is a TestFlight release, not a public App Store submission.
