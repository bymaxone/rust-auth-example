# Phase 7 — Platform Domain & WebSocket

> **Status**: 👀 Review · **Progress**: 5 / 5 tasks · **Last updated**: 2026-07-02
> **Source roadmap**: [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P7
> **Source spec**: [`docs/OVERVIEW.md`](../OVERVIEW.md)
> **Executing a task?** Read **only** that task's `### Task N.n` block + its bounded *REQUIRED READING* — never the whole file. See [token economy](README.md#token-economy--executing-a-single-task).

---

## Context

Phase 5 brought the dashboard auth surface live — `AuthEngine::builder()` wired with the sqlx `UserRepository`, the one `Arc<RedisStores>` handle, the lettre `EmailProvider`, and the `AuditAuthHooks` impl — and mounted the library router for register/login/logout/refresh/me, email verification, password reset, sessions and MFA. Phase 6 (running in parallel with this one) adds Google OAuth and invitations on top of that same engine. The platform-admin domain, the WebSocket ticket surface, and the example's own guard/diagnostics routes have so far been left dark.

This phase lights up the **second identity domain** and the realtime + diagnostics seams. It enables `platform.enabled` and the `SqlxPlatformUserRepository` seam (built in P4) so the mounted `/auth/platform/*` routes answer over HTTP; it proves the two token families are isolated (a dashboard token can never satisfy a platform guard, and vice-versa) and that platform MFA is **fail-closed** (an MFA-enabled admin cannot log in when `mfa` is unconfigured). It then proves the `POST /auth/ws-ticket` mint (a ~30 s single-use ticket) and adds a tiny example `WebSocketUpgrade` endpoint guarded by `WsAuthUser`/`WsAuthUserFromHeader` so the JWT never travels in the URL. Finally it surfaces the server-only primitives (`password::needs_rehash`, `BruteForceStore` lockout, the `AuthHooks` event log) through example-owned diagnostics endpoints, and gates the example's own `/audit` and `/diagnostics` routes with `AuthUser`/`RequireRole<R>`/`PlatformUser`.

When P7 is done, `cargo nextest run -p api platform` and `cargo nextest run -p api ws` pass; platform login/me/refresh/logout + platform MFA answer over HTTP with correct status codes; a dashboard token is rejected by `verify_platform_token` and a platform token is rejected by `verify_access_token`; an MFA-enabled admin login is refused when `mfa` is unconfigured; `issue_ws_ticket` → `redeem_ws_ticket` succeeds exactly once and a replay errors; the diagnostics endpoints report hash staleness, lockout countdowns, and the hook-event log; the example's gated routes return the allowed body vs `401`/`403`; and `cargo llvm-cov nextest -p api` reports 100% on every new module. **This phase wires and verifies only the platform domain, the WebSocket ticket + example endpoint, the diagnostics primitives, and the example-owned guard gating — no platform UI (P11), no WebSocket browser client (P10), and no OAuth/invitations (P6).**

---

## Rules-of-phase

1. **Two isolated token families.** The dashboard and platform domains use distinct `token_type` discriminators (`DashboardType` → `"dashboard"` vs `PlatformType` → `"platform"`) that fail cross-domain deserialization. A dashboard token must be rejected by `verify_platform_token` and a platform token by `verify_access_token`; assert this both ways, never assume it.
2. **Platform is tenant-less.** `PlatformClaims` carries **no** `tenant_id` (unlike `DashboardClaims`); the `PlatformUserRepository` lookups take no tenant argument and the platform routes carry no tenant selector. Do not thread a `tenant_id` through any platform path.
3. **Platform MFA is fail-closed.** `platform.enabled` without an `mfa` config must **refuse** an MFA-enabled admin login (it returns an MFA-related error rather than a session) — this is the security default and must be proven, not assumed.
4. **The WS ticket carries the auth — the JWT is never in the URL.** `POST /auth/ws-ticket` mints a ~30 s (`WS_TICKET_TTL_SECONDS`) single-use ticket via the `WsTicketStore`; the browser opens `wss://…?ticket=…`. `redeem_ws_ticket` consumes the ticket exactly once — a replay must be rejected.
5. **Route groups are doubly gated.** Every optional surface is gated by a Cargo feature (`platform`, `websocket`, `mfa` on `bymax-auth-axum`) **and** a runtime `ControllerToggles` flag (`platform: true`); the mounted surface must exactly match the configured one. Enabling the domain means flipping both the config flag and the toggle, not editing the library.
6. **One Redis handle wires every store seam.** `redis_stores(Arc<RedisStores>)` already wires the `WsTicketStore` (and the platform session seam) — do not hand-implement or separately wire a store. Use the existing `Arc<RedisStores>` from the P5 engine builder.
7. **Diagnostics surface effects, never secrets.** The diagnostics endpoints expose server-only primitives through observable effects (hash-staleness booleans, lockout countdowns, the hook-event log) and must never return a token, OTP, MFA secret, or password hash. The redacting `Debug` invariant and the never-log-secrets rule still hold.
8. **No `unwrap`/`expect`/`panic!`/`todo!`/`unreachable!` in non-test code; typed `thiserror` errors only; `#![forbid(unsafe_code)]`.** The example's `AppError`/domain errors map library `AuthError`s through the library's `error_response`/`AuthRejection`; an internal error never leaks a string to the client.
9. **Memory-safe tests.** Run `cargo nextest` with bounded `--test-threads`; the integration tests run `sqlx migrate` against the test stack first. Never fan out parallel test agents.
10. **`git switch -c` only; Conventional Commits with no `Co-Authored-By`; English-only, timeless comments** — no `Phase`/`Task`/roadmap references in any committed source or config file.

---

## Reference docs

- [`docs/OVERVIEW.md`](../OVERVIEW.md) — § 11 "The Authentication Pipelines" (stage 2 MFA-temp, stage 3 issue), § 12 "Identity Domains & Extension Points" (the two domains table + fail-closed note), § 13 "Token, Session & Tenant Security" (algorithm-pin, lockout, never-log-secrets), § 15 "Auth Event Tracking & the Audit Domain" (the hook-event log), § 16 journeys 12 (WebSocket auth) & 14 (Platform admin domain).
- [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) — § P7 (scope/DoD), § 2 "Global Conventions", § 3 "Autonomous Execution Model", Appendix B (matrix rows 14, 15, 17, 22).
- `docs/DASHBOARD.md` § "Platform" / § "Realtime" — the console mapping for the platform domain and the WS ticket (authored in P14; reference for shape only).
- Sibling library sources to copy-and-adapt: `../../../rust-auth/crates/bymax-auth-axum/src/routes/platform.rs` + `.../routes/platform_mfa.rs` + `.../ws.rs` + `.../extractors/` (the mounted platform/WS routes and the `WsAuthUser`/`PlatformUser` extractors), and `../../../rust-auth/crates/bymax-auth-core/src/services/adapter_api.rs` (`verify_platform_token`, `issue_ws_ticket`/`redeem_ws_ticket`, `WS_TICKET_TTL_SECONDS`).
- `apps/api/src/engine/mod.rs` — the canonical builder wiring from P5 (extend it here; do not re-derive it).
- /bymax-workflow:standards — universal coding rules (apply the Rust track).

---

## Task index

| ID | Task | Status | Priority | Size | Depends on |
|---|---|---|---|---|---|
| 7.1 | Platform domain wiring + cross-domain token isolation | ✅ Done | P0 | M | — |
| 7.2 | Platform MFA fail-closed | ✅ Done | P0 | M | 7.1 |
| 7.3 | `ws-ticket` mint + example WebSocket endpoint | ✅ Done | P1 | M | — |
| 7.4 | Diagnostics primitives (hash-strength · lockout · hook log) | ✅ Done | P1 | M | — |
| 7.5 | Guard demo + e2e on `/audit` & `/diagnostics` | ✅ Done | P1 | M | 7.1, 7.3 |

---

## Tasks

### Task 7.1 — Platform domain wiring + cross-domain token isolation

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Enable `platform.enabled` and wire the `SqlxPlatformUserRepository` seam into the P5 engine builder so the mounted `/auth/platform/*` routes answer over HTTP, then prove the two token families are isolated (a dashboard token cannot satisfy a platform guard and vice-versa via the distinct `token_type` discriminators).

#### Acceptance criteria

- [x] The engine builder sets `config.platform.enabled = true`, flips `ControllerToggles.platform = true`, and attaches `.platform_user_repository(Arc::new(SqlxPlatformUserRepository::new(pool)))`; the `platform` Cargo feature is on for `bymax-auth-axum`/`-core`/`-redis`.
- [x] `POST /auth/platform/login`, `GET /auth/platform/me`, `POST /auth/platform/refresh`, `POST /auth/platform/logout`, and `DELETE /auth/platform/sessions` answer with the correct status codes (200 / 200 / 200 / 204 / 204) against the seeded demo platform admin.
- [x] A dashboard access token is rejected by `verify_platform_token` (401/403), and a platform access token is rejected by `verify_access_token` (401/403) — both directions asserted.
- [x] `engine.platform_auth()` and `engine.platform_user_repository()` both resolve to `Some(...)` once `platform.enabled`.
- [x] 100% coverage on the new/changed wiring + platform route tests; `cargo fmt --check`, `cargo clippy -- -D warnings` clean.

#### Files to create / modify

- `apps/api/src/engine/mod.rs` (enable platform + attach the repository seam)
- `apps/api/Cargo.toml` (ensure the `platform` feature is enabled on the consumed crates)
- `apps/api/tests/platform_domain.rs` (route smoke tests + cross-domain rejection)
- `apps/api/src/seed.rs` (ensure a demo platform admin is seeded — confirm/extend P4 seed)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 7 (Platform Domain & WebSocket) — Task 7.1 of 5 (FIRST)

PRECONDITIONS
- P5 produced `apps/api/src/engine/mod.rs` with `AuthEngine::builder()` wired (config profile, `redis_stores(Arc<RedisStores>)`, sqlx `UserRepository`, lettre `EmailProvider`, `AuditAuthHooks`) and the library router mounted via `auth_router(engine, AxumAuthConfig{ route_prefix: "auth".into(), .. })`.
- P4 produced `SqlxPlatformUserRepository` (all 6 `PlatformUserRepository` methods) and a seed for a demo platform admin.
- The `platform` Cargo feature is available on `bymax-auth-axum`/`-core`/`-redis` (the api depends on them with `full`).

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § 12 "Identity Domains & Extension Points" — the two-domains table (Dashboard vs Platform, tenant-less PlatformClaims) and the "distinct token_type" isolation rule.
- docs/OVERVIEW.md § 9 "Canonical wiring" — the `config.platform.enabled = true` + `ControllerToggles` + `.platform_user_repository(...)` shape.
- docs/DEVELOPMENT_PLAN.md § P7 (scope/DoD).
- ../../../rust-auth/crates/bymax-auth-axum/src/routes/platform.rs — the mounted platform handlers (login/me/refresh/logout/revoke_all) to drive in tests.
- ../../../rust-auth/crates/bymax-auth-core/src/services/adapter_api.rs — `verify_access_token` / `verify_platform_token` (the cross-domain boundary).

TASK
Extend the P5 engine builder to enable the platform domain and attach the `SqlxPlatformUserRepository` seam, then add an integration test module that drives the mounted `/auth/platform/*` routes against the seeded demo admin and proves the dashboard↔platform token families are isolated in both directions.

DELIVERABLES
1. `apps/api/src/engine/mod.rs`:
   - Enable the platform domain and attach the platform repository seam in the existing builder.
   ```rust
   use std::sync::Arc;
   use bymax_auth_core::{AuthEngine, config::{ControllerToggles, Environment}};

   // light up the tenant-less platform admin domain (doubly gated: config flag + controller toggle)
   config.platform.enabled = true;
   config.controllers = ControllerToggles { platform: true, ..config.controllers };
   config.validate(Environment::Development)?;

   AuthEngine::builder()
       .config(config)
       .environment(Environment::Development)
       .user_repository(Arc::new(SqlxUserRepository::new(pool.clone())))
       .platform_user_repository(Arc::new(SqlxPlatformUserRepository::new(pool.clone()))) // REQUIRED iff platform.enabled
       .redis_stores(stores)            // already wires SessionStore + the platform session seam
       .email_provider(email_provider)
       .hooks(hooks)
       .build()
       .map_err(BuildError::from)
   ```
2. `apps/api/tests/platform_domain.rs`:
   - Spin the router against the test stack (run `sqlx migrate` first), seed the demo admin, and assert the five platform routes answer.
   ```rust
   //! Platform-admin domain: the routes answer and the two token families are isolated.
   use bymax_auth_types::error::AuthErrorCode;

   /// `/auth/platform/login` → `PlatformLoginResult::Success` for the seeded admin;
   /// `/auth/platform/me` returns the `SafeAuthPlatformUser` (no `tenant_id`).
   #[tokio::test]
   async fn platform_login_me_refresh_logout_sessions() { /* drive the 5 routes; assert 200/200/200/204/204 */ }

   /// A dashboard access token must never satisfy a platform guard: `PlatformClaims`
   /// carries `token_type: "platform"`, so a `"dashboard"` token fails deserialization.
   #[tokio::test]
   async fn dashboard_token_rejected_by_platform_verify() {
       let engine = test_engine_with_platform().await;
       let dashboard_access = register_then_login_dashboard(&engine).await.access_token;
       let err = engine.verify_platform_token(&dashboard_access).await.unwrap_err();
       assert!(matches!(err.http_status(), 401 | 403));
   }

   /// And the reverse: a platform token must never satisfy a dashboard guard.
   #[tokio::test]
   async fn platform_token_rejected_by_dashboard_verify() {
       let engine = test_engine_with_platform().await;
       let platform_access = platform_login(&engine).await.access_token;
       let err = engine.verify_access_token(&platform_access).await.unwrap_err();
       assert!(matches!(err.http_status(), 401 | 403));
   }
   ```
3. `apps/api/Cargo.toml`: confirm `bymax-auth-axum`/`-core`/`-redis` carry the `platform` feature (via `full`); do not add new third-party deps.
4. `apps/api/src/seed.rs`: confirm/extend the demo platform admin seed (email + scrypt/argon2 password hash) so the login test has a fixture.

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed thiserror; the example's error type maps `AuthError` through the library's `error_response`/`AuthRejection` (an internal error never leaks a string).
- Platform is tenant-less — thread no `tenant_id` through any platform path.
- English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config file; no .gitkeep; git switch -c only.
- Memory-safe tests: bounded `--test-threads`; `sqlx migrate` against the test stack first; never fan out parallel test agents.

Verification:
- `cargo build --locked` — expected: builds.
- `cargo nextest run -p api platform_domain --test-threads 2` — expected: all platform-domain tests pass (5 routes + both cross-domain rejections).
- `cargo llvm-cov nextest -p api --lcov` — expected: the engine wiring + `tests/platform_domain.rs`-covered paths at 100%.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `grep -riE "phase [0-9]|task [0-9]" apps/api/src/engine/mod.rs apps/api/tests/platform_domain.rs` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `1 / 5` and Last updated.
4. Update the P7 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 7.1 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(api): wire platform admin domain + cross-domain token isolation` (no Co-Authored-By).
````

---

### Task 7.2 — Platform MFA fail-closed

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: 7.1

#### Description

Verify the mounted `/auth/platform/mfa/*` routes run against the platform identity with `MfaContext::Platform`, and prove the security default: `platform.enabled` without an `mfa` config refuses an MFA-enabled admin login (fail-closed).

#### Acceptance criteria

- [x] With `mfa` configured, the platform MFA journey round-trips: `POST /auth/platform/mfa/setup` → `verify-enable` → re-login returns an MFA challenge → `POST /auth/platform/mfa/challenge` issues a `PlatformAuthResult`; `disable`/`recovery-codes` answer with the correct status codes.
- [x] The engine uses `MfaContext::Platform` for the platform enrol/challenge path (asserted via the platform challenge returning a platform — not dashboard — result: the safe user is tenant-less).
- [x] **Fail-closed proven:** with `platform.enabled` but **no** `mfa` config, an MFA-enabled admin login is refused (`AuthError::InvalidCredentials`, never a session); an e2e test asserts this.
- [x] `POST /auth/platform/mfa/challenge` with the `mfa` feature absent returns `auth.mfa_not_enabled` (the library's documented compile-gated behavior; the `full` build always carries the surface).
- [x] 100% coverage on the platform-MFA paths; static gates clean.

#### Files to create / modify

- `apps/api/tests/platform_mfa.rs` (the enrol/challenge round-trip + the fail-closed proof)
- `apps/api/src/engine/mod.rs` (only if a test-profile toggle for the no-mfa config is needed)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 7 (Platform Domain & WebSocket) — Task 7.2 of 5 (MIDDLE)

PRECONDITIONS
- Task 7.1 is done: `platform.enabled = true`, the `SqlxPlatformUserRepository` seam is wired, and `/auth/platform/*` answers over HTTP; a demo platform admin is seeded.
- The `mfa` Cargo feature is available on `bymax-auth-axum`/`-core`/`-crypto`/`-redis` (via `full`); `MFA_ENCRYPTION_KEY` is a base64 32-byte value in the test env.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § 11 "The Authentication Pipelines" — stage 2 (the `MfaChallengeResult` + short-lived `mfa_temp_token`, AEAD-sealed TOTP, ±2-step drift).
- docs/OVERVIEW.md § 12 — the **fail-closed** note ("platform.enabled without an MFA config refuses an MFA-enabled admin login").
- docs/DEVELOPMENT_PLAN.md § P7 (DoD bullet on platform MFA).
- ../../../rust-auth/crates/bymax-auth-axum/src/routes/platform_mfa.rs — the mounted setup/verify-enable/disable/recovery-codes handlers (PlatformUser-guarded) and `routes/platform.rs::mfa_challenge`.
- ../../../rust-auth/crates/bymax-auth-core/src/services/adapter_api.rs — `mfa_setup(user_id, MfaContext::Platform)`, `platform_mfa_challenge(...)`, `mfa_result_platform(...)`.

TASK
Add an integration test module that proves the platform MFA journey with `MfaContext::Platform`, and proves the fail-closed default when `mfa` is unconfigured. Use the crypto TOTP primitives to generate a valid code from the enrolment secret (do not hard-code a code).

DELIVERABLES
1. `apps/api/tests/platform_mfa.rs`:
   ```rust
   //! Platform MFA runs with MfaContext::Platform and is fail-closed when unconfigured.
   use bymax_auth_types::claims::MfaContext;
   use bymax_auth_types::error::AuthErrorCode;
   use bymax_auth_crypto::totp;

   /// Full enrol → challenge round-trip in the platform domain.
   /// `mfa_setup(admin_id, MfaContext::Platform)` returns a secret + qrCodeUri;
   /// a code computed from that secret enables MFA; re-login returns an MFA challenge;
   /// `platform_mfa_challenge` issues a `PlatformAuthResult` (admin, NO tenantId).
   #[tokio::test]
   async fn platform_mfa_setup_enable_challenge_roundtrip() {
       let engine = test_engine_with_platform_and_mfa().await;
       let setup = engine.mfa_setup(&admin_id, MfaContext::Platform).await.unwrap();
       let code = format!("{:06}", totp::totp(&decode(&setup.secret), now(), 30, 6));
       // verify_enable(code) -> re-login -> MfaChallengeResult -> platform_mfa_challenge(temp, code)
   }

   /// Fail-closed: `platform.enabled` but NO `mfa` config must refuse an MFA-enabled
   /// admin login — the login returns an MFA-related error, never a `PlatformAuthResult`.
   #[tokio::test]
   async fn platform_mfa_enabled_admin_refused_when_mfa_unconfigured() {
       let engine = test_engine_platform_without_mfa().await; // mfa config absent
       let err = platform_login_mfa_admin(&engine).await.unwrap_err();
       assert!(matches!(err.code(), AuthErrorCode::MfaSetupRequired | AuthErrorCode::MfaNotEnabled | AuthErrorCode::MfaRequired));
   }
   ```
2. `apps/api/src/engine/mod.rs` (only if needed): a test-only constructor / profile switch that builds an engine with `platform.enabled` and the `mfa` config absent, to exercise the fail-closed path. Keep production wiring unchanged.

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code (tests may use them); typed thiserror.
- Never assert on a hard-coded TOTP code — compute it from the enrolment secret via `bymax_auth_crypto::totp`.
- The audit/diagnostics surfaces must never expose the MFA secret or recovery codes (redacting Debug holds).
- English-only TIMELESS comments — NO Phase/Task/roadmap references in committed source/config; no .gitkeep; git switch -c only.
- Memory-safe tests: bounded `--test-threads`; `sqlx migrate` first; never parallel test agents.

Verification:
- `cargo nextest run -p api platform_mfa --test-threads 2` — expected: the enrol/challenge round-trip passes AND the fail-closed test passes (login refused).
- `cargo llvm-cov nextest -p api --lcov` — expected: the platform-MFA paths at 100%.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `cargo fmt --all --check` — expected: no diff.
- `grep -riE "phase [0-9]|task [0-9]" apps/api/tests/platform_mfa.rs` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `2 / 5` and Last updated.
4. Update the P7 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 7.2 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `test(api): prove platform MFA round-trip + fail-closed default` (no Co-Authored-By).
````

---

### Task 7.3 — `ws-ticket` mint + example WebSocket endpoint

- **Status**: ✅ Done
- **Priority**: P1
- **Size**: M
- **Depends on**: —

#### Description

Verify `POST /auth/ws-ticket` mints a ~30 s single-use ticket, add a tiny example `WebSocketUpgrade` endpoint guarded by `WsAuthUser`/`WsAuthUserFromHeader`, and prove a ticket replay is rejected (redeem-once).

#### Acceptance criteria

- [x] `POST /auth/ws-ticket` (guarded by `AuthUser` + `UserStatus` + `MfaSatisfied`) returns a ticket; the `websocket` Cargo feature is enabled on `bymax-auth-axum` (via `full`).
- [x] `issue_ws_ticket(&DashboardClaims)` → `redeem_ws_ticket(ticket)` succeeds exactly once and returns the original `DashboardClaims` subject; a second `redeem_ws_ticket` on the same ticket errors (single-use / `WS_TICKET_TTL_SECONDS` = 30).
- [x] An example `GET /ws/example` endpoint upgrades the connection only when the query ticket redeems (via the engine's `redeem_ws_ticket`, the exact operation `WsAuthUser` performs); an absent/invalid/replayed ticket is rejected before upgrade — proven with a real `tokio-tungstenite` client.
- [x] The JWT is never read from the URL — the endpoint authenticates via the ticket only.
- [x] 100% coverage on the new `ws` module; static gates clean.

#### Files to create / modify

- `apps/api/src/ws/mod.rs` (the example `WebSocketUpgrade` endpoint)
- `apps/api/src/app.rs` (mount `GET /ws/example` onto the example Router)
- `apps/api/tests/ws_ticket.rs` (mint + single-use replay rejection)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 7 (Platform Domain & WebSocket) — Task 7.3 of 5 (MIDDLE)

PRECONDITIONS
- P5 produced the wired `AuthEngine` (with `redis_stores(Arc<RedisStores>)`, which wires the `WsTicketStore` seam) and the mounted `auth_router(...)`.
- P3 produced `apps/api/src/app.rs` composing the example `Router` + `AppState`.
- The `websocket` Cargo feature is available on `bymax-auth-axum` (via `full`); `axum` 0.8 provides `axum::extract::ws::{WebSocket, WebSocketUpgrade}`.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § 16 journey 12 "WebSocket auth" — "Connect realtime mints a ~30 s ws-ticket; the browser opens wss://…?ticket=… (the JWT never in the URL); the ticket is single-use (a replay is rejected)".
- docs/DEVELOPMENT_PLAN.md § P7 (DoD bullet on `ws-ticket`).
- ../../../rust-auth/crates/bymax-auth-axum/src/ws.rs — the mounted `POST /auth/ws-ticket` handler (`AuthUser` + `UserStatus` + `MfaSatisfied`) and the `WsAuthUser`/`WsAuthUserFromHeader` extractors.
- ../../../rust-auth/crates/bymax-auth-core/src/services/adapter_api.rs — `issue_ws_ticket(&DashboardClaims) -> Result<String, AuthError>`, `redeem_ws_ticket(ticket) -> Result<DashboardClaims, AuthError>`, `const WS_TICKET_TTL_SECONDS: u64 = 30`.

TASK
Add a small example WebSocket endpoint that authenticates via the library's WS ticket (never a JWT in the URL), mount it on the example Router, and add tests proving the ticket is minted and is single-use (a replay is rejected).

DELIVERABLES
1. `apps/api/src/ws/mod.rs`:
   ```rust
   //! Example realtime endpoint. The browser first calls `POST /auth/ws-ticket`
   //! (guarded by `AuthUser` + `UserStatus` + `MfaSatisfied`) to mint a single-use
   //! ticket (~30 s), then opens `wss://…?ticket=…`. `WsAuthUser` redeems the ticket
   //! exactly once — a replay is rejected. The JWT never travels in the URL.
   use axum::{
       extract::ws::{Message, WebSocket, WebSocketUpgrade},
       response::Response,
   };
   use bymax_auth_axum::WsAuthUser;
   use bymax_auth_types::claims::DashboardClaims;

   /// Upgrade only after `WsAuthUser` redeems the query ticket into `DashboardClaims`.
   pub async fn realtime(WsAuthUser(claims): WsAuthUser, upgrade: WebSocketUpgrade) -> Response {
       upgrade.on_upgrade(move |socket| handle_socket(socket, claims))
   }

   /// Echo the authenticated subject once, then close — the demo payload.
   async fn handle_socket(mut socket: WebSocket, claims: DashboardClaims) {
       let _ = socket.send(Message::Text(format!("authenticated: {}", claims.sub).into())).await;
       let _ = socket.close().await;
   }
   ```
2. `apps/api/src/app.rs`: mount the endpoint on the example Router.
   ```rust
   use axum::routing::get;
   // …
   router.route("/ws/example", get(crate::ws::realtime))
   ```
3. `apps/api/tests/ws_ticket.rs`:
   ```rust
   //! `ws-ticket` mints a single-use ticket; a replay is rejected.
   #[tokio::test]
   async fn ws_ticket_is_single_use() {
       let engine = test_engine().await;
       let claims = dashboard_claims_for(&engine).await;       // an authenticated user's claims
       let ticket = engine.issue_ws_ticket(&claims).await.unwrap();
       let first = engine.redeem_ws_ticket(&ticket).await;
       assert!(first.is_ok(), "first redeem succeeds");
       let replay = engine.redeem_ws_ticket(&ticket).await;
       assert!(replay.is_err(), "a replayed ticket is rejected (redeem once)");
   }
   ```
   Plus a route-level test asserting `POST /auth/ws-ticket` returns 200 for an authenticated user and that `/ws/example` rejects a missing/invalid ticket before upgrade.

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed thiserror.
- The endpoint authenticates ONLY via the ticket — never parse a JWT from the query string or path.
- English-only TIMELESS comments — NO Phase/Task/roadmap references in committed source/config; no .gitkeep; git switch -c only.
- Memory-safe tests: bounded `--test-threads`; never parallel test agents.

Verification:
- `cargo build --locked` — expected: builds (with the `websocket` feature).
- `cargo nextest run -p api ws_ticket --test-threads 2` — expected: `ws_ticket_is_single_use` passes (first redeem ok, replay err) and the route tests pass.
- `cargo llvm-cov nextest -p api --lcov` — expected: `apps/api/src/ws/mod.rs` at 100%.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `grep -riE "phase [0-9]|task [0-9]" apps/api/src/ws/mod.rs apps/api/tests/ws_ticket.rs` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `3 / 5` and Last updated.
4. Update the P7 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 7.3 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(api): example WebSocket endpoint guarded by single-use ws-ticket` (no Co-Authored-By).
````

---

### Task 7.4 — Diagnostics primitives (hash-strength · lockout · hook log)

- **Status**: ✅ Done
- **Priority**: P1
- **Size**: M
- **Depends on**: —

#### Description

Build the example-owned diagnostics surface for the server-only primitives that have no first-class UI journey: `password::needs_rehash` (hash staleness/strength), `BruteForceStore` force-lockout + `remaining_lockout_secs`, and the `AuthHooks` event log — each exposed through an example endpoint that reveals effects, never secrets.

#### Acceptance criteria

- [x] `/diagnostics/hash-strength` reports whether a PHC hash is stale for the current `PasswordParams` (`password::needs_rehash`) — returns a `needsRehash` verdict, never the hash itself (a `POST` body carries the PHC so it never lands in a URL/log).
- [x] `POST /diagnostics/force-lockout` drives `BruteForceStore::record_failure` until `is_locked` is true, then reports `remainingLockoutSecs` as a countdown; `POST /diagnostics/reset-lockout` clears it.
- [x] `GET /diagnostics/hooks` returns the `AuditAuthHooks` event log (event name + actor + timestamp) and is asserted to expose only masked fields — no token/OTP/secret (a projection over safe columns; the emailed OTP never appears).
- [x] All endpoints map errors through the example's typed `AppError` → the library envelope; no internal string leaks.
- [x] 100% coverage on the diagnostics module; static gates clean.

#### Files to create / modify

- `apps/api/src/diagnostics/mod.rs` + `apps/api/src/diagnostics/routes.rs` (the three endpoints)
- `apps/api/src/app.rs` (mount the `/diagnostics/*` routes)
- `apps/api/tests/diagnostics.rs` (behaviour + the no-secrets assertion)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 7 (Platform Domain & WebSocket) — Task 7.4 of 5 (MIDDLE)

PRECONDITIONS
- P5 produced the wired `AuthEngine` (`redis_stores(Arc<RedisStores>)` wires the `BruteForceStore` seam) and the `AuditAuthHooks` impl writing the audit/event log.
- P3 produced `apps/api/src/app.rs` and the example's typed `AppError` (mapping `AuthError` via the library `error_response`/`AuthRejection`).

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § 13 "Token, Session & Tenant Security" — the `password::needs_rehash` rehash-on-verify rule, the `BruteForceStore` lockout + `remaining_lockout_secs` countdown, and the never-log-secrets invariant.
- docs/OVERVIEW.md § 15 "Auth Event Tracking & the Audit Domain" — the `AuthHooks` event log (events receive `SafeAuthUser` + `HookContext`, never secrets).
- docs/DEVELOPMENT_PLAN.md § P7 (the diagnostics-primitives scope).
- ../../../rust-auth/crates/bymax-auth-crypto/src/password/mod.rs — `needs_rehash(phc: &str, current: &PasswordParams) -> bool`, `PasswordParams`.
- ../../../rust-auth/crates/bymax-auth-core/src/traits/store.rs — `BruteForceStore::{is_locked, record_failure, reset, remaining_lockout_secs}`.

TASK
Implement three example-owned diagnostics endpoints that surface server-only primitives through observable effects (never secrets), mount them on the example Router, and add tests including a no-secrets assertion on the hook log.

DELIVERABLES
1. `apps/api/src/diagnostics/routes.rs`:
   ```rust
   //! Example-owned diagnostics for server-only primitives. Effects only — never a
   //! token, OTP, MFA secret, or password hash crosses this boundary.
   use axum::{extract::State, Json};
   use bymax_auth_crypto::password::{self, PasswordParams};

   /// GET /diagnostics/hash-strength?phc=… → is the stored PHC hash stale for the
   /// engine's *current* params? (drives transparent rehash-on-login). Returns a
   /// verdict, NOT the hash.
   pub async fn hash_strength(/* ValidatedQuery<HashStrengthQuery>, State<AppState> */) -> Json<HashVerdict> {
       let needs = password::needs_rehash(&query.phc, &current_params);
       Json(HashVerdict { needs_rehash: needs })
   }

   /// POST /diagnostics/force-lockout → record failures until locked, then report the
   /// `remaining_lockout_secs` countdown. A follow-up `reset` clears the lock.
   pub async fn force_lockout(State(state): State<AppState>, /* Json<ForceLockoutBody> */) -> Json<LockoutVerdict> {
       let store = state.engine.brute_force_store();
       // record_failure(&id) … until is_locked(&id) == true
       let remaining = store.remaining_lockout_secs(&id).await?;
       Json(LockoutVerdict { is_locked: true, remaining_lockout_secs: remaining })
   }

   /// GET /diagnostics/hooks → the AuditAuthHooks event log (event + actor + ts),
   /// sourced from SafeAuthUser/HookContext — contains no secrets.
   pub async fn hooks(State(state): State<AppState>) -> Json<Vec<HookEventView>> { /* read the log */ }
   ```
2. `apps/api/src/diagnostics/mod.rs`: the view DTOs (`HashVerdict`, `LockoutVerdict`, `HookEventView`) with `#[serde(rename_all = "camelCase")]`; no field carries a secret.
3. `apps/api/src/app.rs`: mount `GET /diagnostics/hash-strength`, `POST /diagnostics/force-lockout`, `GET /diagnostics/hooks`.
4. `apps/api/tests/diagnostics.rs`:
   ```rust
   /// The hook-event log never contains a token, OTP, or secret — the never-log-secrets
   /// invariant rendered as a diagnostics surface.
   #[tokio::test]
   async fn hook_log_contains_no_secrets() {
       let body = get_json("/diagnostics/hooks").await;
       let serialized = serde_json::to_string(&body).unwrap();
       assert!(!serialized.contains("password"));
       assert!(!serialized.to_lowercase().contains("otp"));
   }
   ```
   Plus tests for the hash-strength verdict (stale vs current params) and the force-lockout countdown.

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed thiserror; map library errors through the example's `AppError` → the `{ error: { code, message, details } }` envelope.
- The diagnostics responses MUST NOT include a token, OTP, MFA secret, recovery code, or password hash — surface only effects (booleans, countdowns, event names).
- English-only TIMELESS comments — NO Phase/Task/roadmap references in committed source/config; no .gitkeep; git switch -c only.
- Memory-safe tests: bounded `--test-threads`; never parallel test agents.

