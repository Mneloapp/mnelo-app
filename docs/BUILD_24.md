# Build 24: incoming sharing and message composition

Photos and Files shares use a native app-group ownership check that resolves filesystem aliases and symlinks. Only regular files within MneloIncoming are accepted; sibling paths, remote URLs and escaping symlinks are rejected. Photos may have source files up to 50 MiB and 100 million pixels and are resized to a 1600-pixel long edge before the existing 10 MiB encrypted transport limit is checked. Other files retain the 10 MiB limit. Errors now distinguish source availability, item count and size. A Maps link remains literal text and is never fetched during sharing.

The share extension declares INSendMessageIntent support. Real sends and receives donate the conversation name, opaque conversation ID and optional avatar to iOS, with no message body, phone number or identity key. Donations are serialized with removal on history clear, group leave, blocking and account erasure. Selecting a system suggestion preselects a locally valid conversation; the user still reviews and presses Send. A digest binds the suggestion to its attachment batch. iOS decides when and where suggestions appear; this cannot be pinned or forced by Mnelo. No old conversation activity is fabricated to seed suggestions.

Poll and event creation use grouped white fields, clearer hints, numbered answer rows, a compact add-option control, aligned date fields and a fixed accent submit button. Validation, encrypted rich cards and explicit calendar export remain in place. Long forms scroll above the submit control, including with large text or a keyboard.

Message actions open inside the chat's existing native view so the original touch can continue. Chat scrolling and swipe-to-reply are suspended while the menu is open. Moving across a menu row or reaction highlights it; releasing selects it. Touch-end coordinates are read from changedTouches when omitted at the top level. Reduced Motion, tap actions and accessibility actions remain supported.

Editing closes the menu and loads the sent text into the normal composer. Save updates the existing message and retains its Edited marker. Cancel and successful Save restore the earlier unsent draft and reply context. The input is locked during an edit save; a failed save leaves the edit intact.

## Verification

Full local checks: 444 UI/unit tests, 3 server integration tests and 144 device/transport integration tests passed. Native Foundation tests exercise owned files, canonical aliases, sibling/traversal rejection, symlink escapes, directories and remote URLs. An unsigned iOS Release build compiled the new native bridge and extension successfully before final packaging.

Browser review used actual React Native components and fictional data at 390 and 320 pixels in English and Georgian. A real browser touch stream held a message, traversed Copy, then selected Edit without lifting: the background message stayed at y=702, the hover was visible and Edit opened the composer. Cancel restored the original draft; a subsequent Save called editMessage exactly once without creating a new message and restored that draft again. These checks do not substitute for physical iOS Photos/iCloud, system suggestion ranking, keyboard transitions or Dynamic Type acceptance.

Signed archive, published source, CI and TestFlight outcomes are recorded in BUILD_LOG after release verification.
