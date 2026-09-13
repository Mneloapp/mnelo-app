# Mnelo Development — local backend

The local stack uses Supabase CLI 2.116.0, PostgreSQL 17.6 (image 17.6.1.165), GoTrue 2.196.0, PostgREST 16.1, Realtime 2.129.3, Storage 1.70.3 and Edge Runtime 1.74.3. The app remains one Expo mobile application. No cloud account is necessary for local Auth, database, RLS, Realtime and Storage development. Local services must stay on loopback, with no production data or credentials.

## Standard setup

Install a local Docker-compatible runtime, run `npm ci`, then `npm run db:start`. The wrapper creates the `mnelo-local-only` Docker network with its host binding set to `127.0.0.1` and passes that network to every command, including reset. API port is 54321 and database port is 54322. PostgreSQL migrations apply on startup/reset. `npm run db:reset` discards the local development database; it cannot target a cloud project. Run `npm run db:test` and `npm run db:lint` afterward.

No automatic seed users are loaded. The local configuration defines three reserved test phone numbers ending 0101–0103; Phase 3 verified this flow against real Auth. `npm run db:env` prepares the ignored public-only mobile environment. See [AUTH.md](AUTH.md) for the test codes and no-delivery hook. The hook rejects unlisted numbers and replaces SMS delivery; the deliberately invalid provider placeholders only enable the CLI's phone feature gate. Never copy this local provider/test configuration into cloud Auth. Studio, analytics, vector/S3 features and email signup remain disabled. Core Auth, Realtime, Storage and Edge Runtime remain enabled.

## Original Mac runtime

The host had no container runtime. Lima 2.2.0 was downloaded from its official GitHub release, verified against the release SHA256 manifest, and installed under `~/.local/share/mnelo-toolchain/lima`. Docker CLI 29.8.0 came from Docker's official macOS ARM64 binary distribution and is under the same toolchain directory. No global shell, Homebrew, account or signing configuration was changed.

The `mnelo-local` Lima VM uses Apple's VZ driver, Ubuntu 26.04 ARM64, 4 CPUs, 4 GiB RAM and an 18 GiB sparse disk. Its Docker engine is 29.8.0. Only the repository is mounted, read-only; the home directory is not mounted. The Docker socket is local to `~/.lima/mnelo-local/sock/docker.sock`. The Node wrapper discovers this socket and the isolated Docker CLI without altering global contexts. Lima forwards guest services to host loopback.

Start/stop this runtime explicitly when needed:

```sh
~/.local/share/mnelo-toolchain/lima/bin/limactl start mnelo-local
npm run db:start
npm run db:stop
~/.local/share/mnelo-toolchain/lima/bin/limactl stop mnelo-local
```

Containers, generated local credentials, volumes and ignored `.temp`/artifact logs are local state, not deployable source. CLI status contains local keys; do not paste its full output into reports. Only modern publishable keys may enter the mobile config. Privileged keys remain in server processes.

## Deployment boundary

There is no cloud project reference in this repository. Before cloud rollout, create/authorize Mnelo Development, review the migration diff, deploy only migrations and server functions, and configure cloud Auth separately with a real SMS provider, rate limits and production test-code exclusion. The wrapper offers no `link`, `push` or cloud reset command. Local development success does not prove hosted deployment or delivery of SMS/push/calls.

References: [Supabase local development](https://supabase.com/docs/guides/local-development), [Lima installation](https://lima-vm.io/docs/installation/), [Lima Docker runtime](https://lima-vm.io/docs/examples/containers/docker/), [Docker binary installation](https://docs.docker.com/engine/install/binaries/).

## Executed foundation checks

Clean start and a subsequent full local reset applied both migrations. All seven core containers run; database/Auth/Storage/Realtime/Kong reported healthy, PostgREST and Edge Runtime reported running. Host `lsof` and Docker effective port bindings both confirmed API `127.0.0.1:54321`. PostgreSQL reported version 17.6. pgTAP: 52 passing checks. Database lint: no schema errors. See QA_REPORT for limits.

An initial reset omitted the custom network and recreated only PostgreSQL on the CLI default network. Storage failed DNS lookup for the database. The wrapper now always supplies the same network; the subsequent clean reset and tests passed. An initial security test also caught Supabase global function grants surviving a schema-local REVOKE. Migrations now revoke global defaults and explicitly revoke all internal helper execution before granting the required policy helpers. The regression test passes.

## Phase 4 profile integration

See [profile and avatar implementation](PROFILES.md). Migrations `20260907000400_profiles.sql` and `20260907000500_availability_expiry.sql` add bounded privacy-filtered summaries/search, expiring availability and owner-only avatar reservations. The authenticated Edge image processor exclusively writes private avatars; client finalization/upload is denied. `npm run test:profiles` exercises the real local service boundary; `npm run check:edge` checks server TypeScript. Native picker/device and cloud deployment acceptance remain pending.
