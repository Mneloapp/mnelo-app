# Build 36 — settings and quick reply design

Shared search fields now use a white pill surface. Settings, privacy, notification preferences, blocked contacts, backup/recovery and open-source pages use the same rounded cards, icon badges, typography and action buttons as the profile screens. Loaded phone and blocked-contact settings no longer show an unrelated empty-state message.

Incoming-call quick replies use white selectable rows with icons. The editor has compact, rounded white fields, an explicit close control and a lime Save footer that remains reachable while the contents scroll. Editing or saving only changes the saved reply text; choosing a reply during an incoming call still performs the existing decline-and-send action. English and Georgian copy is included. The notification preview explanation now matches the existing device-settings controls.

The call, receipt, encryption and native audio/video implementation from build 35 is retained. These UI changes do not establish physical acceptance of call timing. That still requires both phones running the current build.

Validation before native packaging: the full existing check completed 662 tests (500 Jest in 95 suites, 3 server and 159 device/protocol). The actual components were reviewed with local fixture data in English and Georgian, including 390-pixel layouts and a 320 × 568 embedded viewport for the quick reply sheets. Save stays reachable and the third field can scroll into view. Search input/clear and reply edit/save/empty validation were checked; no real message or call was sent. Web-only animation/pointer-event deprecation warnings are not native call failures. Final type, lint and focused behavior checks follow the empty-state adjustment. Preview fixtures are ignored and excluded from the application entry point.

Native archive, source publication and TestFlight availability are recorded in BUILD_LOG after completion.
