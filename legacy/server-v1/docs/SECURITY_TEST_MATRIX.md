# Mnelo security test matrix

This matrix records actual local authorization checks. It is not a penetration-test certificate or a cloud/device acceptance claim. Private API behavior uses real local Auth sessions, PostgreSQL, Storage, Realtime and LiveKit; database pgTAP fixtures run inside a rolled-back transaction.

| Release-blocking boundary               | Automated evidence                                                                                                                                           | Local result |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| Private phone/profile fields            | pgTAP private Auth SELECT denial; profiles/privacy integrations exclude phone/GPS and enforce explicit consent                                               | PASS         |
| Unrelated conversation read             | pgTAP membership/message isolation; messaging integration                                                                                                    | PASS         |
| Unrelated message insert                | pgTAP raw INSERT denied; messaging RPC outsider denied                                                                                                       | PASS         |
| Another user's message edit/delete      | pgTAP UPDATE denied; messaging actor checks                                                                                                                  | PASS         |
| Unauthorized attachment access          | pgTAP metadata/object policies; media/profile integrations attempt actual unauthorized signed/download/upload access                                         | PASS         |
| Blocked connection request              | pgTAP and moderation/security integrations                                                                                                                   | PASS         |
| Blocked discovery                       | pgTAP and profile/matching/moderation/security integrations                                                                                                  | PASS         |
| Self-verification                       | pgTAP INSERT/UPDATE denied; profile/reputation projections use actual current records                                                                        | PASS         |
| Self-rating or spoofed reputation       | pgTAP raw mutation denied; reputation eligibility/immutability integration                                                                                   | PASS         |
| Client admin/moderation operation       | pgTAP private action INSERT denied; moderation RPC and service-function ACL checks                                                                           | PASS         |
| Unauthorized LiveKit token              | calls integration verifies real signed scope, outsider denial, consent and actual room teardown                                                              | PASS         |
| Report enumeration                      | pgTAP and moderation integration deny subjects/other users                                                                                                   | PASS         |
| Device or push-token access             | pgTAP raw SELECT denied; device and notification integrations scope actual sessions/tokens                                                                   | PASS         |
| Exact-location leak                     | pgTAP unrelated location denied; privacy/matching/media integrations isolate explicitly shared points                                                        | PASS         |
| Revoked JWT use                         | devices integration: REST/RPC/Edge/refresh/Realtime receive and new-topic denial                                                                             | PASS         |
| Deletion impersonation/false completion | account integration and receipt tests: derived actor, server-only cleanup, actual Auth/Storage removal                                                       | PASS         |
| Discovery rate bypass                   | security integration: owner-only raw tables, volatile GET refusal, concurrent final-quota requests                                                           | PASS         |
| Resource abuse                          | security integration checks message/request/report/upload/call/Connect/matching limits; Auth checks resend/verification; streaming tests check size/deadline | PASS         |

`npm run db:test` currently executes 57 pgTAP assertions. `npm run test:security` executes two integration scenarios in addition to feature integration suites. `npm run test:server` executes three request-stream checks. `npm run scan:secrets` runs checksum-verified Gitleaks 8.30.1 against all available Git history, the current tracked/nonignored source snapshot and both required native JavaScript bundles. Scanner output is redacted; ignored local server configuration is intentionally outside the source snapshot. No secret scan proves the absence of every possible encoded or obfuscated secret.

## Rate boundaries

| Surface                              | Server limit                                                                      | Enforcement                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| OTP send/verify                      | local 60-second resend interval; configured Auth send/sign-in/verification limits | Actual Supabase Auth, never a client-only timer                                              |
| Username search                      | 60/minute, maximum 20 results                                                     | Authenticated volatile RPC; raw identity tables are owner-only                               |
| Other profile read                   | 120/minute                                                                        | Actor-scoped RPC; own profile restoration does not consume discovery quota                   |
| Profile details/reviews/verification | combined 120/minute                                                               | Actor-scoped projection RPCs                                                                 |
| Messaging                            | 60/minute                                                                         | Transactional RPC with idempotent message IDs                                                |
| Connection requests                  | 20/hour                                                                           | Actor-derived request RPC plus pair/cooldown/expiry checks                                   |
| Reports                              | 5/hour and 20/day                                                                 | Authenticated report RPC and immutable retry identity                                        |
| Attachment reservations              | 20/hour                                                                           | Successful reservation commits before Edge body processing, including malformed media bodies |
| Avatar processing                    | 10/hour                                                                           | Committed reservation before decoder work                                                    |
| Call initiation                      | 3/minute and 20/hour                                                              | Permission check and actor quota before real room creation                                   |
| Call token issuance                  | 180/hour                                                                          | Current participant/session validation                                                       |
| Connect interpretation/publication   | 40/hour                                                                           | Committed attempt before Edge input parsing                                                  |
| Matching                             | 60/hour                                                                           | Owned active-request evaluation                                                              |

PostgreSQL transaction limits bound committed application work. A failed/rolled-back RPC does not retain its counter increment. This is explicitly **not** a volumetric DDoS or all-invalid-attempt meter. Invalid requests cannot obtain the unauthorized content or create the rejected work, but still consume network/database resources. Cloud deployment must verify Supabase perimeter controls, configure production Auth CAPTCHA/SMS limits and cost alerts, and load-test the selected plan. No cloud account-level policy is claimed here. CORS is not authentication and is not used as authorization.

The actual boundary tests preload only reserved local fixture counters to their final permitted attempt or threshold, then make real concurrent/RPC/Edge requests. They do not claim to simulate an hour of production traffic. Production SMS delivery and distributed abuse controls remain release gates; no additional hosted rate-limit service has been introduced.

## Hardening findings and disposition

Raw eligible-profile table reads could bypass the intended discovery API. Migration 059 adds owner-only restrictive raw policies, retains privacy-checked summaries and revokes raw verification SELECT. Four additional database assertions and a real API regression verify the stronger boundary. Private helper schemas remain unexposed, definer functions fix their search path, anonymous definer execution is denied, and sensitive service-only function grants are checked.

Previously bounded request bodies had no application deadline while reading a slow stream. They now enforce a 30-second total read deadline and a byte ceiling, including missing content-length and stalled cancellation. Shared response headers prevent caching/sniffing; Auth headers are length-bounded and forwarded-message input is strict. Stable error codes replace private diagnostic payloads.

Remaining release concerns: the known runtime decoder advisory awaits Phase 25; generic files remain untrusted without a deployed malware scanner; production SMS/provider/billing limits, cloud workers, physical media permissions/background behavior and backup/legal retention are not yet validated. Signed links and copied/forwarded data cannot be recalled. Mnelo does not implement E2EE; see SECURITY.md for its future architecture boundary.

Primary references checked during this pass: [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api), [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [production checklist](https://supabase.com/docs/guides/deployment/going-into-prod), [Gitleaks source and releases](https://github.com/gitleaks/gitleaks). Local test outcomes, rather than those documents alone, establish the results above.
