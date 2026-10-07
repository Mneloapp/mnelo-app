# Focus interface — October 5, 2026

Focus implements the approved visual direction in the application: a white canvas,
light gray controls, soft lime sections, restrained page titles,
and a dark bottom navigation bar with a lime selected tab. Shared theme tokens and
components carry the treatment across screens; incoming and outgoing messages,
missed calls, destructive actions and active-call controls retain distinct states.

## Implemented surfaces

| Surface                              | Change                                                                                                                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chats                                | Title and lime action, pull-down search, underline filters, a separate pinned section, compact conversation rows and unread badges.                                                                                         |
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

## October 7 refinement and design QA

Internal page, tab and active-call headers no longer show the Mnelo brand label.
The launch and phone-registration artwork remains. Primary tab-header actions
use lime; titles use a lighter 32-point treatment. Me keeps one accessible edit
action. Chats and Calls retain the original pull-down search implementation and
title-tap access, without a separate search icon.

The conversation composer is one gray capsule. Its attachment and Send/Mic
actions have identical 52-point slots, vertically centered with the input.
Nonempty native inputs use intrinsic text measurement; explicit line breaks
provide a minimum-height floor. Long drafts scroll at the height limit and
clearing or sending restores the compact empty field without remounting it.
Web-only content measurements are guarded against stale value/width/font-scale
callbacks. Large contact headings can use two lines.

The final Jest run passed 711 tests across 122 suites. TypeScript, ESLint,
Prettier, localization and whitespace checks passed. An independent source
review found no further material issues. These changes affect presentation;
message sending, call media and transport logic were not changed.

The ignored `artifacts/design-polish-20261007/` fixture imports current production
components with fictional in-memory data. Visual checks covered 320, 393 and
430-pixel widths in Georgian and English, including attachments and revealed
search. Twenty-two accessibility runs across eleven screens reported no
automated violations. Icon-font contrast and offscreen/video-fixture items
remain manual-review candidates, so this is not accessibility certification.
Composer measurements show matching vertical centers and stable input width
when Mic changes to Send; empty height returns to 52 points after a three-line
draft grows to 98 points on web.

A separate disposable iPhone SE simulator (375 × 667, iOS 26.5) exercised the
actual current `MessageField`, `ComposerAction` and `FocusTabHeader` with the
production composer row styles. It verified a three-line Georgian draft,
native keyboard editing, Send/reset with keyboard retained, and long wrapped
drafts at the height limit. At native font scale 1.79, the empty field and long
draft were also checked, including moving the caret to reveal the end. The
bounded fixture uses an existing compatible development client and replaces the
application/session boundary; it does not verify the complete release or real
message delivery. Web font-scale overrides exercise layout branches only.

The October 7 refinements are not included in TestFlight build 54. The subsequent
build and distribution checkpoint is tracked in [BUILD55_QA](BUILD55_QA.md).
Physical iPhone keyboard/attachment transitions, full-app Dynamic Type and
VoiceOver remain release acceptance checks.

## October 7 upper-right actions, after build 55

Chats, Calls and My space now use a consistent 52-point circular lime action at
the upper right. Compose and profile edit use a pencil; new call uses a plus.
Large Dynamic Type no longer stacks these actions below the title. The title
retains its own flexible column and can wrap without moving the action. Full
localized accessibility labels, action destinations and title-tap/pull search
remain intact.

Call history uses an unfilled round information action with a green outline icon,
a separate 48-point touch area and a soft lime pressed state. Tapping the call
row and opening its information remain separate operations.

TypeScript, ESLint, formatting, localization and all 711 Jest tests across 122
suites passed. Independent review found no further actionable source issues.
The ignored `artifacts/design-header-20261007/` records source hashes, screenshots
and presentation QA. Browser checks covered all three tabs in Georgian/English
at 320/393/430 pixels (18 cases), with no horizontal overflow or reported axe
violations; icon-font contrast remains an automated incomplete/manual item.
Visible action destinations and the separate row/info interactions were checked.

A fresh disposable iPhone SE simulator (375 × 667, iOS 26.5) rendered the actual
header and call-row components at native font scale 1.00 in Georgian and 1.79 in
Georgian/English. All actions stayed upper right; the long Georgian My space
title wrapped into two lines without overlap. This bounded presentation fixture
uses a compatible development client and fictional data with inert callbacks,
not a complete new native release. Some native captures include Expo's floating
development-tools badge, which is absent from production. Full-app physical
device and VoiceOver acceptance are still separate checks.

These follow-up changes are not yet included in TestFlight build 55.
