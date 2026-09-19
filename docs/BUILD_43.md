# Build 43 — local contact names on cold launch

The chat list previously queried the vault before the asynchronous phonebook
projection was ready. It displayed a Mnelo profile name or phone number, then
replaced that title with the device's saved contact name a second or two later.

Name-dependent `ContactView` queries now wait for the initial local phonebook
read. The app shell, network, message processing and notification navigation
continue independently. Identical concurrent name lookups, including the caller
cache warm-up and chat projection, share only the in-flight Contacts scan. Later
reads recheck permission and current names; no address-book cache is persisted.

The projection is scoped to the engine, own phone number and enabled session.
Permission changes, failed reads and cleanup discard its names. A Contacts
change during the first scan suppresses that obsolete result. Denied access or
a failed read releases the query to its existing profile/number fallback. An
exceptional hung read releases after five seconds, while a later successful
read can still refresh the name. Thus a native read that takes more than five
seconds can still show a fallback before the local name; ordinary initial
reads resolve before the first chat-title result.

Outgoing call targets and call-action trust checks now use raw local identity
queries under separate query keys. They cannot be delayed by name presentation;
incoming answer, media playback and decline remain available while labels load.
Pending call labels use the localized loading text. Protocol identity, contact
permissions and the build-42 media negotiation remain unchanged.

## Verification checkpoint

- Full checks pass: **738 tests** (558 Jest in 101 suites, three server tests and
  177 device/protocol tests), TypeScript, lint, formatting and source guards.
- Eleven phonebook-hook tests cover the cold query, refresh/revocation, failed
  and stalled reads, stale-session isolation, cleanup and StrictMode replay.
- A provider test verifies that the network and app shell start while the first
  name query waits, and its first displayed result is the phonebook alias.
- A real SQLite contact-view test preserves aliases and protocol identity while
  resolving the initial name asynchronously.
- Native adapter tests cover concurrent scan deduplication, independent result
  maps, fresh subsequent reads and recovery after rejection.
- The final 34 focused call/dial tests pass without console warnings, including
  immediate outgoing start, incoming answer/playback and blocked-contact safety
  while presentation queries remain pending. The full suite's initial dial test
  warning was corrected by awaiting its new independent trust query.
- Both mobile JavaScript exports pass. Gitleaks history, source and bundle scans
  report zero findings. No dependencies or server deployment changed.

Native archive, distribution and TestFlight availability are pending at this
checkpoint. The reported cold-launch sequence has been reproduced with delayed
Contacts responses in tests; the owner's physical-phone result remains to be
confirmed. Prior builds, including 37 and 42, remain preserved. The previously
documented intermittent suspension crash is not claimed fixed by this release.
