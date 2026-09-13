# Profiles and private avatars

Mnelo profiles now persist through caller-scoped database RPCs. A username is unique, lowercase, 3–24 ASCII letters/digits/underscores starting with a letter; reserved official identities are rejected. Display names and capabilities support Georgian text. Profile writes cannot set verification, reputation, another user's identity or precise location.

`get_profile` returns a typed summary with actual capability/language records and database-derived review count/rating and unexpired verification. No phone or GPS fields are included. `search_profiles` matches escaped name/username prefixes, requires two characters, returns at most 20 rows, and limits successful RPC calls to 60/minute. The app debounces search. Direct table reads remain RLS-filtered; comprehensive abuse protection for all API paths is part of Phase 18.

Default relevant-only discoverability means a stranger's username alone does not grant profile access. Connections, current matching results and participants in a pending contextual request can view the necessary profile. Blocks take precedence in both directions. This keeps the request recipient able to identify the sender without making that sender globally searchable. Nobody is excluded from new discovery; existing authorized relationships retain profile access.

Availability is explicit and expires at the next UTC midnight. The initial server-day convention is conservative and documented; timezone-specific presentation and matching interpretation must be reviewed in localization. Language codes and availability are saved independently from profile text. Need/Offer persistence follows Phase 8 and uses the existing normalized schema.

## Avatar transport

The opt-in system photo picker selects an image. Native ImageManipulator resizes its longest edge to at most 512 pixels and converts it to JPEG. The user previews and confirms the upload. Camera and microphone permissions are not enabled by this avatar feature.

The `avatar` Edge Function authenticates through Auth.getUser, reserves an upload with a caller-scoped 10/hour database limit, and reads at most 2 MiB. jpeg-js 0.4.4 decodes with strict parsing, 1.1-megapixel/32-MiB bounds and a 1024-pixel dimension cap. The server encodes only decoded pixels, dropping EXIF/GPS, comments and appended payload. This is image validation and normalization, not a general malware scanner.

Only the server writes the private avatars bucket. Client Storage inserts and privileged finalization are denied. Finalization locks the profile and checks the unexpired owner reservation and stored object; the previous avatar is removed after replacement. Error responses contain stable codes only. Service credentials remain in Edge Runtime. The gateway JWT check is disabled for modern signing-key compatibility; the function independently verifies every request with Auth, and unauthenticated requests are tested as 401.

Authorized clients request 60-second signed image URLs, kept only in memory and refreshed while displayed. Existing signed URLs can remain usable until their short expiry after a privacy/block change; new signing is immediately subject to RLS. This bounded revocation window must be considered in final security QA. Failed post-upload database commits attempt object cleanup; orphan/reservation maintenance belongs in lifecycle hardening.

## Local verification

Run `npm run db:migrate`, `npm run functions:serve` and `npm run test:profiles`. The two integration tests exercise real Auth, PostgREST, Edge Runtime and Storage, including username collision/reservation, default privacy, cross-user updates, expired availability, block suppression, valid image processing, spoofed MIME rejection, signed access and unrelated-user denial. Native photo-picker/permission and image rendering acceptance remains pending a supported native build.

Official sources: [Expo ImagePicker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/), [ImageManipulator](https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator/), [Supabase Edge authentication](https://supabase.com/docs/guides/functions/auth), [jpeg-js decoding bounds](https://github.com/jpeg-js/jpeg-js).
