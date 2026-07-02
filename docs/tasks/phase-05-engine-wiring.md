# Phase 5 — Engine Wiring, Email & Audit

> **Status**: 🔄 In Progress · **Progress**: 5 / 7 tasks · **Last updated**: 2026-07-02
> **Source roadmap**: [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P5
> **Source spec**: [`docs/OVERVIEW.md`](../OVERVIEW.md)
> **Executing a task?** Read **only** that task's `### Task N.n` block + its bounded *REQUIRED READING* — never the whole file. See [token economy](README.md#token-economy--executing-a-single-task).

---

## Context

Phase 4 delivered the persistence boundary: the Postgres migrations (`users`, `platform_users`, `tenants`, `invitations`, `audit_log`), the offline `.sqlx/` query cache, a `SqlxUserRepository` implementing all 11 `UserRepository` methods, a `SqlxPlatformUserRepository` implementing all 6 `PlatformUserRepository` methods (`Conflict → auth.email_already_exists`, missing row → `Ok(None)`), and the demo seed (`acme`/`globex` tenants + a platform admin). Phase 3 already booted the axum service — `main.rs` + `app.rs` compose a `Router` + `AppState`, a typed `AppError` wraps the library `AuthRejection`, the `PgPool` and `Arc<RedisStores>` resolve, and `tracing` is installed. What is missing is the `AuthEngine` itself and the HTTP auth surface: today nothing calls the repositories the library expects.

This phase wires the engine and lights up the core auth surface. It picks an `AuthConfig` profile and `validate`s it fail-fast (5.1), assembles `AuthEngine::builder()` with real seams — the two sqlx repositories, the one `Arc<RedisStores>` store handle, the example `EmailProvider`, and the audit `AuthHooks` — storing it as `Arc<AuthEngine>` in `AppState` (5.2). It supplies a production-shaped email transport: a `lettre` SMTP provider that renders the 7 transactional templates and delivers to Mailpit (5.3), plus an opt-in `reqwest`/Resend provider and the `resolve_email_provider` selector (5.4). It writes an `AuditAuthHooks` impl that records every lifecycle hook to the `audit_log` table without ever persisting a token/code/secret (5.5). It mounts `bymax_auth_axum::auth_router(engine, AxumAuthConfig{…})` merged onto the example `Router` (5.6). It then adds the example-owned audit read-API (keyset `GET /audit/logs` + SSE `GET /audit/stream`) and the diagnostics endpoints (5.7).

When P5 is done, the engine builds via `AuthEngine::builder()`; the mounted `/auth/*` surface answers `register`/`login`/`logout`/`refresh`/`me` + `verify-email` + the password-reset wizard over HTTP with the correct status codes and a `Retry-After` header on `429`; a programmatic `register → verify-email → login` renders and delivers the verification OTP to Mailpit and writes **masked** audit rows (no token/code) to Postgres; `GET /audit/{logs,stream}` and `POST /diagnostics/{hash-strength,force-lockout}` + `GET /diagnostics/hooks` surface the server-only primitives; and `cargo nextest run -p api` is green at 100% coverage. **OAuth (the TLS `HttpClient` + the `on_oauth_login` Create/Link policy), team invitations, the platform-admin journey + WebSocket, and any web UI are explicitly out of P5 — they land in P6, P7, and P8+ respectively; this phase only enables the `sessions` + `mfa` controller groups and the engine's platform service, not the OAuth/invitations/platform route groups.**

---

## Rules-of-phase

1. **One `Arc<RedisStores>` handle wires every store seam.** Construct it once with `RedisStores::connect(url, namespace)` (a lazy pool — no I/O at construct) and pass it to `.redis_stores(stores)`; never hand-implement an individual store trait.
2. **Pass every DI-dependent seam as an `Arc`.** `.user_repository(Arc::new(…))`, `.platform_user_repository(Arc::new(…))`, `.email_provider(…)` (already an `Arc`), `.hooks(Arc::new(…))` — the builder takes `Arc<dyn _>` for each.
3. **The audit log never persists a token, code, or secret.** Hooks receive a `SafeAuthUser` (never `AuthUser`) + a `HookContext`; store only the event name, actor id/email, tenant, IP, and user-agent. A regression test asserts the emitted `audit_log` rows never contain the emailed OTP/token string.
4. **Anti-enumeration paths always succeed.** `resend-verification`, `forgot-password`, and `resend-otp` return `204`/`200` whether or not the account exists — the example surface must not branch observably on account existence.
5. **No secrets in logs or errors.** `AppError::Internal` maps to an opaque `500`; never log a password, OTP, token, or MFA secret; honour the library's redacting `Debug` impls. The lettre/Resend providers must not echo the OTP/token into a `tracing` span.
6. **Fail-fast config.** `AuthConfig::validate(Environment)` runs before the builder and aborts on a weak/low-entropy `JWT_SECRET` or an empty role hierarchy; the engine is never constructed from an invalid config.
7. **Doubly-gated route groups.** A route group mounts only when its Cargo feature *and* its runtime `ControllerToggles` flag are both on. P5 enables `sessions` + `mfa`; `oauth`/`invitations`/`platform` stay off — note that setting `platform.enabled = true` would auto-promote the platform controller group in `build()`, so platform is deferred to P7.
8. **Timeless, English-only comments.** No `Phase N` / `Task N` / roadmap references in any committed source or config file; explain *what*/*why*, never *which roadmap stage*. `#![forbid(unsafe_code)]`, no `unwrap`/`expect`/`panic!`/`todo!`/`unreachable!` in non-test code, typed `thiserror` errors.
9. **Memory-safe tests.** Run `cargo nextest run -p api` with bounded `--test-threads`; integration tests `sqlx migrate run` against the test stack first; never fan out parallel test agents.
10. **`git switch -c` only** (never `git checkout -b`); Conventional Commits with **no `Co-Authored-By` trailer**.

---

## Reference docs

- [`docs/OVERVIEW.md`](../OVERVIEW.md) § 9 "Configuration & Environment" (the env table + the **Canonical wiring** code block — the single source of truth for the builder shape), § 11 "The Authentication Pipelines (Deep Dive)", § 12 "Identity Domains & Extension Points" (the extension-seam table), § 15 "Auth Event Tracking & the Audit Domain" (the hook list, the read-API contract, the never-contains-secrets proof).
- [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § "Phase 5", § 2 "Global Conventions", § 3 "Autonomous Execution Model", Appendix A (Environment Variable Registry), Appendix B (Library Export → Phase Coverage Map).
- [`docs/DASHBOARD.md`](../DASHBOARD.md) § 7 "Page-by-page spec" (the Audit page + Account/Diagnostics surfaces the read-API backs) and § 8 "Real-time — the SSE audit tail" (the `Last-Event-ID` resume contract).
- Sibling library sources to copy-and-adapt (consumed by `path`): `../../../rust-auth/crates/bymax-auth-core/src/traits/email.rs` (the `EmailProvider` trait + `SessionInfo`/`InviteData`), `.../src/traits/hooks.rs` (the `AuthHooks` 14 methods + `HookContext`), `.../src/config/profiles.rs` + `.../src/config/validate.rs` (the `AuthConfig` profiles + `validate`), `../../../rust-auth/crates/bymax-auth-axum/src/router.rs` + `.../src/rate_limit.rs` + `.../src/state.rs` (`auth_router`/`AuthRouter`/`AxumAuthConfig`/`RateLimitConfig`).
- The cross-runtime twin `../../../nest-auth-example/` (an illustrative peer, not a dependency) — its email-provider and audit-hook adapters show the same contract on NestJS; mirror the shape, not the code.
- /bymax-workflow:standards — universal coding rules (apply the Rust track).

---

## Task index

| ID | Task | Status | Priority | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| 5.1 | AuthConfig profile + validate | ✅ Done | P0 | M | — |
| 5.2 | `AuthEngine::builder()` wiring | ✅ Done | P0 | L | 5.1 |
| 5.3 | lettre `EmailProvider` → Mailpit | ✅ Done | P0 | M | — |
| 5.4 | Resend provider + resolution + templates | ✅ Done | P1 | M | 5.3 |
| 5.5 | `AuditAuthHooks` + `audit_log` write | ✅ Done | P0 | M | 5.2 |
| 5.6 | `auth_router` mount | 📋 ToDo | P0 | M | 5.2 |
| 5.7 | audit read-API + diagnostics | 📋 ToDo | P1 | M | 5.5, 5.6 |

---

## Tasks

### Task 5.1 — AuthConfig profile + validate

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Build the example's `AuthConfig` from the validated `Settings`: pick a profile (`nest_compat_defaults`, or `secure_defaults` under `argon2`), set `jwt.secret`/`platform.enabled`/the `ControllerToggles`, then `validate(Environment)` fail-fast.

#### Acceptance criteria

- [x] `build_auth_config(settings, environment) -> Result<AuthConfig, ConfigError>` exists in `apps/api/src/engine/config.rs`.
- [x] It selects `AuthConfig::nest_compat_defaults()` by default and `AuthConfig::secure_defaults()` under the `argon2` feature.
- [x] It sets `config.jwt.secret`, `config.platform.enabled = false` (platform is deferred — setting it `true` would auto-promote the platform controller group in `build()`), and `ControllerToggles { sessions: true, mfa: true, ..config.controllers }`, so P5 enables only `sessions` + `mfa`; `oauth`/`invitations`/`platform` stay off.
- [x] It calls `config.validate(environment)?` so a `JWT_SECRET` shorter than 64 chars / low-entropy or an empty role hierarchy returns a `ConfigError` (covered by a unit test).
- [x] `cargo nextest run -p api engine::config` passes; `src/engine/config.rs` is 100% covered; clippy is clean; no phase/task strings in the file.

#### Files to create / modify

- `apps/api/src/engine/config.rs` (new)
- `apps/api/src/engine/mod.rs` (declare `pub mod config;`)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 5 (Engine Wiring, Email & Audit) — Task 5.1 of 7 (FIRST)

PRECONDITIONS
- P3 produced apps/api/src/{main.rs,app.rs} with AppState, a typed AppError, the PgPool + Arc<RedisStores> handles, and tracing.
- P4 produced SqlxUserRepository (11 methods) + SqlxPlatformUserRepository (6 methods) and the migrations incl. audit_log.
- apps/api/src/config/ exposes a validated `Settings` struct (figment) with at least: jwt_secret, redis_url, redis_namespace, smtp_host, smtp_port, smtp_from, resend_api_key: Option<String>.
- The path deps on bymax-auth-{axum,core,redis} are present with feature `full`.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "Configuration & Environment" — the env table + the "Canonical wiring" code block (the AuthConfig profile + validate shape).
- docs/DEVELOPMENT_PLAN.md § "Phase 5" and Appendix A (Environment Variable Registry — the JWT_SECRET ≥ 64 / entropy guard).
- ../../../rust-auth/crates/bymax-auth-core/src/config/profiles.rs and .../config/validate.rs — the real `AuthConfig`, `nest_compat_defaults`/`secure_defaults`, `ControllerToggles`, `Environment`, and `validate(Environment) -> Result<bool, ConfigError>` signatures.

TASK
Author `build_auth_config`: assemble the example's `AuthConfig` from `Settings`, set the example's toggles, and fail-fast via `validate`. No engine construction here (that is the next task).

DELIVERABLES
1. `apps/api/src/engine/config.rs`:
   - The builder function with rustdoc; the `#[cfg(feature = "argon2")]` profile split; the controller toggles; the fail-fast validate.
   ```rust
   //! Builds the example's `AuthConfig` profile from validated settings.
   use bymax_auth_core::{AuthConfig, ConfigError};
   use bymax_auth_core::config::{ControllerToggles, Environment};

   use crate::config::Settings;

   /// Assembles the example's [`AuthConfig`] from validated [`Settings`] and
   /// rejects it fail-fast for the target [`Environment`].
   ///
   /// Picks the `nest_compat_defaults` profile (or `secure_defaults` under the
   /// `argon2` feature), injects the HS256 secret, and enables the `sessions`
   /// + `mfa` controller groups.
   /// The `oauth`/`invitations`/`platform` route groups stay off until their
   /// seams are wired.
   pub fn build_auth_config(
       settings: &Settings,
       environment: Environment,
   ) -> Result<AuthConfig, ConfigError> {
       #[cfg(not(feature = "argon2"))]
       let mut config = AuthConfig::nest_compat_defaults();
       #[cfg(feature = "argon2")]
       let mut config = AuthConfig::secure_defaults();

       config.jwt.secret = secrecy::SecretString::from(settings.jwt_secret.clone());
       config.platform.enabled = false; // the platform admin domain is wired separately, once its repository + routes are added
       config.controllers = ControllerToggles {
           sessions: true,
           mfa: true,
           ..config.controllers
       };

       // Fail-fast: rejects a weak/low-entropy secret or an empty role hierarchy.
       config.validate(environment)?;
       Ok(config)
   }
   ```
2. `apps/api/src/engine/mod.rs`: add `pub mod config;` (create the module file if P3 left `engine` absent).
3. Tests (in a `#[cfg(test)] mod tests`): (a) a valid dev `Settings` fixture yields `Ok`; (b) a `JWT_SECRET` of < 64 chars yields `Err(ConfigError::JwtSecretTooShort)` (or the low-entropy variant) — assert the variant, not just `is_err()`.

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed thiserror/ConfigError errors; English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config file; no .gitkeep; git switch -c only.
- Do not construct the engine, repositories, stores, or providers here.
- Confirm the exact import paths against the sibling crate (`cargo public-api` / the P4 repository module) — adjust if `ControllerToggles`/`Environment` live at a different path.
- `JwtConfig::secret` is a `secrecy::SecretString`: wrap the `String` from `Settings` with `secrecy::SecretString::from(...)` (add `use secrecy::SecretString;`). Add a `secrecy` dependency to `apps/api/Cargo.toml`, pinned to the version the library uses.

Verification:
- `cargo build --locked` — expected: builds.
- `cargo nextest run -p api engine::config` — expected: both tests pass (valid → Ok, weak secret → the expected ConfigError variant).
- `cargo llvm-cov nextest -p api --lcov --output-path /tmp/p5-1.info` — expected: `src/engine/config.rs` 100%.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `grep -riE "phase [0-9]|task [0-9]" apps/api/src/engine/config.rs` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `1 / 7` and Last updated.
4. Update the P5 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 5.1 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(engine): build and validate the AuthConfig profile` (no Co-Authored-By).
````

---

### Task 5.2 — `AuthEngine::builder()` wiring

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: L
- **Depends on**: 5.1

#### Description

Assemble the production-shaped `AuthEngine` via `AuthEngine::builder()` — config, environment, both sqlx repositories, the one `Arc<RedisStores>`, the example `EmailProvider`, and the audit hooks — and store it as `Arc<AuthEngine>` in `AppState`.

#### Acceptance criteria

- [x] `build_engine(settings, pool, environment) -> Result<AuthEngine, EngineError>` exists in `apps/api/src/engine/mod.rs`.
- [x] It calls `build_auth_config` (5.1), constructs `Arc::new(RedisStores::connect(&settings.redis_url, settings.redis_namespace.clone())?)`, and chains `.config().environment().user_repository().redis_stores().email_provider().hooks().build()` (the `platform_user_repository` seam is deferred until `platform.enabled` flips true in P7).
- [x] A typed `EngineError` (`thiserror`) wraps `ConfigError`, `RedisStoreError`, and `EmailError`.
- [x] `AppState` holds an `Arc<AuthEngine>` reachable by the example's own routes; `main.rs` builds the engine at startup and aborts with the precise `EngineError` message on failure.
- [x] `cargo nextest run -p api engine` passes (a smoke test builds the engine from a lazy `PgPool` + dev `Settings`, no live backends needed); `cargo +1.90 check` builds; coverage 100%; clippy clean.

#### Files to create / modify

- `apps/api/src/engine/mod.rs`
- `apps/api/src/app.rs` (add `Arc<AuthEngine>` to `AppState`; build at startup)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 5 (Engine Wiring, Email & Audit) — Task 5.2 of 7 (MIDDLE)

PRECONDITIONS
- 5.1 is ✅: `build_auth_config(settings, environment) -> Result<AuthConfig, ConfigError>` exists in apps/api/src/engine/config.rs.
- P4 is ✅: `SqlxUserRepository::new(pool)` (impl UserRepository, 11 methods) + `SqlxPlatformUserRepository::new(pool)` (impl PlatformUserRepository, 6 methods) exist (e.g. crate::repository::*).
- The email seam (`resolve_email_provider`, tasks 5.3/5.4) and the audit hooks (`AuditAuthHooks`, task 5.5) may not be merged yet — provide the wiring against their signatures; if absent, use `bymax_auth_core::traits::NoOpEmailProvider` / `bymax_auth_core::traits::NoOpAuthHooks` (in the default feature set, NOT gated) as a temporary placeholder behind a TODO-free comment, and the dependent task swaps in the real seam.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "Configuration & Environment" — the "Canonical wiring" code block (`build_engine` shape, the one-handle `redis_stores`, the REQUIRED seams).
- docs/OVERVIEW.md § "Identity Domains & Extension Points" — the extension-seam table (which seams are required).
- ../../../rust-auth/crates/bymax-auth-core/src/engine/builder.rs (or the engine module) — the real `AuthEngineBuilder` method set and `AuthEngine::builder()` entry; note `.build() -> Result<AuthEngine, ConfigError>`.
- ../../../rust-auth/crates/bymax-auth-redis/src/pool.rs — `RedisStores::connect(url, namespace) -> Result<Self, RedisStoreError>` (lazy pool) and `RedisStoreError`.

TASK
Author `build_engine`, define `EngineError`, and store the resulting `Arc<AuthEngine>` in `AppState`. The engine is built once at startup.

DELIVERABLES
1. `apps/api/src/engine/mod.rs`:
   ```rust
   //! Assembles the fully-wired `AuthEngine` and exposes it for `AppState`.
   pub mod config;

   use std::sync::Arc;

   use bymax_auth_core::AuthEngine;
   use bymax_auth_core::config::Environment;
   use bymax_auth_redis::{RedisStoreError, RedisStores};
   use sqlx::PgPool;

   use crate::config::Settings;
   use crate::email::resolve_email_provider;
   use crate::engine::config::build_auth_config;
   use crate::hooks::AuditAuthHooks;
   use crate::repository::SqlxUserRepository;

   /// Failure assembling the engine from settings.
   #[derive(Debug, thiserror::Error)]
   pub enum EngineError {
       /// The `AuthConfig` was rejected for the target environment.
       #[error("auth configuration rejected: {0}")]
       Config(#[from] bymax_auth_core::ConfigError),
       /// The Redis store handle could not be constructed.
       #[error("redis store construction failed: {0}")]
       RedisStore(#[from] RedisStoreError),
   }

   /// Builds the production-shaped `AuthEngine`: real sqlx repositories, one
   /// `Arc<RedisStores>` store handle, the resolved `EmailProvider`, and the
   /// audit hooks.
   pub fn build_engine(
       settings: &Settings,
       pool: PgPool,
       environment: Environment,
   ) -> Result<AuthEngine, EngineError> {
       let config = build_auth_config(settings, environment)?;
       let stores = Arc::new(RedisStores::connect(
           &settings.redis_url,
           settings.redis_namespace.clone(),
       )?);

       let engine = AuthEngine::builder()
           .config(config)
           .environment(environment)
           .user_repository(Arc::new(SqlxUserRepository::new(pool.clone())))
           // The platform repository seam is wired separately, once the platform admin domain is enabled:
           // .platform_user_repository(Arc::new(SqlxPlatformUserRepository::new(pool.clone())))
           .redis_stores(stores)
           .email_provider(resolve_email_provider(settings))
           .hooks(Arc::new(AuditAuthHooks::new(pool)))
           .build()?;
       Ok(engine)
   }
   ```
2. `apps/api/src/app.rs`: add `engine: Arc<AuthEngine>` to `AppState` (keep the existing `pool` + `redis` handles); in startup, `let engine = Arc::new(build_engine(&settings, pool.clone(), Environment::Development)?);` and surface a precise abort message on `EngineError`.
3. A smoke test: build the engine from `PgPool::connect_lazy(&dev_url)?` + a valid dev `Settings` fixture and assert `Ok` (no live Postgres/Redis required — both pools are lazy).

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed thiserror errors; English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config file; no .gitkeep; git switch -c only.
- Wire every store seam through the single `Arc<RedisStores>` — do not call any individual store builder.
- `email_provider(resolve_email_provider(settings))` already yields an `Arc<dyn EmailProvider>`; `hooks` takes `Arc::new(AuditAuthHooks::new(pool))`.
- Confirm each builder method name against the sibling crate; adjust if a method is renamed.

Verification:
- `cargo build --locked` — expected: builds.
- `cargo nextest run -p api engine` — expected: the smoke test passes (engine builds from lazy pools + dev settings).
- `cargo +1.90 check` — expected: builds on the MSRV floor.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `cargo llvm-cov nextest -p api --lcov --output-path /tmp/p5-2.info` — expected: `src/engine/mod.rs` 100%.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `2 / 7` and Last updated.
4. Update the P5 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 5.2 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(engine): wire AuthEngine::builder with real seams into AppState` (no Co-Authored-By).
````

---

### Task 5.3 — lettre `EmailProvider` → Mailpit

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Implement a `lettre` SMTP `EmailProvider` covering all 7 `EmailProvider` methods, rendering the transactional templates and delivering to the local Mailpit relay.

#### Acceptance criteria

- [x] `LettreEmailProvider` in `apps/api/src/email/lettre.rs` implements `bymax_auth_core::traits::email::EmailProvider` (all 7: `send_password_reset_token`, `send_password_reset_otp`, `send_email_verification_otp`, `send_mfa_enabled`, `send_mfa_disabled`, `send_new_session_alert`, `send_invitation`).
- [x] It builds a plaintext SMTP transport to `host:port` (Mailpit speaks plain SMTP) and sends an HTML message per method; every error path maps to `EmailError::Delivery(Box<…>)`.
- [x] The 7 `apps/api/templates/email/*.html` askama templates exist and render the OTP/token/session/invite context; `SessionInfo`/`InviteData` fields are used (no secret beyond the OTP/token the email legitimately carries).
- [x] An integration test delivers all 7 messages to a live Mailpit relay (skips when none is reachable); the shared render module is unit-covered directly.
- [x] `cargo nextest run -p api email` passes; `src/email/lettre.rs` is 100% covered; clippy clean; no phase/task strings.

#### Files to create / modify

- `apps/api/src/email/mod.rs` (new module + the shared `templates` render helpers)
- `apps/api/src/email/lettre.rs` (new)
- `apps/api/templates/email/{email_verification_otp,password_reset_otp,password_reset_token,mfa_enabled,mfa_disabled,new_session_alert,invitation}.html` (new)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 5 (Engine Wiring, Email & Audit) — Task 5.3 of 7 (MIDDLE)

PRECONDITIONS
- The path deps on bymax-auth-{axum,core,redis} are present with feature `full`; `bymax_auth_core::traits::email::{EmailProvider, EmailError, SessionInfo, InviteData}` are available.
- `Settings` exposes smtp_host: String, smtp_port: u16, smtp_from: String.
- docker-compose runs Mailpit (SMTP :1025, UI/REST :8025).
- Add the runtime deps this task needs: `lettre` (async, tokio1, no native TLS for Mailpit), `askama` (compile-time templates), `async-trait`. Respect the deny.toml ban on `openssl`/`openssl-sys`/`ring` — choose a rustls/aws-lc-rs feature set or, for the plaintext Mailpit transport, no TLS backend at all.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "Identity Domains & Extension Points" — the Email transport seam row (lettre → Mailpit + Resend).
- docs/OVERVIEW.md § "Auth Event Tracking & the Audit Domain" — the never-log-secrets invariant context.
- ../../../rust-auth/crates/bymax-auth-core/src/traits/email.rs — the exact `EmailProvider` trait (7 `async fn` returning `Result<(), EmailError>`, each taking `locale: Option<&str>`) + `SessionInfo{device, ip, session_hash}` + `InviteData{inviter_name, tenant_name, invite_token, expires_at}` + `enum EmailError { Delivery(...) }`.

TASK
Author `LettreEmailProvider` implementing all 7 EmailProvider methods over a plaintext SMTP transport to Mailpit, plus the askama templates and the shared render helpers.

DELIVERABLES
1. `apps/api/src/email/lettre.rs`:
   ```rust
   //! A `lettre` SMTP `EmailProvider` that renders transactional templates and
   //! delivers them to the local Mailpit relay.
   use async_trait::async_trait;
   use lettre::message::header::ContentType;
   use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

   use bymax_auth_core::traits::email::{EmailError, EmailProvider, InviteData, SessionInfo};

   use crate::email::templates;

   /// SMTP-backed [`EmailProvider`] targeting Mailpit in development.
   pub struct LettreEmailProvider {
       transport: AsyncSmtpTransport<Tokio1Executor>,
       from: String,
   }

   impl LettreEmailProvider {
       /// Builds a plaintext SMTP transport to `host:port` (Mailpit speaks plain SMTP).
       #[must_use]
       pub fn new(host: &str, port: u16, from: String) -> Self {
           let transport = AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(host)
               .port(port)
               .build();
           Self { transport, from }
       }

       async fn deliver(&self, to: &str, subject: &str, html: String) -> Result<(), EmailError> {
           let message = Message::builder()
               .from(self.from.parse().map_err(|e| EmailError::Delivery(Box::new(e)))?)
               .to(to.parse().map_err(|e| EmailError::Delivery(Box::new(e)))?)
               .subject(subject)
               .header(ContentType::TEXT_HTML)
               .body(html)
               .map_err(|e| EmailError::Delivery(Box::new(e)))?;
           self.transport
               .send(message)
               .await
               .map(|_| ())
               .map_err(|e| EmailError::Delivery(Box::new(e)))
       }
   }

   #[async_trait]
   impl EmailProvider for LettreEmailProvider {
       async fn send_email_verification_otp(&self, email: &str, otp: &str, locale: Option<&str>) -> Result<(), EmailError> {
           self.deliver(email, "Verify your email", templates::verification_otp(otp, locale)).await
       }
       // implement the other 6 the same way: send_password_reset_otp, send_password_reset_token,
       // send_mfa_enabled, send_mfa_disabled, send_new_session_alert(&SessionInfo),
       // send_invitation(&InviteData) — each rendering its template via `templates::*`.
   }
   ```
2. `apps/api/src/email/mod.rs`: `pub mod lettre;` + a `pub(crate) mod templates;` exposing one render fn per email (askama `#[derive(Template)]` structs backed by `apps/api/templates/email/*.html`), each returning `String`.
3. `apps/api/templates/email/*.html`: the 7 baseline English templates (verification OTP, password-reset OTP, password-reset token, MFA enabled, MFA disabled, new-session alert, invitation). Use the OTP/token/session/invite context; keep them simple, semantic HTML.

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed thiserror/EmailError errors; English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config/template file; no .gitkeep; git switch -c only.
- Never write the OTP/token to a `tracing` span or log line — it appears ONLY inside the rendered email body.
- Do not pull `openssl`/`ring`; the Mailpit transport is plaintext (no TLS backend).

Verification:
- `cargo build --locked` — expected: builds.
- `docker compose up --wait` then `cargo nextest run -p api email` — expected: passes; the integration test finds the message via `GET http://localhost:8025/api/v1/messages` (or the AsyncStubTransport unit test asserts the 7 calls render).
- `cargo llvm-cov nextest -p api --lcov --output-path /tmp/p5-3.info` — expected: `src/email/lettre.rs` 100%.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `grep -riE "phase [0-9]|task [0-9]" apps/api/src/email apps/api/templates/email` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter (increment the done count) and Last updated.
4. Update the P5 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 5.3 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(email): lettre SMTP EmailProvider delivering to Mailpit` (no Co-Authored-By).
````

---

### Task 5.4 — Resend provider + resolution + templates

- **Status**: ✅ Done
- **Priority**: P1
- **Size**: M
- **Depends on**: 5.3

#### Description

Add a `reqwest`-based Resend `EmailProvider` (opt-in via `RESEND_API_KEY`), the `resolve_email_provider(settings)` selector, and the locale-aware finalized 7 transactional `.html` templates shared by both providers.

#### Acceptance criteria

- [x] `ResendEmailProvider` in `apps/api/src/email/resend.rs` implements all 7 `EmailProvider` methods by POSTing to `https://api.resend.com/emails` with `Authorization: Bearer <key>`, rendering via the shared `email::templates` module.
- [x] `resolve_email_provider(settings) -> Result<Arc<dyn EmailProvider>, EmailError>` returns `ResendEmailProvider` when `settings.resend_api_key` is `Some`, otherwise `LettreEmailProvider`.
- [x] The 7 `templates/email/*.html` are finalized (BCP-47 `locale` handling with an `es` copy set); both providers render identical HTML (DRY — one shared render module).
- [x] A Resend unit test mocks the HTTP endpoint (a local axum server) and asserts the request reaches `/emails` with bearer auth; a resolution test asserts the selector picks each provider correctly.
- [x] `cargo nextest run -p api email` passes; `src/email/resend.rs` + `src/email/mod.rs` 100% covered; clippy clean.

#### Files to create / modify

- `apps/api/src/email/resend.rs` (new)
- `apps/api/src/email/mod.rs` (add `resolve_email_provider`)
- `apps/api/templates/email/*.html` (finalize the 7)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 5 (Engine Wiring, Email & Audit) — Task 5.4 of 7 (MIDDLE)

PRECONDITIONS
- 5.3 is ✅: `LettreEmailProvider` + the shared `email::templates` render module + the 7 baseline templates exist; `apps/api/src/email/mod.rs` declares the module tree.
- `Settings` exposes `resend_api_key: Option<String>` and `smtp_from: String` (the From address).
- `reqwest` is available with a rustls/aws-lc-rs TLS backend (NOT openssl/ring — they are banned in deny.toml).

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "Configuration & Environment" — `EMAIL_PROVIDER`/`RESEND_API_KEY` rows (unset RESEND_API_KEY ⇒ Mailpit).
- docs/OVERVIEW.md § "Identity Domains & Extension Points" — the Email transport seam (Mailpit zero-cred + Resend opt-in).
- ../../../rust-auth/crates/bymax-auth-core/src/traits/email.rs — the EmailProvider trait + EmailError (re-confirm the 7 signatures already implemented in 5.3).

TASK
Author `ResendEmailProvider`, the `resolve_email_provider` selector, and finalize the 7 shared templates with locale handling. Both providers render identical HTML.

DELIVERABLES
1. `apps/api/src/email/resend.rs`:
   ```rust
   //! A `reqwest`-based `EmailProvider` delivering via the Resend HTTPS API.
   use async_trait::async_trait;

   use bymax_auth_core::traits::email::{EmailError, EmailProvider, InviteData, SessionInfo};

   use crate::email::templates;

   /// HTTPS [`EmailProvider`] backed by the Resend transactional API.
   pub struct ResendEmailProvider {
       http: reqwest::Client,
       api_key: String,
       from: String,
   }

   impl ResendEmailProvider {
       /// Creates a provider bound to a Resend API key and a verified `from`.
       #[must_use]
       pub fn new(api_key: String, from: String) -> Self {
           Self { http: reqwest::Client::new(), api_key, from }
       }

       async fn deliver(&self, to: &str, subject: &str, html: String) -> Result<(), EmailError> {
           let response = self
               .http
               .post("https://api.resend.com/emails")
               .bearer_auth(&self.api_key)
               .json(&serde_json::json!({ "from": self.from, "to": to, "subject": subject, "html": html }))
               .send()
               .await
               .map_err(|e| EmailError::Delivery(Box::new(e)))?;
           if response.status().is_success() {
               Ok(())
           } else {
               Err(EmailError::Delivery(format!("resend status {}", response.status()).into()))
           }
       }
   }

   // #[async_trait] impl EmailProvider for ResendEmailProvider { ... } — the same 7
   // methods as the lettre provider, each rendering via `templates::*` then `deliver`.
   ```
2. `apps/api/src/email/mod.rs`:
   ```rust
   use std::sync::Arc;
   use bymax_auth_core::traits::email::EmailProvider;
   use crate::config::Settings;
   use crate::email::{lettre::LettreEmailProvider, resend::ResendEmailProvider};

   /// Selects the active provider: Resend when `RESEND_API_KEY` is set,
   /// otherwise the zero-credential lettre → Mailpit transport.
   #[must_use]
   pub fn resolve_email_provider(settings: &Settings) -> Arc<dyn EmailProvider> {
       match settings.resend_api_key.as_deref() {
           Some(key) => Arc::new(ResendEmailProvider::new(key.to_owned(), settings.smtp_from.clone())),
           None => Arc::new(LettreEmailProvider::new(&settings.smtp_host, settings.smtp_port, settings.smtp_from.clone())),
       }
   }
   ```
3. `apps/api/templates/email/*.html`: finalize the 7 (branding + a `locale` switch so a non-default BCP-47 `locale` renders a localized copy; default to English). The render fns in `email::templates` take `locale: Option<&str>` and pick the variant.

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed thiserror/EmailError errors; English-only TIMELESS comments (template copy may be localized by `locale`, but source comments are English) — NO Phase/Task/roadmap references in any committed source/config/template file; no .gitkeep; git switch -c only.
- DRY: both providers MUST render via the one shared `email::templates` module — do not duplicate HTML between lettre and resend.
- Use a rustls/aws-lc-rs reqwest TLS backend; never pull openssl/ring.

Verification:
- `cargo build --locked` — expected: builds.
- `cargo nextest run -p api email` — expected: passes; the wiremock test asserts the POST to `/emails` carries `Authorization: Bearer`; the resolution test asserts Resend-when-set / Lettre-when-unset.
- `cargo llvm-cov nextest -p api --lcov --output-path /tmp/p5-4.info` — expected: `src/email/resend.rs` + `src/email/mod.rs` 100%.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter and Last updated.
4. Update the P5 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 5.4 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(email): opt-in Resend provider and provider resolution` (no Co-Authored-By).
````

---

### Task 5.5 — `AuditAuthHooks` + `audit_log` write

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: 5.2

#### Description

Implement an `AuthHooks` impl that records every lifecycle hook as a masked `audit_log` row, receiving `SafeAuthUser` + `HookContext` and never persisting a token/code/secret.

#### Acceptance criteria

- [x] `AuditAuthHooks` in `apps/api/src/hooks/audit.rs` implements `bymax_auth_core::traits::hooks::AuthHooks`, writing one `audit_log` row at each `after_*` hook plus `on_new_session` / `on_session_evicted`; `on_oauth_login` and `before_register` are left at their library defaults (`on_oauth_login` = secure DENY — its Create/Link policy lands later).
- [x] Each row stores only non-secret context: event name, actor id/email, tenant, IP, user-agent (from `HookContext` + `SafeAuthUser`); no token, OTP, MFA secret, or session hash is written (a unit test proves the session hashes never reach a row).
- [x] A `HookError::Internal` wraps any sqlx failure; no `unwrap`/`expect`/`panic` on the write path.
- [x] The full `register → verify-email → login` flow regression (emailed OTP absent from every audit row) lands with the mounted surface in the auth-surface integration test (5.6).
- [x] `cargo nextest run -p api hooks` passes against the test stack; `src/hooks/audit.rs` 100% covered; clippy clean; no phase/task strings.

#### Files to create / modify

- `apps/api/src/hooks/mod.rs` (new)
- `apps/api/src/hooks/audit.rs` (new)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 5 (Engine Wiring, Email & Audit) — Task 5.5 of 7 (MIDDLE)

PRECONDITIONS
- 5.2 is ✅: `build_engine` wires `.hooks(Arc::new(AuditAuthHooks::new(pool)))`; `AppState` holds `Arc<AuthEngine>`.
- P4 created the `audit_log` table with columns: id (bigserial PK — the keyset cursor), event (text not null), actor_id (text null), actor_email (text null), tenant_id (text null), ip (text), user_agent (text), metadata (jsonb), created_at (timestamptz default now()).
- `bymax_auth_core::traits::hooks::{AuthHooks, HookContext, HookError}` and `SafeAuthUser` are available; `SessionInfo` comes from `traits::email`.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "Auth Event Tracking & the Audit Domain" — the hook list, "the example's `AuditAuthHooks` writes a row to an `audit_log` Postgres table", and the never-contains-secrets proof.
- docs/OVERVIEW.md § "The Authentication Pipelines (Deep Dive)" — which hooks fire when (after_login / on_new_session / on_session_evicted, etc.).
- ../../../rust-auth/crates/bymax-auth-core/src/traits/hooks.rs — the exact `AuthHooks` trait (14 `async fn`, all defaulted; `on_oauth_login` default = secure DENY), `HookContext{user_id, email, tenant_id, ip, user_agent, sanitized_headers}`, `enum HookError { Rejected(String), Internal(...) }`.

TASK
Author `AuditAuthHooks`: override the lifecycle hooks to write a masked `audit_log` row each. Leave `on_oauth_login` at the default DENY (its Create/Link policy is added when OAuth is wired).

DELIVERABLES
1. `apps/api/src/hooks/audit.rs`:
   ```rust
   //! `AuthHooks` implementation recording every lifecycle event as a masked
   //! `audit_log` row — never a token, code, or secret.
   use async_trait::async_trait;
   use sqlx::PgPool;

   use bymax_auth_types::SafeAuthUser;
   use bymax_auth_core::traits::email::SessionInfo;
   use bymax_auth_core::traits::hooks::{AuthHooks, HookContext, HookError};

   /// Persists auth lifecycle events to the `audit_log` table.
   pub struct AuditAuthHooks {
       pool: PgPool,
   }

   impl AuditAuthHooks {
       /// Creates the hooks bound to the audit Postgres pool.
       #[must_use]
       pub fn new(pool: PgPool) -> Self {
           Self { pool }
       }

       /// Inserts one masked row: event + actor + tenant + ip + user-agent only.
       async fn record(&self, event: &str, actor_id: Option<&str>, ctx: &HookContext) -> Result<(), HookError> {
           sqlx::query!(
               "INSERT INTO audit_log (event, actor_id, actor_email, tenant_id, ip, user_agent) \
                VALUES ($1, $2, $3, $4, $5, $6)",
               event,
               actor_id,
               ctx.email.as_deref(),
               ctx.tenant_id.as_deref(),
               ctx.ip,
               ctx.user_agent,
           )
           .execute(&self.pool)
           .await
           .map_err(|e| HookError::Internal(Box::new(e)))?;
           Ok(())
       }
   }

   #[async_trait]
   impl AuthHooks for AuditAuthHooks {
       async fn after_register(&self, user: &SafeAuthUser, ctx: &HookContext) -> Result<(), HookError> {
           self.record("after_register", Some(&user.id), ctx).await
       }
       async fn after_login(&self, user: &SafeAuthUser, ctx: &HookContext) -> Result<(), HookError> {
           self.record("after_login", Some(&user.id), ctx).await
       }
       async fn on_new_session(&self, user: &SafeAuthUser, _session: &SessionInfo, ctx: &HookContext) -> Result<(), HookError> {
           // Record the event only — never the session hash.
           self.record("on_new_session", Some(&user.id), ctx).await
       }
       // implement the remaining hooks: after_logout, after_email_verified,
       // after_password_reset, after_mfa_enabled, after_mfa_disabled,
       // after_mfa_recovery_codes_regenerated, after_invitation_accepted,
       // on_session_evicted — each calling `record(...)`. Leave `on_oauth_login`
       // and `before_register` at their library defaults for now.
   }
   ```
2. `apps/api/src/hooks/mod.rs`: `pub mod audit; pub use audit::AuditAuthHooks;`.
3. The no-secrets regression test (integration, test stack): drive `register → verify-email`, then `SELECT * FROM audit_log` and assert no row's serialized form contains the OTP/token the email carried.

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed thiserror/HookError errors; English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config file; no .gitkeep; git switch -c only.
- Hooks receive a `SafeAuthUser` (never `AuthUser`); persist ONLY non-secret fields — no token, OTP, MFA secret, recovery code, or session hash.
- Use compile-checked `query!`; keep the offline `.sqlx/` cache current (`cargo sqlx prepare`).
- Confirm `SafeAuthUser`'s field name for the id (`user.id`) against the sibling crate.

Verification:
- `sqlx migrate run` (test stack) then `cargo nextest run -p api hooks` — expected: passes, incl. the no-secrets regression assertion.
- `cargo sqlx prepare --check` — expected: the offline cache is current.
- `cargo llvm-cov nextest -p api --lcov --output-path /tmp/p5-5.info` — expected: `src/hooks/audit.rs` 100%.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `grep -riE "phase [0-9]|task [0-9]" apps/api/src/hooks` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter and Last updated.
4. Update the P5 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 5.5 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(hooks): AuditAuthHooks writing masked audit_log rows` (no Co-Authored-By).
````

---

### Task 5.6 — `auth_router` mount

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: 5.2

#### Description

Mount `bymax_auth_axum::auth_router(engine, AxumAuthConfig{…})` and merge it onto the example `Router`, then verify the core `/auth/*` surface answers with correct status codes and a `Retry-After` on `429`.

#### Acceptance criteria

- [ ] `apps/api/src/app.rs` mounts the library router via `AxumAuthConfig { route_prefix: "auth".into(), rate_limits: RateLimitConfig::default(), client_ip_source: ClientIpSource::PeerAddr, ..Default::default() }` and merges it onto the example `Router` (sharing the `Arc<AuthEngine>` with the example's own routes).
- [ ] An integration test exercises `/auth/register` (201), `/auth/login` (200), `/auth/me` (200 with the access token), `/auth/logout` (204), `/auth/refresh` (200), `/auth/verify-email` (204), `/auth/password/forgot-password` (200, anti-enum).
- [ ] Hammering `/auth/login` past the default limit (5/60) yields `429` with a `Retry-After` header present.
- [ ] `cargo nextest run -p api e2e::auth` (or the chosen module) passes against the test stack; coverage 100% on the mount glue; clippy clean.

#### Files to create / modify

- `apps/api/src/app.rs`
- `apps/api/tests/auth_surface.rs` (or `apps/api/src/...` integration tests)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 5 (Engine Wiring, Email & Audit) — Task 5.6 of 7 (MIDDLE)

PRECONDITIONS
- 5.2 is ✅: `build_engine` returns a wired `AuthEngine`; `AppState` holds `Arc<AuthEngine>`.
- 5.3/5.4 (email) and 5.5 (audit hooks) are wired into the engine so login/register actually deliver mail + write audit rows.
- The config enables the `auth` + `password_reset` (default) + `sessions` + `mfa` controller groups; `oauth`/`invitations`/`platform` route groups are off.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "Configuration & Environment" — the paragraph after the canonical wiring: `auth_router(engine, AxumAuthConfig { route_prefix: "auth".into(), rate_limits: RateLimitConfig::default(), client_ip_source: ClientIpSource::PeerAddr, ..Default::default() })` and "the example's own domain routes are merged onto the same Router".
- docs/OVERVIEW.md § "The Demo Domain & Auth Console" — the mounted endpoint table (status codes per route).
- ../../../rust-auth/crates/bymax-auth-axum/src/router.rs and .../src/rate_limit.rs and .../src/state.rs — `auth_router` / `AuthRouter::from_engine(Arc<AuthEngine>, AxumAuthConfig)` / `AxumAuthConfig` / `RateLimitConfig::default()` / `ClientIpSource`.

TASK
Mount the library router and merge it with the example `Router`, then prove the core surface answers correctly (incl. the 429 Retry-After envelope).

DELIVERABLES
1. `apps/api/src/app.rs` — build the engine once, share it as `Arc<AuthEngine>`, and mount:
   ```rust
   use std::sync::Arc;

   use axum::Router;
   use bymax_auth_axum::{AuthRouter, AxumAuthConfig, ClientIpSource, RateLimitConfig};

   /// Composes the example `Router`: the library auth surface + the example's
   /// own domain routes, sharing one `Arc<AuthEngine>`.
   pub fn build_app(engine: Arc<bymax_auth_core::AuthEngine>, state: AppState) -> Router {
       let auth = AuthRouter::from_engine(
           Arc::clone(&engine),
           AxumAuthConfig {
               route_prefix: "auth".to_owned(),
               rate_limits: RateLimitConfig::default(),
               client_ip_source: ClientIpSource::PeerAddr,
               ..Default::default()
           },
       )
       .into_router();

       Router::new()
           .merge(auth)
           .merge(example_routes()) // /health (+ /audit/*, /diagnostics/* land next)
           .with_state(state)
   }
   ```
   (If P3 already exposes a router builder, extend it rather than replacing it. `auth_router(engine, config)` is the by-value convenience; use `AuthRouter::from_engine(Arc<AuthEngine>, config)` so the example keeps a shared `Arc<AuthEngine>` for its own routes.)
2. `apps/api/tests/auth_surface.rs` — spawn the app against the test stack (`sqlx migrate run` first) and assert: register 201, login 200, me 200 (bearer), logout 204, refresh 200, verify-email 204, forgot-password 200; then loop `/auth/login` > 5 times and assert one response is 429 with a non-empty `Retry-After` header.

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed thiserror errors; English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config file; no .gitkeep; git switch -c only.
- Do NOT enable the oauth/invitations/platform route groups here.
- CORS must expose `Retry-After` (P3 set this) so the browser can read the throttle envelope.
- Memory-safe tests: bounded `--test-threads`; never fan out parallel test agents.

Verification:
- `sqlx migrate run` (test stack) then `cargo nextest run -p api e2e::auth --test-threads=2` — expected: every status assertion passes, incl. 429 + Retry-After.
- `cargo build --locked` — expected: builds.
- `cargo llvm-cov nextest -p api --lcov --output-path /tmp/p5-6.info` — expected: `src/app.rs` mount glue 100%.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter and Last updated.
4. Update the P5 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 5.6 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(api): mount auth_router onto the example Router` (no Co-Authored-By).
````

---

### Task 5.7 — audit read-API + diagnostics

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: M
- **Depends on**: 5.5, 5.6

#### Description

Add the example-owned `GET /audit/logs` (keyset) + `GET /audit/stream` (SSE `Last-Event-ID` resume) over `audit_log`, plus `POST /diagnostics/{hash-strength,force-lockout}` + `GET /diagnostics/hooks`. This is the LAST task — run the per-phase protocol on completion.

#### Acceptance criteria

- [ ] `GET /audit/logs?cursor&actor&event&tenantId&limit` returns `{ data, nextCursor, hasMore }` with keyset pagination over `audit_log.id`.
- [ ] `GET /audit/stream` emits SSE where each event `id` is the row's keyset cursor; a reconnect with `Last-Event-ID` resumes from that cursor.
- [ ] `POST /diagnostics/hash-strength` reports `needs_rehash` via `bymax_auth_crypto::password::needs_rehash`; `POST /diagnostics/force-lockout` drives `BruteForceStore` (via the engine handle); `GET /diagnostics/hooks` returns a compact view of the most recent hook-event audit rows.
- [ ] These example routes are mounted onto the same `Router` (merged in 5.6); they are dev-facing and may be left open here (guards land with the platform/guard demo).
- [ ] `cargo nextest run -p api audit diagnostics` passes against the test stack; coverage 100%; clippy clean; no phase/task strings.

#### Files to create / modify

- `apps/api/src/audit/mod.rs` + `apps/api/src/audit/routes.rs` (new)
- `apps/api/src/diagnostics/mod.rs` + `apps/api/src/diagnostics/routes.rs` (new)
- `apps/api/src/app.rs` (merge `example_routes()` → `/audit/*`, `/diagnostics/*`)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 5 (Engine Wiring, Email & Audit) — Task 5.7 of 7 (LAST)

PRECONDITIONS
- 5.5 is ✅: `AuditAuthHooks` writes masked `audit_log` rows (id is a bigserial keyset cursor).
- 5.6 is ✅: the library `auth_router` is merged onto the example `Router`; `AppState` holds `Arc<AuthEngine>` and the `PgPool`.
- The engine handle exposes `brute_force_store()` and the crypto crate exposes `password::needs_rehash` + `PasswordParams::default()`.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "Auth Event Tracking & the Audit Domain" — the read-API contract (`GET /audit/logs?cursor&actor&event&tenantId&limit` → `{ data, nextCursor, hasMore }`; `GET /audit/stream` SSE where each event id is the keyset cursor → `Last-Event-ID` resume).
- docs/OVERVIEW.md § "The Demo Domain & Auth Console" — the example-owned `/audit/*` + `/diagnostics/{hash-strength,force-lockout}` + `/diagnostics/hooks` row.
- docs/DASHBOARD.md § "Real-time — the SSE audit tail" — the follow-mode + resume UX the stream backs.

TASK
Author the audit read-API and the diagnostics endpoints, merge them onto the example `Router`, and run the per-phase closeout.

DELIVERABLES
1. `apps/api/src/audit/routes.rs`:
   ```rust
   use std::convert::Infallible;

   use axum::extract::{Query, State};
   use axum::response::sse::{Event, Sse};
   use axum::Json;
   use futures_core::Stream;
   use serde::{Deserialize, Serialize};

   use crate::app::AppState;
   use crate::error::AppError;

   #[derive(Deserialize)]
   #[serde(rename_all = "camelCase")]
   pub struct AuditQuery {
       pub cursor: Option<i64>,
       pub actor: Option<String>,
       pub event: Option<String>,
       pub tenant_id: Option<String>,
       #[serde(default = "default_limit")]
       pub limit: i64,
   }
   fn default_limit() -> i64 { 50 }

   #[derive(Serialize)]
   #[serde(rename_all = "camelCase")]
   pub struct AuditRow {
       pub id: i64,
       pub event: String,
       pub actor_email: Option<String>,
       pub tenant_id: Option<String>,
       pub ip: String,
       pub created_at: String,
   }

   #[derive(Serialize)]
   #[serde(rename_all = "camelCase")]
   pub struct AuditPage {
       pub data: Vec<AuditRow>,
       pub next_cursor: Option<i64>,
       pub has_more: bool,
   }

   /// Keyset page over `audit_log` (id DESC, id < cursor). Fetches `limit + 1`
   /// to compute `has_more`/`next_cursor` without a second count query.
   pub async fn list_logs(
       State(state): State<AppState>,
       Query(q): Query<AuditQuery>,
   ) -> Result<Json<AuditPage>, AppError> {
       // SELECT ... FROM audit_log WHERE ($cursor IS NULL OR id < $cursor)
       //   AND (filters) ORDER BY id DESC LIMIT $limit + 1
       todo!("compile-checked query!; map sqlx::Error -> AppError")
   }

   /// SSE tail; resumes from `Last-Event-ID` (the row id). Each `Event` carries
   /// `.id(row.id)` so a reconnect continues after the last delivered cursor.
   pub async fn stream_logs(
       State(state): State<AppState>,
       headers: axum::http::HeaderMap,
   ) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
       todo!("read Last-Event-ID; poll new rows id > last; Event::default().id(id).json_data(row)")
   }
   ```
   (Replace the `todo!` placeholders with real implementations — the published file must contain NO `todo!`.)
2. `apps/api/src/diagnostics/routes.rs`:
   - `POST /diagnostics/hash-strength` → `{ needsRehash: bool }` via `bymax_auth_crypto::password::needs_rehash(&phc, &PasswordParams::default())`.
   - `POST /diagnostics/force-lockout` → drive `state.engine.brute_force_store().record_failure(...)` until locked, return the lockout state.
   - `GET /diagnostics/hooks` → the most recent hook-event `audit_log` rows (a compact view).
3. `apps/api/src/app.rs`: extend `example_routes()` to mount `GET /audit/logs`, `GET /audit/stream`, `POST /diagnostics/hash-strength`, `POST /diagnostics/force-lockout`, `GET /diagnostics/hooks`.
4. Integration tests (test stack): keyset pagination returns `nextCursor`/`hasMore`; an SSE reconnect with `Last-Event-ID` resumes; each diagnostics endpoint answers.

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic/todo! in non-test code; typed thiserror/AppError errors; English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config file; no .gitkeep; git switch -c only.
- Use compile-checked `query!`; keep the offline `.sqlx/` cache current.
- The audit read surface never exposes a token/code/secret (the rows already exclude them).

Verification:
- `sqlx migrate run` (test stack) then `cargo nextest run -p api audit diagnostics --test-threads=2` — expected: keyset + SSE-resume + diagnostics tests pass.
- `cargo sqlx prepare --check` — expected: the offline cache is current.
- `cargo llvm-cov nextest -p api --lcov --output-path /tmp/p5-7.info` — expected: `src/audit/**` + `src/diagnostics/**` 100%.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `grep -riE "phase [0-9]|task [0-9]" apps/api/src/audit apps/api/src/diagnostics` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `7 / 7` and Last updated.
4. Update the P5 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 5.7 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(audit): example audit read-API and diagnostics endpoints` (no Co-Authored-By).
(The LAST task also runs the PER-PHASE protocol: confirm every task ✅ + the P5 DoD met + CI green, flip the P5 row in docs/DEVELOPMENT_PLAN.md to ✅ / 7 of 7 with Last updated, advance the Active phase to P6, recompute the Overall progress %, set this file header Status to ✅, and commit `docs(plan): P5 complete`. If a DoD bullet is unmet, use 🟡 instead.)
````

---

## Phase Completion Protocol

When **Task 5.7** is ✅ (the last task), close the phase:

1. Confirm **all 7 tasks are ✅** and every Definition-of-Done bullet in [`docs/DEVELOPMENT_PLAN.md` § Phase 5](../DEVELOPMENT_PLAN.md) is met: the engine builds via `AuthEngine::builder()`; `/auth/*` answers register/login/logout/refresh/me + verify-email + password-reset with correct status + `Retry-After` on 429; a programmatic register → verify → login delivers the verification email to Mailpit and writes masked audit rows; HS256 verifies and the opaque refresh rotates with grace; 100% coverage.
2. Confirm the **PR is merged** and **CI is green** (every `ci.yml` job, incl. coverage + supply-chain + export-usage).
3. In [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md): set the **P5** row Status to ✅, Progress `7 / 7`, refresh **Last updated**; advance **Active phase** to **P6**; recompute **Overall progress** (`N / 15 phases`, %).
4. Set **this file's header** Status to ✅ (Progress `7 / 7`, Last updated).
5. Commit `docs(plan): P5 complete` (no `Co-Authored-By`).
6. If any DoD bullet is unmet, use **🟡 Partial** (never ✅) and record the gap in the completion log.

---

## Completion log

> Append-only. One line per completed task: `- <id> ✅ YYYY-MM-DD — <summary>`.

- 5.1 ✅ 2026-07-02 — `build_auth_config` assembles the profile (Both delivery, role hierarchy, sealed MFA config, sessions+mfa toggles) and validates fail-fast.
- 5.3 ✅ 2026-07-02 — `LettreEmailProvider` (7 methods) + a shared locale-aware askama render module + 7 templates; delivery proven against live Mailpit.
- 5.4 ✅ 2026-07-02 — `ResendEmailProvider` (bearer HTTPS, ring-free rustls/aws-lc-rs) + `resolve_email_provider`/`resolve_kind`; Settings gains SMTP + redacted Resend key.
- 5.5 ✅ 2026-07-02 — `AuditAuthHooks` writes masked `audit_log` rows on every lifecycle hook; a DB test proves session hashes never reach a row and failures map to `HookError::Internal`.
- 5.2 ✅ 2026-07-02 — `build_engine` assembles the engine from the sqlx repo, one `Arc<RedisStores>`, the resolved provider, and audit hooks; `AppState` carries `Arc<AuthEngine>` and `main` builds it at boot.
