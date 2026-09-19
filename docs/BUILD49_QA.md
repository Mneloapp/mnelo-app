# iOS 0.1.0 (49)

## Follow-up from the owner

Build 48 connects successfully while held at the ear and chat export works. The owner clarified that Mnelo's two in-app timers agree; the incoming iPhone system timer starts earlier. This is qualitative physical feedback, without USB traces or an answer-to-audio measurement.

## Changes

- Complete CallKit's incoming answer only when the authenticated media transport connects, with the same local connection timestamp used by Mnelo. Previously fulfilling the button press immediately started iOS's timer during ICE/DTLS setup. Outgoing system calls also receive the recorded connection timestamp, rather than a later bridge-callback time. Duplicate actions, connection-before-answer, cancellation, timeout and provider reset are handled. Audio remains owned by CallKit's activation callback; no microphone/camera is opened before consent. The native answer regression runs with `node scripts/test-native-answer.cjs`.
- Call setup fetches configuration and checks the authorized peer concurrently, then rechecks call identity, lifetime and permission before allocation. Existing ringing-time preparation, early encrypted SDP and event-driven candidate/delivery paths remain. New local-only `NATIVE_MEDIA_CONNECTED` and `ANSWER_COMPLETED` markers separate transport readiness from CallKit audio activation. This does not establish a millisecond latency result; actual sound and locked-screen video require two-device acceptance.
- Suppress inbox replay alerts when iOS has already presented the same message. Read both direct APNs trigger payloads and Expo data, retain a bounded displayed-event ledger across notification cleanup, and dismiss the actual remote notification identifier. Merely receiving a hidden foreground push does not count as presentation; fresh messages and distinct missed-call results still alert.
- Shared contact cards use three aligned circular Mnelo icon actions, with short visible labels and full accessible action labels. Existing phone identity, account/navigation cancellation and saved-contact behavior remain. A local fixture renders the actual card at 320/393-point widths in English and Georgian with isolated action dependencies; device rendering is still a physical acceptance item.
- Exported photos/videos/audio have MIME-derived extensions and stable, unique numbered names, for example `Photo-000002.jpg` and `Video-000003.mp4`. Chat.html download labels and filenames match ZIP entries. Documents retain sanitized original names with a unique sequence prefix. Real ZIP extraction verifies repeated generic names cannot collide.

## Validation / release

Host QA passed: 670 Jest tests in 115 suites, 3 server tests and 222 device integration tests (895 total), TypeScript, lint, formatting, environment, localization, source-security and brand checks. The compiled Swift answer-completion probe passed. The signed native archive and distribution export passed signature, entitlement, version, endpoint, source-offer and localized Siri checks. All five app/extension executables match their archive code and retained dSYMs; 95 non-signing resource files match. Source and decoded Hermes secret scans had zero findings; two minified JavaScript scanner matches were independently traced to runtime identity properties, not embedded credentials. Four existing vendor dSYM warnings remain for React, ReactNativeDependencies, WebRTC and hermesvm. Public CI run 35473237256 passed all checks. Existing archives and IPAs remain retained. No public App Store submission is authorized by this beta release.

## Physical acceptance on both phones

1. Update both installations without deleting app data. Call with the receiver locked, unlocked and at the ear. Compare iOS and Mnelo duration; listen for the first word in both directions. Try Wi-Fi/cellular and video, including unlocking and camera switching. Reject and cancel before answering and while connecting.
2. Fully close the app, receive a message, then open Mnelo from its home-screen icon. Confirm no second banner. Send a fresh message while the app is open and confirm a normal banner; notification-tap navigation must still open the exact chat.
3. Use the contact card's Message, Call and Save actions. Export repeated photos and videos, unzip, open Chat.html and inspect the Media folder's numbered filenames.

Apple defines the connection time as when both parties can communicate: [incoming answer completion](<https://developer.apple.com/documentation/callkit/cxanswercallaction/fulfill(withdateconnected:)>), [outgoing connection reporting](<https://developer.apple.com/documentation/callkit/cxprovider/reportoutgoingcall(with:connectedat:)>). Host checks cannot measure physical audibility or certify public-release security.

## Release artifacts

Compiled source `0ed68b0079e5c4a5a88816192bdd8074436781e3`, tree `569cca6983b14cc5e16fc4b4223398c7c64ad2d7`. Public tag [ios-0.1.0-49](https://github.com/Mneloapp/mnelo-app/tree/ios-0.1.0-49), commit `84781f70a0d30a96ec766e041c484014ac415746`.

Retained archive: `artifacts/Mnelo-0.1.0-49.xcarchive`; IPA: `artifacts/Mnelo-0.1.0-49-export/Mnelo.ipa`, 152,143,390 bytes, SHA-256 `81d4d762cf980ca41319e651818fa89f1bc2c2f183a2ebc8a15676d823ae5007`. Main Hermes SHA-256: `6ce946852fdc0c683ab5b65aaedcd1653b0df5db6709436183ab697a435204bf`. Apple build ID: `b4d35e1c-c328-443e-87fd-21da6d251ba6`. Uploaded September 20, 2026 around 02:36 Asia/Tbilisi.

App Store Connect confirms **Testing** for both existing groups: Mnelo Preview (external, 2 testers) and Mnelo Development (internal, 1 tester), each expiring in 90 days. Automatic tester notification is enabled. The owner’s prior encryption answers were retained. No public App Store submission was made. New two-device acceptance remains pending.