Verification:
- `cargo nextest run -p api diagnostics --test-threads 2` — expected: hash-strength, force-lockout, and the no-secrets hook-log tests pass.
- `cargo llvm-cov nextest -p api --lcov` — expected: `apps/api/src/diagnostics/**` at 100%.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `cargo fmt --all --check` — expected: no diff.
- `grep -riE "phase [0-9]|task [0-9]" apps/api/src/diagnostics/` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `4 / 5` and Last updated.
4. Update the P7 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 7.4 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(api): diagnostics surface for hash-strength, lockout and the hook log` (no Co-Authored-By).
````

---

### Task 7.5 — Guard demo + e2e on `/audit` & `/diagnostics`

- **Status**: ✅ Done
- **Priority**: P1
- **Size**: M
- **Depends on**: 7.1, 7.3

#### Description

Gate the example's own `/audit` and `/diagnostics` routes with `AuthUser` / `RequireRole<R>` / `PlatformUser`, and e2e the allowed path vs the `401` (unauthenticated) and `403` (wrong role / wrong domain) paths. This is the LAST task in the phase — run the per-phase completion protocol.

#### Acceptance criteria

- [x] `/audit/*` is admin-gated (the `DashboardAdmin` guard, the `RequireRole<Admin>` equivalent); `/diagnostics/whoami` is an authenticated-only route (`DashboardUser`) and `/diagnostics/platform` is a platform-only route (`PlatformAdmin`).
- [x] e2e proves: a valid admin dashboard token → 200; no token → 401; a non-admin dashboard token → 403; a platform token on a dashboard-guarded route (and a dashboard token on the platform-only route) → 401/403.
- [x] The handlers carry **no bespoke auth logic** — each guard sources only the bearer credential and delegates every decision to the engine (`verify_access_token` / `verify_platform_token` / `role_satisfies`). The library's own extractor *types* cannot be hosted by a consumer (they bind the library's private `AuthState`, which has no public constructor, and phase rule 5 forbids editing the library), so the guards reuse the engine's security primitives verbatim instead.
- [x] 100% coverage on the gated routes + the guard tests; static gates clean.
- [x] **Per-phase closeout** executed: all five tasks ✅, P7 code-complete and in PR (dashboard advanced to 👀 Review pending merge + green CI).

#### Files to create / modify

- `apps/api/src/app.rs` (gate `/audit/*` and `/diagnostics/*`; define the `Admin` `Role` marker)
- `apps/api/src/audit/routes.rs` (apply `RequireRole<Admin>` to the audit read-API handlers)
- `apps/api/tests/guards_e2e.rs` (allowed vs 401 vs 403, both domains)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 7 (Platform Domain & WebSocket) — Task 7.5 of 5 (LAST)

PRECONDITIONS
- Task 7.1 is done: the platform domain answers and `verify_access_token`/`verify_platform_token` isolate the two token families.
- Task 7.3 is done: the example WS endpoint exists; Task 7.4 added the `/diagnostics/*` routes.
- P5 produced the example's `GET /audit/{logs,stream}` read-API handlers.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § 13 (the guards/RBAC overview) and § 15 (the audit read-API the routes expose).
- docs/DEVELOPMENT_PLAN.md § P7 (DoD: "The guard extractors gate the example routes (allowed vs 401/403)") and § 3 (the per-phase closeout / Update Protocol).
- ../../../rust-auth/crates/bymax-auth-axum/src/extractors/ — `AuthUser(DashboardClaims)`, `trait Role { const NAME: &'static str; }`, `RequireRole<R: Role>(DashboardClaims, PhantomData<R>)`, `PlatformUser(PlatformClaims)` (all `FromRequestParts`, rejecting `AuthRejection`).

TASK
Gate the example's own `/audit` and `/diagnostics` routes with the library extractors and add an e2e module proving the allowed path vs the 401/403 paths in both identity domains. Use the library extractors verbatim — write no bespoke auth checks in the handlers.

DELIVERABLES
1. `apps/api/src/app.rs`:
   ```rust
   use bymax_auth_axum::{AuthUser, PlatformUser, RequireRole, Role};

   /// The example's RBAC marker for the audit reader. `NAME` matches the role string
   /// in `DashboardClaims.role`; the library's role hierarchy resolves satisfaction.
   struct Admin;
   impl Role for Admin {
       const NAME: &'static str = "admin";
   }
   // mount: /audit/* gated by RequireRole<Admin>; an AuthUser-only diagnostics route;
   // a PlatformUser-gated diagnostics route (platform-only visibility).
   ```
2. `apps/api/src/audit/routes.rs`: apply `RequireRole<Admin>` to the audit read-API handlers.
   ```rust
   /// GET /audit/logs — admin-only keyset page over the audit log.
   pub async fn logs(RequireRole(claims, _): RequireRole<Admin>, /* ValidatedQuery<AuditQuery>, State */) -> impl IntoResponse { /* … */ }
   ```
3. `apps/api/tests/guards_e2e.rs`:
   ```rust
   //! The example routes are gated by the library extractors — allowed vs 401/403.
   #[tokio::test]
   async fn audit_requires_admin_dashboard_token() {
       // admin token  -> 200
       // no token     -> 401
       // non-admin    -> 403
       // platform tok -> 401/403 (wrong domain for a dashboard guard)
   }

   #[tokio::test]
   async fn platform_only_diagnostics_rejects_dashboard_token() {
       // platform token -> 200 ; dashboard token -> 401/403
   }
   ```

Constraints:
- Reuse the library extractors verbatim — no bespoke role/domain checks in the example handlers.
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed thiserror; errors map through `AuthRejection`/`error_response`.
- English-only TIMELESS comments — NO Phase/Task/roadmap references in committed source/config; no .gitkeep; git switch -c only.
- Memory-safe tests: bounded `--test-threads`; `sqlx migrate` first; never parallel test agents.

Verification:
- `cargo nextest run -p api guards_e2e --test-threads 2` — expected: admin→200, no-token→401, non-admin→403, cross-domain→401/403 all pass.
- `cargo llvm-cov nextest -p api --lcov` — expected: 100% across the P7 modules (engine wiring, platform tests, `ws`, `diagnostics`, gated `audit`).
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `cargo public-api` — expected: no unexpected new consumed-surface drift.
- `grep -riE "phase [0-9]|task [0-9]" apps/api/src/app.rs apps/api/src/audit/routes.rs apps/api/tests/guards_e2e.rs` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `5 / 5` and Last updated.
4. Update the P7 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 7.5 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(api): gate example audit/diagnostics routes with library guards + e2e` (no Co-Authored-By).
(The LAST task also runs the PER-PHASE protocol: flip P7 to ✅ / 5 of 5 in docs/DEVELOPMENT_PLAN.md, advance the Active phase to P8, recompute Overall %.)
````

