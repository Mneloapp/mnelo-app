# Mnelo performance

Phase 20 addresses measured or directly traced costs without changing product behavior or authorization.

| Surface           | Bound / behavior                                                                                  | Evidence                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Message page      | 40, tuple timestamp/UUID cursor; no offset/full history fetch                                     | Real 2,000-message fixture, 200 requested results without duplication |
| Enrichment        | Text: 3 HTTP requests; contact/location: 5; attachment only when present                          | Actual adapter instrumentation, six unconditional requests previously |
| Inbox             | 30 per cursor page                                                                                | Existing authenticated inbox tests                                    |
| Discovery/matches | 20 search results / 3 matches                                                                     | Server-enforced limits                                                |
| Message render    | FlatList, stable IDs, 12 initial / 10 per batch / 7 viewport window, memoized bubble              | Browser layout check; hardware profiling still needed                 |
| Outbox            | 20 persisted items / 24,000 characters; no idle one-second loop                                   | Interruption/idempotency/backoff tests; actual online delivery        |
| Acknowledgments   | At most 40 ephemeral sent entries, never truncates pending work                                   | Separate from durable queue and canonical server cache                |
| Voice             | No recording fetch at mount; fresh authorized URL on first Play; background cancels delayed start | Two unit tests and actual browser playback progression                |
| Image             | Existing JPEG resize to 1,600 px / 4 MP server maximum; avatars 1,024 px / 2 MiB                  | Media/avatar tests; private URLs expire in 60 seconds                 |
| Cache             | Memory-only history, 30-second stale time / five-minute inactive GC; media metadata 60-second GC  | Current query configuration; logout/access changes clear cache        |

Realtime bursts coalesce for 150 ms. Events during an ongoing snapshot schedule a subsequent snapshot; teardown cancels queued refresh. This avoids losing a late event while reducing duplicate refreshes. Reconnect still revalidates every already-loaded cursor page, preserving deletion/reaction/read consistency. The initial fetch never loads a full history, but an intentionally deep scroll increases subsequent refresh work. A future incremental event protocol must preserve authorization, cursor gaps and edit/delete semantics before replacing this behavior. Do not set a naive maxPages that discards the newest page while scrolling older messages.

`npm run test:performance` uses guarded local fixtures and the actual mobile message-page adapter under a recipient JWT. Five 40-message page reads from 2,000 rows measured median 9.1 ms and max 11.4 ms on this Mac/local database. These are not network, native startup, FPS, production load or device-memory benchmarks. Request counts and cursor integrity are assertions; timing is diagnostic, not a flaky CI threshold. Other regression commands: `test:offline`, `test:messaging`, `test:media`, `test:groups`.

Remaining device work: release-mode startup, slow-network scroll fill, large Dynamic Type, decoded-image/native memory, audio route/interruptions and low-memory eviction on iPhone/Android. Current exports are approximately 7.1 MB iOS / 7.5 MB Android Hermes bundles, including LiveKit/WebRTC interfaces; no measured startup improvement is claimed. Expo Router retains screen routing, and no speculative bundler/SDK upgrade was applied.

Implementation references: [React Native list tuning](https://reactnative.dev/docs/optimizing-flatlist-configuration), [TanStack infinite-query behavior](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries), [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/), checked alongside installed packages. Dynamic-height messages do not use invented fixed item layouts; clipping defaults were not forced on iOS.
