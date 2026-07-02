# Phase 4 — Schema & Repositories

> **Status**: 🔄 In Progress · **Progress**: 6 / 6 tasks · **Last updated**: 2026-07-02
> **Source roadmap**: [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P4
> **Source spec**: [`docs/OVERVIEW.md`](../OVERVIEW.md)
> **Executing a task?** Read **only** that task's `### Task N.n` block + its bounded *REQUIRED READING* — never the whole file. See [token economy](README.md#token-economy--executing-a-single-task).

---

## Context

Phase 3 produced a bootable axum service: `apps/api/src/main.rs` + `app.rs` compose a `Router` and an `AppState`
that already holds a live `PgPool` and an `Arc<RedisStores>`, `GET /health` answers 200, and a typed `AppError`
serializes the library's `{ error: { code, message, details } }` envelope. What is missing is the **persistence
boundary**: the `AuthEngine::builder()` that Phase 5 will assemble *requires* an `Arc<dyn UserRepository>` (and an
`Arc<dyn PlatformUserRepository>` once `platform.enabled`), and there is no Postgres schema, no offline query cache,
and no repository implementations behind those traits yet.

This phase fills that gap and nothing else. It authors the Postgres schema that backs `AuthUser` and
`AuthPlatformUser` **field-for-field** (including the `Option<Vec<String>>` recovery codes, the OAuth identity columns,
and the platform-only `updated_at`/`platform_id`); the committed `.sqlx/` offline query cache plus the
`cargo sqlx prepare` workflow and placeholder-`DATABASE_URL` wiring that let `cargo build` succeed without a live
database; the two hand-written sqlx repositories — `SqlxUserRepository` (all 11 `UserRepository` methods) and
`SqlxPlatformUserRepository` (all 6 `PlatformUserRepository` methods), every query `query_as!`/`query!`-typed; the
`sqlx::Error → RepositoryError` mapping that turns a Postgres unique-violation into `RepositoryError::Conflict` (which
the engine renders as `auth.email_already_exists`) while a missing or cross-tenant row stays `Ok(None)`; and an
idempotent development seed for the `acme`/`globex` demo tenants and a demo platform admin.

When P4 is done, `sqlx migrate run` applies the schema cleanly, `cargo sqlx prepare --check` passes (the offline cache
is current), `cargo nextest run -p api repository` proves every one of the 11 + 6 methods round-trips each
`AuthUser`/`AuthPlatformUser` field against a real Postgres on the test stack, a duplicate `(tenant_id, email)` collides
to `Conflict` while a missing/cross-tenant lookup returns `Ok(None)`, `cargo llvm-cov nextest -p api` reports the
repository modules at 100%, and `cargo run -p api --bin seed` populates the demo data idempotently. **This phase writes
ONLY the schema, the offline cache, the two repositories, the error mapping, and the seed — no engine wiring, no HTTP
routes, no email or audit (all P5), and no business logic inside the repositories.**

---

## Rules-of-phase

1. **Missing/cross-tenant row is `Ok(None)`, never an error.** `RepositoryError` has no "not found" variant — every
   `find_*` uses `fetch_optional` and returns `Ok(None)` when the row is absent or the `tenant_id` does not match.
2. **Compile-checked SQL only.** Use `sqlx::query_as!` / `sqlx::query!` (macro forms) so the SQL is validated against
   the schema at build time; never assemble runtime query strings.
3. **No business logic in the repository.** A repository is pure persistence — it maps rows to domain types and back.
   Validation, hashing, token minting, and policy belong to the engine (P5), not here.
4. **The schema backs `AuthUser`/`AuthPlatformUser` EXACTLY.** Every field, its type, and its nullability must match
   the domain structs (e.g. `password_hash` is nullable for dashboard users but `NOT NULL` for platform admins;
   `mfa_recovery_codes` is `TEXT[]`; platform rows have `updated_at` + `platform_id` and **no** `tenant_id`/`email_verified`).
5. **Conflict maps to `auth.email_already_exists`.** A Postgres unique-violation (SQLSTATE `23505`) maps to
   `RepositoryError::Conflict(_)`; the engine turns that into the `auth.email_already_exists` wire code. Every other
   `sqlx::Error` becomes an opaque `RepositoryError::Backend(_)`.
6. **The offline cache is committed and current.** `.sqlx/` is checked into git; a placeholder `DATABASE_URL` plus
   `SQLX_OFFLINE=true` let `cargo build --locked` succeed with no database. Whenever a `query_as!`/`query!` is added or
   changed, re-run `cargo sqlx prepare` and commit the refreshed cache.
7. **Safety + typed errors.** `#![forbid(unsafe_code)]`; no `unwrap`/`expect`/`panic!`/`todo!`/`unreachable!` in
   non-test code; the `#[async_trait]` impls return `Result<_, RepositoryError>` only.
8. **Memory-safe, real-Postgres tests.** Repository tests run against the **test stack** (`docker-compose.test.yml`,
   high ports) after `sqlx migrate run`; bound `cargo nextest` threads; never fan out parallel test agents.
9. **Timeless, English-only.** No `Phase N`/task/roadmap references in any committed `.sql`/`.rs`/`.toml`; Conventional
   Commits with **no `Co-Authored-By` trailer**; create branches with `git switch -c` (never `git checkout -b`).

---

## Reference docs

- [`docs/OVERVIEW.md`](../OVERVIEW.md) § 12 "Identity Domains & Extension Points" — the two repositories as the headline
  bring-your-own seams (11 + 6 methods), `Conflict → auth.email_already_exists`, missing-row `Ok(None)`.
- [`docs/OVERVIEW.md`](../OVERVIEW.md) § 13 "Token, Session & Tenant Security" — multi-tenant isolation
  (`find_by_email(email, tenant_id)`), SHA-256 tenant identifiers, the never-log-secrets / redacting-`Debug` invariant.
- [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § "Phase 4 — Schema & Repositories" — scope, DoD, rules; § 2
  "Global Conventions" (Rust language, test coverage, memory-safe tests); Appendix C/D (the sqlx offline-cache note).
- `/Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/crates/bymax-auth-core/src/traits/repository.rs` — the exact
  `UserRepository` / `PlatformUserRepository` trait signatures to implement.
- `/Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/crates/bymax-auth-types/src/domain.rs` — the exact
  `AuthUser` / `AuthPlatformUser` / `CreateUserData` / `CreateWithOAuthData` / `UpdateMfaData` field shapes.
- `/Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/crates/bymax-auth-types/src/error.rs` and
  `crates/bymax-auth-core/src/...` (the `RepositoryError` re-export) — the error variants to map onto.
- /bymax-workflow:standards — universal coding rules (apply the Rust track).

---

## Task index

| ID | Task | Status | Priority | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| 4.1 | Schema migrations (`0001_init.sql`) | ✅ Done | P0 | M | — |
| 4.2 | sqlx offline cache + prepare workflow | ✅ Done | P0 | S | 4.1 |
| 4.3 | `SqlxUserRepository` (11 methods) | ✅ Done | P0 | L | 4.1, 4.2 |
| 4.4 | `SqlxPlatformUserRepository` (6 methods) | ✅ Done | P0 | M | 4.1, 4.2 |
| 4.5 | `RepositoryError` mapping (Conflict / `Ok(None)`) | ✅ Done | P1 | S | 4.3, 4.4 |
| 4.6 | Seed data (acme/globex + demo admin) | ✅ Done | P1 | S | 4.1 |

---

## Tasks

### Task 4.1 — Schema migrations (`0001_init.sql`)

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Author the initial Postgres migration creating `tenants`, `users`, `platform_users`, `invitations`, and `audit_log`,
with the `users`/`platform_users` columns backing `AuthUser`/`AuthPlatformUser` exactly and the indexes that serve
`find_by_email`, `find_by_oauth_id`, and the keyset audit read.

#### Acceptance criteria

- [x] `apps/api/migrations/0001_init.sql` exists and `sqlx migrate run` applies it cleanly against the dev stack.
- [x] `users` has every `AuthUser` column with matching nullability: `password_hash` nullable, `mfa_secret` nullable,
      `mfa_recovery_codes TEXT[]` nullable, `oauth_provider`/`oauth_provider_id` nullable, `last_login_at` nullable,
      `email_verified`/`mfa_enabled` `BOOLEAN NOT NULL`, `created_at TIMESTAMPTZ NOT NULL`.
- [x] `platform_users` mirrors `AuthPlatformUser`: `password_hash TEXT NOT NULL`, **no** `tenant_id`/`email_verified`,
      adds `platform_id` (nullable) and `updated_at TIMESTAMPTZ NOT NULL`.
- [x] A unique index on `users (tenant_id, email)` backs `find_by_email` and raises `23505` on a duplicate; a
      (partial) unique index on `users (tenant_id, oauth_provider, oauth_provider_id)` backs `find_by_oauth_id`.
- [x] `audit_log` has a keyset index on `(created_at DESC, id DESC)`; `invitations` and `tenants` exist.
- [x] No `.gitkeep` / empty-directory placeholders are created.

#### Files to create / modify

- `apps/api/migrations/0001_init.sql`

#### Agent prompt

````
You are a senior Rust / sqlx database engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 4 (Schema & Repositories) — Task 4.1 of 6 (FIRST)

PRECONDITIONS
- Phase 3 landed: `apps/api` boots, `AppState` already exposes a live `sqlx::PgPool` and an `Arc<RedisStores>`, and the
  local stack (`docker compose up --wait`) gives a healthy Postgres (sqlx) at the dev port. There is no `migrations/`
  directory and no schema yet.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § 12 "Identity Domains & Extension Points" — the two domains table (Dashboard has `tenant_id`,
  Platform is tenant-less) and the repository method counts (11 + 6).
- docs/OVERVIEW.md § 13 "Token, Session & Tenant Security" — multi-tenant isolation (`find_by_email(email, tenant_id)`),
  and why the same email under two tenants is two isolated users.
- /Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/crates/bymax-auth-types/src/domain.rs — copy the exact field
  set/types of `AuthUser` and `AuthPlatformUser` to drive the columns and nullability.

TASK
Author a single forward migration `apps/api/migrations/0001_init.sql` that creates `tenants`, `users`, `platform_users`,
`invitations`, and `audit_log`. The `users`/`platform_users` columns must back `AuthUser`/`AuthPlatformUser`
field-for-field (types + nullability). Add the indexes that serve `find_by_email`, `find_by_oauth_id`, and keyset
audit reads. No business logic, no triggers beyond what the columns need.

DELIVERABLES
1. `apps/api/migrations/0001_init.sql`:
   - `tenants` (the `acme`/`globex` seed target), `users` (dashboard), `platform_users` (tenant-less admins),
     `invitations`, `audit_log` (keyset-ready for the P5 audit read-API).
   ```sql
   -- Dashboard tenants. Seeded with acme/globex in the dev seed.
   CREATE TABLE tenants (
       id          TEXT PRIMARY KEY,
       name        TEXT NOT NULL,
       created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   );

   -- Dashboard end users. Columns back `bymax_auth_types::domain::AuthUser` exactly.
   CREATE TABLE users (
       id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
       email               TEXT NOT NULL,
       name                TEXT NOT NULL,
       password_hash       TEXT,                          -- NULL for OAuth-only users
       role                TEXT NOT NULL DEFAULT 'user',
       status              TEXT NOT NULL DEFAULT 'active',
       tenant_id           TEXT NOT NULL REFERENCES tenants(id),
       email_verified      BOOLEAN NOT NULL DEFAULT false,
       mfa_enabled         BOOLEAN NOT NULL DEFAULT false,
       mfa_secret          TEXT,                          -- AEAD-sealed; never plaintext
       mfa_recovery_codes  TEXT[],                        -- Option<Vec<String>>
       oauth_provider      TEXT,
       oauth_provider_id   TEXT,
       last_login_at       TIMESTAMPTZ,
       created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   -- Tenant-scoped uniqueness backs find_by_email and raises 23505 -> Conflict.
   CREATE UNIQUE INDEX users_tenant_email_uidx ON users (tenant_id, email);
   -- Backs find_by_oauth_id(provider, provider_id, tenant_id).
   CREATE UNIQUE INDEX users_oauth_uidx
       ON users (tenant_id, oauth_provider, oauth_provider_id)
       WHERE oauth_provider IS NOT NULL AND oauth_provider_id IS NOT NULL;

   -- Platform admins. Back `AuthPlatformUser`: password_hash NOT NULL, no tenant_id /
   -- email_verified, adds platform_id + updated_at.
   CREATE TABLE platform_users (
       id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
       email               TEXT NOT NULL UNIQUE,
       name                TEXT NOT NULL,
       password_hash       TEXT NOT NULL,
       role                TEXT NOT NULL DEFAULT 'admin',
       status              TEXT NOT NULL DEFAULT 'active',
       mfa_enabled         BOOLEAN NOT NULL DEFAULT false,
       mfa_secret          TEXT,
       mfa_recovery_codes  TEXT[],
       platform_id         TEXT,
       last_login_at       TIMESTAMPTZ,
       created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
   );

   -- Team invitations.
   CREATE TABLE invitations (
       id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
       tenant_id   TEXT NOT NULL REFERENCES tenants(id),
       email       TEXT NOT NULL,
       role        TEXT NOT NULL,
       token_hash  TEXT NOT NULL,
       invited_by  TEXT,
       expires_at  TIMESTAMPTZ NOT NULL,
       accepted_at TIMESTAMPTZ,
       created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   );

   -- Append-only audit trail written by the auth lifecycle hooks. Never stores a token/code/secret.
   CREATE TABLE audit_log (
       id          BIGSERIAL PRIMARY KEY,
       tenant_id   TEXT,
       actor_id    TEXT,
       actor_email TEXT,
       event       TEXT NOT NULL,
       ip          TEXT,
       user_agent  TEXT,
       metadata    JSONB,
       created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   -- Keyset pagination index for GET /audit/logs (created_at, id) descending.
   CREATE INDEX audit_log_keyset_idx ON audit_log (created_at DESC, id DESC);
   ```

Constraints:
- The `users`/`platform_users` columns and nullability MUST match `AuthUser`/`AuthPlatformUser` in domain.rs — do not
  add or drop a field. `password_hash` is nullable on `users`, `NOT NULL` on `platform_users`.
- `gen_random_uuid()` is built into Postgres 18 (no extension needed); keep `id` as `TEXT` so it maps to the domain
  `String` ids.
- #![forbid(unsafe_code)] context; SQL only here — English-only, TIMELESS comments (NO Phase/Task/roadmap references in
  the committed `.sql`); no `.gitkeep`; create the branch with `git switch -c`.

Verification:
- `docker compose up --wait` — expected: Postgres healthy.
- `sqlx migrate run --source apps/api/migrations` — expected: `Applied 0001/init` with no error.
- `psql "$DATABASE_URL" -c '\d users' -c '\d platform_users'` — expected: every `AuthUser`/`AuthPlatformUser` column
  present with the right type/nullability.
- `grep -riE "phase [0-9]|task [0-9]" apps/api/migrations` — expected: no matches.
- `find apps/api -name .gitkeep` — expected: no output.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `1 / 6` and Last updated.
4. Update the P4 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 4.1 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(api): add initial schema migration for users, platform_users, tenants, invitations, audit_log` (no Co-Authored-By).
````

---

### Task 4.2 — sqlx offline cache + prepare workflow

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: S
- **Depends on**: 4.1

#### Description

Wire the sqlx offline query cache: add the `sqlx` features the repositories need, embed the migrations, establish the
`cargo sqlx prepare` workflow and the placeholder-`DATABASE_URL` + `SQLX_OFFLINE` build wiring so `cargo build --locked`
succeeds with no live database, and commit the `.sqlx/` directory.

#### Acceptance criteria

- [x] `apps/api/Cargo.toml` depends on `sqlx` with `runtime-tokio`, `tls-rustls-aws-lc-rs`, `postgres`, `macros`,
      `migrate`, and `time` (ids are `TEXT`, so `uuid` is not needed) — a ring-free rustls backend for offline mode.
- [x] `.cargo/config.toml` provides a placeholder `DATABASE_URL`; the CI top-level env sets `SQLX_OFFLINE=true`.
- [x] `cargo sqlx prepare --workspace` regenerates `.sqlx/` against a live (migrated) DB; the directory is committed
      (populated by the first query macros in 4.3/4.4).
- [x] `cargo build --locked` succeeds with `SQLX_OFFLINE=true` and no database reachable.
- [x] `cargo sqlx prepare --check --workspace` passes (the cache is current).

#### Files to create / modify

- `apps/api/Cargo.toml` (sqlx features)
- `apps/api/.env` (placeholder `DATABASE_URL`) and/or `.cargo/config.toml`
- `apps/api/.sqlx/` (committed offline cache) ; `.github/workflows/ci.yml` (`SQLX_OFFLINE=true` already wired in P0 — verify)

#### Agent prompt

````
You are a senior Rust / sqlx database engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 4 (Schema & Repositories) — Task 4.2 of 6 (MIDDLE)

PRECONDITIONS
- Task 4.1 is done: `apps/api/migrations/0001_init.sql` applies cleanly (`sqlx migrate run`).
- The repository query macros (`query_as!`) do not exist yet — they arrive in 4.3/4.4, which each re-run
  `cargo sqlx prepare`. THIS task establishes the offline-cache MECHANISM so those tasks (and CI) build without a DB.

REQUIRED READING (only these — do not load more):
- docs/DEVELOPMENT_PLAN.md § Appendix C/D — the offline-cache note ("a placeholder DATABASE_URL lets the api build
  without a DB; `cargo sqlx prepare` keeps the offline cache current"; `SQLX_OFFLINE=true` in CI).
- docs/DEVELOPMENT_PLAN.md § 2 "Global Conventions" — the Install / supply-chain rows (`ring`/`openssl` banned, so the
  rustls TLS backend must be aws-lc-rs, not ring).

TASK
Add the `sqlx` dependency with the right feature set, embed the migrations, wire a placeholder `DATABASE_URL` +
`SQLX_OFFLINE`, and commit the `.sqlx/` offline cache so the workspace builds with no live database.

DELIVERABLES
1. `apps/api/Cargo.toml` — sqlx with a ring-free TLS backend:
   ```toml
   [dependencies]
   sqlx = { version = "0.8", default-features = false, features = [
       "runtime-tokio",
       "tls-rustls-aws-lc-rs",   # rustls + aws-lc-rs; `ring` is banned by deny.toml
       "postgres",
       "macros",
       "migrate",
       "time",                   # TIMESTAMPTZ -> time::OffsetDateTime (matches the domain types)
       "uuid",
   ] }
   async-trait = "0.1"           # the repository traits are #[async_trait]
   ```
2. `apps/api/.env` — a placeholder URL for `cargo sqlx prepare` (the real URL comes from the figment Settings loader at
   runtime; this file is only consumed by the sqlx macros at build time):
   ```dotenv
   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/rust_auth_example
   ```
3. The prepare workflow — document it in the repo (e.g. a `db:prepare` script) and run it once to seed `.sqlx/`:
   ```bash
   # against a live, migrated database:
   sqlx migrate run --source apps/api/migrations
   cargo sqlx prepare --workspace -- --all-targets --all-features
   git add apps/api/.sqlx   # commit the regenerated cache
   ```
4. Verify `SQLX_OFFLINE=true` is set in the `ci.yml` build/test jobs (wired as a skeleton in P0) so CI never needs a DB
   to compile the macros; if absent, add it to the relevant jobs.

Constraints:
- TLS backend MUST be `tls-rustls-aws-lc-rs` (or equivalent non-ring rustls) — `ring`/`openssl` are banned in deny.toml.
- The `.sqlx/` cache is committed; re-running `cargo sqlx prepare --check` after a clean checkout must pass.
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test; English-only TIMELESS comments — NO Phase/Task/roadmap
  references in `Cargo.toml`/`.env`/CI; no `.gitkeep`; `git switch -c` only.

Verification:
- `cargo sqlx prepare --check --workspace` — expected: "query cache is up-to-date" (no diff).
- `SQLX_OFFLINE=true cargo build --locked -p api` — expected: builds with no database reachable.
- `cargo deny check` — expected: advisories/bans/licenses/sources ok (no `ring` pulled in by sqlx).
- `git status --porcelain apps/api/.sqlx` — expected: tracked, no uncommitted diff after prepare.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `2 / 6` and Last updated.
4. Update the P4 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 4.2 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `build(api): wire sqlx offline query cache and prepare workflow` (no Co-Authored-By).
````

---

### Task 4.3 — `SqlxUserRepository` (11 methods)

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: L
- **Depends on**: 4.1, 4.2

#### Description

Implement `bymax_auth_core::traits::repository::UserRepository` over the `users` table with all 11 methods, each backed
by a compile-checked `query_as!`/`query!`, returning `Ok(None)` for a missing or cross-tenant row, and expose the repo
as an `Arc<dyn UserRepository>` ready for the Phase 5 engine builder.

#### Acceptance criteria

- [x] `SqlxUserRepository::new(pool: PgPool)` exists; the type implements `UserRepository` via `#[async_trait]`.
- [x] All 11 methods are implemented: `find_by_id`, `find_by_email`, `create`, `update_password`, `update_mfa`,
      `update_last_login`, `update_status`, `update_email_verified`, `find_by_oauth_id`, `link_oauth`,
      `create_with_oauth` — each using `query_as!`/`query!` (no runtime query strings).
- [x] `find_by_id`/`find_by_email`/`find_by_oauth_id` return `Ok(None)` for a missing or cross-tenant row (proven by a
      test); `create`/`create_with_oauth` round-trip and return the full `AuthUser`.
- [x] Every `AuthUser` field round-trips, including `mfa_recovery_codes: Option<Vec<String>>` and the OAuth columns.
- [x] `cargo nextest run -p api repository::user` passes against the test stack; `cargo llvm-cov nextest -p api` shows
      `repository/user.rs` at 100% lines (merging a DB-present run with the DB-absent skip-guard run).
- [x] After adding the macros, `cargo sqlx prepare --check --workspace` passes (cache regenerated + committed).

#### Files to create / modify

- `apps/api/src/repository/mod.rs`, `apps/api/src/repository/user.rs`
- `apps/api/src/app.rs` / `apps/api/src/state.rs` (hold `Arc<dyn UserRepository>` in `AppState`)
- `apps/api/.sqlx/` (regenerated)

#### Agent prompt

````
You are a senior Rust / sqlx database engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 4 (Schema & Repositories) — Task 4.3 of 6 (MIDDLE)

PRECONDITIONS
- Tasks 4.1 + 4.2 are done: the schema applies (`sqlx migrate run`), the sqlx offline cache + `async-trait` dependency
  are wired, and `cargo sqlx prepare --check` passes on the empty cache.
- `AppState` already holds a `PgPool` (from P3). The error mapper from Task 4.5 is not written yet — for now map the
  unique-violation inline (a `map_sqlx_error` helper) and let 4.5 extract/harden it.

REQUIRED READING (only these — do not load more):
- /Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/crates/bymax-auth-core/src/traits/repository.rs — the exact
  `UserRepository` trait: 11 async methods, `Result<_, RepositoryError>`, missing row = `Ok(None)`.
- /Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/crates/bymax-auth-types/src/domain.rs — `AuthUser`,
  `CreateUserData`, `CreateWithOAuthData`, `UpdateMfaData` field shapes (to drive the SELECT/INSERT column lists).
- docs/OVERVIEW.md § 12 + § 13 — `Conflict → auth.email_already_exists`, missing/cross-tenant row = `Ok(None)`,
  tenant-scoped `find_by_email(email, tenant_id)`.

TASK
Implement `UserRepository` for `SqlxUserRepository` over the `users` table — all 11 methods, each `query_as!`/`query!`
typed. Map rows to `AuthUser` via a private row projection; return `Ok(None)` for missing/cross-tenant rows; map a
unique-violation to `RepositoryError::Conflict`. Hold the repo in `AppState` as `Arc<dyn UserRepository>`.

DELIVERABLES
1. `apps/api/src/repository/user.rs`:
   - A private `UserRow` projection + `From<UserRow> for AuthUser`, and the trait impl. (Import paths: the trait
     `UserRepository` and `RepositoryError` come from `bymax-auth-core`; the domain types (`AuthUser`, `CreateUserData`,
     `CreateWithOAuthData`, `UpdateMfaData`) come from `bymax-auth-types` — `bymax-auth-core` re-exports only
     `ConfigError`/`RepositoryError`, never the domain types.)
   ```rust
   //! sqlx/Postgres implementation of the dashboard `UserRepository` seam.

   use std::sync::Arc;

   use async_trait::async_trait;
   use bymax_auth_core::traits::repository::UserRepository;
   use bymax_auth_core::RepositoryError;
   use bymax_auth_types::{AuthUser, CreateUserData, CreateWithOAuthData, UpdateMfaData};
   use sqlx::PgPool;
   use time::OffsetDateTime;

   /// Row projection matching the `users` columns positionally; private — the
   /// public boundary is always `AuthUser`.
   struct UserRow {
       id: String,
       email: String,
       name: String,
       password_hash: Option<String>,
       role: String,
       status: String,
       tenant_id: String,
       email_verified: bool,
       mfa_enabled: bool,
       mfa_secret: Option<String>,
       mfa_recovery_codes: Option<Vec<String>>,
       oauth_provider: Option<String>,
       oauth_provider_id: Option<String>,
       last_login_at: Option<OffsetDateTime>,
       created_at: OffsetDateTime,
   }

   impl From<UserRow> for AuthUser {
       fn from(r: UserRow) -> Self {
           AuthUser {
               id: r.id, email: r.email, name: r.name, password_hash: r.password_hash,
               role: r.role, status: r.status, tenant_id: r.tenant_id,
               email_verified: r.email_verified, mfa_enabled: r.mfa_enabled,
               mfa_secret: r.mfa_secret, mfa_recovery_codes: r.mfa_recovery_codes,
               oauth_provider: r.oauth_provider, oauth_provider_id: r.oauth_provider_id,
               last_login_at: r.last_login_at, created_at: r.created_at,
           }
       }
   }

   /// Maps a raw sqlx error onto the repository contract. A Postgres unique-violation
   /// (SQLSTATE 23505) becomes `Conflict` (engine -> `auth.email_already_exists`);
   /// everything else is an opaque `Backend` error.
   fn map_sqlx_error(error: sqlx::Error) -> RepositoryError {
       if let sqlx::Error::Database(db) = &error {
           if db.code().as_deref() == Some("23505") {
               return RepositoryError::Conflict(db.constraint().unwrap_or("unique").to_string());
           }
       }
       RepositoryError::Backend(Box::new(error))
   }

   /// Postgres-backed dashboard user repository.
   pub struct SqlxUserRepository {
       pool: PgPool,
   }

   impl SqlxUserRepository {
       /// Construct over a shared connection pool.
       #[must_use]
       pub fn new(pool: PgPool) -> Self {
           Self { pool }
       }
   }

   #[async_trait]
   impl UserRepository for SqlxUserRepository {
       async fn find_by_email(
           &self,
           email: &str,
           tenant_id: &str,
       ) -> Result<Option<AuthUser>, RepositoryError> {
           let row = sqlx::query_as!(
               UserRow,
               r#"SELECT id, email, name, password_hash, role, status, tenant_id,
                         email_verified, mfa_enabled, mfa_secret,
                         mfa_recovery_codes AS "mfa_recovery_codes: Vec<String>",
                         oauth_provider, oauth_provider_id, last_login_at, created_at
                  FROM users WHERE tenant_id = $1 AND email = $2"#,
               tenant_id,
               email,
           )
           .fetch_optional(&self.pool)
           .await
           .map_err(map_sqlx_error)?;
           Ok(row.map(AuthUser::from))
       }

       async fn create(&self, data: CreateUserData) -> Result<AuthUser, RepositoryError> {
           // INSERT ... RETURNING the full row; COALESCE the Option fields onto the column
           // defaults. A duplicate (tenant_id, email) raises 23505 -> Conflict via map_sqlx_error.
           let row = sqlx::query_as!(
               UserRow,
               r#"INSERT INTO users (email, name, password_hash, role, status, tenant_id, email_verified)
                  VALUES ($1, $2, $3, COALESCE($4, 'user'), COALESCE($5, 'active'), $6, COALESCE($7, false))
                  RETURNING id, email, name, password_hash, role, status, tenant_id,
                            email_verified, mfa_enabled, mfa_secret,
                            mfa_recovery_codes AS "mfa_recovery_codes: Vec<String>",
                            oauth_provider, oauth_provider_id, last_login_at, created_at"#,
               data.email, data.name, data.password_hash, data.role, data.status,
               data.tenant_id, data.email_verified,
           )
           .fetch_one(&self.pool)
           .await
           .map_err(map_sqlx_error)?;
           Ok(AuthUser::from(row))
       }

       // Implement the remaining 9 analogously (NO todo!/unimplemented! — write real SQL):
       //  - find_by_id(id, tenant_id: Option<&str>)  -> WHERE id=$1 AND ($2::text IS NULL OR tenant_id=$2)
       //  - update_password(id, password_hash)        -> UPDATE users SET password_hash=$2 WHERE id=$1
       //  - update_mfa(id, UpdateMfaData)             -> SET mfa_enabled/mfa_secret/mfa_recovery_codes
       //  - update_last_login(id)                     -> SET last_login_at = now()
       //  - update_status(id, status)                 -> SET status=$2
       //  - update_email_verified(id, verified)       -> SET email_verified=$2
       //  - find_by_oauth_id(provider, provider_id, tenant_id) -> WHERE tenant_id/provider/provider_id
       //  - link_oauth(user_id, provider, provider_id)-> SET oauth_provider/oauth_provider_id
       //  - create_with_oauth(CreateWithOAuthData)    -> INSERT (password_hash NULL) RETURNING ...
   }
   ```
2. `apps/api/src/repository/mod.rs`: `pub mod user;` (+ `pub mod platform_user;` lands in 4.4, `pub mod error;` in 4.5).
3. `apps/api/src/state.rs` (or `app.rs`): add `user_repository: Arc<dyn UserRepository>` to `AppState`, constructed as
   `Arc::new(SqlxUserRepository::new(pool.clone()))` — ready for the P5 `AuthEngine::builder().user_repository(...)`.

Constraints:
- Every query is a `query_as!`/`query!` macro (compile-checked); after writing them, run `cargo sqlx prepare` and
  commit the refreshed `.sqlx/`.
- Missing/cross-tenant row -> `Ok(None)` (use `fetch_optional`); NEVER fabricate a "not found" error.
- No business logic (no hashing/validation) — that is the engine's job; the repo only persists.
- #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed `RepositoryError` only;
  English-only TIMELESS comments (NO Phase/Task/roadmap references); `git switch -c` only.
- Tests run against the TEST stack (`docker-compose.test.yml`, high ports) after `sqlx migrate run`; bound nextest
  threads; never fan out parallel test agents.

Verification:
- `cargo sqlx prepare --check --workspace` — expected: cache current (no diff) after committing `.sqlx/`.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `cargo nextest run -p api repository::user --test-threads 2` — expected: all pass (round-trip + Ok(None) +
  duplicate-email Conflict).
- `cargo llvm-cov nextest -p api --lcov --output-path lcov.info` — expected: `repository/user.rs` at 100%.
- `cargo +1.90 check -p api` — expected: builds on the MSRV floor.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `3 / 6` and Last updated.
4. Update the P4 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 4.3 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(api): implement SqlxUserRepository (11 UserRepository methods)` (no Co-Authored-By).
````

---

### Task 4.4 — `SqlxPlatformUserRepository` (6 methods)

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: 4.1, 4.2

#### Description

Implement `bymax_auth_core::traits::repository::PlatformUserRepository` over the `platform_users` table with all 6
methods, each `query_as!`/`query!`-typed, mapping rows to `AuthPlatformUser` and returning `Ok(None)` for a missing row.

#### Acceptance criteria

- [x] `SqlxPlatformUserRepository::new(pool: PgPool)` exists and implements `PlatformUserRepository` via `#[async_trait]`.
- [x] All 6 methods are implemented: `find_by_id`, `find_by_email`, `update_last_login`, `update_mfa` (takes
      `UpdatePlatformMfaData`), `update_password`, `update_status` — each `query_as!`/`query!`-typed.
- [x] `find_by_id`/`find_by_email` return `Ok(None)` for a missing row; the full `AuthPlatformUser` round-trips
      (including `password_hash` non-`Option`, `platform_id`, `updated_at`, `mfa_recovery_codes`).
- [x] `update_*` bumps `updated_at = now()`; `cargo nextest run -p api repository::platform_user` passes against the
      test stack; `repository/platform_user.rs` is 100% covered.
- [x] `cargo sqlx prepare --check --workspace` passes after the macros are added.

#### Files to create / modify

- `apps/api/src/repository/platform_user.rs`, `apps/api/src/repository/mod.rs`
- `apps/api/src/state.rs` (optional `Arc<dyn PlatformUserRepository>` field, gated by `platform.enabled`)
- `apps/api/.sqlx/` (regenerated)

#### Agent prompt

````
You are a senior Rust / sqlx database engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 4 (Schema & Repositories) — Task 4.4 of 6 (MIDDLE)

PRECONDITIONS
- Tasks 4.1 + 4.2 are done. Task 4.3 established the `apps/api/src/repository/` module, the `map_sqlx_error` helper
  pattern, and the offline-cache regeneration habit; mirror that structure here for the platform domain.

REQUIRED READING (only these — do not load more):
- /Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/crates/bymax-auth-core/src/traits/repository.rs — the exact
  `PlatformUserRepository` trait: 6 async methods, `Result<_, RepositoryError>`, missing row = `Ok(None)`.
- /Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/crates/bymax-auth-types/src/domain.rs — `AuthPlatformUser`
  (password_hash NON-optional, no tenant_id/email_verified, adds platform_id + updated_at) and `UpdatePlatformMfaData`.
- docs/OVERVIEW.md § 12 — the platform domain is tenant-less; `find_by_email` takes only the email (no tenant_id).

TASK
Implement `PlatformUserRepository` for `SqlxPlatformUserRepository` over the `platform_users` table — all 6 methods,
each `query_as!`/`query!`-typed, mapping rows to `AuthPlatformUser` and returning `Ok(None)` for a missing row.

DELIVERABLES
1. `apps/api/src/repository/platform_user.rs`:
   ```rust
   //! sqlx/Postgres implementation of the tenant-less `PlatformUserRepository` seam.

   use async_trait::async_trait;
   use bymax_auth_core::traits::repository::PlatformUserRepository;
   use bymax_auth_core::RepositoryError;
   use bymax_auth_types::{AuthPlatformUser, UpdatePlatformMfaData};
   use sqlx::PgPool;
   use time::OffsetDateTime;

   /// Row projection matching the `platform_users` columns positionally.
   struct PlatformUserRow {
       id: String,
       email: String,
       name: String,
       password_hash: String,            // NON-optional for platform admins
       role: String,
       status: String,
       mfa_enabled: bool,
       mfa_secret: Option<String>,
       mfa_recovery_codes: Option<Vec<String>>,
       platform_id: Option<String>,
       last_login_at: Option<OffsetDateTime>,
       created_at: OffsetDateTime,
       updated_at: OffsetDateTime,
   }

   impl From<PlatformUserRow> for AuthPlatformUser {
       fn from(r: PlatformUserRow) -> Self {
           AuthPlatformUser {
               id: r.id, email: r.email, name: r.name, password_hash: r.password_hash,
               role: r.role, status: r.status, mfa_enabled: r.mfa_enabled,
               mfa_secret: r.mfa_secret, mfa_recovery_codes: r.mfa_recovery_codes,
               platform_id: r.platform_id, last_login_at: r.last_login_at,
               created_at: r.created_at, updated_at: r.updated_at,
           }
       }
   }

   /// Postgres-backed platform-admin repository.
   pub struct SqlxPlatformUserRepository {
       pool: PgPool,
   }

   impl SqlxPlatformUserRepository {
       /// Construct over a shared connection pool.
       #[must_use]
       pub fn new(pool: PgPool) -> Self {
           Self { pool }
       }
   }

   #[async_trait]
   impl PlatformUserRepository for SqlxPlatformUserRepository {
       async fn find_by_email(&self, email: &str) -> Result<Option<AuthPlatformUser>, RepositoryError> {
           let row = sqlx::query_as!(
               PlatformUserRow,
               r#"SELECT id, email, name, password_hash, role, status, mfa_enabled, mfa_secret,
                         mfa_recovery_codes AS "mfa_recovery_codes: Vec<String>",
                         platform_id,
                         last_login_at, created_at, updated_at
                  FROM platform_users WHERE email = $1"#,
               email,
           )
           .fetch_optional(&self.pool)
           .await
           .map_err(crate::repository::map_sqlx_error)?;
           Ok(row.map(AuthPlatformUser::from))
       }

       // Implement the other 5 analogously (real SQL, NO todo!/unimplemented!):
       //  - find_by_id(id)                         -> SELECT ... WHERE id=$1 (fetch_optional)
       //  - update_last_login(id)                  -> SET last_login_at = now(), updated_at = now()
       //  - update_mfa(id, UpdatePlatformMfaData)  -> SET mfa_enabled/mfa_secret/mfa_recovery_codes, updated_at = now()
       //  - update_password(id, password_hash)     -> SET password_hash=$2, updated_at = now()
       //  - update_status(id, status)              -> SET status=$2, updated_at = now()
   }
   ```
2. `apps/api/src/repository/mod.rs`: add `pub mod platform_user;` (and re-export `map_sqlx_error` so this module can
   reuse the same helper that 4.3 introduced / 4.5 hardens).
3. `apps/api/src/state.rs`: optionally hold `Arc<dyn PlatformUserRepository>` (constructed when `platform.enabled`) for
   the P5 builder's `.platform_user_repository(...)`.

Constraints:
- `password_hash` is `String` (NON-optional) for platform users — do not make it `Option`.
- Every `update_*` sets `updated_at = now()`.
- `query_as!`/`query!` macros only; re-run `cargo sqlx prepare` and commit `.sqlx/`.
- Missing row -> `Ok(None)`; no business logic; #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in
  non-test code; typed `RepositoryError`; English-only TIMELESS comments (NO Phase/Task refs); `git switch -c` only.
- Tests run against the TEST stack after `sqlx migrate run`; bound nextest threads; never fan out parallel test agents.

Verification:
- `cargo sqlx prepare --check --workspace` — expected: cache current after committing `.sqlx/`.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `cargo nextest run -p api repository::platform_user --test-threads 2` — expected: all pass (round-trip + Ok(None)).
- `cargo llvm-cov nextest -p api --lcov` — expected: `repository/platform_user.rs` at 100%.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `4 / 6` and Last updated.
4. Update the P4 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 4.4 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(api): implement SqlxPlatformUserRepository (6 PlatformUserRepository methods)` (no Co-Authored-By).
````

---

### Task 4.5 — `RepositoryError` mapping (Conflict / `Ok(None)`)

- **Status**: ✅ Done
- **Priority**: P1
- **Size**: S
- **Depends on**: 4.3, 4.4

#### Description

Extract and harden the `sqlx::Error → RepositoryError` mapping into a single shared `repository::error` module — a
unique-violation maps to `RepositoryError::Conflict` (the engine renders `auth.email_already_exists`), every other
error to `RepositoryError::Backend`, and a missing row stays `Ok(None)` — with unit/integration tests proving the
semantics against the test Postgres.

#### Acceptance criteria

- [x] `apps/api/src/repository/error.rs` exposes a single `map_sqlx_error(sqlx::Error) -> RepositoryError`, reused by
      both repositories via a `pub use` re-export (the inline copy from 4.3/4.4's `mod.rs` is removed in favour of it).
- [x] A Postgres unique-violation (SQLSTATE `23505`) maps to `RepositoryError::Conflict(_)`; any other `sqlx::Error`
      maps to `RepositoryError::Backend(_)` (proven for both a non-`Database` error and a non-unique `Database` error).
- [x] A test triggers a real unique violation and asserts `Err(RepositoryError::Conflict(_))`; another asserts a
      missing `find_*` returns `Ok(None)` (not an error).
- [x] A test confirms the engine-level rendering of a pre-checked duplicate as `AuthError::EmailAlreadyExists`
      (`auth.email_already_exists`); there is no `From<RepositoryError> for AuthError` impl — the two types live in
      different crates (orphan rule), so the engine maps `Conflict` contextually.
- [x] `cargo llvm-cov nextest -p api` shows `repository/error.rs` at 100% lines (both branches covered).

#### Files to create / modify

- `apps/api/src/repository/error.rs`, `apps/api/src/repository/mod.rs`
- `apps/api/src/repository/user.rs`, `apps/api/src/repository/platform_user.rs` (use the shared mapper)

#### Agent prompt

````
You are a senior Rust / sqlx database engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 4 (Schema & Repositories) — Task 4.5 of 6 (MIDDLE)

PRECONDITIONS
- Tasks 4.3 + 4.4 are done: both repositories are implemented and currently carry an inline `map_sqlx_error` helper.
  This task centralizes that mapping and proves its semantics.

REQUIRED READING (only these — do not load more):
- /Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/crates/bymax-auth-core/src/error.rs — the
  `RepositoryError { Conflict(String), Backend(Box<dyn Error+Send+Sync>) }` definition (`#[non_exhaustive]`, NO
  "not found" variant). There is NO `From<RepositoryError> for AuthError` impl (the types live in different crates —
  orphan rule); the engine maps `Conflict` contextually (register -> `AuthError::EmailAlreadyExists`).
