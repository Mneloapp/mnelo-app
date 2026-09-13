# UX flow

**Required privacy UX, 2026-09-09:** [device-owned communication and optional encrypted recovery](PRIVACY_ARCHITECTURE.md) add pending-until-recipient delivery, explicit backup consent, recovery-key handling and key-change verification requirements. These flows are not implemented yet. Navigation remains Chats | Connect | Me; no Calls tab or calls filter is added by this decision.

Mnelo is the official product name. See [product identity](PRODUCT_IDENTITY.md) for naming, positioning and native identifiers.

## Product interface

Welcome, phone, six-digit OTP, identity and optional capability screens lead into Chats. Shared safe-area, keyboard avoidance, fields, buttons, rows and state views use the approved warm-white/graphite/Acid Lime system. See [visual decisions and asset requirements](DESIGN_SYSTEM.md). A missing-route page and retry boundary retain safe recovery.

All screen copy lives in `src/i18n/`. English is the initial language even on a Georgian device; English/Georgian selection persists independently of Auth. Typed dictionaries and the inline-copy guard cover implemented features, with pinned Georgian formatting fallbacks for native runtime gaps. Native-speaker review remains pending. Text uses native scaling; controls have a minimum 48-point target and grow with content. Android large-font layouts were exercised; physical screen-reader signoff remains open.

## Implemented navigation

Welcome → Phone → OTP → Name / username → Optional capabilities → Chats.

The tabs are **Chats | Connect | Me**. Chats is the post-onboarding default. Calls originate from a conversation, never a fourth tab.

- **Chats:** communicate with people you already know or have connected with.
- **Connect:** tell Mnelo what you need or what you offer; Mnelo helps identify relevant people.
- **Me:** identity, connections, requests, privacy, devices and settings.

Mnelo is the brand. Connect remains the core action; do not replace the action or tab label with the brand name.

Connect: **What do you need?** → free text with placeholder **Tell Mnelo anything...** and **I need | I offer** → **Connect me** → optional single useful clarification → confirmed request → actual result count and explainable matches → profile → connection request → accept/decline → authorized chat. Preserve raw text and never invent facts or percentages.

Me: concise identity and edit profile, Connections, Requests, My needs & offers, Privacy, Notifications, Devices, Account. No public phone by default, exact location, feed, followers or social score.

## Phase 1 review criteria

Build all specified static UX screens using fixture-backed repository interfaces. Verify navigation, safe areas, keyboard handling, loading/empty/error/offline states, long names, Georgian text expansion, common iPhone sizes and Android layouts. Screens must not depend on a live backend for presentation. The owner authorized these screens. Real backend, media, push and call execution is tracked separately.

## Phase 6 media checkpoint

Chat attachment actions now use opt-in native pickers, explicit previews/captions/send, voice record/cancel/preview/playback, a one-time location consent and a Mnelo contact chooser. Device contacts are selected individually for invitation and never bulk uploaded. Media controls and the message-actions button are separate accessible controls.

## Phase 7 group checkpoint

New group requires a name and at least two existing connections. Conversation overflow opens group details: photo/name, up to 32 members, admin actions and an explicit leave confirmation. Sender names distinguish group messages. Leaving returns to Chats and removes the group from the authorized inbox.

## Phase 8 Connect checkpoint

Connect interpretation now calls the real deterministic service. Missing facts are clarified one at a time, with a coarse-location hint; summary can return to the original request for editing. Publishing retains raw text and enables My needs & offers lifecycle controls. Results remain unavailable until the immediately following matching phase.

## Phase 9 matching checkpoint

Results now show up to three actual candidates with Strong/Good/Possible labels and source-backed explanations. Profile navigation shows the same reasons, actual capabilities/reviews and permitted active Need/Offer summaries. No match percentage or fabricated verification is displayed; paused/closed requests must be explicitly activated.

Phase 10 request flow displays the exact server-reviewed reason and optional message. Pending requests lead to Requests; existing connections show Message. Acceptance opens the conversation with invitation text preserved. Requests and connection lists support bounded pagination/search with loading, error and empty states.

Phase 11: direct chat overflow opens Connection with peer profile link and original reason. Service/business connections offer explicit completion; the second confirmation unlocks an optional review. Social connections display an explanation without a rating prompt. Profiles link to public-safe review pages; Me → Connections links to private completed history.

Phase 12 privacy controls explain discovery versus existing relationships and phone sharing. A separate View shared phone number action requests the number under current permissions and clears it on leaving/background/30-second expiry. Saved settings remain authoritative; no exact-location discovery toggle exists.

Phase 13 supports reporting from profiles and selected incoming messages, explicit block confirmation, and Me → Privacy → Blocked people → Unblock/Report. The report form also offers blocking without requiring submission. Unblock retains cancellation history. Report reasons use a vertical list for readable small-screen labels. Peer access changes automatically clear current cached profile/chat data.

## Phase 14 checkpoint

Phase 14: Me → Notifications persists four categories; Enable on this device requests native consent. Generic system content, no private previews, explicit denied/settings/build-required states. Web explains mobile registration availability. Taps resolve through authenticated server access. No fourth navigation tab. See [NOTIFICATIONS](NOTIFICATIONS.md).

Phase 15: call buttons appear only in a confirmed direct conversation. Recipient gets ringing → Accept/Decline; accepted media offers mute, native speaker, video toggle/switch and End. Permission failure stays in conversation with recovery text. Small-screen remote video/local preview leave End visible. End returns to normal chat with localized call history; no fourth tab.

Phase 16: Me → Devices shows current device first, type/OS and approximate activity, with Show more for older sessions. Log out this device returns to welcome. Log out all other devices explicitly confirms its scope, preserves this session and shows completion only after Auth succeeds. Unrecognized metadata is labeled rather than invented.

Phase 17: Me → Account → Delete account requires typed DELETE. Checking, processing, retry, unsubmitted and backend-confirmed deleted states are distinct. A locally saved receipt keeps native navigation in the deletion flow across Auth removal; Continue clears it only after confirmed completion. No local-only success claim.

Phase 18 preserves the product flow. Security failures continue to use stable user-facing errors; broader raw-table access is not needed by the UI. No new navigation or product surface was added.

Phase 19: Send clears the composer only after a durable local enqueue. Pending/failed states survive native restoration of the same verified session; Retry keeps the original ID. Removing pending content stops retries without claiming an in-flight request was recalled. Existing content and queued messages remain visible during reconnect errors.

Phase 21 accessibility: named scrollable action sheets, visible keyboard focus, linked error guidance, no hidden inactive-tab stops, context-aware message action/inbox labels and motion preferences. Navigation remains exactly Chats | Connect | Me; smallest viewports allow vertical scrolling.

Me → Account → English/ქართული persists the choice. Full Georgian presentation includes Connect interpretation and phone-country search; user-authored content remains unchanged. OS permission-dialog language is independent. See LOCALIZATION.md.

External mnelo:// links currently open the app's authenticated/default landing flow. They do not carry users into private conversations or supply action parameters. No production content deep-link experience is part of this foundation; see the Phase 25 security boundary.
