# Focus interface — October 5, 2026

Focus implements the approved visual direction in the application: a white canvas,
light gray controls, soft lime sections, larger page titles, a small Mnelo wordmark,
and a dark bottom navigation bar with a lime selected tab. Shared theme tokens and
components carry the treatment across screens; incoming and outgoing messages,
missed calls, destructive actions and active-call controls retain distinct states.

## Implemented surfaces

| Surface                              | Change                                                                                                                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chats                                | Brand/action header, search access, underline filters, a separate pinned section, compact conversation rows and unread badges.                                                                                              |
| Calls                                | Matching header, recent-contact shortcuts, date-grouped history and a distinct missed-call surface. Existing call and information destinations remain available.                                                            |
| Conversation                         | Contact identity and labeled voice/video actions, tighter spacing within consecutive messages, individual timestamps/receipts, compact shared-contact actions and an attachment grid.                                       |
| My space                             | Horizontal identity block with the enrolled phone number, QR/edit actions, and flat account/storage settings groups with gray icon surfaces.                                                                                |
| Contact and group information        | Matching identity blocks, compact actions and grouped details; contact saving, profile photos, shared media, export and privacy controls remain available. Group editing and membership controls retain their owner checks. |
| Profile/group editing                | Shared photo and form surfaces while retaining existing field, picker, save and cancellation behavior.                                                                                                                      |
| Active calls and message information | Coordinated colors and surfaces around the existing voice/video controls, call state, receipt details and navigation.                                                                                                       |

The custom tab bar retains selected-state and count announcements, tab press and
long-press events, safe-area clearance and focus visibility. Labels and action
layouts adapt to larger text. English and Georgian labels are included.

## Pinned conversations

Pins are actual preferences, not fixture-only cards. Up to eight conversation IDs
are stored per account in native SecureStore; the iOS accessibility setting is
`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. Browser preferences remain in memory.
Names, phone numbers and message contents are not copied into the pin record.
Writes are serialized per account, and the visible state changes after a successful
write. Storage read failures can retry without overwriting saved preferences.

The pinned section appears in the unfiltered Chats view, and those conversations
are excluded from the ordinary rows while shown there. Search and filters continue
to include pinned conversations. Long-press and accessibility actions expose pin
management. Tapping a pinned direct or group conversation opens its chat. Missing
pins are removed only after successful conversation reads establish that the
conversation is absent.

## Verification and remaining limits

The final Jest run passed 711 tests across 122 suites. TypeScript, ESLint,
formatting and localization checks passed, and refreshed iOS and Android Hermes
exports completed. The existing device/protocol integration suite also passed
244 tests. This note does not certify a full security audit or a new release.

The ignored `artifacts/design-focus-20261005/` fixture bundles real application
screens and components with fictional in-memory identity, conversation and call
data. It provides 320/393-pixel viewports, English/Georgian variants and local
accessibility checks. Network/account boundaries are replaced for the fixture;
external requests and development sockets are disabled. Build evidence records
the imported source hashes. Browser findings and screenshots are separate QA
artifacts, not shipped app assets.

Web uses the shipped FiraGO/DM Sans faces, whereas native uses system fonts. The
fixture's `fontScale` override exercises layout branches but does not reproduce
native Dynamic Type text measurement. Browser checks do not validate real call
media, delivery timing, phone contacts, native pickers or device persistence.
The refreshed accessibility report records 26 runs: 11 screens at 320-pixel
Georgian and 393-pixel English configurations, plus four 320-pixel Georgian
large-text layout branches. No violations were reported after the shared-contact
bubble's nested interaction was corrected. This automated result does not replace
native screen-reader testing.

The initial Focus design checkpoint did not include physical-phone verification
or native distribution. The subsequent TestFlight build is tracked separately in
[BUILD54_QA](BUILD54_QA.md). Native acceptance includes upgrade/history retention,
pin persistence and account isolation,
large Georgian names and Dynamic Type, keyboard/attachment transitions, VoiceOver,
and the existing call, notification and message-action flows.
