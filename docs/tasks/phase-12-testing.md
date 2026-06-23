# Phase 12 — Testing & 100% Coverage

> **Status**: 📋 ToDo · **Progress**: 0 / 6 tasks · **Last updated**: 2026-06-23
> **Source roadmap**: [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P12
> **Source spec**: [`docs/OVERVIEW.md`](../OVERVIEW.md)
> **Executing a task?** Read **only** that task's `### Task N.n` block + its bounded *REQUIRED READING* — never the whole file. See [token economy](README.md#token-economy--executing-a-single-task).

---

## Context

Phases 3–11 built the full vertical: the axum service hosting `AuthEngine::builder()` with real sqlx repositories, `Arc<RedisStores>`, the lettre `EmailProvider`, the `AuditAuthHooks`, and `GoogleOAuthProvider` (P3–P7), then the two Next.js consoles — the dashboard daily-driver and the tenant-less platform admin — consuming `@bymax-one/rust-auth` (P8–P11). Each of those feature phases shipped its own tests at 100% as it landed, so coverage is already high; what no single phase owned was the **consolidation** — closing every remaining wall to 100% on all metrics in both workspaces, exercising the crypto/JWT edges via the wiring, and proving the numbered browser journeys end-to-end against a live stack.

This phase fills that in. On the API side it drives `cargo llvm-cov nextest` to **100% lines/regions/functions** across every engine-wiring/repository/email/hooks/route/error module (with non-executable glue excluded so the number stays meaningful), adds the axum integration suite against both the `testing` in-memory doubles and a real Postgres/Redis (`sqlx migrate` first), wires the native `bymax_auth_client::AuthClient` round-trip, and adds the `proptest` + RFC-KAT property edges (TOTP ±2 drift, PHC round-trip, HS256 alg-pin rejection, refresh-reuse-past-grace revoke). On the web side it drives Vitest to **100%** on `lib/**` + `hooks/**` + `components/**` with `maxWorkers: '50%'` baked in, including the `AUTH_ERROR_CODES` localization-exhaustiveness test and the segmented OTP box behaviors, then proves the live journeys under Playwright. Finally it wires the `ci.yml` `unit` / `e2e-api` / `e2e-web` / `coverage-report` jobs to the 100% gate with the coverage-scope exclusions, so both workspaces report 100% in CI.

When P12 is done, `cargo llvm-cov nextest -p api` reports 100% on all metrics, `pnpm -C apps/web test:cov` reports 100% on all metrics, `cargo nextest run -p api --test integration` passes against the test stack, `npx playwright test` passes the numbered journeys against the live stack, and the CI `unit` + `e2e-api` + `e2e-web` + `coverage-report` jobs are green with the gate enforced. Every test names its scenario and the rule it protects. **Mutation hardening is Phase 13 and the docs/release gate is Phase 14 — this phase only closes the coverage walls and proves the journeys; it does not run `cargo-mutants`/Stryker or author any product docs.**

---

## Rules-of-phase

1. **Memory-safe execution is non-negotiable.** Rust suites run `cargo nextest run -p api --test-threads <= cores/2`; coverage runs `cargo llvm-cov nextest`. Web suites bake `maxWorkers: '50%'` into `vitest.config.ts` plus `NODE_OPTIONS=--max-old-space-size=4096`. **Never** fan out parallel `Agent`/`Workflow` runs that each execute a suite, and never let both apps' suites run at once — the `path`/`file:` library is duplicated into every worker and OOMs the machine.
2. **Integration tests migrate first.** Any test that touches a real Postgres/Redis brings up `docker-compose.test.yml` (high ports — pg `55432`, redis `56379`, mailpit `51025`/`58025`) and runs `sqlx migrate run` against `DATABASE_URL_TEST` before the first query; a missing migration must fail loudly, not silently pass.
3. **Non-executable glue is excluded from coverage scope, never tested into existence.** `main.rs`, the binary bootstrap, pure type modules, and any generated glue are stripped via `--ignore-filename-regex` (Rust) and `coverage.exclude` (Vitest) so the 100% stays meaningful. Excluding a module to dodge a real branch is forbidden — exclude only genuinely non-executable code.
4. **Every test names its scenario and the rule it protects.** Test names read as full sentences (e.g. `verify_rejects_reused_refresh_token_past_grace` / `"localizes every AUTH_ERROR_CODES member"`), not `test_1`. A reviewer must learn the invariant from the name alone.
5. **No real network, no real provider, in CI.** Google is driven through the injected `MockHttpClient` / `MockOAuthProvider` (Rust) or Playwright route interception (web); email is read from the **Mailpit REST API** (`GET /api/v1/messages`), never by querying the database. The opt-in real-TLS test stays `#[ignore]` without credentials.
6. **Never weaken a threshold to go green.** The gate is `--fail-under-lines/functions/regions 100` (Rust) and `thresholds: 100` (Vitest). Close the gap by adding the missing test or removing genuinely-dead code — never by lowering a number or deleting an assertion.
7. **Property tests are reproducible.** `proptest` cases use a committed `proptest-regressions/` seed file so a shrunk counterexample re-runs deterministically; KAT vectors come from RFC 4226/6238/4231 / the PHC test vectors, not from the implementation's own output.
8. **English-only, timeless comments.** No `Phase N` / task / roadmap references in any committed test, config, fixture, or workflow file. `git switch -c` only (never `git checkout -b`); Conventional Commits with no `Co-Authored-By` trailer; no `.gitkeep` / empty-directory scaffolding.

---

## Reference docs

- [`docs/OVERVIEW.md`](../OVERVIEW.md) — § 17 "Testing Strategy" (the layer/tool/scope table, the 100% floor, "every test names the scenario and the rule it protects"), § 16 "Demonstrated Journeys" (the numbered Playwright journeys), § 8 "Local Stack & Memory-Safe Run" (the capped pools + the test-stack high ports).
- [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) — § P12 (scope + DoD), § 2 "Global Conventions" (the Test-coverage + Memory-safe-tests rows), Appendix C "Quality Gates" (the coverage scope note + the per-gate tools), Appendix D "CI/CD Workflow Matrix" (the `unit` / `e2e-api` / `e2e-web` / `coverage-report` jobs).
- [`docs/DASHBOARD.md`](../DASHBOARD.md) — § 11 "Testing the console" (the Vitest unit/component scope, the OTP box / sessions table / error-localization map, the Playwright journeys, `maxWorkers: '50%'`).
- `/Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/crates/bymax-auth-core` · `.../bymax-auth-crypto` · `.../bymax-auth-jwt` · `.../bymax-auth-client` — the `testing` in-memory doubles (`InMemoryUserRepository`, `InMemoryStores`, `MockHttpClient`, `MockOAuthProvider`, `NoOpAuthHooks`/`NoOpEmailProvider`), the `totp`/`password`/`hs256` signatures, and the native `AuthClient` to round-trip.
- `/Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/apps/web/vitest.config.ts` · `.../playwright.config.ts` · `.../e2e/*.spec.ts` — the Vitest threshold + `maxWorkers` config and the Playwright journey specs to copy-and-adapt to this stack.
- /bymax-workflow:standards — universal coding rules (apply the Rust track).

---

## Task index

| ID | Task | Status | Priority | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| 12.1 | API unit coverage → 100% | 📋 ToDo | P0 | L | — |
| 12.2 | API integration tests + native client | 📋 ToDo | P0 | M | — |
| 12.3 | Property / RFC-KAT crypto & JWT edges | 📋 ToDo | P1 | M | — |
| 12.4 | Web Vitest unit/component → 100% | 📋 ToDo | P0 | L | — |
| 12.5 | Playwright live journeys | 📋 ToDo | P1 | M | 12.2, 12.4 |
| 12.6 | CI coverage jobs green @ 100% gate | 📋 ToDo | P1 | M | 12.1, 12.4 |

---

## Tasks

### Task 12.1 — API unit coverage → 100%

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: L
- **Depends on**: —

#### Description

Drive `cargo llvm-cov nextest -p api` to **100% lines/regions/functions** across every engine-wiring, repository, email, hooks, route, and error module by adding the missing unit tests, and bake the coverage-scope exclusions (`main.rs`, the binary bootstrap, pure type modules) so the 100% is meaningful.

#### Acceptance criteria

- [ ] `cargo llvm-cov nextest -p api --ignore-filename-regex '(^|/)(main|bootstrap)\.rs$' --fail-under-lines 100 --fail-under-functions 100 --fail-under-regions 100` passes (the gate is the command).
- [ ] Every engine-wiring branch is covered: `build_engine` happy path + each `BuildError` arm (weak secret rejected by `AuthConfig::validate`, store-connect failure, platform-repo-required-when-`platform.enabled`).
- [ ] `SqlxUserRepository` (all 11 methods) and `SqlxPlatformUserRepository` (all 6) are unit-covered including the `Conflict → auth.email_already_exists` and missing-row → `Ok(None)` arms; the lettre `EmailProvider` render+send paths and the `AuditAuthHooks` masking (no token/code/secret persisted) are covered.
- [ ] `AppError`'s every `IntoResponse` arm is covered, including the `Internal → opaque 500` arm and the delegation to `AuthError::to_envelope` for library errors.
- [ ] `.config/nextest.toml` caps `test-threads` (≤ cores/2) for memory safety; a non-executable bootstrap shim, if any, carries `#[cfg_attr(coverage_nightly, coverage(off))]` rather than a fabricated test.
- [ ] Every test name reads as a scenario sentence; no `.gitkeep` / empty-dir placeholders are created.

#### Files to create / modify

- `apps/api/src/engine/mod.rs`, `apps/api/src/repos/*.rs`, `apps/api/src/email/*.rs`, `apps/api/src/hooks/*.rs`, `apps/api/src/app.rs` (add `#[cfg(test)] mod tests`)
- `apps/api/.config/nextest.toml`
- `apps/api/tests/` (only if a module's branches are unreachable from a pure unit test — prefer in-module `#[cfg(test)]`)

#### Agent prompt

````
You are a senior Rust + TypeScript test engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 12 (Testing & 100% Coverage) — Task 12.1 of 6 (FIRST)

PRECONDITIONS
- Phases 3–7 produced the API: `apps/api/src/{engine,repos,email,hooks,oauth,audit,diagnostics,app}.rs|/`. Each shipped its own tests as it landed, so coverage is high but not yet 100% on all metrics.
- `cargo-llvm-cov` and `cargo-nextest` are installed (Phase 0 toolchain). The package name is `api` (`cargo nextest run -p api`).
- The `bymax-auth-core` `testing` feature exposes in-memory doubles (`InMemoryUserRepository`, `InMemoryStores`, `NoOpAuthHooks`, `NoOpEmailProvider`) usable as test seams without a live backend.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "17. Testing Strategy" — the API-unit row (engine wiring, each repository/EmailProvider/AuthHooks impl, the config builder, the domain routes, the error mapping) and "non-executable glue excluded".
- docs/DEVELOPMENT_PLAN.md § "Phase 12" + § "2. Global Conventions" (Test-coverage row: 100% all metrics, glue excluded; Memory-safe-tests row) + Appendix C (the Coverage scope note).
- ../../../rust-auth/crates/bymax-auth-core/src/error.rs — confirm `AuthError::to_envelope`/`error_response` so the `AppError` delegation test asserts the right `{ error: { code, message, details } }` envelope + status.

TASK
Close every coverage gap in `apps/api`'s executable modules so `cargo llvm-cov nextest -p api` hits 100% lines/regions/functions, and bake the scope exclusions so the number stays honest. Add in-module `#[cfg(test)]` unit tests (prefer them over `tests/` integration where a pure unit suffices); do NOT add integration-against-Postgres tests here (that is Task 12.2).

DELIVERABLES
1. `apps/api/.config/nextest.toml` — cap workers for memory safety:
   ```toml
   # Bound the worker pool so the path-linked library is not duplicated across
   # more forks than the machine can hold (see the memory-safe run recipe).
   [profile.default]
   test-threads = "num-cpus/2"
   fail-fast = false

   [profile.ci]
   test-threads = 4
   ```
2. `apps/api/src/app.rs` — cover every `AppError` arm:
   ```rust
   #[cfg(test)]
   mod tests {
       use super::*;
       use axum::response::IntoResponse;
       use http::StatusCode;

       /// An internal error must surface as an opaque 500 — the inner message
       /// is never leaked to the client (protects the no-internal-leak rule).
       #[test]
       fn internal_error_maps_to_opaque_500() {
           let response = AppError::Internal("db pool exhausted".into()).into_response();
           assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
           // The opaque body must not contain the inner detail.
       }

       /// A wrapped library rejection must delegate to AuthError::to_envelope so
       /// the client sees the stable { error: { code, message, details } } shape.
       #[test]
       fn library_error_delegates_to_envelope() {
           let response = AppError::from(/* an AuthError::… */).into_response();
           assert_eq!(response.status(), StatusCode::CONFLICT); // e.g. email_already_exists
       }
   }
   ```
3. `apps/api/src/engine/mod.rs` — cover the builder happy path + each `BuildError` arm (weak `JWT_SECRET` rejected by `AuthConfig::validate(Environment::Development)`, store-connect failure, platform repo missing when `platform.enabled`). Use the `testing` doubles where a real backend is not needed.
4. `apps/api/src/repos/*.rs`, `apps/api/src/email/*.rs`, `apps/api/src/hooks/*.rs` — add the `#[cfg(test)]` tests that cover the remaining branches: the `Conflict → auth.email_already_exists` and missing-row → `Ok(None)` repository arms (these may defer the live-Postgres assertion to Task 12.2; here cover the pure mapping with a faked `sqlx::Error`), the email render+send-error arms, and the `AuditAuthHooks` masking assertion (the persisted row contains no token/code/secret).

Constraints:
- #![forbid(unsafe_code)] stays; production code keeps NO unwrap/expect/panic!/todo!/unreachable! — those are allowed ONLY inside `#[cfg(test)]`.
- Exclude only genuinely non-executable code from coverage (`main.rs`, a bootstrap shim) via `--ignore-filename-regex` / `#[cfg_attr(coverage_nightly, coverage(off))]`; never exclude a module to dodge a real branch.
- English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed file; no `.gitkeep`; `git switch -c` only.

Verification:
- `cargo llvm-cov nextest -p api --ignore-filename-regex '(^|/)(main|bootstrap)\.rs$' --fail-under-lines 100 --fail-under-functions 100 --fail-under-regions 100` — expected: passes (no module under 100%).
- `cargo nextest run -p api --profile ci` — expected: all unit tests pass with the capped thread pool.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean (tests included).
- `cargo fmt --all --check` — expected: no diff.
- `find . -name .gitkeep -o -name .keep` — expected: no output.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `1 / 6` and Last updated.
4. Update the P12 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 12.1 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `test(api): unit coverage to 100%` (no Co-Authored-By).
````

---

### Task 12.2 — API integration tests + native client

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Add the axum integration suite that drives the full mounted HTTP surface against the `testing` in-memory doubles **and** a real Postgres/Redis from `docker-compose.test.yml` (`sqlx migrate run` first), plus the native `bymax_auth_client::AuthClient` round-trip against a spawned server.

#### Acceptance criteria

- [ ] `apps/api/tests/integration.rs` boots the example `Router` via `axum_test::TestServer` (or `tower::ServiceExt::oneshot`) and drives register → verify-email → login → refresh → me → logout with correct status codes and the `Retry-After` header on a forced 429.
- [ ] A `testing`-feature variant wires `InMemoryUserRepository` + `InMemoryStores` (using `peek_otp` to read the verification code) so the suite runs with **no** live backend; a `#[cfg(feature = "pg-integration")]` variant runs the same flow against the test-stack Postgres/Redis after `sqlx::migrate!()`.
- [ ] The native `bymax_auth_client::AuthClient` (`register`/`login`/`mfa_challenge`/`me`/`refresh`/`logout`/`forgot_password`/`reset_password`) round-trips against the spawned server, asserting `AuthOutcome::Authenticated` and `AuthOutcome::MfaRequired`.
- [ ] The suite reads delivered email from the Mailpit REST API (`GET /api/v1/messages`), never from the database; the test stack is brought up `--wait` and torn down `-v`.
- [ ] `cargo nextest run -p api --test integration` passes with a capped `--test-threads`; no `.gitkeep` placeholders.

#### Files to create / modify

- `apps/api/tests/integration.rs`
- `apps/api/tests/common/mod.rs` (the `spawn_app` / `mailpit_latest_otp` helpers)
- `apps/api/Cargo.toml` (`[dev-dependencies]`: `axum-test`, `reqwest`; a `pg-integration` feature)

#### Agent prompt

````
You are a senior Rust + TypeScript test engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 12 (Testing & 100% Coverage) — Task 12.2 of 6 (MIDDLE)

PRECONDITIONS
- Phase 5 mounted `bymax_auth_axum::auth_router(engine, AxumAuthConfig)` onto the example `Router` and exposed `apps/api/src/app.rs::build_router(state)`; Phase 1 produced `docker-compose.test.yml` (pg 55432, redis 56379, mailpit 51025/58025) + `DATABASE_URL_TEST`.
- The `bymax-auth-core` `testing` feature exposes `InMemoryUserRepository`, `InMemoryPlatformUserRepository`, `InMemoryStores` (`peek_otp`), `NoOpAuthHooks`, `NoOpEmailProvider`. The native client lives in `bymax-auth-client` (`AuthClient`, `AuthOutcome { Authenticated(Box<AuthResult>), MfaRequired(MfaChallengeResult) }`, `RegisterRequest`, `LoginRequest`).
- `sqlx::migrate!()` reads `apps/api/migrations/` (Phase 4).

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "17. Testing Strategy" (the API-integration row: full HTTP surface against the `testing` doubles AND a real Postgres/Redis with `sqlx migrate` first; the native `AuthClient` round-trip) + § "8. Local Stack & Memory-Safe Run" (the test-stack high ports + the capped pools).
- docs/DEVELOPMENT_PLAN.md § "Phase 12" + Appendix D (the `e2e-api` job: boots `docker-compose.test.yml --wait`, `sqlx migrate run`, runs api e2e, tears down `-v`).
- ../../../rust-auth/crates/bymax-auth-client/src/lib.rs — confirm the `AuthClient` method set + `AuthOutcome`/`RegisterRequest`/`LoginRequest` so the round-trip names them exactly.

TASK
Author the axum integration suite + the native-client round-trip. Provide a no-backend variant (the `testing` in-memory doubles) that always runs, and a `pg-integration` variant against the test stack. Read email from the Mailpit REST API, never the DB. Do NOT add property/KAT tests (Task 12.3) or any web test (Task 12.4).

DELIVERABLES
1. `apps/api/tests/common/mod.rs` — the shared harness:
   ```rust
   //! Integration harness: spawn the example app on an ephemeral port and read
   //! delivered mail from Mailpit's REST API (never from the database).
   use std::net::SocketAddr;

   /// Spawns `app::build_router(state)` on `127.0.0.1:0` with the in-memory
   /// `testing` seams and returns the bound base URL for a reqwest/AuthClient.
   pub async fn spawn_app_in_memory() -> SocketAddr { /* tokio::spawn axum::serve */ }

   /// Fetches the newest OTP delivered to `to` by querying Mailpit
   /// `GET /api/v1/messages` then `/api/v1/message/{id}` and extracting the code.
   pub async fn mailpit_latest_otp(to: &str) -> String { /* reqwest GET … */ }
   ```
2. `apps/api/tests/integration.rs`:
   ```rust
   mod common;
   use common::spawn_app_in_memory;

   /// Register → verify-email → login → refresh → me → logout round-trips with
   /// the documented status codes (protects the dashboard auth pipeline).
   #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
   async fn full_dashboard_auth_lifecycle_over_http() {
       let addr = spawn_app_in_memory().await;
       // POST /auth/register -> 201 ; read OTP via peek_otp/Mailpit ;
       // POST /auth/verify-email -> 204 ; POST /auth/login -> 200 ;
       // POST /auth/refresh -> 200 ; GET /auth/me -> 200 ; POST /auth/logout -> 204.
   }

   /// A throttled login surfaces 429 with a Retry-After header (protects the
   /// rate-limit envelope contract).
   #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
   async fn login_throttle_sets_retry_after() { /* hammer past RateLimitConfig.login */ }

   /// The native bymax-auth-client round-trips against the live server and
   /// returns AuthOutcome::Authenticated then ::MfaRequired (protects row 27).
   #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
   async fn native_auth_client_round_trip() {
       use bymax_auth_client::{AuthClient, AuthOutcome, RegisterRequest, LoginRequest};
       // let client = AuthClient::new(base_url); client.register(RegisterRequest{..}).await ; …
       // assert!(matches!(client.login(LoginRequest{..}).await, Ok(AuthOutcome::Authenticated(_))));
   }
   ```
3. `apps/api/tests/integration.rs` — gate the live-backend flow behind `#[cfg(feature = "pg-integration")]`, calling `sqlx::migrate!("./migrations").run(&pool).await` before the first query and using `DATABASE_URL_TEST` / `REDIS_URL` test-stack values.
4. `apps/api/Cargo.toml` — add `[dev-dependencies]` (`axum-test`, `reqwest` with a TLS-free feature set, `serde_json`) and the `pg-integration` feature; enable the `testing` feature of `bymax-auth-core` under `[dev-dependencies]`.

Constraints:
- unwrap/expect are allowed in `#[cfg(test)]` only; production code stays panic-free.
- Read mail via Mailpit REST (`GET /api/v1/messages`) — never assert against DB rows for delivery.
- Bound test parallelism (`worker_threads = 2`, `--test-threads <= cores/2`); never run both apps' suites at once; never fan out parallel test agents.
- English-only TIMELESS comments — NO Phase/Task/roadmap references; no `.gitkeep`; `git switch -c` only.

Verification:
- `docker compose -f docker-compose.test.yml up --wait` — expected: pg/redis/mailpit healthy on the high ports.
- `cargo nextest run -p api --test integration` — expected: the in-memory flow + native-client round-trip pass.
- `cargo nextest run -p api --test integration --features pg-integration` — expected: the live-backend flow passes after `sqlx migrate`.
- `docker compose -f docker-compose.test.yml down -v` — expected: stack + volumes removed.
- `find . -name .gitkeep -o -name .keep` — expected: no output.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `<n> / 6` and Last updated.
4. Update the P12 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 12.2 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `test(api): integration suite + native client round-trip` (no Co-Authored-By).
````

---

### Task 12.3 — Property / RFC-KAT crypto & JWT edges

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: M
- **Depends on**: —

#### Description

Add the `proptest` + RFC known-answer-test edges, exercised via the example's wiring: TOTP ±2 drift acceptance/rejection, the PHC password round-trip (`hash`/`verify`/`needs_rehash`), HS256 alg-pin rejection, and the refresh-reuse-past-grace revoke (`RotateOutcome::Invalid`).

#### Acceptance criteria

- [ ] A `proptest` case asserts `bymax_auth_crypto::totp::verify(secret, code, t, window=2)` accepts codes generated at `t-2..=t+2` steps and rejects codes outside the window, across arbitrary secrets/times.
- [ ] A PHC round-trip property asserts `password::verify(&hash(pw, params), pw)` is always true, a wrong password is always false, and `needs_rehash` flips when `PasswordParams` strengthen.
- [ ] An HS256 alg-pin test asserts `hs256::verify` rejects a token whose header `alg` is `none` or `RS256` (returns the alg-mismatch `JwtError`), confirming alg pinning before the HMAC check.
- [ ] A refresh-rotation test drives the engine/store so a refresh token replayed past the grace window yields `RotateOutcome::Invalid` and the whole session is revoked (the rotation-reuse defense).
- [ ] A committed `proptest-regressions/` seed file makes any shrunk counterexample reproducible; KAT vectors are RFC-sourced, not implementation-sourced.

#### Files to create / modify

- `apps/api/tests/property.rs`
- `apps/api/proptest-regressions/property.txt`
- `apps/api/Cargo.toml` (`[dev-dependencies]`: `proptest`)

#### Agent prompt

````
You are a senior Rust + TypeScript test engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 12 (Testing & 100% Coverage) — Task 12.3 of 6 (MIDDLE)

PRECONDITIONS
- The crypto/JWT primitives are consumed transitively: `bymax_auth_crypto::totp::{totp, verify}` (TOTP, drift ±2), `bymax_auth_crypto::password::{hash, verify, needs_rehash}` + `PasswordParams`, `bymax_auth_jwt::hs256::{sign, verify, decode_unverified}` + `HsKey` + `VerifyOptions` + `JwtError`. The store value type `bymax_auth_core::traits::store::RotateOutcome { Rotated, Grace, Invalid }` models rotation.
- Add `bymax-auth-crypto` / `bymax-auth-jwt` as explicit `[dev-dependencies]` (or reach them via the already-linked crates) only as needed to name the functions directly.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "17. Testing Strategy" (the API property/KAT row: crypto/JWT edges exercised via the example's wiring — TOTP drift, PHC round-trips, alg-pin rejection).
- docs/DEVELOPMENT_PLAN.md § "Phase 12" (the property edges list) + § "0. Guiding Principles" (the no-panic rule).
- ../../../rust-auth/crates/bymax-auth-crypto/src/totp.rs and .../password.rs and ../../../rust-auth/crates/bymax-auth-jwt/src/hs256.rs — confirm `totp(secret,unix_time,step_secs,digits)->u32`, `verify(secret,code,unix_time,window)->bool`, `hash`/`verify`/`needs_rehash`, and that `hs256::verify` pins `alg` before the HMAC check (the rejection error variant).

REQUIRED RFC VECTORS: RFC 6238 (TOTP) / RFC 4226 (HOTP) test vectors for the KAT assertions; the PHC string format for the password round-trip.

TASK
Author `apps/api/tests/property.rs` with the four edge families, exercised through the real primitives. Seed a committed `proptest-regressions/` file. Do NOT add HTTP integration (Task 12.2) or web tests (Task 12.4).

DELIVERABLES
1. `apps/api/tests/property.rs`:
   ```rust
   use proptest::prelude::*;
   use bymax_auth_crypto::{totp, password::{self, PasswordParams}};
   use bymax_auth_jwt::hs256;

   proptest! {
       /// TOTP verify accepts codes within ±2 steps and rejects those outside
       /// (protects the documented drift window).
       #[test]
       fn totp_accepts_within_drift_window(secret in prop::collection::vec(any::<u8>(), 16..32),
                                           t in (30u64 * (2u64 + 1))..4_000_000_000u64) { // floor = step*(window+1), avoids u64 underflow
           let step = 30; let digits = 6; let window = 2;
           for k in -2i64..=2 {
               let at = (t as i64 + k * step as i64) as u64;
               let code = format!("{:0width$}", totp::totp(&secret, at, step, digits), width = digits as usize);
               prop_assert!(totp::verify(&secret, &code, t, window));
           }
           let far = format!("{:06}", totp::totp(&secret, t + step * 5, step, digits));
           prop_assert!(!totp::verify(&secret, &far, t, window));
       }

       /// hash→verify is always true for the right password and false otherwise;
       /// needs_rehash flips when params strengthen (protects rehash-on-verify).
       #[test]
       fn phc_round_trip(pw in "[ -~]{8,64}") {
           let phc = password::hash(pw.as_bytes(), &PasswordParams::default()).expect("hash");
           prop_assert!(password::verify(pw.as_bytes(), &phc).expect("verify ok"));
           prop_assert!(!password::verify(format!("{pw}x").as_bytes(), &phc).expect("verify err"));
       }
   }

   /// hs256::verify rejects a token whose alg is not HS256 BEFORE the HMAC check
   /// (protects the alg-pinning defense against alg-confusion).
   #[test]
   fn hs256_rejects_non_hs256_alg() {
       // craft a token with header {"alg":"none"} / {"alg":"RS256"} and assert
       // hs256::verify returns the alg-mismatch JwtError, not a signature error.
   }
   ```
2. A rotation test (in `property.rs` or a sibling `#[tokio::test]`) that replays a refresh token past the grace window through the engine/store seam and asserts `RotateOutcome::Invalid` + full-session revocation.
3. `apps/api/proptest-regressions/property.txt` — committed so a shrunk counterexample re-runs deterministically.
4. `apps/api/Cargo.toml` — add `proptest` (and `bymax-auth-crypto`/`bymax-auth-jwt` if naming them directly) under `[dev-dependencies]`.

Constraints:
- KAT values come from the RFCs / PHC spec — never from the implementation's own output.
- unwrap/expect/panic allowed in `#[cfg(test)]` only.
- English-only TIMELESS comments — NO Phase/Task/roadmap references; no `.gitkeep`; `git switch -c` only.

Verification:
- `cargo nextest run -p api --test property` — expected: all property + KAT + rotation cases pass.
- `cargo nextest run -p api --test property` (re-run) — expected: deterministic (the regressions file is honoured).
- `cargo llvm-cov nextest -p api --fail-under-lines 100` — expected: still 100% (the new tests do not regress the gate).
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `find . -name .gitkeep -o -name .keep` — expected: no output.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `<n> / 6` and Last updated.
4. Update the P12 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 12.3 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `test(api): property + RFC-KAT crypto/jwt edges` (no Co-Authored-By).
````

---

### Task 12.4 — Web Vitest unit/component → 100%

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: L
- **Depends on**: —

#### Description

Drive Vitest unit + component coverage to **100%** on `lib/**` + `hooks/**` + `components/**` with `maxWorkers: '50%'` baked into the config, including the `AUTH_ERROR_CODES` localization-exhaustiveness test and the segmented OTP box behaviors (paste / advance / backspace).

#### Acceptance criteria

- [ ] `apps/web/vitest.config.ts` sets `coverage.thresholds` to `100` on lines/functions/branches/statements over `lib/**` + `hooks/**` + `components/**`, `coverage.exclude` for `*.d.ts` / pure type modules, and `test.maxWorkers: '50%'`.
- [ ] An exhaustiveness test imports `AUTH_ERROR_CODES` (the 38-member union) from `@bymax-one/rust-auth/shared` and asserts the localization map produces a non-raw, distinct message for **every** code — a missing entry fails the test.
- [ ] The segmented OTP box component test covers paste-fills-all-cells, type-advances-focus, backspace-retreats, `autocomplete="one-time-code"` + `inputmode="numeric"`, and the on-complete callback.
- [ ] The `/react` hook wrappers (`useAuth`, `useSession`, `useAuthStatus`) and the `lib/` client setup (`createAuthClient`/`createAuthFetch` + severity) are covered with the package mocked; the sessions table and the localization severity map are covered.
- [ ] `pnpm -C apps/web test:cov` reports 100% on all metrics; no `.gitkeep` placeholders.

#### Files to create / modify

- `apps/web/vitest.config.ts`, `apps/web/vitest.setup.ts`
- `apps/web/lib/__tests__/*.test.ts`, `apps/web/hooks/__tests__/*.test.tsx`, `apps/web/components/**/__tests__/*.test.tsx`

#### Agent prompt

````
You are a senior Rust + TypeScript test engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 12 (Testing & 100% Coverage) — Task 12.4 of 6 (MIDDLE)

PRECONDITIONS
- Phases 8–11 built `apps/web` (`lib/`, `hooks/`, `components/{trigger,sessions,mfa,oauth,invitations,audit,controls,ui}`, the public auth pages, the two consoles). Each shipped its own tests; coverage is high but not 100% on all metrics.
- `@bymax-one/rust-auth/shared` exports `AUTH_ERROR_CODES` (a 38-member `auth.*` union) and `AuthClientError`; `/react` exports `AuthProvider`/`useAuth`/`useSession`/`useAuthStatus`; `/client` exports `createAuthClient`/`createAuthFetch`. The package is `file:`-linked and `serverExternalPackages`-externalized.
- Vitest 4 (jsdom) + Testing Library are the unit/component tools (Phase 0/8).

REQUIRED READING (only these — do not load more):
- docs/DASHBOARD.md § "11. Testing the console" (the Unit/Component scope: the OTP box paste/advance/backspace, the countdown, the sessions table, the error-localization map exhaustiveness, the client wiring; `maxWorkers: '50%'` baked in; 100% on lib/** + hooks/** + components/**).
- docs/OVERVIEW.md § "17. Testing Strategy" (the Web-unit row) + § "8" (the memory-safe `maxWorkers` cap + `NODE_OPTIONS`).
- /Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/apps/web/vitest.config.ts — copy-and-adapt the `coverage.thresholds`/`coverage.exclude`/`maxWorkers` shape to this stack.

TASK
Close every web coverage gap to 100% on `lib/**` + `hooks/**` + `components/**`, with the localization-exhaustiveness test and the OTP box behaviors. Bake `maxWorkers: '50%'`. Do NOT write Playwright e2e (Task 12.5) or touch CI workflows (Task 12.6).

DELIVERABLES
1. `apps/web/vitest.config.ts`:
   ```ts
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
     test: {
       environment: 'jsdom',
       setupFiles: ['./vitest.setup.ts'],
       // Cap forks: the file:-linked WASM/TS package reloads into every worker;
       // 50% keeps peak memory bounded (see the memory-safe run recipe).
       maxWorkers: '50%',
       coverage: {
         provider: 'v8',
         include: ['lib/**', 'hooks/**', 'components/**'],
         exclude: ['**/*.d.ts', '**/index.ts', '**/__tests__/**'],
         thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
       },
     },
   });
   ```
2. `apps/web/lib/__tests__/error-localization.test.ts` — the exhaustiveness gate:
   ```ts
   import { describe, expect, it } from 'vitest';
   import { AUTH_ERROR_CODES } from '@bymax-one/rust-auth/shared';
   import { localizeAuthError } from '../error-localization';

   describe('error localization', () => {
     // A missing map entry would surface a raw `auth.*` code to a user — assert
     // every one of the 38 wire-visible codes resolves to a real message.
     it('localizes every AUTH_ERROR_CODES member', () => {
       const messages = new Set<string>();
       for (const code of AUTH_ERROR_CODES) {
         const message = localizeAuthError(code);
         expect(message, `missing localization for ${code}`).toBeTruthy();
         expect(message).not.toBe(code); // never show the raw code
         messages.add(message);
       }
       expect(messages.size).toBe(AUTH_ERROR_CODES.length); // distinct messages
     });
   });
   ```
3. `apps/web/components/**/__tests__/otp-box.test.tsx` — cover paste-fills-all-cells, type-advances-focus, backspace-retreats, `autocomplete="one-time-code"` + `inputmode="numeric"`, and the on-complete callback (via `@testing-library/user-event`).
4. Tests for the `/react` hook wrappers (`useAuth`/`useSession`/`useAuthStatus`, package mocked), the `lib/` client setup (`createAuthClient`/`createAuthFetch` + the severity map), the sessions table, and the countdown — enough to reach 100% on the three globs.

Constraints:
- Zero `any`, zero suppression comments (`@ts-ignore`, `eslint-disable`); strict TS.
- Mock `@bymax-one/rust-auth` subpaths in unit tests — do NOT hit a real backend (that is Playwright's job in Task 12.5).
- `maxWorkers: '50%'` + run with `NODE_OPTIONS=--max-old-space-size=4096`; never run web + api suites concurrently; never fan out parallel test agents.
- English-only TIMELESS comments — NO Phase/Task/roadmap references; no `.gitkeep`; `git switch -c` only.

Verification:
- `pnpm -C apps/web test:cov` — expected: 100% lines/functions/branches/statements on lib/** + hooks/** + components/**.
- `pnpm -C apps/web typecheck` — expected: 0 errors.
- `pnpm -C apps/web lint` — expected: 0 warnings.
- `node -e "import('@bymax-one/rust-auth/shared').then(m => process.exit(m.AUTH_ERROR_CODES.length === 38 ? 0 : 1))"` — expected: exit 0 (the union is 38).
- `find . -name .gitkeep -o -name .keep` — expected: no output.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `<n> / 6` and Last updated.
4. Update the P12 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 12.4 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `test(web): vitest unit/component to 100%` (no Co-Authored-By).
````

---

### Task 12.5 — Playwright live journeys

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: M
- **Depends on**: 12.2, 12.4

#### Description

Add the Playwright e2e specs for the numbered journeys against a live stack: register → Mailpit → verify → login → MFA, the reset wizard, sessions revoke, OAuth (mocked Google), the edge-protection bounce, and the platform-isolation journey.

#### Acceptance criteria

- [ ] `apps/web/playwright.config.ts` defines a `webServer` (or assumes the running stack), a single capped worker count, and trace-on-first-retry; the spec suite lives under `apps/web/e2e/`.
- [ ] `register-verify-login-mfa.spec.ts` registers a user, reads the OTP from the Mailpit REST API (`GET /api/v1/messages`), verifies, logs in, enrolls TOTP (generating the code from the rendered secret), and lands authenticated.
- [ ] Specs cover the reset wizard (forgot → OTP from Mailpit → reset), sessions revoke ("log out everywhere else"), OAuth with **mocked** Google (Playwright `page.route` interception), the WASM edge-protection bounce (an expired/forged cookie redirects to `/auth/login` without a backend round-trip), and platform isolation (a dashboard session cannot enter `/platform/*`).
- [ ] `npx playwright test` passes against the live dev stack; traces upload on failure (CI wiring is Task 12.6).
- [ ] No real Google credentials are required; no `.gitkeep` placeholders.

#### Files to create / modify

- `apps/web/playwright.config.ts`
- `apps/web/e2e/{register-verify-login-mfa,reset-wizard,sessions-revoke,oauth-google-mocked,edge-protection,platform-isolation}.spec.ts`
- `apps/web/e2e/helpers/mailpit.ts`

#### Agent prompt

````
You are a senior Rust + TypeScript test engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 12 (Testing & 100% Coverage) — Task 12.5 of 6 (MIDDLE)

PRECONDITIONS
- Task 12.2 proved the API HTTP surface end-to-end; Task 12.4 brought web unit/component coverage to 100%. The public auth pages (Phase 9) and the two consoles (Phases 10–11) exist and run against the live stack.
- `pnpm infra:up` brings up Postgres + Redis + Mailpit (Mailpit UI :8025, SMTP :1025); `apps/api` listens on :4000, `apps/web` on :3000. The Next.js middleware edge-verifies the session cookie via `verifyJwtToken` (WASM).
- Mailpit exposes a REST API: `GET /api/v1/messages` (list) + `GET /api/v1/message/{id}` (body) to extract the OTP — never read the database.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "16. Demonstrated Journeys" — the numbered journeys (1 first-verified-login, 2 login-with-MFA, 7 reset wizard, 11 sessions device manager, 8 OAuth, 13 edge route protection, 14 platform domain isolation) — the exact step sequence each spec must follow.
- docs/DASHBOARD.md § "11. Testing the console" (the E2E row: register → Mailpit → verify → login → MFA; reset wizard; sessions revoke; OAuth mocked Google; edge-protection bounce; platform login isolation).
- /Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/apps/web/e2e — copy-and-adapt the spec structure, the Mailpit OTP helper, and the `page.route` Google mock to this stack's routes/selectors.

TASK
Author the Playwright config + the journey specs against the live stack, reading OTPs from Mailpit and mocking Google via route interception. Do NOT wire CI (Task 12.6) — only the local-runnable specs + config.

DELIVERABLES
1. `apps/web/playwright.config.ts`:
   ```ts
   import { defineConfig } from '@playwright/test';

   export default defineConfig({
     testDir: './e2e',
     // Bound parallelism for memory safety on the path/file:-linked stack.
     workers: process.env.CI ? 1 : 2,
     retries: process.env.CI ? 2 : 0,
     use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
     // Assumes `pnpm infra:up` + both dev servers are already running; CI starts them.
   });
   ```
2. `apps/web/e2e/helpers/mailpit.ts`:
   ```ts
   /** Fetches the newest OTP delivered to `to` via the Mailpit REST API. */
   export async function latestOtp(to: string): Promise<string> {
     const list = await fetch('http://localhost:8025/api/v1/messages').then((r) => r.json());
     const id = list.messages.find((m: { To: { Address: string }[] }) =>
       m.To.some((a) => a.Address === to))?.ID;
     const body = await fetch(`http://localhost:8025/api/v1/message/${id}`).then((r) => r.json());
     return (body.Text.match(/\b(\d{6})\b/) ?? [])[1];
   }
   ```
3. `apps/web/e2e/register-verify-login-mfa.spec.ts`:
   ```ts
   import { test, expect } from '@playwright/test';
   import { latestOtp } from './helpers/mailpit';

   // Journey 1+2: a fresh user registers, verifies via the Mailpit OTP, logs in,
   // enrolls TOTP, and lands authenticated (protects the headline auth journey).
   test('register → verify → login → enroll MFA → authenticated', async ({ page }) => {
     const email = `e2e+${Date.now()}@auth.local`;
     await page.goto('/auth/register'); /* fill + submit */
     const code = await latestOtp(email);
     await page.goto('/auth/verify-email'); /* enter code → 204 */
     await page.goto('/auth/login'); /* login → lands authenticated */
     await expect(page.getByTestId('session-badge')).toBeVisible();
   });
   ```
4. The remaining specs: `reset-wizard.spec.ts` (forgot → Mailpit OTP → reset), `sessions-revoke.spec.ts` ("log out everywhere else"), `oauth-google-mocked.spec.ts` (`page.route('**/oauth/google/**', …)` returning a canned profile), `edge-protection.spec.ts` (a forged/expired cookie on `/dashboard/*` redirects to `/auth/login` with no backend hit), `platform-isolation.spec.ts` (a dashboard session is rejected from `/platform/*`).

Constraints:
- Read OTPs from Mailpit REST — never from the database; mock Google via `page.route` — never require real OAuth credentials.
- `workers` bounded (≤ 2 local, 1 in CI); never run web + api suites concurrently; never fan out parallel test agents.
- Zero `any` in helpers; English-only TIMELESS comments — NO Phase/Task/roadmap references; no `.gitkeep`; `git switch -c` only.

Verification:
- `pnpm infra:up` — expected: Postgres/Redis/Mailpit healthy.
- `npx playwright test` (with both dev servers running) — expected: every journey spec passes.
- `npx playwright test edge-protection` — expected: the middleware bounce passes (redirect without a `/auth/me` round-trip).
- `find . -name .gitkeep -o -name .keep` — expected: no output.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `<n> / 6` and Last updated.
4. Update the P12 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 12.5 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `test(web): playwright e2e journeys` (no Co-Authored-By).
````

---

### Task 12.6 — CI coverage jobs green @ 100% gate

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: M
- **Depends on**: 12.1, 12.4

#### Description

Wire the `ci.yml` `unit` / `e2e-api` / `e2e-web` / `coverage-report` jobs to the 100% gate with the coverage-scope exclusions so both workspaces report 100% in CI. This is the LAST task — it also runs the per-phase closeout.

#### Acceptance criteria

- [ ] The `ci.yml` `unit` job runs `cargo llvm-cov nextest -p api --fail-under-lines/functions/regions 100` (with the `--ignore-filename-regex` exclusions) and `pnpm -C apps/web test:cov` (Vitest `thresholds: 100`), uploading `coverage-unit-api` / `coverage-unit-web`.
- [ ] The `e2e-api` job boots `docker-compose.test.yml --wait`, runs `sqlx migrate run`, executes the api integration suite (incl. `--features pg-integration`), and tears down `-v`.
- [ ] The `e2e-web` job (`needs: e2e-api`) runs Playwright against service containers and uploads `playwright-traces` on failure.
- [ ] The `coverage-report` job (`if: always()`) downloads both coverage artifacts and uploads `coverage-combined`; the 100% gate fails the build when either workspace drops below 100%.
- [ ] Memory safety is baked in (capped `--test-threads`, Vitest `maxWorkers: '50%'`, each workspace's coverage a separate sequential step); job names match Appendix D exactly; no `.gitkeep`.
- [ ] Per-phase closeout performed (see Completion Protocol): P12 flipped to ✅ / 6 of 6, Active phase advanced to P13, Overall progress recomputed.

#### Files to create / modify

- `.github/workflows/ci.yml` (the `unit` / `e2e-api` / `e2e-web` / `coverage-report` jobs)
- `apps/web/package.json` (the `test:cov` script, if not already present)

#### Agent prompt

````
You are a senior Rust + TypeScript test engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 12 (Testing & 100% Coverage) — Task 12.6 of 6 (LAST)

PRECONDITIONS
- Tasks 12.1–12.5 are done: `cargo llvm-cov nextest -p api` hits 100% locally; the api integration + property suites pass; `pnpm -C apps/web test:cov` hits 100%; the Playwright journeys pass against the live stack.
- Phase 0 scaffolded `.github/workflows/ci.yml` with skeleton jobs (`build-library`, `install`, `format`, `lint`, `typecheck`, `msrv`, `unit`, `e2e-api`, `e2e-web`, `export-usage-check`, `supply-chain`, `coverage-report`). The job NAMES are contractual (branch protection references them) — do not rename.
- `docker-compose.test.yml` uses high ports (pg 55432, redis 56379, mailpit 51025/58025); `DATABASE_URL_TEST` is the test DSN.

REQUIRED READING (only these — do not load more):
- docs/DEVELOPMENT_PLAN.md § "Phase 12" + Appendix C (the Unit-coverage/E2E gates + the Coverage-scope exclusions note: main.rs/generated glue/pure type modules/*.d.ts excluded) + Appendix D (the `unit`/`e2e-api`/`e2e-web`/`coverage-report` job definitions + the memory-safe "each workspace's coverage a separate step").
- docs/OVERVIEW.md § "17. Testing Strategy" (the CI-gates paragraph: the npm package built first so the file: link resolves; a placeholder DATABASE_URL lets the build run without a DB).
- /Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/.github/workflows/ci.yml — copy-and-adapt the `cargo llvm-cov` + `Swatinem/rust-cache` + `nextest` job shape (the Rust-stack reference for the coverage gate).

TASK
Wire the four coverage jobs to the 100% gate with the scope exclusions and memory-safe caps, keeping the contractual job names. Then run the per-phase closeout. Do NOT touch mutation workflows (Phase 13) or any product docs (Phase 14).

DELIVERABLES
1. `.github/workflows/ci.yml` — the `unit` job (both workspaces, sequential steps, gate enforced):
   ```yaml
   unit:
     needs: build-library
     runs-on: ubuntu-latest
     timeout-minutes: 25
     permissions:
       contents: read
     env:
       DATABASE_URL: postgres://postgres:postgres@localhost:5432/placeholder
       NODE_OPTIONS: --max-old-space-size=4096
     steps:
       - uses: actions/checkout@v5
       # Rust coverage — bounded threads; non-executable glue excluded from scope.
       - run: cargo llvm-cov nextest -p api
              --ignore-filename-regex '(^|/)(main|bootstrap)\.rs$'
              --fail-under-lines 100 --fail-under-functions 100 --fail-under-regions 100
              --lcov --output-path lcov-api.info -- --test-threads 4
       - uses: actions/upload-artifact@v4
         with: { name: coverage-unit-api, path: lcov-api.info }
       # Web coverage — Vitest thresholds:100, maxWorkers:50% from the config.
       - run: pnpm -C apps/web test:cov
       - uses: actions/upload-artifact@v4
         with: { name: coverage-unit-web, path: apps/web/coverage/lcov.info }
   ```
2. `.github/workflows/ci.yml` — the `e2e-api` job: boot `docker compose -f docker-compose.test.yml up --wait`, `sqlx migrate run` (against `DATABASE_URL_TEST`), `cargo nextest run -p api --test integration --features pg-integration -- --test-threads 4`, then `docker compose -f docker-compose.test.yml down -v` (always).
3. `.github/workflows/ci.yml` — the `e2e-web` job (`needs: e2e-api`): Postgres/Redis/Mailpit service containers, `npx playwright test --workers=1`, `actions/upload-artifact@v4` `playwright-traces` `if: failure()`.
4. `.github/workflows/ci.yml` — the `coverage-report` job (`if: always()`, `needs: [unit, e2e-api, e2e-web]`): download `coverage-unit-api` + `coverage-unit-web`, merge, upload `coverage-combined`; fail if either workspace is below 100%.
5. `apps/web/package.json` — `"test:cov": "vitest run --coverage"` if not already present.

Constraints:
- Keep the contractual job names (`unit`, `e2e-api`, `e2e-web`, `coverage-report`) — branch protection references them.
- Bake memory safety: capped `--test-threads`, Vitest `maxWorkers: '50%'`, each workspace's coverage a separate sequential step; never run both apps' coverage in one parallel step.
- Least-privilege `permissions`, `timeout-minutes`, pinned actions on every job.
- English-only TIMELESS comments — NO Phase/Task/roadmap references in the workflow; no `.gitkeep`; `git switch -c` only.

Verification:
- `yamllint .github/workflows/ci.yml` — expected: valid.
- `cargo llvm-cov nextest -p api --fail-under-lines 100 --fail-under-functions 100 --fail-under-regions 100` — expected: passes (the gate the `unit` job runs).
- `pnpm -C apps/web test:cov` — expected: Vitest reports 100% (thresholds enforced).
- `gh run watch` (or the PR Checks tab) — expected: `unit` + `e2e-api` + `e2e-web` + `coverage-report` all green.
- `grep -riE "phase [0-9]|task [0-9]" .github/workflows/ci.yml` — expected: no matches.
- `find . -name .gitkeep -o -name .keep` — expected: no output.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `6 / 6` and Last updated.
4. Update the P12 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 12.6 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `ci(coverage): wire 100% coverage gate jobs` (no Co-Authored-By).
(The LAST task also runs the PER-PHASE protocol: confirm all six tasks are ✅ and the DoD is met with CI green on the merged PR; in docs/DEVELOPMENT_PLAN.md set the P12 Status to ✅, Progress 6 / 6, Last updated, advance the Active phase to P13, and recompute Overall progress; set this file's header Status to ✅; commit `docs(plan): P12 complete`. If any DoD bullet is unmet, use 🟡 Partial instead of ✅.)
````

---

## Phase Completion Protocol

Run this closeout when the LAST task (12.6) is ✅:

1. Confirm every task (12.1–12.6) is ✅ and each Phase-12 Definition-of-Done bullet in [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P12 is observably met: `cargo llvm-cov nextest -p api` reports 100% on all metrics; `pnpm -C apps/web test:cov` reports 100% on all metrics; the Playwright journeys pass against the live stack; CI `unit` + `e2e-api` + `e2e-web` + `coverage-report` are green; every test names its scenario and the rule it protects.
2. Confirm the PR is merged to `main` and CI is fully green (no skipped required check).
3. In `docs/DEVELOPMENT_PLAN.md`: set the P12 **Status** to ✅, **Progress** to `6 / 6`, refresh **Last updated**, advance the **Active phase** to P13, and recompute **Overall progress** (phases and tasks).
4. In this file's header, set **Status** to ✅ and refresh **Last updated**.
5. Commit `docs(plan): P12 complete` (no `Co-Authored-By`).
6. If any DoD bullet is unmet or a required check is red, mark P12 **🟡 Partial** (never ✅) and record the gap.

---

## Completion log

> Append-only. One line per completed task: `- <id> ✅ YYYY-MM-DD — <summary>`.

_(empty — no tasks completed yet)_
