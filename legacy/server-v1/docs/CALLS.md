# Mnelo calls

Mnelo uses authorized one-to-one LiveKit voice/video rooms from conversations. No Calls tab, public rooms, recording or group-call feature is introduced. SDKs: `@livekit/react-native` 2.12.0, its Expo plugin 1.0.2, `@livekit/react-native-webrtc` 144.1.2, WebRTC config plugin 15.0.2, `livekit-client` 2.22.3 and server SDK 2.18.0. Expo Development Builds are mandatory; Expo Go is unsupported.

## Authorization and lifecycle

`start_call` validates a live Auth session, direct-conversation membership, an existing connection and both-direction blocks. Sorted person locks prevent overlapping calls; idempotent client UUIDs prevent duplicate creation. Three starts/minute and 20/hour apply. A real server room must exist before incoming events become visible. The recipient explicitly accepts on one authenticated session; no participant token is issued before consent. A different session cannot join an accepted call.

The `calls` Edge endpoint revalidates the authenticated user and calls narrow RPCs. Server-only credentials generate 60-second initial participant tokens for the exact room/actor, with microphone-only voice grants or microphone/camera video grants. Data publishing, metadata changes, recording, room creation and admin permissions are absent. Tokens stay in the active component/SDK memory, outside application query caches and persistent storage. Token responses are no-store. LiveKit handles reconnection token refresh within its session; the server cleanup path, not initial JWT expiry alone, terminates existing access.

Ringing expires after 60 seconds. Accepted sessions have a two-hour maximum and a 90-second absence grace. Presence is observed through the privileged LiveKit RoomService, not a client boolean or mobile background timer. Oldest observations are processed first, up to 100 rooms per invocation, five concurrent lookups. A failed lookup does not prove absence or prevent processing other terminal-room cleanup. Throughput and queue age require production monitoring/load validation.

End/decline records the transition and one localized call-history message, updates inbox ordering and attempts immediate room removal. History does not create a duplicate message push. A private durable cleanup queue survives call-row deletion, retries with two-minute leases and covers database-only blocks/session revocation. Errors do not mark cleanup complete. Client access to readiness, observation, queue administration and session internals is denied. The worker returns a redacted failure if any attempted cleanup failed; this must be monitored.

LiveKit Cloud participant removal revokes issued tokens. Self-hosted removal alone does not. The guarded local server therefore disables automatic room creation and deletes the whole room; a still-valid old JWT was actually rejected after deletion. Production configuration accepts only a matching HTTPS/WSS LiveKit Cloud host. Do not enable arbitrary self-hosted production URLs without implementing and testing equivalent revocation.

## Local reproducible environment

1. `npm run db:start` and `npm run db:migrate`.
2. `npm run calls:start` creates/starts the pinned local server, loopback signaling 7880 and RTC TCP 7881. Its random credentials/config are ignored, owner-only files under `artifacts/local-livekit`; do not print or commit them.
3. Start/restart `npm run functions:serve` to load the local server environment.
4. Run `npm run calls:worker` in another terminal. It reconciles rooms every ten seconds. `-- --once` performs one invocation.
5. `npm run test:calls` uses explicitly reserved local Auth fixtures and actual LiveKit signaling. Browser media QA uses synthetic Chromium devices, never production data.

The pinned server image is `livekit/livekit-server:v1.13.6@sha256:e37d68f172556d02aa77968b9fc55ef481468c0315fa38e4fa6c56ce72e3a815`. This loopback setup is for this computer; physical phones cannot use its localhost address. Configure an authenticated development cloud environment or a separately secured reachable development endpoint before device calls.

## Cloud and native prerequisites

After owner project authorization, store `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`, `LIVEKIT_PUBLIC_URL` and `LIVEKIT_DEPLOYMENT=cloud` in server Edge secrets. Never use EXPO_PUBLIC secrets. Deploy `calls` and `call-cleanup`. Migration 042 creates inactive `mnelo-call-cleanup`; protected Vault fields `mnelo_calls_project_url` and `mnelo_calls_dispatch_authorization` bind invocation to the intended hosted Supabase project. Activate the existing ten-second Cron job only after the endpoint and eviction checks pass. Absent configuration sends no HTTP request. There is no production worker activation or LiveKit Cloud validation yet.

iOS CNG includes microphone/camera permission descriptions and background audio; native AudioSession supports earpiece/speaker and Bluetooth where available. Video is disabled on background. Android foreground call-service/telecom behavior, real interruptions, hardware audio routing and iPhone/Android camera switching remain device acceptance work. Standard Expo push does not guarantee incoming wakeup when the app is killed, and there is no CallKit or full-screen telecom integration at this checkpoint. No background-call or physical-device PASS is claimed.

## Observed QA and limitations

Actual local two-user browser voice and video tracks exchanged media. Remote video was 640×480 with advancing playback; voice had one remote audio element and no local microphone playback. Mute, camera off/on, synthetic camera-track restart and hangup were exercised. A video call stayed active beyond the 90-second grace with worker-observed presence. Permission denial produced a clear recovery message without starting a call. Small-screen screenshots were inspected at 390×844. Synthetic inputs do not establish hardware audio/video quality.

UI QA found and fixed duplicate Realtime channel registration, local microphone echo, controls below the viewport, stale inbox time, raw call-history labels, exact conversation lookup outside the inbox page, and a callback-identity error on chat return during refresh. SDK peer-connection/data-channel abort warnings can occur when the server deletes an active room during hangup; they are recorded, not hidden. Device-specific graceful teardown remains part of native acceptance. No fatal SDK error is treated as success.

The repository remains SDK 57, whose supported minimum is Xcode 26.4+. Xcode 26.2 compilation previously failed with ExpoModulesJSI Swift errors, exit 65. Phase 15 clean prebuild, 128-pod installation and iOS/Android JavaScript exports pass; none proves native compilation, boot, TestFlight or physical-device operation.

Sources checked: [LiveKit Expo integration](https://docs.livekit.io/transport/sdk-platforms/expo/), [tokens and revocation](https://docs.livekit.io/frontends/reference/tokens-grants/), [RoomService API](https://docs.livekit.io/reference/other/roomservice-api/), [local hosting](https://docs.livekit.io/transport/self-hosting/local/), and [Chromium permission testing](https://chromium.googlesource.com/chromium/src/+/main/components/permissions/).

September 9 native continuation: Xcode 26.6 now compiles and boots the iOS app with the installed LiveKit/WebRTC pods. Current SDK maintenance Android artifacts also compile and render. These results establish native build/link/boot compatibility, not iOS voice/video or physical audio/background acceptance. The earlier Xcode 26.2 compiler blocker is resolved; iPhone signing/device availability and real provider/hardware tests remain open. See BUILD_LOG and IPHONE_DEVELOPMENT.
