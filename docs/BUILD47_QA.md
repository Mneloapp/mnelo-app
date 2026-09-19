# iOS 0.1.0 (47) test build

Build 47 contains the complete call, messaging, interface and chat-export changes documented in [build 46 QA](BUILD46_QA.md). It additionally packages localized INSendMessageIntent example phrases in the main application to address Apple's build 46 processing warning 90626 for English and Georgian. The examples are static phrases and contain no personal contacts.

The final host check passed 875 tests: 659 Jest tests in 112 suites, 3 server tests and 213 device integration tests. TypeScript, ESLint, formatting, environment, localization and brand checks passed. Generated English/Georgian vocabulary plists and the Xcode project pass Apple plist validation.

## TestFlight delivery — September 20, 2026

Xcode uploaded 0.1.0 (47) at 00:33 Asia/Tbilisi. Apple build `c0812b20-a272-4dfb-b3a6-48cda4af78c7` completed processing; the build 46 Siri warning 90626 is absent. The existing standard-encryption and France-No answers were saved. Both existing groups now show build 47 **Testing**, with 90 days remaining: Mnelo Development has 1 internal tester and Mnelo Preview has 2 external testers. Beta review was submitted and the external group's Testing state was verified afterward. This is an existing-cohort TestFlight update, with no public App Store submission.

Build 46 is retained and superseded by 47 for this test release. Build 37 and subsequent retained archives/IPAs remain preserved. The owner subsequently reported completing the requested physical call test successfully; the evidence and remaining checks are recorded below.

## Exact source and artifacts

| Item                    | Verified value                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Compiled private source | `7717c6ec2415208c760910ad2fe96f59b34ac0c8`                                                                                 |
| Source tree             | `a8da2bed8d57622a6a609cceb6b0f8d5a1ac28f6`                                                                                 |
| Public source           | [ios-0.1.0-47](https://github.com/Mneloapp/mnelo-app/tree/ios-0.1.0-47), commit `a13444a9570ed04e8d66a452f3f69b87b9edc5f0` |
| Exact-source CI         | [35467388881](https://github.com/Mneloapp/mnelo-app/actions/runs/35467388881), success                                     |
| IPA                     | `artifacts/Mnelo-0.1.0-47-export/Mnelo.ipa`, 152,125,673 bytes                                                             |
| IPA SHA-256             | `adfa16e2bb065fc984bc614b80fcf51a975367d27bc80b924cfa9cae6301f286`                                                         |
| Main Hermes SHA-256     | `bf2e85c3779d749cff0073099bb3025f24292e3c66b27e5f0a6193ea076541c7`                                                         |

Archive and exported IPA verification passed for all five app/extension identities and versions, signatures, app-group/keychain continuity, production distribution entitlements, service endpoints, the exact source offer, absence of the Testing runtime, localized permission strings and the native QR provider. Both compiled main-app Siri vocabulary files contain two examples and match their generated English/Georgian resources. All 143 Pod dependencies match build 46.

The independent compiled-artifact audit matched all five executable UUIDs to their retained dSYMs and matched their code/metadata sections between archive and IPA. The main Hermes bundle and all three extension JavaScript bundles agree with the archive; the extension bundles also match generated files and build 46. Another 95 resource files are byte-identical; the five reencoded Info.plists are semantically identical. Compiled camera switching, voice/proximity handling, MapKit, Siri routing and diagnostic markers are present. Review fixture markers are absent.

Source and decoded-Hermes secret scans returned zero findings. The packaged scan returned two generic-key matches in minified Share/Intents JavaScript; both were individually traced through their exact syntax and runtime identity source to confirm false positives with no embedded credential literal. The raw reports remain retained; no blanket allowlist or scanner configuration change was used. Exact-source CI also passed Doctor, dependency compatibility, the high-severity dependency audit, mobile exports and secret checks.

Xcode reported four missing vendor dSYM warnings for `React.framework`, `ReactNativeDependencies.framework`, `WebRTC.framework` and `hermesvm.framework`. These warnings did not prevent upload or Apple processing, but limit symbolication inside those vendor frameworks. The application's and all four extensions' matching dSYMs are retained.

Local evidence: `artifacts/build47-release-evidence.json`, `build47-source-ci.json`, `build47-archive-verification.json`, `build47-export-verification.json`, `build47-compiled-features.json`, `build47-packaged-secret-review.json` and `build47-upload.json`. These ignored release records are separate from the immutable published source tag.

## Physical acceptance

On September 20, the owner replied to the build 47 physical-test request: “დასრულდა მაკზე შეერთებული არ მაქვს მაგრამ მუშაობს კარგად” (completed; the phones are not connected to the Mac, but it works well). The request covered foreground voice calling, video calling to a locked receiver with camera switching, and rejecting an incoming call. Record this as a positive owner-reported result for the requested call test, not separate instrumented proof of every scenario. No device logs were collected and no numerical answer-to-audio or first-video delay was supplied.

The remaining [physical checklist](BUILD46_QA.md#physical-testflight-checks-still-required) includes explicit account/history preservation, cold notification-to-chat navigation, badges, rapid messages and receipt leaves, voice playback, albums, Message info and exported ZIP contents. A future instrumented call pass can measure answer, audio activation and first received media alongside the user's actual hearing/visible-frame observations; the current report does not require reconnecting the phones now.

The native Message action still requires confirmation on the actual phones. Siri example-phrase validation does not prove that iOS displays that action. Host tests also do not establish acoustic latency, microphone/speaker routing, successful TestFlight upgrade or public-release readiness.
