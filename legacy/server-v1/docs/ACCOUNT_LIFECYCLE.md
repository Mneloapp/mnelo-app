# Mnelo account lifecycle

Me → Account offers current-device logout and account deletion. Profile fields remain editable from Me → Edit profile. Deletion requires an authenticated session and an explicit typed `DELETE` confirmation. It is irreversible once submitted. Mnelo does not report completion merely because a request was queued or a local session disappeared.

## Durable deletion

The app generates a cryptographically random 256-bit receipt and saves it before submitting. Native storage uses the existing segmented SecureStore adapter. The browser QA adapter is memory-only, so a browser reload does not promise receipt persistence. Neither receipt nor Auth token enters query caches, logs or UI. The server stores only a SHA-256 receipt hash. This is a random completion capability, not application encryption or an E2EE claim.

The account-deletion endpoint authenticates requests and derives the actor from the verified live session. Strict input rejects client actor IDs. Repeated submissions reuse the same durable account job. A separate status operation accepts the receipt after Auth deletion and returns only `processing`, `deleted` or `not_found`; it exposes no account identifier. Unknown status or a transport failure never becomes a success screen. The receipt cannot be discarded while processing or during the initial two-minute uncertain-submission window.

Closing accounts immediately stop ordinary RPC mutations, hide from profile discovery, pause matching, cancel pending requests, disable push and end active call records. The independent call worker must actually remove terminal rooms before deletion is ready. A worker leases one deletion job, tombstones authored message content in bounded batches, removes authored locations/contacts/reactions, reassigns group administration where necessary, and records all owned private Storage paths. Storage files are removed through the Storage API, not by deleting metadata rows. The worker rescans before deleting Auth. An upload barrier prevents new ready attachments/avatar publication after closing begins. A final profile-deletion trigger tombstones any late-committed authored payload.

A minimum two-minute settlement period and actual remaining-object/call-queue checks precede Auth deletion. Failures preserve the durable job, receipt and path manifest. Queue leases last two minutes; normal deferral and failed jobs retry after 20 seconds. Auth removal has bounded retries for transient/uncertain acknowledgments; a confirmed already-missing user is idempotent success. Serializable/deadlock request failures receive bounded retries. Cleanup failures produce stable redacted errors. A failure in retention cleanup does not prevent an unrelated queued deletion from being attempted.

Supabase documents that Storage ownership can block Auth removal and that an old JWT is otherwise valid until expiry. Mnelo removes actual objects first and enforces live Auth-session checks in RLS/RPC/Edge/Realtime. See [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data) and [Storage object removal](https://supabase.com/docs/guides/storage/management/delete-objects), checked during this phase.

## Retention rules and limits

- Auth identity, private phone, refresh sessions and cascaded profile, capabilities, needs/offers, connections, reviews, devices and push tokens are removed with the account. Existing relational foreign-key rules remain migration-managed.
- Authored messages remain empty deletion tombstones for conversation continuity. Sender identity is null after profile removal. Another participant's independently authored messages and files remain theirs. Previously copied, downloaded or forwarded content cannot be recalled.
- Operational deletion records retain the former actor UUID and file manifest for seven days to sweep interrupted uploads. The retention sweep still retries beyond seven days if owned objects remain; it does not discard the ownership information needed to remove them. Once clear, identity/path data is removed. Anonymous completion receipts expire 30 days after completion; pending jobs keep their receipts usable.
- Service-only moderation audit metadata can remain without a live profile reference. This implementation is not a finalized legal retention policy. Production backup expiration, third-party log retention, legal holds and required privacy/terms disclosures must be reviewed by the owner before release.

## Workers and deployment

Local: `npm run account:worker` invokes the actual local cleanup endpoint every ten seconds. `npm run calls:worker` must also run for active-call eviction. Both scripts use the guarded local backend context; privileged values remain in process memory. `npm run account:worker -- --once` is a one-shot diagnostic.

Cloud: deploy `account-deletion` and `account-cleanup` with the other functions. The cleanup endpoint requires service authorization. Migration `20260908005600` creates the inactive `mnelo-account-cleanup` cron job. Provision protected Vault entries `mnelo_account_project_url` and `mnelo_account_dispatch_authorization` through authorized server administration and then activate the job. The schedule is once per minute; missing Vault configuration does not dispatch. Do not paste secrets into documentation or mobile configuration. No cloud deployment/scheduler activation has occurred locally.

## Verification

`npm run test:account` creates reserved local accounts and tests real Auth/Storage deletion, concurrent related-account requests, exact surviving group admin, active LiveKit room teardown, private receipts, client-denied completion/worker access, hidden closing profiles, write/call denial, retained peer content and late-file removal. It first asserts the two-minute settlement gate, then advances only the reserved fixture jobs' timestamps for a fast integration test. The browser flow separately exercises the actual elapsed settlement period. Unit tests cover uncertain submission, receipt recovery, status without Auth, corruption, failed cleanup, retry and truthful completion. Native keychain persistence and physical-device lifecycle remain device acceptance gates.
