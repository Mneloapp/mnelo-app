# Mnelo end-to-end QA

This document distinguishes real local service flows, supplementary browser QA, Android emulator QA and unverified physical/cloud behavior. No test-user identity, uploaded fixture or local test OTP is production data.

## Reproducible local users

After the local database, LiveKit and Edge Functions are running, explicitly reset only the three reserved demo identities:

```sh
npm run db:seed -- --reset-demo-users
```

The command requires project `mnelo-local`, the local Unix-socket container runtime, loopback API, local environment and the exact reserved OTP mapping. It refuses other arguments/environments and never reads a cloud service key. It deletes/recreates only the following local test users; their local conversations may consequently be removed. This is a fixture reset, not the product account-deletion workflow. For a fully empty local Storage/database baseline use the separately destructive, guarded `db:reset` after preserving local data.

| Development identity             | Reserved phone  | Local OTP | Initial data                                   |
| -------------------------------- | --------------- | --------- | ---------------------------------------------- |
| Development Nika / @dev_nika     | +1 555 555 0101 | 123456    | Vake; no capabilities                          |
| Development Giorgi / @dev_giorgi | +1 555 555 0102 | 234567    | Vake; Electrical installation; available today |
| Development Mariam / @dev_mariam | +1 555 555 0103 | 345678    | Vake; account lifecycle fixture                |

All start without connections, with default privacy. The randomly generated bootstrap passwords are not displayed or persisted by the script; UI testing uses local OTP. Existing test accounts outside these three numbers remain unchanged. Never run this script as a production provisioning or account deletion tool.

## Acceptance procedure

1. Sign in as Nika and Giorgi on two separate clients. Check default hidden phone, no exact discovery location and relevant-only visibility.
2. Nika enters “I need an electrician in Vake.” Verify the interpretation, real capability/location explanation, contextual request and Giorgi's acceptance. Unknown-user direct conversation must be denied before acceptance.
3. Exchange text, verify unread/read, reply/reaction, duplicate prevention and reconnect. For native process-death durability use the Android procedure in OFFLINE/BUILD_LOG, not merely browser offline mode.
4. Send private photo, file, voice, explicit location and contact; verify recipient access and unrelated-user denial. Exercise OS permission denial/recovery separately.
5. Initiate voice and video calls, accept, mute, toggle camera, switch camera/speaker, reject and end. Inspect actual participant/media state; distinguish synthetic media from audible physical-device quality. Verify permission denied and server denial for unrelated callers.
6. Block Nika from Giorgi. Verify discovery/request/new-chat denial, restricted profile access and no further call authorization.
7. Verify current-device display, logout/relogin and actual account deletion. Keep local call/account workers running; do not count a processing screen as completed deletion.

Screenshots, UI dumps and runtime logs are kept under ignored `artifacts/phase-27-*`. Final observed results are recorded in QA_REPORT; unexecuted hardware/cloud items remain release gates.

## Phase 27 observed results

The reserved Nika/Giorgi fixtures used real local Supabase OTP, migrations, RLS, Storage and Realtime; no repository mock substituted these flows. Android Development Client and a separate browser peer exchanged messages after a real Connect interpretation, three data-backed candidates, contextual request and acceptance. Hidden phone consent remained enforced after acceptance. Native recording/private upload and recipient playback worked; Android recorder duration resetting to zero after stop was fixed and rechecked. Contact sharing delivered only authorized name/username.

Voice and video calls used the real local LiveKit server, with two ACTIVE participants and published audio/video tracks. Mute/unmute, camera off/on, camera switch, speaker routing, decline and end were exercised. Server inspection confirmed muted tracks and room removal. Browser video decoded the native synthetic camera. A native voice call recovered to Connected after background/foreground and the microphone track remained controllable. SDK ping timeout, signal disconnect/ICE restart and closed-peer warnings occurred during background/end transitions. This is not audible physical-audio or sustained background-call acceptance: the emulator is headless, audio output disabled and media synthetic. Incoming calls were foreground Realtime events, not APNs/FCM delivery.

The AOSP API 36 image cannot supply the installed Expo Location module's Google fused provider: Google Play services and Store were absent, with SERVICE_INVALID in native diagnostics. Permission denial showed localized guidance correctly, but position acquisition did not pass on that image. A Google Play API 36 ARM64 revision 7 image replaced this task's disposable AOSP emulator; existing screenshots, logs, APK and local database were retained. Its first boot failed the emulator's enforced 6-GiB userdata free-space threshold; deleting only the obsolete task-created AVD allowed boot. No Google account login was performed.

Mariam's account deletion was initiated through the UI, displayed Processing, and then confirmed completion. A separate backend observation found zero Auth users for the reserved Mariam number. The completion screenshot is `artifacts/phase-27-account-deleted.png`. The worker completion, not the request response, determines success.

The seed command's production-environment probe exited 1 before touching data. Current code checks pass with 155 Jest tests in 30 suites and three server-stream tests; four focused native-media suites cover 13 cases, and the real media integration scenario passes. Doctor first reported a CocoaPods path problem; rerunning with the documented installed Ruby/CocoaPods environment passed 21/21. Compatibility, both mobile exports and source/history/bundle secret scans pass. Native permission recovery, final location and block results are appended after observation, not inferred from these checks.

Final native location follow-up: the Google fused provider became available, but a balanced-power current request returned unavailable because no fresh network fix existed. Installed LocationHelpers maps this to BALANCED_POWER_ACCURACY with a three-second maximum age. Deliberate single-point sharing now requests High accuracy so GPS-only acquisition works, still respecting OS approximate permission. A new request acquired the injected 41.708/44.765 test point, enabled Send only after selection, and delivered “Development emulated location” to Giorgi. This point is synthetic QA data, never owner location, and is not supplied to discovery. The native contact picker opened only after the opt-in action and showed the empty emulator address book; cancel returned safely. Misplaced conversation-privacy copy was removed from the address-book invitation screen.

Giorgi blocked Nika through Profile → Block → Confirm. Both clients' inboxes emptied; Nika's native exact-username search returned no Giorgi and offered no direct-chat/request action. The automated security/moderation suites separately test raw unauthorized requests and matching, not merely hidden buttons. Native Devices showed the new Google emulator as current and the removed AOSP emulator as another session. “Log out all other devices” completed, removed the old row and kept the current session. Giorgi logged out and then signed back in through real OTP. Mariam's post-deletion Continue returned to Welcome. No push, SMS delivery, physical iPhone or hardware call quality PASS is claimed.

## September 9 iOS Simulator continuation

Xcode 26.6, iPhone 17 Pro / iOS 26.5: signed Expo Development Client and embedded local diagnostic both build, install and render. Actual invalid OTP rejection, reserved local Supabase OTP, process-restart SecureStore restoration, Chats/Connect/Me, real development profile, deterministic interpretation and three database-backed candidates were exercised. Candidate facts match the displayed development profiles. Software keyboard English/Georgian rendering, input and dismissal were observed; full keyboard/gesture and assistive-device QA remains pending.

With Metro stopped, a 6,153-byte malformed native URI cold-launched the embedded app into Chats; Me remained interactive. The warm input preserved the process, returned to Chats, and Connect responded. This is a bounded simulator security check, separate from phone/media/call acceptance. Notifications showed the expected configured-build-required state. The Development Client was restored afterwards. Physical iPhone remains disconnected and its app-specific signing is unverified. [Build, native input, warnings and artifact evidence](audits/ios-26.6/native-result.json).
