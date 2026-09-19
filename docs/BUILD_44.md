# Build 44 — restore chat names without a blank loading page

Build 43 removed the profile-name flash by waiting for the first Contacts read,
but the chat list then displayed a centered spinner on an otherwise empty page.
The owner confirmed this on a physical phone after updating.

This release replaces that initial state in Chats and Calls with three quiet,
static row placeholders aligned with the existing list. Existing rows remain
visible during a refresh. Empty results and retryable failures retain their own
states; decorative placeholders are hidden from assistive technology beneath a
single loading announcement.

A bounded presentation cache in the existing encrypted device vault is used
for repeat launches. It holds only aliases matched to existing Mnelo
contacts, separate from protocol identity and user-assigned contact aliases.
Restoring it requires current full Contacts access and matching account and
contact bindings. Limited access uses a fresh read. A fresh scan replaces the
cache, while access changes and account/history removal invalidate it. It is
excluded from exported backups and is never transmitted.

## Verification checkpoint

Focused validation passes: 22 phonebook hook cases, five SQLite integration
cases including an actual database close/reopen, and 25 history/call UI tests.
The provider test confirms network startup is independent of name loading.
Permission loss during a stalled refresh clears both visible and durable names;
late responses cannot overwrite a new session or binding. Storage failure does
not prevent the fresh Contacts read, and a fresh empty result clears old aliases.

An isolated browser harness rendered the actual Chats and Calls components with
fabricated data in English and Georgian. Loading placeholders, populated rows,
interactive headers and exclusive retry states were inspected at a compact
333 x 722 CSS viewport, with no horizontal page overflow. The fixture's initial
missing environment define was corrected; the final render had no new runtime
error. The existing RNWeb pointerEvents deprecation warning remains. Native
sticky-search and safe-area behavior are not equivalent to the browser fixture.
No real accounts, contacts, phones or backend service were used in this preview.

Full source checks pass 760 tests (575 Jest cases across 102 suites, three server
cases and 182 device/protocol cases), typecheck, lint, formatting and source guards.
Both mobile exports and history/source/bundle secret scans pass. Archive
verification and TestFlight availability are pending at this checkpoint. Physical-phone acceptance is not yet claimed. No phone
installation will be attempted while the owner cannot connect one.

The first launch without a populated cache and limited Contacts access can still
require a fresh scan; the row placeholders cover this period. The existing
intermittent suspension crash remains unresolved. Earlier build archives and
source releases, including 37 and 43, are retained.

## Packaged build and source

Frozen private source: `bb7f1765fc751c6b5a0284d748b0230ae8014e14`.
The public `ios-0.1.0-44` tag points to
`d215900af0f744d75155c7dda8b1d8546299180b`; both share exact tree
`8186d995ead5614c1be1edb9f91c6dafa3a3dc6b`.

The signed archive and App Store IPA pass configuration, signature, all extension,
production entitlement, permission, source-offer and compiled regression checks.
The archive and distribution Hermes hashes match:
`7e21b87bb1c143aadd5c2ce44336f593a646b9190bfdbef2878fa8e4215f85e2`.
The 121,098,161-byte IPA has SHA-256
`b85dcc6297aac5a1749b9ce7b8bd04b48c8a2d68b1b900612f0f172b4904d83e`
and zero packaged-secret findings. Archive and IPA are retained in `artifacts`.

Exact-source CI run `35456817227` passed the full check, Expo doctor and dependency
compatibility steps in two attempts. Both attempts then stopped because npm's
advisory endpoint returned HTTP 503 maintenance; a local audit reproduced it.
Thus CI is not fully green and the current dependency advisory scan is unavailable.
Dependencies are byte-for-byte unchanged from build 43. Mobile exports and secret
scans that were skipped by CI passed locally. The security gate was not altered.

Xcode confirmed upload at 21:12 Asia/Tbilisi, with the four pre-existing vendor
dSYM warnings for React, ReactNativeDependencies, WebRTC and hermesvm. Apple
build ID: `4bdcca5f-288a-4b4f-be09-bc26e98ec440`. Apple completed processing. Distribution to tester groups is held: while
processing, the owner reported a fresh build-43 crash on declining an incoming
call, with the caller left ringing. The following release will include the
loading fix together with the decline fix and requested visual changes. Build 44
has not been assigned to either tester group.
