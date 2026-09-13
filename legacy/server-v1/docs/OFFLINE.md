# Mnelo offline and reconnect behavior

Text messages enter a bounded outbox before the composer clears. Native pending text is stored through the existing OS SecureStore adapter; no plaintext AsyncStorage or persisted query/history cache is introduced. Each snapshot contains an account ID, verified current Auth session ID and stable client message IDs. The storage key also separates backend/environment/account. Browser QA uses ephemeral memory and does not claim durable browser persistence.

The app can keep typing/sending into that initialized outbox during a connection loss. Existing loaded conversation content remains available in memory and an offline banner identifies the state. Queued messages show Pending; transport failures show retry controls. On reconnect/foreground, automatic delivery resumes with the same client UUID and current backend authorization. Unknown-user access, blocks, expired membership and session revocation are still enforced by the server.

Only one delivery runs at once. New messages can be saved while it waits. Messages retain order within a conversation while earlier automatic retries are pending. Transient failures use exponential delay from two seconds to a two-minute maximum and pause other attempts during that network backoff. After eight automatic attempts, deliberate Retry is required. Authorization, validation, conflict and rate-limit errors stop automatic retry immediately. An explicit retry preserves the message ID.

An acknowledgment must match the original client ID, conversation, actor and sent state. The durable entry is removed only after that acknowledgment. A lost response after an actual server commit is safe to replay: the database returns the existing message. If storage reports failure after committing a new snapshot, an exact readback can confirm it. If the result is still unknown, the outbox stops writes until reloaded; it does not overwrite uncertain data. The composer keeps its draft message ID across a failed save attempt.

Snapshots are limited to 20 messages and 24,000 Unicode characters including metadata, fitting the existing segmented store. Capacity failure preserves the existing queue and composer text. This is for pending text, not full conversation archives. A single unusually large message reduces how many other pending messages fit.

## Privacy and lifecycle

Logout/account switching immediately clears the visible queue, stops new delivery and removes its SecureStore snapshot. Late acknowledgments cannot repopulate another account's state. A cold start resumes only after Auth identity/session verification and an outbox read succeed. A new login with a different Auth session clears the older session's queue before allowing writes; it cannot silently replay messages queued before logout. This also covers an earlier interrupted cleanup. If removal fails, the encrypted old snapshot can remain, but a new session must successfully clear it before writes are enabled. Native keychain behavior on a physical device remains a device acceptance check.

Account deletion pauses the outbox while the deletion receipt owns navigation. Auth removal clears local session data. Removing a pending entry stops retries, but cannot assert that a request already in transit never reached the server; the UI says so. Pending messages cannot be reacted to, forwarded or used as a reply target before server acknowledgment.

## Realtime and cache

TanStack Query tracks link connectivity and foreground state without third-party reachability probes. Realtime subscriptions refresh snapshots both at channel join and PostgreSQL change registration, closing the reconnection gap. Pagination uses timestamp/UUID cursors, and UI reconciliation uses stable client IDs to avoid duplicate optimistic/acknowledged rows. Read-state updates retry when the stream returns; a failed read confirmation does not pretend to have succeeded.

## Actual verification and limits

Unit tests exercise reconstruction, lost acknowledgments, concurrent enqueue/delivery, offline/backoff order, wrong acknowledgment, authorization/rate pauses, capacity, interrupted/uncertain SecureStore writes, corrupt state, logout and account/session changes. These use a controlled backing store around the real segmented adapter; they are not a physical keychain test.

`npm run test:offline` uses real local Supabase accounts, commits a message and deliberately loses the transport acknowledgment, reconstructs the outbox, replays it and checks exactly one received database row. It also verifies an actual new Auth session cannot replay the older queue. Device/revocation and messaging/reconnect regressions remain required.

Supplementary browser QA used two real local OTP accounts: network disabled on one browser, two pending messages with zero server copies, a peer reply during the outage, then network restored. Both queued messages were committed once and in order, the peer reply appeared and read state recovered. Screenshots at 390×844 were inspected and browser errors/console were empty. This is simulated browser networking, not physical iPhone airplane-mode QA.

Cold-start authentication requires connectivity; full offline message-history reading is not implemented. Media retry retains the current upload's stable identifiers within its existing screen, but this phase does not persist a large media transfer queue across process death. Production reconnect/load tests, real device suspension/airplane mode and keychain behavior remain acceptance gates. This storage is not E2EE.

Phase 20 removes idle polling: queue changes, connectivity/focus and the next exact retry deadline wake the outbox. No timer is retained for an empty/manual-only queue. The ephemeral acknowledged-message projection is capped at 40 while durable pending messages are preserved.
