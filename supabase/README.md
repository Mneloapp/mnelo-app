# Mnelo backend

This directory owns reproducible PostgreSQL migrations, private Storage and Realtime policies, and transactional pgTAP authorization tests. It is the Mnelo Development local project; no cloud project is linked or provisioned.

```sh
npm run db:start
npm run db:reset
npm run db:test
npm run db:lint
```

`db:reset` explicitly recreates only the local development database. The wrapper fixes the project ID, removes inherited cloud credentials, rejects remote Docker endpoints and never accepts arbitrary linked-project flags. Start uses a loopback-bound Docker network. Install a local Docker-compatible runtime first; see [local setup](../docs/LOCAL_BACKEND.md).

Every exposed application table has RLS. Client roles receive SELECT only and narrow authenticated mutation functions; each function derives identity from Auth, checks authorization and fixes its search path. Phone stays in `auth.users`. User locations shared in messages are protected by conversation membership. Private moderation/rate/notification tables have no client policies. Buckets are private; upload reservation/finalization is added in the media phase.

Test fixtures use reserved development identities within a transaction and roll back. Automatic SQL seeding is disabled. Cloud deployment and production SMS remain separate owner-authorized configuration. Never push this local test OTP configuration to a cloud Auth project.
