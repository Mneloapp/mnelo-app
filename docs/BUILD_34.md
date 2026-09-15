# Build 34: delivery and call latency

Build 33 paced every authenticated command at 750 ms even when the device and server were idle. A command also takes two HTTP round trips. Serial call accept/offer/answer and delivered/read receipts accumulated those waits; receipts additionally waited behind server mailbox cleanup. The scheduler now permits a bounded burst (24 commands) and refills at 72/minute, reserving four tokens for interactive traffic. Even entirely urgent traffic remains below 96 starts in any rolling minute, leaving capacity below the server's 120/minute budget for extensions. Rate rejection still pauses the queue for one minute. Requests and Signal journal mutations remain serial.

Delivered/read receipts now retain urgent priority from their durable transaction through the HTTP queue, including after message projection and before mailbox cleanup. Startup skips a duplicate key-status request only when publication confirms sufficient keys; depleted directories still replenish immediately. WebRTC gathering runs independently after offer/answer creation so slow TURN fallback discovery cannot occupy the Signal inbox and delay hangup, fallback candidates or receipts. Signed descriptions, identity checks, relay-only routing and durable ciphertext retry semantics are unchanged.

CallKit owns both initial and explicit iOS audio routes, using matching WebRTC and AVAudioSession configurations before capture and at activation. Video/group calls default to the speaker while preserving external routes; explicit speaker selection uses the native owner. Actual route events update the button. An audio-first stream can add its video track without changing its native URL; the video renderer now rebinds when that track appears.

## Measured comparison

The same two-client test ran against clean build-33 source and the new source, with actual Signal encryption, signed HTTP challenges and commands, real WebSocket wake routing, and 80 ms added to each HTTP request. Both contacts were already enrolled and ready. There is no APNs, native capture, real network TURN or physical media in this test.

| Stage                                  | Build 33 | Changed source |
| -------------------------------------- | -------: | -------------: |
| Send to recipient history              | 1,110 ms |         531 ms |
| Recipient history to delivered receipt | 1,670 ms |         364 ms |
| Mark read to sender read receipt       | 1,512 ms |         540 ms |
| Voice accept → offer → answer          | 3,751 ms |         920 ms |
| Next video accept → offer → answer     | 4,503 ms |       1,228 ms |

These are single local comparisons, not device acceptance or guaranteed network performance. In particular, offer/answer completion does not establish audible audio or a displayed video frame. The main iPhone was verified on build 33; the other phone was locked. The hosted identity, TURN and proxy services were active with low CPU/memory load during investigation; no server configuration or registration state changed.

For the next physical test, native builds keep a bounded local cache of at most 200 constant timing codes and durations. It records HTTP queue/command time, call negotiation stages, audio activation/route, first inbound RTP, first encoded/decoded video and the first rendered frame (excluding WebRTC's synthetic 2×2 clearing frame). It includes no peer IDs, content, SDP, credentials or addresses, is not uploaded, and is excluded from backup. In-memory entries older than 15 minutes are dropped on the next event; the cache is replaced by a new process's trace. USB access to the app's cache was verified without needing system log access.

Physical acceptance remains required: both phones on this build, voice and video calls in both directions, speaker already correct before any toggle, and delivered/read leaves on an open and closed conversation. Capture and compare both devices' timing files if Connecting or the first frame remains delayed. TestFlight release evidence belongs in BUILD_LOG after upload and group availability are verified.

## Automated validation

The full checks pass 662 tests: 500 Jest across 95 suites, 3 server tests and 159 device/protocol tests, plus TypeScript, lint, formatting, security, environment, localization and brand checks. New tests exercise burst/fairness/reserved capacity and cancellation, production-scheduler latency over real Signal/HTTP/WebSocket delivery, inbox progress during ICE gathering, native route bridging, an audio-first stream gaining video, and late statistics after hangup. Native CallKit manager code also typechecks against the installed iOS/WebRTC SDK; complete signed archive validation is recorded separately. One pre-existing VirtualizedList act warning appeared in the shared-content screen test; the test passed.