---

## Phase Completion Protocol

Run this closeout when the **last task (7.5)** is ✅:

1. Confirm **all five tasks are ✅** in the Task index and every Definition-of-Done bullet for P7 in [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P7 is met (platform login/me/refresh/logout + platform MFA over HTTP; cross-domain token isolation both ways; platform MFA fail-closed; `ws-ticket` minted + single-use; the example WS endpoint authenticates via the ticket; the guard extractors gate the example routes; 100% coverage on the P7 modules).
2. Confirm the phase PR is **merged** and **CI is fully green** (every required check).
3. In [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md): set the **P7** dashboard row Status to ✅, Progress to `5 / 5`, and the Last-updated date; advance the **Active phase** (P8 — Web Skeleton & Design System); recompute **Overall progress** (`N / 15 phases`, `M / 86 tasks`, %).
4. Set this file's header **Status** to ✅ and the Last-updated date.
5. Commit `docs(plan): P7 complete` (no `Co-Authored-By`).
6. If any DoD bullet is unmet while the rest are done, mark the phase 🟡 Partial (never ✅) and record what remains.

---

## Completion log

> Append-only. One line per completed task: `- <id> ✅ YYYY-MM-DD — <summary>`.

- 7.1 ✅ 2026-07-02 — Enabled the platform domain (config flag + controller toggle + platform role hierarchy), wired the `SqlxPlatformUserRepository` seam into the builder, and proved the five `/auth/platform/*` routes plus dashboard↔platform token isolation (both directions, engine seam + HTTP).
- 7.2 ✅ 2026-07-02 — Proved the platform MFA journey (setup → verify-enable → re-login challenge → `MfaContext::Platform` challenge issuing a tenant-less `PlatformAuthResult`), the disable/recovery-codes routes, and the fail-closed default (an MFA-enabled admin refused when the deployment has no MFA surface).
- 7.3 ✅ 2026-07-02 — Added the example `GET /ws/example` endpoint that redeems the single-use ticket via `redeem_ws_ticket` (the consumer-legal equivalent of `WsAuthUser`, since the library exposes no public `AuthState` constructor to host an extractor-typed route). Proved the mounted `POST /auth/ws-ticket` mint, the once-only redeem/replay, and a real `tokio-tungstenite` upgrade that rejects absent/invalid/replayed tickets — the JWT never in the URL.
- 7.4 ✅ 2026-07-02 — Extended the diagnostics surface: `force-lockout` now reports the `remainingLockoutSecs` countdown and a new `reset-lockout` clears it; added a masked-fields-only assertion on the hook log (safe projection, no token/OTP/secret). Hash-strength and the hook log already surfaced effects, never secrets.
- 7.5 ✅ 2026-07-02 — Gated the example's `/audit/*` (admin-only) and added `/diagnostics/whoami` (authenticated-only) + `/diagnostics/platform` (platform-only) via example guards that delegate to the engine's `verify_access_token` / `verify_platform_token` / `role_satisfies`. e2e proves admin→200, none→401, non-admin→403, and cross-domain→401/403 in both domains.
