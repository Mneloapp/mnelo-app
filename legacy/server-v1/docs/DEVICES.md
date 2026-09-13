# Mnelo devices and sessions

Me → Devices lists the current session first, device type/OS and approximate last activity. Metadata is reported by the application; it is not hardware attestation. Unregistered Auth sessions are shown as unrecognized devices with no invented OS/IP/location. Cursor pages contain 20 sessions; a separate current-device lookup keeps this session visible even when many newer sessions exist. Session identifiers are used only as internal row/cursor identifiers and never rendered as credentials. Raw devices, Auth sessions and push-token tables are not exposed through the client API.

The foreground app checks current session validity every 30 seconds and when returning to foreground. It registers device metadata on first use and at most every five minutes, independently of push permission. Missing network access is not treated as logout. A confirmed revocation clears session material, pending messages, private subscriptions and query cache; the navigator returns to authentication. Server access checks apply immediately to subsequent requests even before that UI check runs.

## Logout semantics

- **Log out this device** uses Supabase Auth's `local` scope.
- **Log out all other devices** explicitly confirms that all other account sessions will be terminated and the current session retained. It uses the supported Auth `others` scope. There is no misleading per-device action that secretly logs out several devices.

The current user's JWT authorizes those endpoints. No server key is needed in the application and no raw Auth-table deletion is performed by the client. Supabase deletes affected sessions and revokes their refresh tokens. The installed auth-js 2.115.0 implementation clears SDK storage on some failed `signOut` network responses; Mnelo therefore confirms Auth's server logout before clearing local state. A failed request remains retryable. Unit tests cover this observed SDK behavior and the intended application contract.

An existing access JWT remains cryptographically valid until expiry after logout. Mnelo adds a database check of the verified JWT's `session_id` against a current `auth.sessions` row, including `not_after` and any application device revocation. All exposed application tables have a restrictive live-session policy in addition to existing ownership/block policies. A database assertion prevents future tables silently omitting this policy. Private Storage and Realtime channel authorization also check the live session. Definer RPCs require a live user; the two older membership-only message RPCs were strengthened. Edge authentication verifies live session state before privileged processing.

Revoked sockets receive no new private message changes, and cannot join a new private topic. Calls use unique actor-owned private topics. Push delivery already checks current session/device state; Auth deletion cascades device tokens. Active calls are ended by the durable call worker when their bound Auth session disappears.

These controls cannot recall content already seen or copied, and previously issued signed media URLs can remain usable until their short expiry. Existing LiveKit transport termination depends on the configured cleanup worker. An offline device cannot learn about remote revocation until it reconnects. This is not E2EE.

## Verification and deployment

`npm run test:devices` creates reserved local accounts with two actual Auth sessions and synthetic pagination fixtures. It verifies current-device lookup, private data boundaries, official other-session and local logout, refresh revocation, stale-JWT REST/RPC/Edge denial, Realtime delivery before logout and its absence afterward, revoked-topic join denial, unaffected accounts and fresh login. It does not use production identities or expose JWTs in output.

The pgTAP suite now uses explicit rolled-back Auth session fixtures and verifies the additional restrictive-policy invariant. Its old device read assertion was strengthened from an empty result to denied raw SELECT. Existing authentication, messaging, media, profile, matching, groups, push and call regressions remain required. The OTP integration fixture now uses reserved test number ending 0103, preserving the two interactive 0101/0102 demonstration accounts.

Supabase configuration may separately enforce paid-plan session lifetime/inactivity policies. Those settings must be reviewed for the actual deployment; this repository does not claim to have enabled unavailable account-level settings. The application enforces existing `not_after` immediately. See [Supabase sessions](https://supabase.com/docs/guides/auth/sessions) and [signout scopes](https://supabase.com/docs/guides/auth/signout), checked during this phase.
