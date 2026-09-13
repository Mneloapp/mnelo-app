# Explainable matching

`find_matches` is an authenticated, owner-scoped database procedure. It starts from indexed matching-key evidence in capabilities and active opposite-mode Need/Offer records. Versioned aliases mirror the deterministic interpreter's supported vocabulary, including Georgian terms; otherwise normalized text must match exactly. This is not semantic AI and does not estimate probability.

A Need may match a listed capability or a compatible active Offer. Product/opportunity Needs require explicit Offers, not a generic skill alone. An Offer matches active Needs. Service/professional/capability types can cross-match the same key; other intent types must agree. Explicit dates must be compatible and unexpired. Location matching uses coarse text/known locality aliases, with no GPS, distance calculation or invented service radius.

The procedure excludes self, blocks, Nobody discoverability, expired/inactive requests and unavailable request routes. Mutual-connection routes ignore blocked intermediate relationships. Relevant-only profiles become visible only after a current, actual result. No connection is created by matching.

| Recorded evidence                                                                                                  |              Internal points |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------: |
| Matching listed capability                                                                                         |                      60 base |
| Matching explicit Need/Offer                                                                                       |                      65 base |
| Both capability and explicit Offer                                                                                 | 5 extra, plus strongest base |
| Same stated coarse area                                                                                            |                           20 |
| Explicit current availability, when relevant to the request date                                                   |                           10 |
| At least one shared listed language                                                                                |                            5 |
| Existing connection                                                                                                |                            5 |
| At least two reviews averaging at least 4.0 (rounded to one decimal), for service/professional/product/opportunity |                            5 |

Strong requires 90 points; Good requires 75; otherwise Possible. These are deterministic labels, not confidence percentages or an opaque user reputation score. Final scores are calculated from the stored evidence. The client cannot select the score column and receives only labels, profile summaries and typed facts. Up to three current candidates are returned; UUID breaks score ties. Ranking is a transaction snapshot, not a promise that a person is available to accept.

Every reason has a signal, source ID and actual fact; review evidence also records the actual count/average. Capabilities and offers are self-reported, not verification. Copy says “lists”, “has an active offer”, or “marked themselves available”; it does not invent professional credentials, work coverage or future availability. No phone, exact message location, raw request or private detail enters an explanation. Match profiles show only public-safe active intent summaries, gated by profile access; original request text stays owner-only.

Results expire after 15 minutes. Profile, capabilities, languages, privacy, Need/Offer, reviews and blocks invalidate related results. Every reason is also checked against its current source before it can be read. This protects against stale facts and races: a changed/removed source cannot keep an explanation or relevant-profile grant alive. Expired records remain as a server-side audit snapshot until lifecycle retention cleanup; current owner-facing results require live evidence. Sources and reasons are relational rows, not an unvalidated JSON model response.

Matching is limited to 60 evaluations/hour per user. Result screens re-evaluate on entry and every minute while focused; rate-limit failure is explicit. Paused/closed requests offer a deliberate activation action. Profile navigation waits for the matching evaluation so a cold route cannot race a relevant-profile authorization grant. Pagination/bounds apply to underlying client features; matching never downloads user tables to mobile. Database load/performance under a large cohort remains a Phase 20 acceptance task.

Verification uses seven separate local Auth users. It covers positive evidence/rank controls, maximum three actual results, hidden/blocked/unrelated exclusions, internal-score denial, forged candidate writes, source invalidation, TTL, lifecycle, privacy, existing connections, explicit local review fixtures, Need/Offer direction and raw-text privacy. Browser results/profile QA used a clearly labeled development electrician with real persisted capability/availability and no verification or fabricated reviews.

Known concurrency finding: parallel deletion of connected development fixture users caused PostgreSQL `40P01` deadlocks in cascading connections/matching invalidation. Fixture cleanup now runs sequentially because these mutations share rows. Account-lifecycle implementation must retry deadlocks safely and test related concurrent deletions before release; this is not hidden as a successful account-deletion test.
