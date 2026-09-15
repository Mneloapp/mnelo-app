# Build 33: confirmed outgoing ringing

An outgoing call now shows Calling until the recipient confirms that its incoming call UI was presented. Only then does it show Ringing and play ringback. Answering changes the status to Connecting; the connected state and duration still require the media connection.

On iOS and Android the confirmation requires both the authenticated invite and the existing successful CallKit/Telecom incoming event, in either arrival order. A raw VoIP wake, server queue acceptance, failed native report, expired invite or already answered/ended call cannot trigger it. The foreground call screen supplies confirmation only when focused and active on platforms without a native call provider. Receipt work does not block answering.

The existing encrypted ACK packet carries the call UUID, at the same queue priority as call controls. No new invite schema, server change, internet-presence guess or timer is used. Both the durable Signal/HTTP and legacy authenticated peer channel route ACKs to the active call. The receipt must match the outgoing call and peer; group confirmations require an invited participant still waiting. Duplicates do not change state, and late receipts cannot undo Connecting, Active or Ended. Receipt storage failures can retry. Older clients safely consume the existing ACK shape without creating messages; both phones need build 33 for the new confirmation/status behavior. An older recipient leaves the caller on Calling until acceptance.

## Validation

Focused call state, native bridge and UI tests cover presentation/invite ordering while backgrounded, no receipt before successful presentation, native failure, early answer/end, duplicates, retry, wrong caller/call, late receipts and group participant decline. The application integration fixture uses actual Signal encryption and local HTTP delivery, verifies critical receipt priority, and checks safe legacy handling with no new chat messages. Physical iPhone/CallKit presentation timing and caller audio still require a two-phone TestFlight check. This change does not establish a new measurement for the previously reported answer-to-audio delay.

Full checks passed 655 tests (494 Jest tests in 93 suites, 3 server tests and 158 device/protocol tests), TypeScript, lint, formatting, security, environment, localization and brand validation. Signed archive, source CI and TestFlight availability are recorded in BUILD_LOG when completed.
