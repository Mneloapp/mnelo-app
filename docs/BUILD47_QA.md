# iOS 0.1.0 (47) test build

Build 47 contains the complete call, messaging, interface and chat-export changes documented in [build 46 QA](BUILD46_QA.md). It additionally packages localized INSendMessageIntent example phrases in the main application to address Apple's build 46 processing warning 90626 for English and Georgian. The examples are static phrases and contain no personal contacts.

The final host check passed 875 tests: 659 Jest tests in 112 suites, 3 server tests and 213 device integration tests. TypeScript, ESLint, formatting, environment, localization and brand checks passed. Generated English/Georgian vocabulary plists and the Xcode project pass Apple plist validation.

The existing-cohort TestFlight release remains subject to signed artifact verification and Apple's processing result. Exact evidence and availability are recorded after upload. Build 37 and subsequent retained archives/IPAs remain preserved.

## Physical acceptance

Use build 47 on both phones for the [full physical checklist](BUILD46_QA.md#physical-testflight-checks-still-required). Begin with voice/video calls in foreground, background and locked states. Record answer-to-audible-speech, first remote video frame, rejection-before-answer behavior and camera switching. Collect the retained phase diagnostics immediately afterward.

The native Message action still requires confirmation on the actual phones. Siri example-phrase validation does not prove that iOS displays that action. Host tests also do not establish acoustic latency, microphone/speaker routing, successful TestFlight upgrade or public-release readiness.
