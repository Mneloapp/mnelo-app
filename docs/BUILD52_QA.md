# iOS 0.1.0 (52) — Answer latency and message links

The owner confirms that build 51 restored audible calls, but answering still precedes the real connection. A read-only, content-free trace from a build 51 phone contains three incoming calls with native-answer-to-transport times of 2.115, 2.239 and 4.298 seconds. One call took 2.098 seconds to reach the JavaScript acceptance path. These are local transport measurements, not synchronized two-phone audibility measurements. RTP observations are sampled and can be delayed by background execution. Another paired phone on an older build was not involved in the reported test.

## Changes

- An authenticated direct incoming call prepares one relay-only ICE candidate pool while ringing. The pinned iOS WebRTC converter now forwards a numeric pool size, bounded to one. Preparation attaches no tracks, requests no microphone or camera, sets no session descriptions and publishes no peer signal. Answering reuses the pool. End, replacement, stop and contact rejection discard it; preparation failure falls back to ordinary connection setup. Relay-only transport and all consent checks remain in place.
- Native answer events for the current authenticated call start acceptance before waiting on an outstanding native caller-name/presentation callback. Terminal events from the same batch take precedence. Unknown invitations remain queued for authenticated recovery; locked video still waits for foreground camera access.
- The delivery pump projects already-received encrypted answers before uploading the remaining receipt/candidate backlog. Incoming projection yields at most one urgent call upload between items, retaining a single encryption/journal owner and receipt fairness. The pre-existing immediate follow-up for buffered inbox responses is retained; there was no newly discovered unconditional three-second poll delay on that path.
- Ordinary messages and media captions recognize HTTP(S) and `www.` links inline. Tapping opens the exact validated destination, while long-press retains message actions. Prose, line breaks and balanced URL punctuation remain intact. No preview request is made before a tap. The shared-links index uses the same parser; credentials and unsafe protocols are not activated.

The build 51 CallKit AudioEngine gate and immediate incoming-answer completion are retained. Delaying CallKit completion until ICE connected previously risked blocking audio activation. The incoming iPhone timer may therefore precede transport readiness; Mnelo's in-app timer still follows the connection. This release reduces avoidable preparation and queue delays rather than hiding a disconnected state. Network latency and device scheduling cannot be guaranteed to become zero.

## Validation

- Full host checks: 686 Jest tests in 118 suites, 233 device integration tests and 3 server tests (922 total), plus typechecking, lint, formatting, localization, environment, source-security and brand checks.
- New integration coverage uses the actual encrypted delivery journal/server path to verify an answer bypasses a 20-receipt backlog and that the final upload's inbox is handled without an idle poll. Existing urgent-call ordering, receipt fairness, legacy delivery and restart/replay cases pass.
- Incoming media tests cover reuse, no capture/SDP/signals before acceptance, end/block/replacement/stop during pending preparation and safe fallback. System-call tests cover a stalled presentation callback and answer/hangup in one batch. Link tests cover parsing, tapping, long-press, disabled interaction and open failures.
- The native ICE probe compiles and executes the installed converter's actual pool-setting block, including invalid, absent and out-of-range inputs. The existing native CallKit AudioEngine regression probe passes.
- A local React Native Web fixture renders outgoing/incoming links at 320 and 393-point widths. Manual browser verification confirmed the link opens the intended destination; no console errors occurred. This checks layout and interaction, not physical iOS rendering.

## Physical acceptance required

Update both participating phones to 52 without deleting the app. Repeat voice calls in both directions with apps open, the receiver locked and the caller holding the phone at the ear. Start speaking immediately when answering; record the approximate delay and any missing first words. Repeat a second call, speaker switching, cancellation/decline and video/camera switching. Test a link in an existing message, a newly shared URL, a caption and long-press message actions.

The prepared pool, answer handling and delivery ordering are covered by automated checks. The improvement in answer-to-audible-sound time remains unverified until the new build is exercised on both phones. No public App Store release or final security certification is implied.

## Release status

Signed artifact verification, corresponding-source publication and TestFlight assignment are in progress. Existing archives and original IPAs remain preserved.
