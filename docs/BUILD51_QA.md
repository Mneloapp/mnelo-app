# iOS 0.1.0 (51) — Call audio repair

The owner reports no sound in either direction after answering a call following build 50. Neither paired iPhone is currently reachable from this Mac, so there is no trace from the failing call and no measured physical answer-to-audio latency.

## Findings and changes

- The pinned WebRTC 144.1.2 module instantiates the AudioEngine ADM. Mnelo only toggled the legacy `RTCAudioSession.isAudioEnabled` gate; it never synchronized the AudioEngine's input/output availability with CallKit. This allowed negotiation to start the engine before CallKit activation and provided no explicit AudioEngine restart at activation. The installed SDK source and the [official LiveKit CallKit example](https://github.com/livekit-examples/react-native-callkit/blob/main/src/CallManager.ts) establish this integration gap. It is a concrete defect and a plausible cause of the report, not a device-trace-proven sole cause.
- A version/hash-pinned native patch now starts the engine with input/output unavailable and listens to the existing manual audio session. Both paths become available only when CallKit has activated the session and Mnelo enables audio. Deactivation, end and interruption close the gate; subsequent activation restores it. Late module creation reconciles existing activation. The serial worker reads current state when it executes, so an old callback cannot reopen the microphone after a call ends. No JavaScript round trip or independent session activation is introduced. Automatic non-CallKit audio remains untouched.
- Incoming answer completion no longer waits for ICE/DTLS. The system action is fulfilled after audio configuration, allowing CallKit to grant audio promptly, as in [Apple's recommended answer flow](https://developer.apple.com/documentation/callkit/making-and-receiving-voip-calls). This reverses build 49's timer-alignment gate. The incoming system timer can therefore precede actual transport readiness; Mnelo's in-app timer continues to start at transport connection. Audio correctness takes precedence over cosmetic system timer alignment.
- Local content-free diagnostics record AudioEngine availability, suspension and errors in the existing bounded timing trace. No audio, conversation content, identifiers or telemetry are uploaded.
- Build 50's contact forms, group management, export and chat actions are retained.

## Validation

The native regression probe executes the installed patch's actual Objective-C methods against deterministic session/ADM doubles: cold and early activation, both input/output paths, end/restart, interruption/resume, delayed callbacks and native module recreation. The Swift answer probe verifies immediate completion before a network callback, duplicate handling and reset. The existing voice-playback lease probe verifies speaker/receiver routing and CallKit handoff, and typechecks against the actual iPhone SDK. These checks cannot prove audible sound on physical phones.

Full host checks passed: 681 Jest tests in 117 suites, 225 device integration tests and 3 server tests (909 total), plus TypeScript, lint, formatting, source security, environment, localization and brand checks. The patch was reapplied to the pristine pinned dependency and matched the installed source byte for byte. The signed archive, distribution verification and TestFlight availability will be recorded after completion.

## Physical acceptance

1. Update both phones to 51 without deleting the app. Make one voice call in each direction with both apps open. Verify the first words are audible on both phones and the timer advances.
2. Repeat with the receiver locked, then held at the ear. Toggle speaker on and off; hang up and immediately make another call.
3. Repeat with video, switching cameras; test cancelling and declining. Verify voice messages before and after a call.
4. If either direction is silent, note build versions, whether the timer runs, foreground/locked state and approximate time. USB timing traces are still needed to establish the device-specific sequence and numerical latency.
