# Phase 1 — Local Stack & Environment

> **Status**: ✅ Done · **Progress**: 5 / 5 tasks · **Last updated**: 2026-07-02
> **Source roadmap**: [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P1
> **Source spec**: [`docs/OVERVIEW.md`](../OVERVIEW.md)
> **Executing a task?** Read **only** that task's `### Task N.n` block + its bounded *REQUIRED READING* — never the whole file. See [token economy](README.md#token-economy--executing-a-single-task).

---

## Context

Phase 0 produced a building, fully-gated, dual (cargo + pnpm) monorepo: the workspace metadata, the toolchain, the
lint/format/commit governance, the complete CI/CD + go-public scaffolding, and an empty `apps/api` stub (a `main.rs`
that compiles under `cargo build --locked`). What P0 did **not** provide is a way to actually run anything: there is no
database, no Redis, no mail sink, and no validated configuration the future engine can read. The repo can lint and
compile, but it cannot boot.

This phase fills that gap with two deliverables that every later backend phase depends on. First, a **one-command,
zero-credential local stack** — `docker-compose.yml` (Postgres + Redis + Mailpit, each healthchecked) plus the
override/test/prod variants, the init scripts, and the `infra:up`/`infra:down` wrappers — so a reviewer can stand up the
whole backend with a single command and watch every transactional email land in a browsable inbox. Second, a
**fail-fast environment contract** — the committed `.env.example`/`.env.prod.example` documenting every variable from
[`OVERVIEW.md §9`](../OVERVIEW.md#9-configuration--environment), and a `figment`-layered `Settings` loader
(`apps/api/src/config/`) that deserializes and **validates** the environment at boot, aborting with a precise message
when a required variable is missing or a hard guard (`JWT_SECRET` ≥ 64 chars, `MFA_ENCRYPTION_KEY` base64-32 bytes) is
violated.

When P1 is done, `pnpm infra:up` (or `docker compose up --wait`) returns **only** when all three containers report
healthy and the Mailpit UI is reachable at `http://localhost:8025`; the test stack (high ports `55432`/`56379`/
`51025`+`58025`, `tmpfs`) boots and tears down without contending with the dev stack; `cargo nextest run -p api config`
passes, including the unit tests that prove a short `JWT_SECRET` and a malformed `MFA_ENCRYPTION_KEY` each abort
`Settings::load()` with a typed, precise error. **This phase wires infrastructure and configuration only — there is no
axum bootstrap, no routes, no `RedisStores::connect`, and no `AuthEngine` wiring; the service still does not serve HTTP
(that begins in P3).**

---

## Rules-of-phase

1. **All services bind `127.0.0.1`.** Every published port is `127.0.0.1:<host>:<container>` (never `0.0.0.0`) so the
   dev stack is never exposed on the LAN; container-network isolation is the access control for local dev.
2. **The test stack uses deliberately high ports + `tmpfs`.** Postgres `55432`, Redis `56379`, Mailpit `51025`/`58025`,
   no named volumes — so `docker-compose.test.yml` runs alongside the dev stack without a port or volume collision and
   leaves no state behind.
3. **Secrets only via env; only the `*.example` files are committed.** `.env`, `.env.prod`, `.env.test` stay
   git-ignored. The committed `.env.example` may carry **throwaway dev-only** values (a ≥ 64-char `JWT_SECRET`, a
   base64 32-byte `MFA_ENCRYPTION_KEY`) so the happy path runs with zero external credentials; the `.env.prod.example`
   leaves every secret blank with a generation command.
4. **Image pinning.** Mailpit is **digest-pinned** (`axllent/mailpit@sha256:…`); Postgres and Redis are tag-pinned
   (`postgres:18-alpine`, `redis:7-alpine`). Never use a floating `latest`.
5. **Compose project names are stable.** `rust-auth-example` (dev + auto-merged override), `rust-auth-example-test`
   (CI/test), `rust-auth-example-prod` (prod smoke). The override file is dev-only and must never carry prod settings.
6. **The config loader is fail-fast and panic-free.** `Settings::load()` returns a typed `thiserror` `ConfigError`;
   **no `unwrap`/`expect`/`panic!`** on the load path. A missing required var or a violated guard aborts boot with an
   actionable message naming the offending variable.
7. **Hard secret guards mirror the library.** `JWT_SECRET` ≥ 64 chars and `MFA_ENCRYPTION_KEY` = base64 of exactly 32
   bytes are validated here at boot, ahead of (and consistent with) `AuthConfig::validate` in the engine wiring (P5).
8. **Timeless, English-only, no placeholders.** No `Phase N` / task / roadmap references in any committed file
   (compose, env, Rust, config); no `.gitkeep` / empty-directory scaffolding; create the new branch with `git switch -c`
   (never `git checkout -b`).

---

## Reference docs

- [`OVERVIEW.md`](../OVERVIEW.md) — §8 Local Stack & Memory-Safe Run (the 3-service table + ports), §9 Configuration &
  Environment (the full variable table + the canonical wiring shape).
- [`DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) — § P1 (Goal / Scope / DoD), §2 Global Conventions, Appendix A
  (Environment Variable Registry).
- Sibling gold sources (copy & **adapt** — do not invent): `~/Documents/MyApps/bymax-one/nest-auth-example/`
  `{docker-compose.yml, docker-compose.override.yml, docker-compose.test.yml, docker-compose.prod.yml,
  docker/postgres/init.sql, docker/redis/redis.conf, .env.example, .env.prod.example}`.
- `cargo` / `figment` config patterns (Rust track): re-verify the current `figment` providers API via context7 before
  writing the loader; the engine `AuthConfig::validate` guard set is the contract the loader mirrors.
- /bymax-workflow:standards — universal coding rules (apply the Rust track).

---

## Task index

| ID | Task | Status | Priority | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| 1.1 | docker-compose dev stack | ✅ Done | P0 | M | — |
| 1.2 | Test + prod compose | ✅ Done | P1 | S | 1.1 |
| 1.3 | Init scripts + infra commands | ✅ Done | P1 | S | 1.1 |
| 1.4 | Environment contract (`.env.example`) | ✅ Done | P0 | S | — |
| 1.5 | figment `Settings` loader + validation | ✅ Done | P0 | M | 1.4 |

---

## Tasks

### Task 1.1 — docker-compose dev stack

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Author the dev `docker-compose.yml` (Postgres + Redis + Mailpit, each healthchecked, on a `local-dev` bridge with named
volumes) and the auto-merged `docker-compose.override.yml` (dev log caps), so the whole backend stack comes up healthy
with one command.

#### Acceptance criteria

- [x] `docker-compose.yml` defines `name: rust-auth-example` and three services on a `local-dev` bridge network:
  `postgres:18-alpine` (`127.0.0.1:5432`, `pg-data` volume + `docker/postgres/init.sql`, `pg_isready` healthcheck),
  `redis:7-alpine` (`127.0.0.1:6379`, `redis-data` volume + `docker/redis/redis.conf`, `redis-cli ping` healthcheck),
  and `axllent/mailpit` **digest-pinned** (`127.0.0.1:1025`/`8025`, `wget` healthcheck).
- [x] Postgres reads `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` with `:-` dev defaults (`postgres`/`postgres`/
  `example_app`); `restart: unless-stopped` on every service.
- [x] `docker-compose.override.yml` (`name: rust-auth-example`) adds `json-file` log caps (`max-size: 10m`,
  `max-file: 3`) to all three services and nothing prod-specific.
- [x] `docker compose up -d --wait` returns `0` only when all three containers are healthy; the Mailpit UI answers at
  `http://localhost:8025`.

#### Files to create / modify

- `docker-compose.yml`
- `docker-compose.override.yml`

#### Agent prompt

````
You are a senior infrastructure / DevOps engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 1 (Local Stack & Environment) — Task 1.1 of 5 (FIRST)

PRECONDITIONS
- P0 is complete: the dual monorepo builds; an apps/api stub (main.rs) compiles under `cargo build --locked`. There is no docker stack and no docker/ directory yet (init.sql + redis.conf arrive in Task 1.3).

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "8. Local Stack & Memory-Safe Run" — the 3-service table: images, host ports (pg 5432, redis 6379, mailpit 1025/8025), purpose, and healthcheck per service.
- docs/DEVELOPMENT_PLAN.md § "Phase 1 — Local Stack & Environment" (Scope/DoD) + the Rules-of-phase above.
- The gold source to copy & adapt (rename the project, keep the topology): ~/Documents/MyApps/bymax-one/nest-auth-example/docker-compose.yml and ~/Documents/MyApps/bymax-one/nest-auth-example/docker-compose.override.yml.

TASK
Author the dev docker-compose.yml and the auto-merged docker-compose.override.yml so `docker compose up --wait` brings up a healthy Postgres + Redis + Mailpit stack with one command. Do NOT add an `api` or `web` service here (those live in the prod file only).

DELIVERABLES
1. `docker-compose.yml`:
   - `name: rust-auth-example`; three services on a `local-dev` bridge; named volumes `pg-data`, `redis-data`.
   ```yaml
   name: rust-auth-example

   services:
     postgres:
       image: postgres:18-alpine
       restart: unless-stopped
       environment:
         POSTGRES_USER: ${POSTGRES_USER:-postgres}
         POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
         POSTGRES_DB: ${POSTGRES_DB:-example_app}
       ports:
         - '127.0.0.1:5432:5432'
       volumes:
         - pg-data:/var/lib/postgresql/data
         - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
       healthcheck:
         test: ['CMD-SHELL', 'pg_isready -U $${POSTGRES_USER:-postgres} -d $${POSTGRES_DB:-example_app}']
         interval: 5s
         timeout: 5s
         retries: 10
       networks: [local-dev]

     redis:
       image: redis:7-alpine
       restart: unless-stopped
       command: ['redis-server', '/usr/local/etc/redis/redis.conf']
       ports:
         - '127.0.0.1:6379:6379'
       volumes:
         - ./docker/redis/redis.conf:/usr/local/etc/redis/redis.conf:ro
         - redis-data:/data
       healthcheck:
         test: ['CMD', 'redis-cli', 'ping']
         interval: 5s
         timeout: 5s
         retries: 10
       networks: [local-dev]

     mailpit:
       image: axllent/mailpit@sha256:757f22b56c1da03570afdb3d259effe5091018008a81bbedc8158cee7e16fdbc
       restart: unless-stopped
       ports:
         - '127.0.0.1:1025:1025'
         - '127.0.0.1:8025:8025'
       healthcheck:
         test: ['CMD-SHELL', 'wget -qO- http://localhost:8025/api/v1/info || exit 1']
         interval: 5s
         timeout: 5s
         retries: 10
       networks: [local-dev]

   networks:
     local-dev:
       driver: bridge

   volumes:
     pg-data:
     redis-data:
   ```
   - Re-verify the current `axllent/mailpit` digest before committing; keep it digest-pinned (never `:latest`).
2. `docker-compose.override.yml`:
   - `name: rust-auth-example`; a dev-only file (auto-merged when compose runs from the repo root) adding `json-file` log caps to all three services. A leading comment must state it is dev-only and that CI/staging use explicit `--file` flags to exclude it.
   ```yaml
   name: rust-auth-example
   services:
     postgres:
       logging:
         driver: json-file
         options: { max-size: '10m', max-file: '3' }
     redis:
       logging: { driver: json-file, options: { max-size: '10m', max-file: '3' } }
     mailpit:
       logging: { driver: json-file, options: { max-size: '10m', max-file: '3' } }
   ```

Constraints:
- All ports bind 127.0.0.1; images pinned (postgres:18-alpine, redis:7-alpine, mailpit digest); secrets only via env defaults. English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed file. No .gitkeep / empty-dir scaffolding. Create the branch with `git switch -c` (never `git checkout -b`).
- The compose file references ./docker/postgres/init.sql and ./docker/redis/redis.conf, authored in Task 1.3 — that is expected; `docker compose config` still validates without them, and `up --wait` is verified after Task 1.3.

Verification:
- `docker compose config` — expected: valid merged config (compose.yml + override.yml); lists exactly postgres, redis, mailpit; project name `rust-auth-example`.
- `grep -c '127.0.0.1:' docker-compose.yml` — expected: 4 (pg 5432, redis 6379, mailpit 1025 + 8025).
- `grep -q 'axllent/mailpit@sha256:' docker-compose.yml` — expected: match (digest-pinned).
- `find . -name .gitkeep -o -name .keep` — expected: no output.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `1 / 5` and Last updated to today.
4. Update the P1 row Progress to `1 / 5` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 1.1 ✅ <YYYY-MM-DD> — docker-compose dev stack (pg + redis + mailpit)`.
6. Commit `chore(infra): add dev docker-compose stack + override` (no Co-Authored-By).
````

---

### Task 1.2 — Test + prod compose

- **Status**: ✅ Done
- **Priority**: P1
- **Size**: S
- **Depends on**: 1.1

#### Description

Author `docker-compose.test.yml` (the ephemeral high-port CI stack — Postgres `55432`, Redis `56379`, Mailpit
`51025`/`58025`, `tmpfs`, `example_app_test`) and `docker-compose.prod.yml` (the production-topology smoke stack with
GHCR images), so CI and a prod smoke test each have a dedicated, non-colliding stack.

#### Acceptance criteria

- [x] `docker-compose.test.yml` defines `name: rust-auth-example-test`, binds Postgres `127.0.0.1:55432:5432`, Redis
  `127.0.0.1:56379:6379`, Mailpit `127.0.0.1:51025:1025`/`58025:8025`, uses `tmpfs` (no named volumes), sets
  `POSTGRES_DB: example_app_test`, tighter `3s` healthcheck intervals, and a `ci` bridge network.
- [x] The test Redis runs inline flags mirroring dev eviction (`--save '' --appendonly no --maxmemory 256mb
  --maxmemory-policy volatile-lru --protected-mode no`) — no `redis.conf` bind, since `tmpfs` is ephemeral.
- [x] `docker-compose.prod.yml` (`name: rust-auth-example-prod`) wires `postgres` + `redis` (requirepass) + `api`
  (`ghcr.io/bymaxone/rust-auth-example-api:${IMAGE_TAG:-latest}`) + `web`
  (`ghcr.io/bymaxone/rust-auth-example-web:${IMAGE_TAG:-latest}`), each with `depends_on … condition: service_healthy`
  and a healthcheck; no Mailpit (prod uses `EMAIL_PROVIDER=resend`).
- [x] Both files pass `docker compose -f <file> config`.

#### Files to create / modify

- `docker-compose.test.yml`
- `docker-compose.prod.yml`

#### Agent prompt

````
You are a senior infrastructure / DevOps engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 1 (Local Stack & Environment) — Task 1.2 of 5 (MIDDLE)

PRECONDITIONS
- Task 1.1 is done: docker-compose.yml + docker-compose.override.yml exist with the dev Postgres/Redis/Mailpit topology and the rust-auth-example project name. The GHCR image names ghcr.io/bymaxone/rust-auth-example-{api,web} are the convention the release workflow publishes.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "8. Local Stack & Memory-Safe Run" — the test-stack high ports (55432 / 56379 / 51025 / 58025) and the tmpfs note.
- docs/DEVELOPMENT_PLAN.md § "Phase 1" + Appendix D (the e2e-api job boots docker-compose.test.yml --wait, runs sqlx migrate, tears down -v).
- Gold sources to copy & adapt (rename project + images): ~/Documents/MyApps/bymax-one/nest-auth-example/docker-compose.test.yml and ~/Documents/MyApps/bymax-one/nest-auth-example/docker-compose.prod.yml.

TASK
Author docker-compose.test.yml (ephemeral high-port CI stack) and docker-compose.prod.yml (production-topology smoke stack on GHCR images). The test stack must never collide with the dev stack from Task 1.1.

DELIVERABLES
1. `docker-compose.test.yml`:
   - `name: rust-auth-example-test`; a leading comment that it is ephemeral, test-only, and bound to 127.0.0.1 so it runs alongside dev.
   ```yaml
   name: rust-auth-example-test

   services:
     postgres:
       image: postgres:18-alpine
       environment:
         POSTGRES_USER: ${POSTGRES_USER:-postgres}
         POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
         POSTGRES_DB: example_app_test
       ports: ['127.0.0.1:55432:5432']
       tmpfs: ['/var/lib/postgresql']
       healthcheck:
         test: ['CMD-SHELL', 'pg_isready -U $${POSTGRES_USER:-postgres} -d example_app_test']
         interval: 3s
         timeout: 3s
         retries: 10
       networks: [ci]

     redis:
       image: redis:7-alpine
       command: ['redis-server', '--save', '', '--appendonly', 'no', '--protected-mode', 'no', '--maxmemory', '256mb', '--maxmemory-policy', 'volatile-lru']
       ports: ['127.0.0.1:56379:6379']
       healthcheck:
         test: ['CMD', 'redis-cli', 'ping']
         interval: 3s
         timeout: 3s
         retries: 10
       networks: [ci]

     mailpit:
       image: axllent/mailpit@sha256:757f22b56c1da03570afdb3d259effe5091018008a81bbedc8158cee7e16fdbc
       ports: ['127.0.0.1:51025:1025', '127.0.0.1:58025:8025']
       healthcheck:
         test: ['CMD-SHELL', 'wget -qO- http://localhost:8025/api/v1/info || exit 1']
         interval: 3s
         timeout: 3s
         retries: 10
       networks: [ci]

   networks:
     ci:
       driver: bridge
   ```
2. `docker-compose.prod.yml`:
   - `name: rust-auth-example-prod`; a leading comment with the run recipe (`cp .env.prod.example .env.prod` → fill secrets → `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --wait`); no Mailpit (prod uses Resend). Services: `postgres` (named volume, requirepass-less is fine — managed PG in real prod), `redis` (`--requirepass ${REDIS_PASSWORD}` + `--appendonly yes`), `api` and `web` on GHCR images.
   ```yaml
   api:
     image: ghcr.io/bymaxone/rust-auth-example-api:${IMAGE_TAG:-latest}
     restart: unless-stopped
     environment:
       DATABASE_URL: ${DATABASE_URL}
       REDIS_URL: ${REDIS_URL:-redis://:${REDIS_PASSWORD}@redis:6379}
       JWT_SECRET: ${JWT_SECRET}
       MFA_ENCRYPTION_KEY: ${MFA_ENCRYPTION_KEY}
       API_PORT: ${API_PORT:-4000}
       WEB_ORIGIN: ${WEB_ORIGIN}
       EMAIL_PROVIDER: ${EMAIL_PROVIDER:-resend}
       RESEND_API_KEY: ${RESEND_API_KEY:-}
     depends_on:
       postgres: { condition: service_healthy }
       redis: { condition: service_healthy }
     healthcheck:
       test: ['CMD-SHELL', 'wget -qO- http://localhost:4000/health || exit 1']
       interval: 10s
       timeout: 5s
       start_period: 20s
       retries: 5
     networks: [prod]

   web:
     image: ghcr.io/bymaxone/rust-auth-example-web:${IMAGE_TAG:-latest}
     restart: unless-stopped
     ports: ['${WEB_PORT:-3000}:3000']
     environment:
       INTERNAL_API_URL: ${INTERNAL_API_URL:-http://api:4000}
       AUTH_JWT_SECRET_FOR_PROXY: ${AUTH_JWT_SECRET_FOR_PROXY}
     depends_on:
       api: { condition: service_healthy }
     networks: [prod]
   ```

Constraints:
- Test ports are exactly 55432 / 56379 / 51025 / 58025; tmpfs (no named volumes) in the test stack. Prod image names are ghcr.io/bymaxone/rust-auth-example-{api,web}. All host bindings on 127.0.0.1 for the test stack. English-only TIMELESS comments — NO Phase/Task/roadmap references. No .gitkeep. `git switch -c` only.
- The api healthcheck hits /health (the route lands in P3) — that is expected; the prod file is a smoke harness, not run in this phase.

Verification:
- `docker compose -f docker-compose.test.yml config` — expected: valid; ports 55432/56379/51025/58025 present; POSTGRES_DB example_app_test; tmpfs set.
- `docker compose -f docker-compose.prod.yml config` — expected: valid; images ghcr.io/bymaxone/rust-auth-example-api and -web present.
- `docker compose -f docker-compose.test.yml up --wait && docker compose -f docker-compose.test.yml down -v` — expected: all three become healthy, then tear down cleanly.
- `grep -rE "phase [0-9]|task [0-9]" docker-compose.test.yml docker-compose.prod.yml` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `2 / 5` and Last updated.
4. Update the P1 row Progress to `2 / 5` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 1.2 ✅ <YYYY-MM-DD> — test (high-port tmpfs) + prod (GHCR) compose`.
6. Commit `chore(infra): add test + prod docker-compose stacks` (no Co-Authored-By).
````

---

### Task 1.3 — Init scripts + infra commands

- **Status**: ✅ Done
- **Priority**: P1
- **Size**: S
- **Depends on**: 1.1

#### Description

Author the Postgres init script (`docker/postgres/init.sql` — create `example_app`), the Redis config
(`docker/redis/redis.conf`), and wire the `infra:up`/`infra:down` root scripts so the stack is one command up and a
clean teardown down.

#### Acceptance criteria

- [x] `docker/postgres/init.sql` idempotently creates database `example_app` (UTF8, `\gexec` guard, `WHERE NOT EXISTS`)
  with a comment explaining the entrypoint runs it only on first boot.
- [x] `docker/redis/redis.conf` enables AOF (`appendonly yes`, `appendfsync everysec`), disables RDB (`save ""`), sets
  `maxmemory 256mb` + `maxmemory-policy volatile-lru`, `protected-mode no` (for the Docker-NAT host connect), with a
  comment warning it is dev-only (no `requirepass`/`bind`).
- [x] Root `package.json` wires `infra:up` → `docker compose up -d --wait` and `infra:down` → `docker compose down -v`
  (plus, optionally, `infra:test:up`/`infra:test:down` against `-f docker-compose.test.yml`).
- [x] `pnpm infra:up` returns only when all three are healthy and creates the `example_app` database; `pnpm infra:down`
  removes the containers and named volumes.

#### Files to create / modify

- `docker/postgres/init.sql`
- `docker/redis/redis.conf`
- `package.json` (wire `infra:up` / `infra:down` scripts)

#### Agent prompt

````
You are a senior infrastructure / DevOps engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 1 (Local Stack & Environment) — Task 1.3 of 5 (MIDDLE)

PRECONDITIONS
- Task 1.1 is done: docker-compose.yml references ./docker/postgres/init.sql and ./docker/redis/redis.conf and binds redis with `redis-server /usr/local/etc/redis/redis.conf`. Those two files do not exist yet — create them here so `docker compose up --wait` succeeds. The root package.json already has placeholder `infra:up`/`infra:down` scripts from P0 to replace with real commands.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "8. Local Stack & Memory-Safe Run" — `pnpm infra:up` (or `docker compose up --wait`) returns only when healthy; the namespace + eviction rationale.
- Gold sources to copy & adapt: ~/Documents/MyApps/bymax-one/nest-auth-example/docker/postgres/init.sql and ~/Documents/MyApps/bymax-one/nest-auth-example/docker/redis/redis.conf.

TASK
Author docker/postgres/init.sql + docker/redis/redis.conf and wire the real infra:up/infra:down npm scripts.

DELIVERABLES
1. `docker/postgres/init.sql`:
   - Idempotent create of `example_app` (the entrypoint runs files in /docker-entrypoint-initdb.d only on first boot).
   ```sql
   -- Initial database for the example app. Postgres 18 runs this only on first boot.
   -- \gexec executes the generated CREATE DATABASE; WHERE NOT EXISTS makes it idempotent.
   -- example_app_test is created by the test compose stack via its own POSTGRES_DB env var.
   SELECT 'CREATE DATABASE example_app
     ENCODING ''UTF8''
     LC_COLLATE ''C''
     LC_CTYPE ''C''
     TEMPLATE template0'
     WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'example_app')\gexec
   ```
2. `docker/redis/redis.conf`:
   - AOF on, RDB off, volatile-lru eviction so session/OTP/lockout keys with a TTL are evicted first and blacklisted-token keys are never silently dropped; a comment warning it is dev-only.
   ```conf
   # Dev config: AOF durability, no RDB snapshots, volatile-LRU eviction.
   # WARNING: no requirepass/bind — DO NOT use in production.
   protected-mode no
   dir /data
   appendonly yes
   appendfsync everysec
   no-appendfsync-on-rewrite yes
   save ""
   maxmemory 256mb
   maxmemory-policy volatile-lru
   maxmemory-samples 10
   loglevel notice
   ```
3. `package.json` (root) — replace the placeholder scripts:
   ```json
   {
     "scripts": {
       "infra:up": "docker compose up --wait",
       "infra:down": "docker compose down -v",
       "infra:test:up": "docker compose -f docker-compose.test.yml up --wait",
       "infra:test:down": "docker compose -f docker-compose.test.yml down -v"
     }
   }
   ```

Constraints:
- redis.conf is dev-only (no requirepass/bind); init.sql is idempotent. English-only TIMELESS comments — NO Phase/Task/roadmap references. Do not create empty dirs beyond docker/postgres + docker/redis (they are created by writing these two real files). No .gitkeep. `git switch -c` only.

Verification:
- `docker compose down -v; docker compose up --wait` — expected: exit 0 with all three healthy.
- `docker compose exec -T postgres psql -U postgres -lqt | cut -d '|' -f1 | grep -qw example_app` — expected: match (database created).
- `docker compose exec -T redis redis-cli config get maxmemory-policy` — expected: `volatile-lru`.
- `pnpm infra:up && pnpm infra:down` — expected: up returns only when healthy; down removes containers + volumes.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `3 / 5` and Last updated.
4. Update the P1 row Progress to `3 / 5` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 1.3 ✅ <YYYY-MM-DD> — postgres init.sql + redis.conf + infra:up/down`.
6. Commit `chore(infra): postgres/redis init configs + infra:up/down scripts` (no Co-Authored-By).
````

---

### Task 1.4 — Environment contract (`.env.example`)

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: S
- **Depends on**: —

#### Description

Author `.env.example` (every variable from `OVERVIEW.md §9`, with throwaway dev defaults so the happy path runs with
zero external credentials) and `.env.prod.example` (the same keys, secrets blank with generation commands), the single
documented contract the loader validates.

#### Acceptance criteria

- [x] `.env.example` documents every variable from `OVERVIEW.md §9`, sectioned (shared / docker / api / JWT / email /
  OAuth / web): `API_PORT=4000`, `RUST_LOG`/`LOG_LEVEL`, `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`,
  `DATABASE_URL`, `DATABASE_URL_TEST`, `REDIS_URL`, `REDIS_NAMESPACE`, `JWT_SECRET`, `MFA_ENCRYPTION_KEY`,
  `EMAIL_PROVIDER`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM`, `RESEND_API_KEY`, `OAUTH_GOOGLE_CLIENT_ID`/`_CLIENT_SECRET`/
  `_CALLBACK_URL`, `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED`, `INTERNAL_API_URL`,
  `AUTH_JWT_SECRET_FOR_PROXY`.
- [x] `.env.example` ships a **throwaway dev-only** `JWT_SECRET` of ≥ 64 chars and a base64 32-byte
  `MFA_ENCRYPTION_KEY`, with a comment that these are local-only and must be regenerated for any shared environment; the
  three `OAUTH_GOOGLE_*` lines are commented out (OAuth disabled by default).
- [x] `.env.prod.example` lists the same keys with every secret blank and a `# openssl rand -hex 64` /
  `# openssl rand -base64 32` generation hint; `WEB_ORIGIN`/`DATABASE_URL`/`REDIS_URL` carry `https://`/managed-URL
  guidance.
- [x] `.env`, `.env.prod`, `.env.test` are git-ignored (already from P0); only the `*.example` files are committed.

#### Files to create / modify

- `.env.example`
- `.env.prod.example`

#### Agent prompt

````
You are a senior infrastructure / DevOps engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 1 (Local Stack & Environment) — Task 1.4 of 5 (MIDDLE)

PRECONDITIONS
- P0 is complete; .gitignore already excludes .env, .env.prod, .env.test. The figment Settings loader (Task 1.5) reads exactly these variable names — this file is the contract it validates.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "9. Configuration & Environment" — the full variable table (Variable / Service / Default / Used for); copy every row.
- docs/DEVELOPMENT_PLAN.md § "Appendix A — Environment Variable Registry" — the hard guards: JWT_SECRET >= 64 + entropy-checked, MFA_ENCRYPTION_KEY base64 32 bytes, prod WEB_ORIGIN must be https://, managed DATABASE_URL/REDIS_URL (no loopback) in prod.
- Gold sources to copy & adapt (re-section + rename to this project; the api here is Rust, so use RUST_LOG not NODE_ENV for the api): ~/Documents/MyApps/bymax-one/nest-auth-example/.env.example and ~/Documents/MyApps/bymax-one/nest-auth-example/.env.prod.example.

TASK
Author .env.example (zero-credential dev happy path) and .env.prod.example (secrets blank + generation hints), documenting every OVERVIEW §9 variable.

DELIVERABLES
1. `.env.example` — sectioned, every variable from OVERVIEW §9. Ship throwaway dev values for the two hard-guarded secrets so `apps/api` boots with no external setup:
   ```dotenv
   # ----- shared -----
   RUST_LOG=info
   LOG_LEVEL=info

   # ----- docker compose (docker-compose.yml) -----
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=postgres
   POSTGRES_DB=example_app

   # ----- apps/api -----
   API_PORT=4000
   WEB_ORIGIN=http://localhost:3000
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/example_app
   DATABASE_URL_TEST=postgres://postgres:postgres@localhost:55432/example_app_test
   REDIS_URL=redis://localhost:6379
   REDIS_NAMESPACE=rust_auth_example

   # ----- JWT / MFA (hard guards: JWT_SECRET >= 64 chars; MFA_ENCRYPTION_KEY = base64 of 32 bytes) -----
   # THROWAWAY local-only values — regenerate for any shared environment:
   #   openssl rand -hex 64   |   openssl rand -base64 32
   JWT_SECRET=dev_only_local_secret_change_me_0123456789abcdef0123456789abcdef0123456789
   MFA_ENCRYPTION_KEY=ZGV2X29ubHlfbG9jYWxfMzJfYnl0ZV9rZXlfMDAwMDA=

   # ----- email -----
   EMAIL_PROVIDER=mailpit
   SMTP_HOST=localhost
   SMTP_PORT=1025
   SMTP_FROM=no-reply@auth.local
   # RESEND_API_KEY=            # required only when EMAIL_PROVIDER=resend

   # ----- OAuth — Google (optional; set all three together, then flip the web flag) -----
   # OAUTH_GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com
   # OAUTH_GOOGLE_CLIENT_SECRET=<secret>
   # OAUTH_GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/oauth/google/callback

   # ----- apps/web -----
   NEXT_PUBLIC_API_URL=http://localhost:4000
   INTERNAL_API_URL=http://localhost:4000
   AUTH_JWT_SECRET_FOR_PROXY=dev_only_local_secret_change_me_0123456789abcdef0123456789abcdef0123456789
   NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=false
   ```
   - Ensure the JWT_SECRET literal is genuinely >= 64 chars; AUTH_JWT_SECRET_FOR_PROXY must equal JWT_SECRET (the edge verifier shares the secret); ensure MFA_ENCRYPTION_KEY decodes to exactly 32 bytes.
2. `.env.prod.example` — the same keys, every secret blank with a generation hint, plus prod guidance: `WEB_ORIGIN` must be https://, `DATABASE_URL`/`REDIS_URL` point at managed services (no loopback), `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` required, `IMAGE_TAG`/`WEB_PORT`/`REDIS_PASSWORD` for the prod compose stack.

Constraints:
- Document EVERY OVERVIEW §9 variable; the dev secrets are throwaway local-only fixtures (secret-scan safe — no real keys). English-only TIMELESS comments — NO Phase/Task/roadmap references. Only *.example files are committed; never a real .env. No .gitkeep. `git switch -c` only.

Verification:
- `for v in API_PORT DATABASE_URL DATABASE_URL_TEST REDIS_URL REDIS_NAMESPACE JWT_SECRET MFA_ENCRYPTION_KEY EMAIL_PROVIDER SMTP_HOST RESEND_API_KEY OAUTH_GOOGLE_CLIENT_ID WEB_ORIGIN NEXT_PUBLIC_API_URL INTERNAL_API_URL AUTH_JWT_SECRET_FOR_PROXY; do grep -q "$v" .env.example || echo "MISSING $v"; done` — expected: no MISSING output.
- `awk -F= '/^JWT_SECRET=/{ if (length($2) >= 64) print "ok"; else print "short" }' .env.example` — expected: `ok`.
- `awk -F= '/^MFA_ENCRYPTION_KEY=/{print $2}' .env.example | base64 -d | wc -c` — expected: `32`.
- `test -f .env.prod.example` — expected: present.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `4 / 5` and Last updated.
4. Update the P1 row Progress to `4 / 5` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 1.4 ✅ <YYYY-MM-DD> — .env.example + .env.prod.example (full §9 contract)`.
6. Commit `docs(env): document the full environment contract (.env.example + prod)` (no Co-Authored-By).
````

---

### Task 1.5 — figment `Settings` loader + validation

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: 1.4

#### Description

Author `apps/api/src/config/` — a `figment`-layered loader that deserializes the environment into a validated `Settings`
struct, fails fast with a typed `thiserror` `ConfigError` (naming the offending variable), enforces the `JWT_SECRET` ≥ 64
and `MFA_ENCRYPTION_KEY` base64-32 hard guards, and is unit-tested to prove each failure path aborts.

#### Acceptance criteria

- [x] `apps/api/src/config/mod.rs` defines `Settings` (covering the configuration variables the current API surface
  needs; later-phase variables such as SMTP host/port, OAuth credentials, and `DATABASE_URL_TEST` are absent by design)
  deserialized via `figment` (built-in defaults layered under `Env::raw()`), declared `mod config;` (private) in
  `main.rs`, with `figment`, `serde`, `thiserror`, and `base64` added to `apps/api/Cargo.toml`.
- [x] `Settings::load() -> Result<Settings, ConfigError>` layers defaults → env, extracts, then `validate()`s; it is
  **panic-free** (no `unwrap`/`expect`) and returns a typed error.
- [x] `ConfigError` is a `thiserror` enum with at least `Extract(Box<figment::Error>)`, `JwtSecretTooShort { got }`,
  and `MfaKeyInvalid`; each `Display` names the variable and the constraint.
- [x] Hard guards enforced: `JWT_SECRET.len() >= 64`; `MFA_ENCRYPTION_KEY` base64-decodes to exactly 32 bytes.
- [x] Unit tests (using `figment::Jail`) prove: a valid env loads; a short `JWT_SECRET` returns
  `ConfigError::JwtSecretTooShort`; a malformed `MFA_ENCRYPTION_KEY` returns `ConfigError::MfaKeyInvalid`; the module is
  100% covered by `cargo llvm-cov nextest -p api`.

#### Files to create / modify

- `apps/api/src/config/mod.rs`
- `apps/api/src/main.rs` (declare `mod config;`)
- `apps/api/Cargo.toml` (add `figment`, `serde`, `thiserror`, `base64`)

#### Agent prompt

````
You are a senior infrastructure / DevOps engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 1 (Local Stack & Environment) — Task 1.5 of 5 (LAST)

PRECONDITIONS
- Task 1.4 is done: .env.example documents every variable this loader reads, with throwaway dev values for JWT_SECRET (>= 64) and MFA_ENCRYPTION_KEY (base64 32 bytes). The apps/api crate (package name `api`) exists from P0 as a buildable stub with a main.rs. The engine wiring later reads Settings. The engine's own guard (AuthConfig::validate) uses a 32-character floor (MIN_SECRET_LEN = 32); the example intentionally enforces a stricter 64-character floor in Settings::load. These are separate constants with different values — do not unify them.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "9. Configuration & Environment" — the variable table (the Settings fields) and the canonical-wiring shape that consumes Settings.
- docs/DEVELOPMENT_PLAN.md § "Appendix A — Environment Variable Registry" — the hard guards (JWT_SECRET >= 64 + entropy, MFA_ENCRYPTION_KEY base64 32B, prod https/managed-URL guards).
- The current figment providers API (Figment::new, providers::Env::raw, providers::Serialized::defaults, figment::Jail for tests) — re-verify via context7 before writing; the API moves between minor versions.

TASK
Implement a figment-layered, fail-fast Settings loader under apps/api/src/config/ that deserializes + validates the environment into a typed Settings, returning a typed thiserror ConfigError on any missing/invalid variable, and unit-test the failure paths.

DELIVERABLES
1. `apps/api/src/config/mod.rs`:
   - The validated Settings struct, a typed ConfigError, the panic-free load + validate, and the unit tests.
   ```rust
   //! Typed application configuration, loaded and validated from the environment.
   //!
   //! [`Settings::load`] layers built-in defaults under the process environment (via
   //! `figment`) and deserializes them into a [`Settings`] value, failing fast with a
   //! precise [`ConfigError`] when a required variable is missing or a hard guard
   //! (`JWT_SECRET` length, `MFA_ENCRYPTION_KEY` shape) is violated — so the process
   //! never boots with an unsafe or incomplete configuration.

   use base64::Engine as _;
   use figment::{
       providers::{Env, Serialized},
       Figment,
   };
   use serde::{Deserialize, Serialize};

   /// The transport selected for outbound transactional email.
   #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
   #[serde(rename_all = "lowercase")]
   pub enum EmailProviderKind {
       /// Local SMTP sink (lettre -> Mailpit); the zero-credential default.
       Mailpit,
       /// Hosted provider (gated by `RESEND_API_KEY`).
       Resend,
   }

   /// The fully validated runtime configuration for `apps/api`.
   #[derive(Debug, Clone, Serialize, Deserialize)]
   pub struct Settings {
       /// TCP port the axum server binds (`API_PORT`, default `4000`).
       pub api_port: u16,
       /// `tracing` filter directive (`RUST_LOG` / `LOG_LEVEL`, default `info`).
       pub log_level: String,
       /// sqlx Postgres connection string (`DATABASE_URL`).
       pub database_url: String,
       /// Redis connection string (`REDIS_URL`).
       pub redis_url: String,
       /// Store key namespace (`REDIS_NAMESPACE`, default `rust_auth_example`).
       pub redis_namespace: String,
       /// HS256 signing secret (`JWT_SECRET`); validated `>= 64` chars.
       pub jwt_secret: String,
       /// base64-encoded 32-byte AES-256-GCM key (`MFA_ENCRYPTION_KEY`).
       pub mfa_encryption_key: String,
       /// CORS allow-origin (`WEB_ORIGIN`, default `http://localhost:3000`).
       pub web_origin: String,
       /// Outbound email transport (`EMAIL_PROVIDER`, default `mailpit`).
       pub email_provider: EmailProviderKind,
   }

   /// Built-in defaults layered *under* the environment so optional vars may be omitted.
   #[derive(Serialize)]
   struct Defaults;

   impl Default for Defaults { /* serialize api_port=4000, log_level="info", … */ fn default() -> Self { Self } }

   /// Configuration failures surfaced at boot — each `Display` names the variable + constraint.
   #[derive(Debug, thiserror::Error)]
   pub enum ConfigError {
       /// A figment extraction error (missing required var or a type mismatch).
       #[error("failed to load configuration from the environment: {0}")]
       Extract(#[from] figment::Error),
       /// `JWT_SECRET` is shorter than the HS256 floor.
       #[error("JWT_SECRET must be at least {} characters (got {got})", Settings::JWT_SECRET_MIN_LEN)]
       JwtSecretTooShort {
           /// The actual length received.
           got: usize,
       },
       /// `MFA_ENCRYPTION_KEY` is not base64 of exactly 32 bytes.
       #[error("MFA_ENCRYPTION_KEY must be base64-encoded 32 bytes (AES-256-GCM key)")]
       MfaKeyInvalid,
   }

   impl Settings {
       /// HS256 secret floor; mirrored by `AuthConfig::validate` in the engine wiring.
       const JWT_SECRET_MIN_LEN: usize = 64;
       /// Required decoded length of the MFA key (AES-256-GCM = 32 bytes).
       const MFA_KEY_LEN: usize = 32;

       /// Load and validate the configuration from process environment variables.
       ///
       /// # Errors
       /// Returns [`ConfigError`] when a required variable is missing, a value fails to
       /// parse, or a hard guard is violated.
       pub fn load() -> Result<Self, ConfigError> {
           let settings: Self = Figment::new()
               .merge(Serialized::defaults(Defaults))
               .merge(Env::raw())
               .extract()?;
           settings.validate()?;
           Ok(settings)
       }

       fn validate(&self) -> Result<(), ConfigError> {
           if self.jwt_secret.len() < Self::JWT_SECRET_MIN_LEN {
               return Err(ConfigError::JwtSecretTooShort { got: self.jwt_secret.len() });
           }
           let decoded = base64::engine::general_purpose::STANDARD
               .decode(self.mfa_encryption_key.as_bytes())
               .map_err(|_| ConfigError::MfaKeyInvalid)?;
           if decoded.len() != Self::MFA_KEY_LEN {
               return Err(ConfigError::MfaKeyInvalid);
           }
           Ok(())
       }
   }

   #[cfg(test)]
   mod tests {
       use super::*;

       // A 32-byte base64 key + a >=64-char secret reused by the happy-path tests.
       const VALID_MFA_KEY: &str = "ZGV2X29ubHlfbG9jYWxfMzJfYnl0ZV9rZXlfMDAwMDA=";
       const VALID_JWT: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0";

       fn seed(jail: &mut figment::Jail) {
           jail.set_env("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/example_app");
           jail.set_env("REDIS_URL", "redis://localhost:6379");
           jail.set_env("JWT_SECRET", VALID_JWT);
           jail.set_env("MFA_ENCRYPTION_KEY", VALID_MFA_KEY);
       }

       #[test]
       fn loads_a_valid_environment() {
           figment::Jail::expect_with(|jail| {
               seed(jail);
               let settings = Settings::load().expect("valid env loads");
               assert_eq!(settings.api_port, 4000);
               assert_eq!(settings.email_provider, EmailProviderKind::Mailpit);
               Ok(())
           });
       }

       #[test]
       fn rejects_short_jwt_secret() {
           figment::Jail::expect_with(|jail| {
               seed(jail);
               jail.set_env("JWT_SECRET", "too-short");
               assert!(matches!(Settings::load(), Err(ConfigError::JwtSecretTooShort { .. })));
               Ok(())
           });
       }

       #[test]
       fn rejects_malformed_mfa_key() {
           figment::Jail::expect_with(|jail| {
               seed(jail);
               jail.set_env("MFA_ENCRYPTION_KEY", "not-base64-!!");
               assert!(matches!(Settings::load(), Err(ConfigError::MfaKeyInvalid)));
               Ok(())
           });
       }
   }
   ```
2. `apps/api/src/main.rs`:
   - Add `mod config;` so the module compiles and is covered; do not change the existing stub's bind/run behavior in this phase.
3. `apps/api/Cargo.toml`:
   - Add the dependencies (versions are illustrative — re-verify the current minor via context7 / crates.io and pin):
   ```toml
   [dependencies]
   figment = { version = "0.10", features = ["env"] }
   serde = { version = "1", features = ["derive"] }
   thiserror = "2"
   base64 = "0.22"

   [dev-dependencies]
   # figment::Jail is in the base crate; no extra dev-dep needed.
   ```

Constraints:
- #![forbid(unsafe_code)] already on the crate. NO unwrap/expect/panic!/todo!/unreachable! in non-test code (tests may use expect). Typed thiserror ConfigError; the load path is fail-fast and panic-free. Functions <= 50 lines; SRP. English-only TIMELESS rustdoc/comments — NO Phase/Task/roadmap references in any committed source. No .gitkeep. `git switch -c` only.
- Use figment::Jail (sets + restores process env) for the tests so they are isolated and memory-safe; run nextest with bounded threads, never fan out parallel test agents.

Verification:
- `cargo nextest run -p api config --test-threads 2` — expected: the 3 config tests pass (valid load, short-secret reject, bad-key reject).
- `cargo llvm-cov nextest -p api --lcov` — expected: apps/api/src/config/mod.rs reports 100% lines + branches.
- `cargo clippy -p api --all-targets -- -D warnings` — expected: clean.
- `cargo fmt --all --check` — expected: no diff.
- `cargo build --locked` — expected: builds; `cargo +1.90 check -p api` — expected: builds on the MSRV floor.
- `grep -rE "phase [0-9]|task [0-9]" apps/api/src/config` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `5 / 5` and Last updated.
4. Update the P1 row Progress to `5 / 5` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 1.5 ✅ <YYYY-MM-DD> — figment Settings loader + fail-fast validation`.
6. Commit `feat(api): figment Settings loader with fail-fast validation` (no Co-Authored-By).
(The LAST task also runs the PER-PHASE protocol below: flip P1 to ✅ / 5 of 5, advance Active phase to P2, recompute Overall progress.)
````

---

## Phase Completion Protocol

When **Task 1.5** is `✅` and every other task is `✅`:

1. Confirm all 5 tasks are `✅` and the P1 **Definition of Done** in [`DEVELOPMENT_PLAN.md § P1`](../DEVELOPMENT_PLAN.md#phase-1--local-stack--environment)
   is met: `pnpm infra:up` (or `docker compose up --wait`) returns only when all three containers are healthy and the
   Mailpit UI is reachable at `:8025`; a missing/invalid env var aborts startup with a precise message (the `Settings`
   loader's failure paths — `JWT_SECRET` ≥ 64 and `MFA_ENCRYPTION_KEY` base64-32 — are unit-tested at 100%);
   `.env.example` documents every variable and the ports match `OVERVIEW §8/§9`.
2. Ensure the phase PR is **merged** to `main` with **CI green** (all required checks).
3. In [`DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md): set the **P1 Status** to `✅`, **Progress** `5 / 5`, **Last
   updated** today; set **Active phase** to `P2`; recompute **Overall progress** to `2 / 15 phases (13%)`.
4. Set this file's header **Status** to `✅` and **Progress** to `5 / 5 tasks`.
5. Commit `docs(plan): P1 complete` (no `Co-Authored-By`).

If any DoD bullet is unmet or CI is red, set P1 to `🟡 Partial`, not `✅`.

---

## Completion log

> Append-only. One line per completed task: `- <id> ✅ YYYY-MM-DD — <summary>`.

- 1.1 ✅ 2026-07-02 — docker-compose dev stack (pg + redis + mailpit)
- 1.2 ✅ 2026-07-02 — test (high-port tmpfs) + prod (GHCR) compose
- 1.3 ✅ 2026-07-02 — postgres init.sql + redis.conf + infra:up/down
- 1.4 ✅ 2026-07-02 — .env.example + .env.prod.example (full §9 contract)
- 1.5 ✅ 2026-07-02 — figment Settings loader + fail-fast validation
