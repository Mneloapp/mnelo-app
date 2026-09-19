# iOS 0.1.0 (42): reduce work after answering a call

Build 42 prepares direct-call negotiation while the recipient is still ringing.
The caller persists the invite, gathers its media offer and sends the signed,
encrypted description in advance. The recipient retains one current description
without creating a media peer or opening its microphone/camera. Answering starts
acceptance delivery and local capture concurrently; once capture is ready, the
cached offer can be applied immediately. The caller holds an early answer until
the authenticated acceptance arrives.

When the offer has already arrived, the recipient no longer waits for acceptance
delivery followed by offer delivery before beginning negotiation. Acceptance
delivery overlaps capture/negotiation and remains a gate on the caller. Very
rapid answers and older clients still use the ordinary negotiation path. The caller resends its offer
after acceptance because build 41 recipients discard pre-answer descriptions.
Cancellation, call/peer binding, expiry and trust checks remain in force. Group
negotiation and CallKit audio ownership are retained.

A delayed failure of the compatibility resend cannot terminate media after the
caller has already applied a valid answer. If the recipient still needs that
offer, publication failure continues to fail the call. A paired regression test
reproduced the first case before the fix and verifies both outcomes.

## Measuring real media readiness

Local diagnostic stages distinguish the native answer action, JavaScript answer
handling, capture readiness, audio-session activation, transport connection,
first inbound audio RTP and first decoded video. RTP arrival alone does not
prove that a person heard sound; a decoded video frame does not prove that it
was displayed. Stats poll every 500 ms for up to 30 seconds, with additional
native bridge/event-loop delay; background suspension can extend the observation
delay. No peer identifiers, SDP, message
contents, addresses or credentials are added to diagnostics.

The owner currently has only one phone available. George's paired phone has
build 41 installed; its retrieved diagnostic cache contains startup/delivery
events but no call. Consequently no fresh physical answer-to-audio or
answer-to-video result is claimed for this change. The two-phone test remains
necessary when both devices are available.

## Release scope

Build 41's startup configuration guard, service endpoints, delivery protocol,
dependencies, shared vault and source-preservation procedures are retained. This
change requires no backend deployment. Prior releases remain preserved. The
previously documented intermittent `0xdead10cc` suspension crash is outside this
call optimization and is not claimed fixed here.

## Validation checkpoint

The complete final source check passed **722 tests**: 542 Jest tests in 100 suites,
3 server tests and 177 device/protocol tests. TypeScript, lint, formatting,
security/environment/localization and brand checks pass. Both mobile JavaScript
exports pass; Gitleaks source, history and bundle scans report zero findings.
Dependencies are unchanged from the build-41 audit, including its recorded
moderate transitive findings.

The real Chromium/WebRTC harness passed **32 calls** over live authenticated
relay-only TURN. Each call required audio RTP on both peers; video calls also
required decoded video frames on both peers. Consent, old-recipient discard and
resend, 400 ms delayed capture, mute, decline, hangup and cleanup passed with no
browser errors. Median answer-to-observed-media times, three samples per cell:

| TURN transport | Voice, baseline → early offer | Video, baseline → early offer |
| -------------- | ----------------------------: | ----------------------------: |
| UDP/TCP        |                1,096 → 941 ms |                1,096 → 996 ms |
| TCP only       |                1,155 → 983 ms |                1,135 → 991 ms |

The baseline uses the current controller with early publication disabled; it is
not execution of the full build-41 binary. The in-memory control/signed-SDP queue
adds 80 ms one-way delay. These measurements include actual browser TURN/RTP but
exclude Signal/HTTP, APNs, CallKit and iPhone audio/camera behavior. Complete
samples, source hashes and scope are in `artifacts/build42-queued-turn-summary.json`.

The signed Release archive passed the native configuration guard, four bundle
version/identity checks, signatures, service endpoints, exact-source offer,
permissions, shared-vault identity, retained feature checks and the scan for
unavailable Testing-framework imports. The final resend guard predates the
archive's JavaScript bundle phase. Archive Hermes SHA-256:
`6e733bf2480a07c2781949e9a0ba187592ea09f6a21f10403b0200e3e7ad9279`.

Distribution export, source publication and TestFlight availability remain
pending at this checkpoint; completion evidence will be appended below.