- docs/OVERVIEW.md § 12 — "RepositoryError::Conflict maps to auth.email_already_exists — a missing row is Ok(None),
  never an error".

TASK
Move the `sqlx::Error -> RepositoryError` mapping into `apps/api/src/repository/error.rs` as the single source of truth,
make both repositories use it, and add tests that prove (against the test Postgres) that a unique-violation is a
`Conflict`, any other error is a `Backend`, and a missing/cross-tenant lookup is `Ok(None)`.

DELIVERABLES
1. `apps/api/src/repository/error.rs`:
   ```rust
   //! Translates raw `sqlx::Error` values onto the engine's `RepositoryError` contract.

   use bymax_auth_core::RepositoryError;

   /// Postgres SQLSTATE for a unique-constraint violation.
   const PG_UNIQUE_VIOLATION: &str = "23505";

   /// Map a sqlx error onto the repository contract.
   ///
   /// A unique-violation becomes `Conflict` — the engine renders it as `auth.email_already_exists`.
   /// Every other failure is an opaque `Backend` error. A MISSING row is never routed here:
   /// callers use `fetch_optional` and return `Ok(None)` instead.
   #[must_use]
   pub fn map_sqlx_error(error: sqlx::Error) -> RepositoryError {
       if let sqlx::Error::Database(db) = &error {
           if db.code().as_deref() == Some(PG_UNIQUE_VIOLATION) {
               return RepositoryError::Conflict(db.constraint().unwrap_or("unique").to_string());
           }
       }
       RepositoryError::Backend(Box::new(error))
   }

   #[cfg(test)]
   mod tests {
       // Against the test stack: insert a duplicate (tenant_id, email) and assert
       // `matches!(err, RepositoryError::Conflict(_))`; force a non-unique failure (e.g. an
       // FK violation) and assert `RepositoryError::Backend(_)`. unwrap/expect ARE allowed here.
   }
   ```
