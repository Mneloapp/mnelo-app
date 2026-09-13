# Mnelo accessibility

Current engineering baseline, not a conformance certification. Native VoiceOver/TalkBack and OS text scaling remain device acceptance gates.

Shared text keeps platform scaling enabled. Decorative icon glyphs have explicit spoken button labels and do not independently scale. Content can wrap and scroll; the tab bar grows with reported font scale and safe-area inset. Tab items have no padding outside the actual press target: fresh browser measurements are 48 px high for Chats, Connect and Me. Primary controls are at least 48 px; native switches use the system implementation plus 16-point hit slop. Real device hit testing remains pending.

`FocusPressable` supplies a visible two-point high-contrast dark outline (light on call surfaces). Fields expose labels and combined guidance/error hints; web invalid/error descriptions reference real element IDs. Choices expose radio roles/checked state and a visible checkmark. Busy/disabled buttons expose that state. Message actions have explicit buttons, content/time context and no extra keyboard stop on the long-press wrapper. Inbox labels include preview, time and unread count.

Action sheets are named modals with scrollable content, safe-area spacing, a Cancel action and Escape/accessibility escape. Country selection is a named modal. The native navigation and modal animation preference follows live `AccessibilityInfo` Reduce Motion events and defaults to no motion until resolved. No flashing or decorative animation was added.

Inactive tabs retain component state but have `display: none` and hidden accessibility descendants while inactive. This fixes the real browser case where navigation's own aria-hidden wrapper still contained tabbable controls. The final measured hidden-tab stop count is zero. Account/session cache clearing remains a separate security control.

Contrast tests compute the central token pairs: at least 4.5:1 for normal text on warm-white, white and accent-soft; at least 3:1 for identifying input/control borders; white text on the primary green also meets 4.5:1. Pressed buttons preserve text contrast through background changes. Disabled controls and decorative dividers are separate from active control identification. See [W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Run `npm run check:accessibility:web -- <agent-browser-session> <checkpoint>` against an already open authenticated local browser. Pinned dev-only Axe Core 4.13.0 runs WCAG 2 A/AA, 2.1 AA and 2.2 AA rules through the existing browser session. Redacted structural results go to ignored `artifacts/accessibility/`; nonzero violations fail the command. Incomplete results are retained for review, never relabeled as passes. No passwords/tokens are collected by this helper. These browser results do not inspect native accessibility trees.

Phase 21 actual checks: phone validation/country/Chats/chat/actions/Connect/Me/privacy; no automatic violations. Final Connect/Me/phone/country/privacy have no incomplete rules. Chats/Search and call glyphs cannot be assessed as ordinary text by axe; their accent/background pair is covered by contrast tests and their explicit button labels are present. Initial inactive-page overlap/focus review items led to the tab fix, then disappeared.

Narrow action-sheet controls at 200% browser text size remain scrollable to Cancel at 320×568. Keyboard focus/Enter, modal Escape, input error linkage and 320/390/768-width layouts were checked and screenshots inspected. This is browser enlargement, not a physical Dynamic Type result. Long Connect/Me content can require scrolling at 320×568. A fresh reload was needed after an Expo CLI/client synchronization warning to verify final tab styling.

Before release: VoiceOver/TalkBack reading/focus after navigation and sheets; maximum OS fonts; keyboard send/recovery and tab traversal on hardware; native switch hit areas; camera/microphone permission sheets; call controls with audio output; grouped messages, Georgian pronunciation/layout and low vision. Preserve all negative authorization tests during accessibility changes.

## September 9 visual refinement

See [the design system](DESIGN_SYSTEM.md) for measured foreground/background pairs. Inter and Noto Sans Georgian retain native scaling. A live iOS Dynamic Type change reproduced stale text line-box clipping; Text/TextInput now invalidate their native measure when fontScale changes. Standard/Georgian rendering and the live enlargement fix were observed on iPhone 17 Pro Simulator. Full large-text scrolling, screen readers and physical-device checks remain separate acceptance items. The iOS input caret uses dark ink; lime is never the only focus cue.
