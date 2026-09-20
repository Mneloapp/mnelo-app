# iOS 0.1.0 (51) — Call audio repair

The owner reports no sound in either direction after answering a call following build 50. The phones were unreachable during the initial investigation. A later read of both devices found build 50 on George's iPhone and build 48 on Ani's; neither cached timing file captures the reported silent build 50 call. Physical answer-to-audio latency remains unmeasured.

## Findings and changes

- The pinned WebRTC 144.1.2 module instantiates the AudioEngine ADM. Mnelo only toggled the legacy `RTCAudioSession.isAudioEnabled` gate; it never synchronized the AudioEngine's input/output availability with CallKit. This allowed negotiation to start the engine before CallKit activation and provided no explicit AudioEngine restart at activation. The installed SDK source and the [official LiveKit CallKit example](https://github.com/livekit-examples/react-native-callkit/blob/main/src/CallManager.ts) establish this integration gap. It is a concrete defect and a plausible cause of the report, not a device-trace-proven sole cause.
- A version/hash-pinned native patch now starts the engine with input/output unavailable and listens to the existing manual audio session. Both paths become available only when CallKit has activated the session and Mnelo enables audio. Deactivation, end and interruption close the gate; subsequent activation restores it. Late module creation reconciles existing activation. The serial worker reads current state when it executes, so an old callback cannot reopen the microphone after a call ends. No JavaScript round trip or independent session activation is introduced. Automatic non-CallKit audio remains untouched.
- Incoming answer completion no longer waits for ICE/DTLS. The system action is fulfilled after audio configuration, allowing CallKit to grant audio promptly, as in [Apple's recommended answer flow](https://developer.apple.com/documentation/callkit/making-and-receiving-voip-calls). This reverses build 49's timer-alignment gate. The incoming system timer can therefore precede actual transport readiness; Mnelo's in-app timer continues to start at transport connection. Audio correctness takes precedence over cosmetic system timer alignment.
- Local content-free diagnostics record AudioEngine availability, suspension and errors in the existing bounded timing trace. No audio, conversation content, identifiers or telemetry are uploaded.
- Build 50's contact forms, group management, export and chat actions are retained.

## Validation

The native regression probe executes the installed patch's actual Objective-C methods against deterministic session/ADM doubles: cold and early activation, both input/output paths, end/restart, interruption/resume, delayed callbacks and native module recreation. The Swift answer probe verifies immediate completion before a network callback, duplicate handling and reset. The existing voice-playback lease probe verifies speaker/receiver routing and CallKit handoff, and typechecks against the actual iPhone SDK. These checks cannot prove audible sound on physical phones.

Full host checks passed: 681 Jest tests in 117 suites, 225 device integration tests and 3 server tests (909 total), plus TypeScript, lint, formatting, source security, environment, localization and brand checks. The patch was reapplied to the pristine pinned dependency and matched the installed source byte for byte. Signed archive and distribution IPA verification passed; release status follows below.

## Physical acceptance

1. Update both phones to 51 without deleting the app. Make one voice call in each direction with both apps open. Verify the first words are audible on both phones and the timer advances.
2. Repeat with the receiver locked, then held at the ear. Toggle speaker on and off; hang up and immediately make another call.
3. Repeat with video, switching cameras; test cancelling and declining. Verify voice messages before and after a call.
4. If either direction is silent, note build versions, whether the timer runs, foreground/locked state and approximate time. USB timing traces are still needed to establish the device-specific sequence and numerical latency.

## Artifact and release status — 20 September 2026

- Source commit: `4e73b51b42e900cf658be97272231d3d2813f08f`. Public source tag `ios-0.1.0-51` points to `2f45c006902217f9535b14165cb1a9f9ab7f8af6`, with the identical source tree. Git transport repeatedly timed out, so the GitHub Git Data API published the same verified blob, tree and commit hashes and fast-forwarded main without force.
- [Public CI run 35494423521](https://github.com/Mneloapp/mnelo-app/actions/runs/35494423521) passed, including clean dependency installation with the pinned native patches, full checks, Expo doctor, dependency/version checks, mobile export and secret scanning.
- Release archive `artifacts/Mnelo-0.1.0-51.xcarchive` built successfully with the iPhone SDK. All five app/extension bundles have build 51, valid archive signatures and matching dSYM UUIDs. Compiled native audio-gate methods and diagnostics are present. Main Hermes SHA-256: `65e9aee1f4bdddcad9d131ba0738db121c60974c2690cd9c0fe63badd3b008e4`.
- Packaged secret scanning was reviewed: two minified JavaScript runtime member-access false positives were proven using their exact AST locations; decoded Hermes had zero findings. Existing archives and IPAs were preserved.
- Distribution IPA: `artifacts/Mnelo-0.1.0-51-export/Mnelo.ipa`, 152,169,364 bytes, SHA-256 `61f08525f649f6a81a6a9fae98febc33cb039eeb2ad6823cbddb7e0cacd4554f`. Production push entitlement, disabled debugging, all five bundle signatures, matching native code/dSYM UUIDs, matching Hermes payload and 95 packaged resource files passed verification.
- **TestFlight: Testing in both existing groups.** Apple build ID `75f0f343-d0e3-460c-8704-53dedff97b85` is assigned to Mnelo Preview (external, 2 testers) and Mnelo Development (internal, 1 tester); the build row in each group visibly reports Testing. Test instructions are saved and automatic tester notification is enabled. Export-compliance answers remain unchanged from the previous releases. Existing cloud-managed distribution signing was used after the owner restored the Xcode account. Upload completed with the same four vendor-framework symbol warnings as prior builds (React, ReactNativeDependencies, WebRTC and Hermes); app and extension dSYMs were verified separately. Physical two-way audio and answer-to-audio latency remain unverified; both phones must first update from their observed builds (50 and 48) to 51.

### Xcode recovery follow-up

Xcode was confirmed unresponsive in Activity Monitor. A process sample placed the main thread in editor/workspace restoration. After stopping the hung process and temporarily enabling `ApplePersistenceIgnoreState`, Xcode opened normally. The original preference was restored after launch; the backup remains local. Export initially failed with `No Accounts`; after the owner signed in, the same archive exported and uploaded successfully. No new account permissions were added.