2. Replace the inline `map_sqlx_error` in `user.rs`/`platform_user.rs` with `use crate::repository::error::map_sqlx_error;`
   (re-export it from `repository/mod.rs` if convenient).
3. Integration tests (in `apps/api/tests/` or `#[cfg(test)]`) that exercise the live semantics: duplicate-email ->
   `Conflict`, missing/cross-tenant `find_*` -> `Ok(None)`, and the engine-level `auth.email_already_exists` rendering
   (drive a register of a pre-checked duplicate and assert it surfaces `AuthError::EmailAlreadyExists` / the wire
   envelope — there is no `From<RepositoryError> for AuthError` to assert against).

Constraints:
- `RepositoryError` has NO "not found" — missing rows are `Ok(None)`; never invent an error for them.
- Both repositories use the ONE shared mapper (no duplicated copies).
- #![forbid(unsafe_code)]; NO unwrap/expect/panic in NON-test code (tests may use them); typed errors; English-only
  TIMELESS comments (NO Phase/Task refs); `git switch -c` only; bound nextest threads; never fan out parallel test agents.

Verification:
- `cargo nextest run -p api repository::error --test-threads 2` — expected: Conflict + Backend + Ok(None) cases pass.
- `cargo llvm-cov nextest -p api --lcov` — expected: `repository/error.rs` at 100% (both branches).
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `grep -rn "fn map_sqlx_error" apps/api/src/repository` — expected: exactly one definition (no duplicates).

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `5 / 6` and Last updated.
4. Update the P4 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 4.5 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `refactor(api): centralize sqlx-to-RepositoryError mapping and prove conflict/none semantics` (no Co-Authored-By).
````

