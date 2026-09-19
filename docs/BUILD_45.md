# Build 45 — native incoming calls and safe background history access

The owner reproduced two incoming call interfaces and inconsistent results when
rejecting the same call: Mnelo recorded a decline, while the iPhone control could
record a missed call. Build 45 uses CallKit alone while an incoming iOS call is
ringing. Mnelo's media controls appear after answering; outgoing calls and active
video controls remain available. Native and in-app rejection now use the same
declined outcome. Custom quick-reply controls and the companion call notification
are removed as requested; previously stored reply preferences are preserved.
iOS determines which controls appear in its system interface.

Native end actions retain an account-scoped pending intent until its encrypted
terminal event is durably uploaded. A finite background assertion starts before
CallKit fulfills the end action. Interrupted delivery can retry, and waiting for
an old terminal upload does not delay handling a new answer. A rejected call does
not generate a missed-call alert. Genuine unanswered calls retain that alert.
The delivery worker rechecks each queued notification immediately before dispatch
so an already acknowledged invite does not create a stale notification.

## Suspension and local history

Two fresh build-43 phone crash reports identify RunningBoard `0xdead10cc`/SIGKILL
while suspending the application. They do not identify a particular SQLite frame
or lock owner; the main thread was in normal rendering. The existing database
adapter allowed shared-file transactions to span JavaScript awaits without owning
iOS background time, a risk consistent with this termination class.

On iOS the main application now owns its SQLCipher connection in a small native
adapter. It uses the existing encrypted history file, OS key and schema. Native
operations acquire finite background time before touching SQL, finalize read
cursors before returning and retain that assertion for an open transaction.
Expiration invalidates the connection, interrupts active work, rolls back and
closes it before releasing the assertion. An expired token cannot reach a new
connection. Foreground recovery replaces the engine generation and network using
the existing account and history; stale callbacks cannot close its replacement.
Android retains its existing Expo SQLite adapter. No history migration or key
replacement is performed.

## Presentation

Foreground message alerts use native notification banners with verified sender
and preview information. The generic remote foreground alert is suppressed to
avoid showing both it and the resolved alert; the currently visible conversation
remains quiet. Existing privacy preferences and verified notification navigation
are retained. iOS controls the system banner background color.

The main background is lighter (`#F7F8F5`) with white controls. Build 44's saved
contact-name cache and calm list placeholders are included. The missing-original
quote notice can be dismissed and expires automatically; changing conversations,
composing or completing a deletion clears stale quote state.

## Validation checkpoint

The actual vendored SQLCipher implementation passes native probes for encrypted
history/schema and typed/blob round trips, transaction expiry rollback, reopening
committed data, denied assertions before SQL, cancellable busy waits and in-flight
read expiry. The UIKit assertion helper also passes an iPhoneOS SDK typecheck.
Automated call, notification, pool/provider and quote regressions cover the changes.

Full source validation, native archive/export and TestFlight distribution are
recorded below after completion. Physical-phone acceptance of decline, cold
incoming CallKit, foreground banners and call latency remains pending. No phone
installation or launch is attempted during this release. Existing archives,
including build 37, are retained; uploaded build 44 is held from tester groups.

An isolated browser fixture rendered the actual Chats and Calls components with
fabricated data in Georgian and English at a compact viewport. The lighter
background and white controls were inspected, with no horizontal overflow or
runtime errors. This visual check does not substitute for native safe-area,
CallKit or notification-banner acceptance.

Dependency compatibility and Expo doctor (21/21 using the configured CocoaPods
runtime) pass. npm's advisory service has recovered: the existing high-severity
gate passes, with 16 moderate transitive advisories still reported. Dependencies
are unchanged; no breaking automatic dependency fix was applied.

Full source validation passes **808 tests** (612 Jest cases across 103 suites,
three server cases and 193 device/protocol cases), TypeScript, lint, formatting,
security/environment/localization and brand guards. Both mobile exports and
history/source/bundle secret scans pass with zero findings. The seven native
SQLCipher probes are additional to those 808 cases. Archive verification and
TestFlight availability remain pending at this source checkpoint.

## Packaged release

Frozen private source is `cb9cab5bf63ef13b2e425c58e0b51523862d9edb`.
Public tag `ios-0.1.0-45` points to
`58728d8793b1419bf64db4030ea1a8573c4fc6b1` with the identical tracked tree.
Exact-source CI run `35459561203` passed all steps, including the restored npm
advisory service, mobile exports and secret scans.

Native archive compilation and both archive/distribution checks pass. The
121,148,480-byte IPA has SHA-256
`8f316cb74ecfd3d1f6f556f15bdca19deb06bcbf5662a3eca6897f550cde3ef2`.
Archive and distribution Hermes bytes match at SHA-256
`1af4c75c1e429eaf17a778fc79d36acd8aa82c40ec717b592dcb4b1a48732fff`.
All extensions, production entitlements, permissions and compiled feature markers
pass. No Testing framework is embedded. One raw packaged-secret scan finding was
independently traced through the parser and source to constructor property
assignments, without a credential literal. That false-positive report is retained;
no allowlist or source change was used to suppress it.

The backend code-only update to the same private source passed post-deploy checks;
four identities and existing configuration/keys remained intact. No account
mutation or SMS was performed.

Xcode confirmed upload at 22:06 Asia/Tbilisi. Apple build ID is
`954cb5fe-1e7d-48e3-a81d-64b153526265`. The four pre-existing vendor dSYM warnings
(React, ReactNativeDependencies, WebRTC and hermesvm) remain nonblocking. Apple completed processing, export compliance was saved and tester notes were
saved. The build is **Testing** with both existing groups listed: Mnelo Development
(internal, one tester) and Mnelo Preview (external, two testers). Automatic tester
notification was enabled. Build 44 remains unassigned. Physical acceptance remains
pending. See `artifacts/build45-evidence.json` for local evidence.
