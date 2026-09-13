# Private media and explicit sharing

Photos, files, native AAC voice recordings, one-point location and Mnelo contacts now use real local services. Each action is chosen explicitly. No background location or background voice recording is enabled. Contacts use the system's individual picker for an optional invitation; the address book is not enumerated/uploaded, and Android contact-write permission is blocked. Chat contact messages reference a Mnelo profile whose visibility is checked for each viewer; phone numbers are not copied.

## Upload and access

The mobile picker copies to cache, bounds file size at 20 MiB, and previews before Send. Photos are resized to a maximum 1600-pixel edge and re-encoded as JPEG. Avatar processing retains its smaller independent limit. Native voice recording is mono AAC/M4A, stops at ten minutes, supports cancel/preview/send/playback, and stops when the app/conversation loses focus. Microphone denial offers Settings. The supplementary web preview does not pretend to record native-compatible voice; server voice tests use an explicitly generated one-second development tone.

`chat-upload` verifies Auth identity and conversation membership, reserves owner-scoped metadata and consumes an upload rate limit even for invalid retries. Image decoding/re-encoding strips metadata and appended payload; audio metadata is parsed server-side to validate AAC/M4A and duration. PDF requires its signature and text requires valid UTF-8 without NUL. Other files are private opaque downloads with `application/octet-stream`; they are not executed or presented as trusted/safe documents. No general malware scanner is configured. Size, MIME, ownership and access validation are not a malware-safety claim.

Privileged processing claims use distinct random object paths and tokens, with a two-minute stale-worker recovery window. An old worker cannot replace a published attachment. Failed attempts clean their object and release only their claim. A stable client UUID connects upload/send retries to the same reservation and message. The server records the actual stored size/type/duration. Only Edge functions can write objects or finalize metadata.

Recipients cannot read an unsent object's bytes or filename. Sending links a ready owned upload to an authorized conversation atomically. Read access requires current membership and a live attachment message. Native downloads use temporary cache files and the explicit system share/open flow; cleanup follows. Signed URLs expire after 60 seconds, so existing URL access can outlive a block/deletion by that bounded interval. Previously downloaded files cannot be remotely erased from another person's device.

## Forwarding and deletion

Text/location/contact forwarding uses normal destination authorization. Media forwarding checks the source through the caller's RLS view and copies validated bytes into a new owner/destination path; it does not expose the source URL or grant destination members source-conversation access. Nonmember forwarding is integration-tested as denied.

Soft deletion removes exact location/contact payload rows, blanks text, disables reactions and rejects the associated attachment, preventing new signed access. Physical object retention/orphan cleanup is handled in the account/lifecycle hardening phases; current failed-attempt cleanup is best effort.

## Actual local checks and limits

`npm run test:media` exercises real Auth, Edge Runtime, PostgreSQL and Storage: image/file/AAC voice upload, duplicate retries, unsent metadata/byte privacy, owner-only send, recipient download, nonmember denial, parsed audio duration, explicit location/contact, private forwarding and deletion. The development tone contains no personal recording. `npm run check:edge` checks all server entry points with a pinned Deno tool and server dependency lock.

Native picker, camera, microphone interruption/playback, real GPS accuracy and physical-device sharing still require supported development builds. Browser layout and file-picker checks are supplementary. Media payloads are not E2EE. No production cloud deployment or malware-scanning service is claimed.

Sources: [Expo Audio](https://docs.expo.dev/versions/v57.0.0/sdk/audio/), [DocumentPicker](https://docs.expo.dev/versions/v57.0.0/sdk/document-picker/), [Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/), [Contacts](https://docs.expo.dev/versions/v57.0.0/sdk/contacts/). Server image validation uses jpeg-js 0.4.4; audio metadata uses music-metadata 11.15.0 with dependencies pinned in `supabase/functions/deno.lock`.