---

### Task 4.6 — Seed data (acme/globex + demo admin)

- **Status**: ✅ Done
- **Priority**: P1
- **Size**: S
- **Depends on**: 4.1

#### Description

Add an idempotent development seed that inserts the `acme` and `globex` demo tenants and a demo platform admin (password
hashed via the library's hasher), runnable as a small script/binary against a migrated database. This is the LAST task —
run the per-phase completion protocol after it.

#### Acceptance criteria

- [x] A seed runnable via a single command (`cargo run -p api --bin seed`) inserts
      `acme`/`globex` into `tenants` and a demo admin into `platform_users`.
- [x] The demo admin's `password_hash` is produced by `bymax_auth_crypto::password::hash` (a real `$scrypt$` PHC
      string), not a hand-written literal.
- [x] The seed is idempotent: running it twice leaves the row counts unchanged (`ON CONFLICT DO NOTHING`).
- [x] The demo credentials are documented in `.env.example` and are clearly local-only fixtures (no real secret
      committed).
- [x] `cargo run -p api --bin seed` succeeds against the dev stack and the rows are present.

#### Files to create / modify

- `apps/api/src/bin/seed.rs` (or `apps/api/db/seed.sql` + `scripts/seed.sh`)
- `apps/api/Cargo.toml` (the `[[bin]]` entry; add `bymax-auth-crypto` as a path dep if not already present)
- documentation of the demo credentials (`.env.example` / `docs/GETTING_STARTED.md` placeholder)

