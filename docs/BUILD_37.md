# iOS 0.1.0 (37): call latency, notification navigation and photo albums

## Call latency

Two physical iPhones reproduced repeated six-second pauses in build 36: creating/applying the callee answer took 6,056 ms, applying the caller answer took 6,255 ms, and the callee's first video frame arrived 6,384 ms after transport connected. The installed WebRTC audio observer initializes lifecycle hooks as active and waits two seconds per unanswered JavaScript callback. Direct peers imported WebRTC classes without initializing that lifecycle bridge. Capture and peer creation now call the library's own idempotent setup, which reconciles inactive hooks before negotiation. CallKit retains audio-session ownership.

A second issue repeatedly registered an unchanged APNs token: querying the token generates an iOS token event, which queried and registered it again. One phone made 33 registration requests in under a minute, holding ordinary requests in the queue for 1.45–5.6 seconds. Unchanged token echoes now coalesce; genuine token changes still register. With both fixes, the phones made two registrations each, and maximum observed HTTP queue waits fell to 281/253 ms (means 8/10 ms).

In diagnostic 36.3, answer-to-transport measured approximately 3.7 seconds for voice and 4.4 seconds for video. First video frames followed transport by 0.41/0.61 seconds. The owner reported clear improvement and correct speaker output. These are individual device traces, not network-wide latency guarantees. Build 37 additionally prepares the caller's existing local media/offer while ringing and reduces initial relay-candidate coalescing from 200 to 40 ms. The offer is published only after acceptance; recipient capture still starts only after answering. Cancellation, blocked peers and stale asynchronous setup remain guarded. Additional warmup timing is awaiting the owner's device check.

Diagnostic copies identify as 36.1–36.4 and retain existing vault/keychain state. They are in-place development installations, not TestFlight releases. Their native notification extension is still build 36; notification badge changes require the new native build.

## Notifications

The service extension sets an unread badge with its notification, counting unread local history and verified pending encrypted inbox messages without double counting already projected/read IDs. APNs supplies a fallback badge of one when the extension cannot resolve the vault. Preview validation continues to enforce authenticated authors, phone bindings, group membership, blocks and local deletion. Push payloads contain no message content, sender name or chat destination.

Foreground banners wait for the local sender/text preview and present once; late lookups cannot replace newer notifications. A notification tap is retained independently of runtime initialization, root navigation and unlock. It resolves the chat from verified local data, waits for inbox updates if necessary, and opens that conversation once. The startup redirect cannot overwrite it. Cached/live duplicate responses are coalesced. Contact-name lookup is no longer on the navigation path.

## Chat presentation

Consecutive photos from the same sender within a minute appear in albums of up to ten, including existing history. The grid shows up to four tiles with a +N overlay; each photo remains a separate durable message for delivery, deletion, reactions, replies and gallery navigation. Delivery/read leaves reflect the least advanced member. Quote navigation recognizes photos inside albums. Captioned photos, replies, intervening messages and different senders/conversations remain separate.

Album tile sizes follow the measured container width. Browser review at a 390-pixel phone width confirmed the two-column grid, +4 overlay for seven images, and opening the fourth image. Search retains its native sticky wrapper when focused, avoiding a TextInput remount and stale offset. Browser focus/typing preserved the same field position and focus; physical keyboard acceptance remains a separate check.

## Validation and release status

Regression coverage includes the installed library's real audio lifecycle reconciler, push-token echo/rotation, prepared-call cancellation, initial and fallback ICE candidates, encrypted notification badge deduplication, cold/warm notification navigation, overlapping preview/tap resolution, album boundaries/statuses and quote navigation. Full checks pass: 675 tests (512 Jest across 98 suites, 3 server, 160 device/protocol), TypeScript, lint, formatting, security, environment, localization and brand checks. One earlier Jest process exited with a host segmentation fault; the complete rerun passed. Native packaging and TestFlight publication are recorded separately after completion; this document does not assert upload success.

Only disposable verification/probe copies were removed for disk space. Older local archives 25–28 were losslessly compressed with every archived file compared before removing the expanded copy; signed binaries and symbols remain recoverable. Build 36's archive and shipped package are unchanged.
