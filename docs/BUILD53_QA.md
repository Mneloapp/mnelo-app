# iOS 0.1.0 (53) — Prepare the call connection before answering

The owner reports that build 52 is faster, but both people can lose their first word after answering. A read-only, content-free trace from the caller's installed build 52 shows its audio session enabled 5.6 seconds before remote acceptance arrived, followed by 771 ms until transport connection (342 ms to applying the SDP answer and approximately 406 ms of transport setup). This is one outgoing-phone trace, not a synchronized acoustic measurement of the two test phones.

## Changes

Current direct-call peers now negotiate an authenticated, relay-only, data-only WebRTC connection while ringing. Its SDP has no audio/video sections and its recipient does not capture the microphone or camera. Neither endpoint attaches media to this connection until acceptance. A prepared connection does not answer CallKit, stop ringing or start a call timer.

After answering, the same ICE/DTLS connection carries acceptance and signed media negotiation over its ordered data channel, with encrypted durable-mailbox copies retained as fallback. Audio/video are added to that existing bundled connection. A quick acceptance that overtakes the initial data answer retains the in-flight preparation and waits for its SDP to become stable; it cannot overwrite an outstanding offer. Capture and native CallKit audio activation keep the build 51/52 behavior. In particular, incoming CallKit answer completion is not postponed, since that previously prevented audio activation.

There is one prepared peer per current direct call. Incoming preparation reuses the existing one-peer ICE pool, and a current caller does not retain a second legacy media peer while ringing. An older recipient ignores the signed preparation extension; its ordinary acceptance uses the established media path. An answer before any preparation is available also falls back safely. That fallback does not receive the warm-path latency improvement. Group calls retain their existing transport.

Preparation is scoped to the authenticated peer and current call, requires relay-only configuration, is bounded by call lifetime, and is discarded on end, stop, block or legacy fallback. Data-only SDP is checked before native application; media cannot be attached or accepted before consent. Bounded, coalesced SDP processing prevents older candidate updates from replacing a newer negotiation. The established channel accepts only scoped call controls, signed SDP and bounded media state. Existing signature, expiry, contact and session checks still apply. Video replacement and camera/media-state updates also use the selected peer.

Local timing traces now distinguish preparation before acceptance from post-consent media readiness. No identities, phone numbers, SDP, messages or credentials are added to the timing trace. Neither ICE readiness nor receipt of RTP alone proves that a person heard sound.

## Validation

- Focused consent, cancellation, reordering, malformed data-only SDP, duplicate acceptance, outstanding-offer, native candidate-event race and timing-analysis tests pass. Existing early-media compatibility tests pass. The native CallKit AudioEngine and ICE-pool probes pass.
- The real-browser harness runs the production call controller and peer mesh with generated identities, signed SDP, real hosted TURN, synthetic audio/video and an 80 ms one-way simulated durable queue. No real microphone, camera, user account, push or phone is used. It checks relay/relay selection, no recipient capture or RTP transceivers before consent, both directions of decoded non-silent generated audio, video frame decoding, unchanged DTLS transport/ICE credentials on the warm path, mute, hangup, decline, denied capture, old-peer fallback, delayed capture and early answers.
- On the completed UDP/TCP-capable run, 14 call scenarios passed. Warm voice calls reached decoded audio in 406 and 409 ms, versus 835 and 945 ms on the cached-offer baseline. Warm video reached decoded media in 526 and 566 ms, versus 934 and 1,062 ms. These are browser test results with polling and synthetic media, not iPhone audibility claims. Immediate answers before preparation was available used the fallback and took about 1.3 seconds in this fixture.
- Test-only TURN credentials are short-lived, local, and distinct per synthetic fixture identity. Early development runs exposed unnecessary parallel relay allocations; the final implementation uses one prepared call peer. Existing server limits and configuration were not changed. Optional candidate failures do not constitute a call failure when the selected relay path and bidirectional decoded media pass; TCP-only results are recorded separately.
- A playback sink is required in the browser fixture to start remote audio decoding. Tests verify decoded tone, not just arriving packets or an enabled sender. UI screenshots of the harness and its console checks are local QA artifacts.

The full repository check passed: TypeScript, ESLint, formatting, security policy, environment, localization, branding, 696 Jest tests in 119 suites, 233 device/integration tests and 3 server tests (932 automated tests). Both native regression probes passed separately.

The final TCP-only hosted-TURN run passed all 12 call scenarios, including acceptance while the initial data negotiation was still in flight. Warm voice decoded in 348 ms versus 1,005 ms on the cached baseline; warm video in 416 ms versus 1,043 ms. Delayed capture took 618/728 ms, in-flight preparation 1,091/988 ms and immediate-answer fallback 1,521/1,403 ms for voice/video. These samples demonstrate reduced warm-path setup, not a guaranteed delay on a real phone. Browser console errors: none. No independent protocol audit or public App Store readiness certification is claimed.

## Physical acceptance

Both participants must update to build 53 for the prepared path. Without deleting the app, repeat voice calls in both directions, including a locked recipient, bringing the phone to the ear immediately after answering, a very quick answer and a second consecutive call. Speak immediately on both sides. Repeat video/camera switching, speaker switching, decline and caller cancellation. Confirm whether the first word is preserved and report any remaining delay. Build 53 physical answer-to-audible-sound timing remains pending.

The iPhone's own incoming-call timer can precede actual audio readiness; this release moves avoidable network preparation before acceptance instead of concealing a disconnected state. Propagation, capture, audio routing and playout cannot be guaranteed to take zero milliseconds. [WebRTC's connection model](https://www.w3.org/TR/webrtc/) permits data and media on the same bundled transport; the actual production implementation is verified separately by the tests above.

## Release status

Build 53 is uploaded, Apple processing is complete, and both existing groups show **Testing**: Mnelo Preview (2 external testers) and Mnelo Development (1 internal tester). Automatic tester notification is enabled. No public App Store submission was made.

The product source commit is `954337eba2fdafba6e52c7eeb2fdbaedddd74b3f`, with tree `85bed4fd73b83b7723d33cf1e6b6af33a0958839`. Public tag [`ios-0.1.0-53`](https://github.com/Mneloapp/mnelo-app/tree/ios-0.1.0-53) points to `eaf81baac24a2e0a0136625957c8368a9db8de6c` with the identical tree. [Public CI](https://github.com/Mneloapp/mnelo-app/actions/runs/35532367778) passed.

Signed archive and distribution verification passed for the main app and all four extensions, version 0.1.0 (53), service endpoints, source offer, permissions, entitlements and matching application/extension dSYMs. The distribution's code and 95 non-signing resources match the archive. The packaged Hermes bundle includes the prepared connection implementation and has SHA-256 `c54c83346c57cca2260bc0e8ffb584750d80fc365338daba9a095d228604f1b0`.

Source and decoded-Hermes secret scans found no secrets. Two packaged minified-JavaScript findings were reviewed at their exact AST positions and proven to be runtime identity member access followed by constructor syntax, with no embedded credential literal. Xcode reported the existing four missing vendor-symbol warnings (React, ReactNativeDependencies, WebRTC and Hermes); these did not prevent upload, and Mnelo's own five dSYMs match.

The first upload preparation ran out of local disk space while packaging symbols. Only temporary Mnelo distribution copies and reproducible compilation caches were removed, then upload succeeded. Build 53's archive/IPA and all earlier original archives/IPAs remain preserved. Detailed local evidence is in `artifacts/build53-release.json`, `artifacts/build53-test-summary.json` and the build 53 verification reports. Physical first-word audibility remains pending.