#### Agent prompt

````
You are a senior Rust / sqlx database engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 4 (Schema & Repositories) — Task 4.6 of 6 (LAST)

PRECONDITIONS
- Task 4.1 is done (the schema exists). The repositories (4.3/4.4) and the error mapping (4.5) may also be done; the
  seed depends only on the schema. `bymax_auth_crypto::password::hash(password: &[u8], &PasswordParams) -> Result<String, _>`
  is available (the example consumes the concrete crates; add `bymax-auth-crypto` as a path dep if not already present).

REQUIRED READING (only these — do not load more):
- docs/DEVELOPMENT_PLAN.md § "Phase 4 — Schema & Repositories" (scope: "a seed for demo tenants (acme/globex) + a demo
  platform admin") and Appendix E (the go-public rule: only local/test fixtures, no real keys).
- /Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/crates/bymax-auth-crypto/src/... — the `password::hash` +
  `PasswordParams::default()` signatures (to hash the demo admin password with the real KDF).

TASK
Add an idempotent development seed inserting the `acme`/`globex` tenants and a demo platform admin (password hashed via
the library's `password::hash`). Make it runnable as `cargo run -p api --bin seed` against a migrated database. Document
the demo credentials as local-only fixtures.

DELIVERABLES
1. `apps/api/src/bin/seed.rs`:
   ```rust
   //! Idempotent development seed: the acme/globex demo tenants and a demo platform admin.
   //! Run with `cargo run -p api --bin seed` against a migrated database.

   use bymax_auth_crypto::password::{self, PasswordParams};
   use sqlx::PgPool;

   #[tokio::main]
   async fn main() -> Result<(), Box<dyn std::error::Error>> {
       let database_url = std::env::var("DATABASE_URL")?;
       let pool = PgPool::connect(&database_url).await?;

       for (id, name) in [("acme", "Acme Inc."), ("globex", "Globex Corp.")] {
           sqlx::query!(
               "INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
               id,
               name,
           )
           .execute(&pool)
           .await?;
       }

       // Demo platform admin — local-only fixture; document the credential in .env.example.
       let admin_email = "admin@platform.local";
       let admin_hash = password::hash(b"ChangeMe!Demo123", &PasswordParams::default())?;
       sqlx::query!(
           r#"INSERT INTO platform_users (email, name, password_hash, role, status)
              VALUES ($1, 'Demo Admin', $2, 'admin', 'active')
              ON CONFLICT (email) DO NOTHING"#,
           admin_email,
           admin_hash,
       )
       .execute(&pool)
       .await?;

       println!("seed complete: tenants=acme,globex platform-admin={admin_email}");
       Ok(())
   }
   ```
2. `apps/api/Cargo.toml`: register the `[[bin]] name = "seed"` (and `bymax-auth-crypto` path dep if missing).
3. Document the demo credentials in `.env.example` (or a `docs/GETTING_STARTED.md` placeholder): the admin email +
   password, clearly labelled as a local-only fixture that the seed creates.

Constraints:
- Idempotent: `ON CONFLICT DO NOTHING` so a second run is a no-op (row counts unchanged).
- Hash with the library's `password::hash` — NEVER commit a hand-written hash or a real secret; the demo password is a
  documented local fixture only (Appendix E: local/test fixtures only).
- A `main` returning `Result<_, Box<dyn Error>>` using `?` is fine; NO unwrap/expect/panic!/todo!/unreachable! in the
  seed body. #![forbid(unsafe_code)]; English-only TIMELESS comments (NO Phase/Task refs); no `.gitkeep`; `git switch -c`.

Verification:
- `sqlx migrate run --source apps/api/migrations` then `cargo run -p api --bin seed` — expected: prints "seed complete".
- `cargo run -p api --bin seed` (second run) — expected: succeeds; `SELECT count(*) FROM tenants` and
  `FROM platform_users` are unchanged (idempotent).
- `psql "$DATABASE_URL" -c "SELECT id FROM tenants ORDER BY id"` — expected: `acme`, `globex`.
- `grep -riE "phase [0-9]|task [0-9]" apps/api/src/bin/seed.rs` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `6 / 6` and Last updated.
4. Update the P4 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 4.6 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(api): add idempotent dev seed for acme/globex tenants and demo platform admin` (no Co-Authored-By).
(The LAST task also runs the PER-PHASE protocol: flip P4 to ✅ / 6 of 6 in docs/DEVELOPMENT_PLAN.md, advance the Active
phase to P5, recompute Overall progress %.)
````

---

## Phase Completion Protocol

When Task 4.6 is ✅ (the LAST task), close the phase:

1. Confirm **all 6 tasks are ✅** in the Task index and that every Definition-of-Done bullet for P4 in
   [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) is met: `sqlx migrate run` applies cleanly,
   `cargo sqlx prepare --check` passes, both repositories implement all 11 + 6 methods with the `Conflict`/`Ok(None)`
   semantics proven against a real Postgres, the schema round-trips every `AuthUser`/`AuthPlatformUser` field, and the
   repository modules are 100% covered.
2. Confirm the phase PR is merged and CI is green (`fmt`, `clippy`, `msrv`, `unit`/coverage, `supply-chain`,
   `export-usage-check`, `e2e-api` where applicable).
3. In [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md): set the **P4** dashboard row Status to ✅, Progress to
   `6 / 6`, and Last updated; advance **Active phase** to P5; recompute **Overall progress** (phases + tasks %).
4. Set this file's header **Status** to ✅ and Progress to `6 / 6`.
5. Commit `docs(plan): P4 complete` (no `Co-Authored-By`).
6. If any DoD bullet is unmet, use 🟡 Partial (never ✅) and record what remains.

---

## Completion log

> Append-only. One line per completed task: `- <id> ✅ YYYY-MM-DD — <summary>`.

- 4.1 ✅ 2026-07-02 — Initial migration `0001_init.sql` creates tenants, users, platform_users, invitations, audit_log backing AuthUser/AuthPlatformUser field-for-field, with the tenant-email + partial OAuth unique indexes and the keyset audit index.
- 4.2 ✅ 2026-07-02 — Wired sqlx (`macros`/`migrate`/`time`, ring-free rustls) + `async-trait`/`time` deps, a `.cargo/config.toml` placeholder `DATABASE_URL`, `SQLX_OFFLINE=true` in CI, and `db:migrate`/`db:prepare` scripts; the `.sqlx/` cache lands with the first query macros.
- 4.3 ✅ 2026-07-02 — `SqlxUserRepository` implements all 11 `UserRepository` methods over compile-checked `query!`/`query_as!`, mapping rows to `AuthUser` with `Ok(None)` for missing/cross-tenant reads and `Conflict`/`Backend` error mapping; held in `AppState` as `Arc<dyn UserRepository>`; committed `.sqlx/` cache; 100% line coverage against the test stack.
- 4.4 ✅ 2026-07-02 — `SqlxPlatformUserRepository` implements all 6 tenant-less `PlatformUserRepository` methods, mapping rows to `AuthPlatformUser` (non-optional `password_hash`, `platform_id`, `updated_at`); every mutation bumps `updated_at`; held in `AppState`; cache regenerated; `platform_user.rs` at 100% coverage.
- 4.5 ✅ 2026-07-02 — Extracted the `sqlx::Error → RepositoryError` mapping into `repository/error.rs` (single definition, re-exported), proving 23505 → `Conflict`, other errors → `Backend`, missing row → `Ok(None)`, and the `auth.email_already_exists` wire rendering; `error.rs` at 100% line coverage.
- 4.6 ✅ 2026-07-02 — Added `apps/api/src/bin/seed.rs`, an idempotent `cargo run -p api --bin seed` that inserts the acme/globex tenants and a demo platform admin whose password is hashed with the library's scrypt KDF (`$scrypt$` PHC); `ON CONFLICT DO NOTHING` keeps re-runs a no-op; demo credentials documented in `.env.example`.
