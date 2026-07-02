# Phase 3 — API Skeleton

> **Status**: 👀 Review · **Progress**: 6 / 6 tasks · **Last updated**: 2026-07-02
> **Source roadmap**: [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P3
> **Source spec**: [`docs/OVERVIEW.md`](../OVERVIEW.md)
> **Executing a task?** Read **only** that task's `### Task N.n` block + its bounded *REQUIRED READING* — never the whole file. See [token economy](README.md#token-economy--executing-a-single-task).

---

## Context

P1 produced the one-command local stack (Postgres + Redis + Mailpit, each healthchecked) and the fail-fast environment
contract — the `figment`-based loader in `apps/api/src/config/` that turns the validated `.env` into a `Settings` struct
(`api_port`, `database_url`, `redis_url`, `redis_namespace`, `web_origin`, the JWT/MFA secrets) and aborts startup on a
missing/invalid var. P2 then consumed both sibling surfaces pre-publish: `apps/api/Cargo.toml` carries the `path` deps on
`../../../rust-auth/crates/{bymax-auth-axum,bymax-auth-core,bymax-auth-redis}` (features `full` on axum + core, `mfa`/`oauth`/`platform` on redis — `bymax-auth-redis` has no `full` feature), and the export audits
(`cargo public-api` + `audit:exports`) pass on the stub. There is still **no running service**: nothing binds a port,
nothing connects to Postgres or Redis, and there is no error envelope.

Phase 3 builds the **bootable axum skeleton** — the cross-cutting plumbing the engine (P5) will slot into, with none of
the auth logic yet. When P3 is done: `cargo run -p api` binds `API_PORT`, installs the JSON tracing subscriber, and
serves a router with `GET /health` (200 + the crate version); a graceful-shutdown signal drains in-flight requests on
Ctrl-C / SIGTERM; the global CORS + tower-http stack (allow `x-tenant-id`, expose `Retry-After`, the `WEB_ORIGIN`
allow-list, `TraceLayer`, security headers, a body limit) wraps every response; a typed `AppError` renders the library's
canonical `{ "error": { code, message, details } }` envelope with the correct status (delegating to `error_response`),
and collapses every infrastructure failure to an opaque `auth.internal` 500; and `AppState` holds the eagerly-connected
`PgPool` and the lazy `Arc<RedisStores>` handle, with both connect paths covered (a down Postgres/Redis aborts with a
precise message). `cargo nextest run -p api`, `cargo llvm-cov nextest -p api` (100% on every covered module),
`cargo clippy --workspace --all-targets -- -D warnings`, and `cargo +1.90 check` all pass.

**Scope fence:** this phase wires only the HTTP shell and the Postgres/Redis handles — it mounts **no** `auth_router`, no
repositories, no engine, and no auth routes; the library's `/auth/*` surface is mounted in P5 and the repositories land
in P4.

---

## Rules-of-phase

1. **The example owns telemetry — the adapter installs none.** `bymax-auth-axum` installs no tracing subscriber by
   design (the consumer owns it). Install the JSON `tracing-subscriber` exactly once, before the runtime serves, so the
   `TraceLayer` spans and every `tracing` event are actually recorded; use `try_init()` so a re-init (in tests) never
   panics.
2. **`AppError` never leaks an internal string.** Only the `Auth(AuthError)` variant is rendered verbatim (via
   `error_response`); `Database`, config, and every other infrastructure failure collapse to `AuthError::Internal` →
   the generic `auth.internal` 500 client message. The source error is logged, never serialized into the body.
3. **Delegate the envelope — never re-implement it.** Library errors render through `bymax_auth_axum::error_response`
   (which uses `AuthError::to_envelope` / the wire-remapped code + `http_status` under the hood). Do not hand-roll the
   `{ "error": { … } }` shape or the status table — the adapter is the single source of truth.
4. **No `unwrap`/`expect`/`panic!` on the bind/connect/shutdown paths.** `main.rs` is excluded from coverage as glue, but
   the no-panic invariant still applies: the bind, pool-connect, store-connect, and signal-handler paths use `?` and
   `match`, never `expect`. Typed `thiserror` errors only.
5. **`ConnectInfo<SocketAddr>` is mandatory.** Serve with
   `router.into_make_service_with_connect_info::<SocketAddr>()` — the adapter's `RequestContext` (client IP) and the
   per-route rate limiter (the `Retry-After` source) require peer-address capture; without it the engine's request
   context is empty.
6. **CORS with credentials demands an explicit allow-list.** Never pair `allow_credentials(true)` with `Any`. The origin
   is the single `WEB_ORIGIN` value (parsed to a `HeaderValue`); allow the `x-tenant-id` request header; expose
   `Retry-After` so the browser can read the rate-limit countdown.
7. **Lazy stores, eager pool.** `RedisStores::connect` does no I/O at construct (the pool is lazy) — wrap it in `Arc`
   once and share it; the `PgPool` connects eagerly so a misconfigured/unreachable database fails at boot, not on the
   first request. `AppState` is cheaply `Clone` (the pool and the `Arc` clone are pointer copies).
8. **Coverage scope.** `main.rs` is non-executable glue (excluded); every other new module (`app`, `error`, `layers`,
   `routes::health`, `db`, `stores`, `telemetry`) is unit-tested to 100% on all metrics. The pool/store happy paths are
   exercised by an integration test against the **test stack** (`docker-compose.test.yml`, high ports).
9. **Memory-safe tests.** Run with `cargo nextest run -p api` under bounded `--test-threads`; never fan out parallel test
   agents. The integration test runs `sqlx migrate`/`docker compose up --wait` against the test stack first.
10. **Timeless, English-only deliverable code.** rustdoc on every public item; no `Phase N` / `Task` / roadmap-stage
    references in any committed source, config, or comment (this planning file may name them; the code it produces may
    not). Conventional Commits, no `Co-Authored-By`; branch with `git switch -c` (never `git checkout -b`).

---

## Reference docs

- [`OVERVIEW.md`](../OVERVIEW.md) — § "3. Architecture at a Glance" (the single axum API hosting the engine + the example
  seams), § "9. Configuration & Environment" (the env table + the canonical `apps/api/src/engine/` wiring shape that this
  shell prepares for), § "11. The Authentication Pipelines (Deep Dive)" (why `ConnectInfo` + the request context
  matter), § "13. Token, Session & Tenant Security" (the security-header / CORS / `Retry-After` posture).
- [`DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) — § "Phase 3 — API Skeleton", § "2. Global Conventions", § "3.
  Autonomous Execution Model".
- Sibling sources to copy & adapt (do NOT invent the bootstrap):
  `/Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/examples/axum-minimal/src/main.rs` and
  `/Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/examples/e2e-backend/src/main.rs` (the `#[tokio::main]` +
  `auth_router` + `into_make_service_with_connect_info::<SocketAddr>()` bootstrap),
  `/Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/crates/bymax-auth-axum/src/response.rs` (the
  `error_response(&AuthError) -> Response` signature + the envelope),
  `/Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/crates/bymax-auth-redis/src/pool.rs` (the
  `RedisStores::connect(url, namespace)` signature + `RedisStoreError`), and
  `/Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/` (the CI/config shape, for reference only).
- /bymax-workflow:standards — universal coding rules (apply the Rust track).

---

## Task index

| ID | Task | Status | Priority | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| 3.1 | tokio + axum bootstrap (`main.rs` + `AppState`) | ✅ Done | P0 | M | — |
| 3.2 | CORS + tower-http global layers | ✅ Done | P0 | S | 3.1 |
| 3.3 | `GET /health` (version probe) | ✅ Done | P1 | S | 3.1 |
| 3.4 | Typed `AppError` → `IntoResponse` | ✅ Done | P0 | M | 3.1 |
| 3.5 | sqlx `PgPool` provider | ✅ Done | P0 | M | 3.1 |
| 3.6 | `RedisStores` handle + JSON telemetry | ✅ Done | P0 | M | 3.1 |

---

## Tasks

### Task 3.1 — tokio + axum bootstrap (`main.rs` + `AppState`)

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Stand up the async entrypoint (`#[tokio::main]`, `axum::serve` on `API_PORT`, graceful-shutdown signal) and the
`AppState` struct + `build_router` composition function that every later task extends — the bootable shell, no routes
beyond a fallback yet.

#### Acceptance criteria

- [x] `apps/api/src/main.rs` exists with `#[tokio::main] async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>>`
  that loads `config::Settings`, builds `AppState`, builds the router, binds `127.0.0.1:{settings.api_port}`, and serves
  via `router.into_make_service_with_connect_info::<SocketAddr>()` with `.with_graceful_shutdown(shutdown_signal())`.
- [x] `shutdown_signal()` resolves on Ctrl-C **or** (on Unix) SIGTERM, using no `unwrap`/`expect` (the non-Unix arm and
  the signal-install-failure arm fall back to `std::future::pending()`).
- [x] `apps/api/src/app.rs` exports a `#[derive(Clone)] AppState` (with `Default`) and `pub fn build_router(state: AppState) -> Router`
  returning a `Router` with `.with_state(state)`; the struct carries `version: &'static str = env!("CARGO_PKG_VERSION")`
  and a rustdoc note that the database pool, the Redis store handle, and the wired `AuthEngine` are attached here as those
  layers are introduced.
- [x] A unit test proves `build_router(AppState::default())` produces a service that answers (e.g. a fallback `404`) via
  `tower::ServiceExt::oneshot` — no live port bound in the test.
- [x] `cargo build --locked` succeeds; `cargo run -p api` binds the port and shuts down cleanly on Ctrl-C.

#### Files to create / modify

- `apps/api/src/main.rs`, `apps/api/src/app.rs`
- `apps/api/src/routes/mod.rs` (empty module barrel, populated by Task 3.3)
- `apps/api/Cargo.toml` (add `axum`, `tokio` (`rt-multi-thread`,`macros`,`signal`,`net`), `tower`, `tracing` deps if absent)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 3 (API Skeleton) — Task 3.1 of 6 (FIRST)

PRECONDITIONS
- P1 built the figment-based loader: `apps/api/src/config/` exports a validated `Settings` with at least `api_port: u16`, `database_url: String`, `redis_url: String`, `redis_namespace: String`, `web_origin: String`, and a `Settings::load() -> Result<Settings, ConfigError>` that aborts on a missing/invalid var.
- P2 added the `path` deps on bymax-auth-axum/-core/-redis (features `full` on axum + core; `mfa`/`oauth`/`platform` on redis) in `apps/api/Cargo.toml`; the audits pass on the stub. No service binds a port yet.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "3. Architecture at a Glance" — the single axum API that will host the engine; the example owns the bootstrap.
- docs/OVERVIEW.md § "9. Configuration & Environment" — the `Settings`/`API_PORT` contract this entrypoint consumes.
- /Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/examples/axum-minimal/src/main.rs — copy & adapt the `#[tokio::main]` + `TcpListener::bind` + `axum::serve(...).into_make_service_with_connect_info::<SocketAddr>()` shape (do NOT copy its in-memory engine wiring — there is no engine in this task).

TASK
Author the async entrypoint and the `AppState`/`build_router` composition that every later task extends. Bind `API_PORT`, serve with peer-address capture and a graceful-shutdown signal. No auth routes, no engine — only the shell.

DELIVERABLES
1. `apps/api/src/app.rs`:
   - the shared, cheaply-cloneable state + the router composition seam.
   ```rust
   use axum::Router;

   /// Shared, cheaply-cloneable handles every request needs.
   ///
   /// The database pool, the Redis store handle, and the wired `AuthEngine` are
   /// attached to this struct as the persistence, store, and engine layers are
   /// introduced; today it carries only the running crate version for `/health`.
   #[derive(Clone)]
   pub struct AppState {
       /// The running crate version, surfaced by the health probe.
       pub version: &'static str,
   }

   impl AppState {
       /// Build the initial state from compile-time metadata.
       #[must_use]
       pub fn new() -> Self {
           Self { version: env!("CARGO_PKG_VERSION") }
       }
   }

   impl Default for AppState {
       fn default() -> Self {
           Self::new()
       }
   }

   /// Compose the example's own router. Later layers merge their route groups and
   /// the mounted `auth_router` onto the value returned here.
   #[must_use]
   pub fn build_router(state: AppState) -> Router {
       Router::new().with_state(state)
   }
   ```
2. `apps/api/src/main.rs` (non-executable glue — excluded from coverage, but still no `unwrap`/`expect`):
   ```rust
   mod app;
   mod config;
   mod routes;

   use std::net::SocketAddr;

   use tokio::signal;

   #[tokio::main]
   async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
       let settings = config::Settings::load()?;
       let state = app::AppState::new();
       let router = app::build_router(state);

       let addr = SocketAddr::from(([127, 0, 0, 1], settings.api_port));
       let listener = tokio::net::TcpListener::bind(addr).await?;
       tracing::info!(%addr, "api listening");

       axum::serve(
           listener,
           router.into_make_service_with_connect_info::<SocketAddr>(),
       )
       .with_graceful_shutdown(shutdown_signal())
       .await?;

       Ok(())
   }

   /// Resolve when the process receives Ctrl-C or (on Unix) SIGTERM, so in-flight
   /// requests drain before the listener stops accepting new connections.
   async fn shutdown_signal() {
       let ctrl_c = async {
           let _ = signal::ctrl_c().await;
       };

       #[cfg(unix)]
       let terminate = async {
           match signal::unix::signal(signal::unix::SignalKind::terminate()) {
               Ok(mut sig) => {
                   sig.recv().await;
               }
               Err(_) => std::future::pending::<()>().await,
           }
       };

       #[cfg(not(unix))]
       let terminate = std::future::pending::<()>();

       tokio::select! {
           () = ctrl_c => {},
           () = terminate => {},
       }
   }
   ```
3. `apps/api/src/routes/mod.rs` — an empty module barrel for now (`//! Example-owned HTTP routes.`); Task 3.3 adds `pub mod health;`.
4. `apps/api/Cargo.toml` — ensure `axum = "0.8"`, `tokio = { version = "1", features = ["rt-multi-thread", "macros", "signal", "net"] }`, `tower`, `tracing`, and (dev) `tower` `ServiceExt` / `http-body-util` are available.
5. A unit test in `app.rs` (`#[cfg(test)] mod tests`): build `build_router(AppState::default())` and assert via `tower::ServiceExt::oneshot` that an unknown path returns `404` and that `AppState::default().version == env!("CARGO_PKG_VERSION")`.

Constraints:
- #![forbid(unsafe_code)] on the crate; no unwrap/expect/panic!/todo!/unreachable! in non-test code (the bind/serve/shutdown paths use `?` and `match`); typed thiserror errors.
- English-only, TIMELESS rustdoc/comments — NO Phase/Task/roadmap references in any committed source or config.
- No `.gitkeep`/empty-dir scaffolding; `git switch -c feat/p3-api-skeleton` (never `git checkout -b`).

Verification:
- `cargo build --locked` — expected: builds clean.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: no warnings.
- `cargo fmt --all --check` — expected: no diff.
- `cargo nextest run -p api app` — expected: the `app` unit tests pass.
- `cargo +1.90 check` — expected: builds on the MSRV floor.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `1 / 6` and Last updated to today.
4. Update the P3 row Progress to `1 / 6` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 3.1 ✅ <YYYY-MM-DD> — tokio + axum bootstrap (main.rs + AppState)`.
6. Commit `feat(api): bootstrap tokio + axum service with graceful shutdown` (no Co-Authored-By).
````

---

### Task 3.2 — CORS + tower-http global layers

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: S
- **Depends on**: 3.1

#### Description

Author the global middleware stack — a `WEB_ORIGIN`-allow-listed `CorsLayer` (allow `x-tenant-id`, expose `Retry-After`),
`TraceLayer`, response security headers, and a `RequestBodyLimitLayer` — applied outermost-first over the example's
router.

#### Acceptance criteria

- [x] `apps/api/src/layers.rs` exports `cors_layer(settings: &Settings) -> Result<CorsLayer, AppError>` building a CORS
  layer with `allow_origin(WEB_ORIGIN parsed to HeaderValue)`, `allow_credentials(true)`, methods
  `GET/POST/DELETE/OPTIONS`, request headers including `content-type`, `authorization`, and `x-tenant-id`, and
  `expose_headers([RETRY_AFTER])`.
- [x] `apps/api/src/layers.rs` exports `apply_global_layers(router: Router, settings: &Settings) -> Result<Router, AppError>`
  composing, **outermost-first**, `TraceLayer::new_for_http()` → the CORS layer → security response headers
  (`x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: no-referrer`) →
  `RequestBodyLimitLayer::new(MAX_BODY_BYTES)` (1 MiB) as chained `Router::layer` calls (`RequestBodyLimitLayer` changes
  the request body type, so axum requires it applied directly to the router rather than composed in a `ServiceBuilder`).
- [x] `main.rs` wraps the router: `let app = layers::apply_global_layers(app::build_router(state), &settings)?;`.
- [x] A unit test proves: an `OPTIONS` preflight with `Origin: <WEB_ORIGIN>` echoes `access-control-allow-origin` and
  lists `x-tenant-id` in `access-control-allow-headers`; an actual cross-origin `GET` exposes `retry-after` in
  `access-control-expose-headers` and carries `x-content-type-options: nosniff`. 100% coverage on `layers.rs`.

#### Files to create / modify

- `apps/api/src/layers.rs`
- `apps/api/src/main.rs` (declare `mod layers;`; wrap the router)
- `apps/api/Cargo.toml` (`tower-http` with `cors`, `trace`, `limit`, `set-header` features)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 3 (API Skeleton) — Task 3.2 of 6 (MIDDLE)

PRECONDITIONS
- Task 3.1 done: `apps/api/src/app.rs` exports `AppState` + `build_router(state) -> Router`; `main.rs` serves with `into_make_service_with_connect_info::<SocketAddr>()`.
- Task 3.4 will add `crate::error::AppError`; if it is not present yet, return a thiserror error from `cors_layer` and re-map it once 3.4 lands (the two tasks are independent — coordinate the `AppError` import).
- `config::Settings` carries `web_origin: String`.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "13. Token, Session & Tenant Security" — the security-header / CORS / `Retry-After` posture (allow `x-tenant-id`, expose `Retry-After`, the `WEB_ORIGIN` allow-list).
- docs/DEVELOPMENT_PLAN.md § "2. Global Conventions" — the Security-defaults row (tower-http security headers, CORS allow-list).
- The adapter's own middleware order for reference (do NOT re-mount it): `/Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/crates/bymax-auth-axum/src/middleware.rs` — outermost-first `TraceLayer` → optional `CorsLayer` → sensitive-headers → `RequestBodyLimitLayer` → cookie manager.

TASK
Author the example's own global layer stack and wrap the router with it. The adapter applies its own internal stack to the `/auth/*` routes (mounted later); this stack governs the example's own routes and the merged surface.

DELIVERABLES
1. `apps/api/src/layers.rs`:
   ```rust
   use axum::Router;
   use axum::http::{header, HeaderName, HeaderValue, Method};
   use tower::ServiceBuilder;
   use tower_http::cors::CorsLayer;
   use tower_http::limit::RequestBodyLimitLayer;
   use tower_http::set_header::SetResponseHeaderLayer;
   use tower_http::trace::TraceLayer;

   use crate::config::Settings;
   use crate::error::AppError;

   /// The tenant discriminator the browser sends on every dashboard request.
   const X_TENANT_ID: HeaderName = HeaderName::from_static("x-tenant-id");
   /// Defense-in-depth body cap for the example's own routes (1 MiB).
   const MAX_BODY_BYTES: usize = 1024 * 1024;

   /// Build the CORS layer from the validated `WEB_ORIGIN` allow-list.
   ///
   /// Credentialed CORS forbids a wildcard origin, so the single configured origin
   /// is parsed to an exact `HeaderValue`; `x-tenant-id` is allowed inbound and
   /// `Retry-After` is exposed so the browser can read the rate-limit countdown.
   pub fn cors_layer(settings: &Settings) -> Result<CorsLayer, AppError> {
       let origin = settings
           .web_origin
           .parse::<HeaderValue>()
           .map_err(|err| AppError::Internal(Box::new(err)))?;
       Ok(CorsLayer::new()
           .allow_origin(origin)
           .allow_credentials(true)
           .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::OPTIONS])
           .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION, X_TENANT_ID])
           .expose_headers([header::RETRY_AFTER]))
   }

   /// Wrap a router with the example's global middleware, outermost-first.
   pub fn apply_global_layers(router: Router, settings: &Settings) -> Result<Router, AppError> {
       let stack = ServiceBuilder::new()
           .layer(TraceLayer::new_for_http())
           .layer(cors_layer(settings)?)
           .layer(SetResponseHeaderLayer::overriding(
               HeaderName::from_static("x-content-type-options"),
               HeaderValue::from_static("nosniff"),
           ))
           .layer(SetResponseHeaderLayer::overriding(
               HeaderName::from_static("x-frame-options"),
               HeaderValue::from_static("DENY"),
           ))
           .layer(SetResponseHeaderLayer::overriding(
               header::REFERRER_POLICY,
               HeaderValue::from_static("no-referrer"),
           ))
           .layer(RequestBodyLimitLayer::new(MAX_BODY_BYTES));
       Ok(router.layer(stack))
   }
   ```
2. `apps/api/src/main.rs` — declare `mod layers;`; replace the bare `build_router` call with
   `let app = layers::apply_global_layers(app::build_router(state), &settings)?;` and serve `app`.
3. `apps/api/Cargo.toml` — `tower-http = { version = "0.6", features = ["cors", "trace", "limit", "set-header"] }`.
4. A `#[cfg(test)] mod tests` in `layers.rs` (100% coverage): build a tiny `Router::new().route("/", get(|| async {}))`, apply `apply_global_layers` with a `Settings` whose `web_origin` is `http://localhost:3000`, then via `tower::ServiceExt::oneshot`:
   - an `OPTIONS` preflight (`Origin`, `Access-Control-Request-Method: POST`, `Access-Control-Request-Headers: x-tenant-id`) ⇒ `access-control-allow-origin` echoes the origin, `access-control-allow-headers` contains `x-tenant-id`, `access-control-expose-headers` contains `retry-after`;
   - a plain `GET /` ⇒ `x-content-type-options: nosniff`, `x-frame-options: DENY`;
   - a `cors_layer` call with an un-parseable `web_origin` (e.g. `"http://exa mple"`) ⇒ `Err(AppError::Internal(_))`.

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed thiserror error from the parse path.
- Never pair `allow_credentials(true)` with `Any`; the origin is the explicit `WEB_ORIGIN`.
- English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config; no `.gitkeep`; `git switch -c` only.

Verification:
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `cargo nextest run -p api layers` — expected: the layer tests pass.
- `cargo llvm-cov nextest -p api --lcov --output-path target/lcov.info` — expected: `apps/api/src/layers.rs` reports 100% on all metrics.
- `cargo fmt --all --check` — expected: no diff.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `2 / 6` and Last updated to today.
4. Update the P3 row Progress to `2 / 6` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 3.2 ✅ <YYYY-MM-DD> — CORS + tower-http global layers`.
6. Commit `feat(api): add global CORS + tower-http security layer stack` (no Co-Authored-By).
````

---

### Task 3.3 — `GET /health` (version probe)

- **Status**: ✅ Done
- **Priority**: P1
- **Size**: S
- **Depends on**: 3.1

#### Description

Add the `GET /health` handler — 200 with `{ status: "ok", version }` where `version` is `env!("CARGO_PKG_VERSION")` —
and merge it onto the example's router, with a unit test.

#### Acceptance criteria

- [x] `apps/api/src/routes/health.rs` exports a `health` handler returning `200` + `Json(HealthResponse { status: "ok", version })`,
  where `version` comes from `AppState` (which holds `env!("CARGO_PKG_VERSION")`), plus a `pub fn routes() -> Router<AppState>`
  mounting `GET /health`.
- [x] `routes/mod.rs` declares `pub mod health;`; `app::build_router` merges `routes::health::routes()` before
  `.with_state(state)`.
- [x] `HealthResponse` derives `Serialize` (and `Debug`); the body is exactly `{"status":"ok","version":"<crate version>"}`.
- [x] A unit test asserts `GET /health` ⇒ `200`, `status == "ok"`, and `version == env!("CARGO_PKG_VERSION")`. 100%
  coverage on `routes/health.rs`.

#### Files to create / modify

- `apps/api/src/routes/health.rs`
- `apps/api/src/routes/mod.rs` (add `pub mod health;`)
- `apps/api/src/app.rs` (merge the health routes into `build_router`)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 3 (API Skeleton) — Task 3.3 of 6 (MIDDLE)

PRECONDITIONS
- Task 3.1 done: `apps/api/src/app.rs` exports `AppState { version: &'static str }` + `build_router(state) -> Router`; `routes/mod.rs` is an empty barrel.
- `serde`/`serde_json` are available (transitively, via the library deps) — add `serde = { version = "1", features = ["derive"] }` to `apps/api/Cargo.toml` if it is not a direct dep.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "9. Configuration & Environment" — the `/health` probe is the example's own route (alongside `/audit/*`, `/diagnostics/*`), merged onto the same `Router`.

TASK
Author the `GET /health` handler (200 + the crate version), mount it, and unit-test it to 100%.

DELIVERABLES
1. `apps/api/src/routes/health.rs`:
   ```rust
   use axum::extract::State;
   use axum::routing::get;
   use axum::{Json, Router};
   use serde::Serialize;

   use crate::app::AppState;

   /// The `/health` probe payload: a liveness flag + the running crate version.
   #[derive(Debug, Serialize)]
   pub struct HealthResponse {
       /// Always `"ok"` while the process is accepting requests.
       pub status: &'static str,
       /// The running crate version (`CARGO_PKG_VERSION`).
       pub version: &'static str,
   }

   /// Liveness probe — returns `200` with the running crate version.
   pub async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
       Json(HealthResponse { status: "ok", version: state.version })
   }

   /// The example's health route group.
   #[must_use]
   pub fn routes() -> Router<AppState> {
       Router::new().route("/health", get(health))
   }
   ```
2. `apps/api/src/routes/mod.rs` — add `pub mod health;`.
3. `apps/api/src/app.rs` — `build_router` merges the health routes:
   ```rust
   pub fn build_router(state: AppState) -> Router {
       Router::new()
           .merge(crate::routes::health::routes())
           .with_state(state)
   }
   ```
4. A `#[cfg(test)] mod tests` in `routes/health.rs` (100% coverage): drive `routes().with_state(AppState::new())` through `tower::ServiceExt::oneshot` with `GET /health`; assert `status == 200`, then deserialize the body and assert `status == "ok"` and `version == env!("CARGO_PKG_VERSION")`.

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed thiserror errors.
- English-only TIMELESS rustdoc — NO Phase/Task/roadmap references in any committed source/config; no `.gitkeep`; `git switch -c` only.

Verification:
- `cargo nextest run -p api health` — expected: the health test passes.
- `cargo llvm-cov nextest -p api --lcov --output-path target/lcov.info` — expected: `apps/api/src/routes/health.rs` reports 100% on all metrics.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- (With the service running) `curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health` — expected: `200`.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `3 / 6` and Last updated to today.
4. Update the P3 row Progress to `3 / 6` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 3.3 ✅ <YYYY-MM-DD> — GET /health version probe`.
6. Commit `feat(api): add GET /health version probe` (no Co-Authored-By).
````

---

### Task 3.4 — Typed `AppError` → `IntoResponse`

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: 3.1

#### Description

Author the example's typed `AppError` enum (`thiserror` + `IntoResponse`) that renders library `AuthError`s through the
adapter's `error_response` and collapses every infrastructure failure to an opaque `auth.internal` 500 — never leaking
the inner string.

#### Acceptance criteria

- [x] `apps/api/src/error.rs` exports `#[derive(Debug, thiserror::Error)] pub enum AppError` with at least
  `Auth(#[from] AuthError)`, `Database(#[source] sqlx::Error)`, and `Internal(#[source] Box<dyn Error + Send + Sync>)`,
  plus `impl From<sqlx::Error> for AppError`.
- [x] `impl IntoResponse for AppError` renders `Auth(err)` via `bymax_auth_axum::error_response(&err)`, and renders both
  `Database` and `Internal` by wrapping the source in `AuthError::Internal(..)` and delegating to `error_response` — so
  the body uses the generic `auth.internal` client message and the source string is **never** serialized.
- [x] A unit test proves: `AppError::from(AuthError::InvalidCredentials).into_response()` ⇒ status `401` and body
  `{"error":{"code":"auth.invalid_credentials",...}}`; an `AppError::Internal` carrying a secret marker string ⇒ status
  `500`, body `code == "auth.internal"`, and the body does **not** contain the secret marker.
- [x] 100% coverage on `error.rs`.

#### Files to create / modify

- `apps/api/src/error.rs`
- `apps/api/src/main.rs` (declare `mod error;`)
- `apps/api/Cargo.toml` (add the `bymax-auth-types` path dep — first phase to name a `bymax-auth-types` type directly)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 3 (API Skeleton) — Task 3.4 of 6 (MIDDLE)

PRECONDITIONS
- Task 3.1 done: the crate compiles as a binary with `mod app; mod config; mod routes;`.
- The library exposes `bymax_auth_axum::error_response(error: &AuthError) -> Response` and `bymax_auth_axum::AuthRejection(pub AuthError)` (extractor rejection, `From<AuthError>`, `IntoResponse`). `bymax_auth_types::AuthError` (defined in the `bymax-auth-types` crate — `bymax-auth-core` does NOT re-export it) is a thiserror enum whose wire shape is `{ "error": { code, message, details } }`; `AuthError::Internal(Box<dyn Error + Send + Sync>)` renders the generic `auth.internal` 500 (its `client_message` is generic — the source is never serialized). `AuthError::InvalidCredentials` is `auth.invalid_credentials` / 401.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "13. Token, Session & Tenant Security" — the never-log-secrets invariant (the client never sees an internal string).
- docs/DEVELOPMENT_PLAN.md § "Phase 3 — API Skeleton" Rules-of-phase: `AppError` never leaks an internal error string (`Internal` → opaque 500), delegating to `error_response`/`to_envelope`.
- /Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/crates/bymax-auth-axum/src/response.rs — the `error_response(&AuthError) -> Response` you delegate to (read its signature + the envelope it builds; do NOT re-implement it).

TASK
Author the example's top-level `AppError` for its own handlers (`/health`, and the future `/audit/*` and `/diagnostics/*`), delegating library errors to the adapter and collapsing every infrastructure failure to an opaque 500.

DELIVERABLES
- First, add the `bymax-auth-types` path dependency to `apps/api/Cargo.toml`: `bymax-auth-types = { path = "../../../rust-auth/crates/bymax-auth-types" }`. This module is the first to name a `bymax-auth-types` domain type (`AuthError`) directly — `bymax-auth-core` re-exports only `ConfigError`/`RepositoryError`, and a transitive dependency is not nameable in Rust — and the dep is reused by P4/P5/P6/P7/P11.
1. `apps/api/src/error.rs`:
   ```rust
   use axum::response::{IntoResponse, Response};
   use bymax_auth_axum::error_response;
   use bymax_auth_types::AuthError;

   /// The example's top-level error for its own handlers.
   ///
   /// Library-originated failures render via the adapter's `error_response`,
   /// preserving the canonical `{ "error": { code, message, details } }` envelope
   /// and status. Every other variant collapses to an opaque `auth.internal` 500:
   /// the source is logged, never serialized into the response body.
   #[derive(Debug, thiserror::Error)]
   pub enum AppError {
       /// A typed library failure — rendered verbatim by the adapter.
       #[error(transparent)]
       Auth(#[from] AuthError),
       /// A database failure — surfaced opaquely as `auth.internal` (500).
       #[error("database error")]
       Database(#[source] sqlx::Error),
       /// Any other infrastructure failure — surfaced opaquely as `auth.internal` (500).
       #[error("internal error")]
       Internal(#[source] Box<dyn std::error::Error + Send + Sync>),
   }

   impl From<sqlx::Error> for AppError {
       fn from(err: sqlx::Error) -> Self {
           Self::Database(err)
       }
   }

   impl IntoResponse for AppError {
       fn into_response(self) -> Response {
           match self {
               Self::Auth(err) => error_response(&err),
               // Wrap as `AuthError::Internal` so the wire envelope uses the generic
               // `auth.internal` client message — the source string is never exposed.
               Self::Database(err) => error_response(&AuthError::Internal(Box::new(err))),
               Self::Internal(err) => error_response(&AuthError::Internal(err)),
           }
       }
   }
   ```
2. `apps/api/src/main.rs` — declare `mod error;`.
3. A `#[cfg(test)] mod tests` in `error.rs` (100% coverage), using `http_body_util::BodyExt` to read the body:
   - `AppError::from(AuthError::InvalidCredentials).into_response()` ⇒ `StatusCode::UNAUTHORIZED`; the JSON body's `error.code == "auth.invalid_credentials"`.
   - `AppError::Internal(Box::new(std::io::Error::other("SECRET-CONNECTION-STRING")))` ⇒ `StatusCode::INTERNAL_SERVER_ERROR`; body `error.code == "auth.internal"` AND the serialized body does NOT contain `"SECRET-CONNECTION-STRING"`.
   - `AppError::from(sqlx::Error::PoolClosed)` (or any constructible `sqlx::Error`) routes through the `Database` arm ⇒ `500`, `auth.internal` (covers the `Database` branch + the `From<sqlx::Error>` impl).
   Each test carries a comment naming the rule it protects (the never-leak invariant; the delegated envelope).

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed thiserror errors.
- Delegate the envelope to `error_response` — do NOT hand-roll the `{ "error": { … } }` shape or the status table.
- English-only TIMELESS rustdoc — NO Phase/Task/roadmap references in any committed source/config; no `.gitkeep`; `git switch -c` only.

Verification:
- `cargo nextest run -p api error` — expected: the error tests pass (incl. the no-leak assertion).
- `cargo llvm-cov nextest -p api --lcov --output-path target/lcov.info` — expected: `apps/api/src/error.rs` reports 100% on all metrics.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `4 / 6` and Last updated to today.
4. Update the P3 row Progress to `4 / 6` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 3.4 ✅ <YYYY-MM-DD> — typed AppError → IntoResponse (opaque 500)`.
6. Commit `feat(api): add typed AppError with opaque-500 IntoResponse` (no Co-Authored-By).
````

---

### Task 3.5 — sqlx `PgPool` provider

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: 3.1

#### Description

Author the `PgPool` provider — an eager connect from `DATABASE_URL` that aborts startup with a precise message on
failure — and attach the pool to `AppState`.

#### Acceptance criteria

- [x] `apps/api/src/db.rs` exports `async fn connect_pool(database_url: &str, max_connections: u32) -> Result<PgPool, AppError>`
  using `PgPoolOptions` with a bounded `acquire_timeout`, eagerly establishing the first connection so a misconfigured /
  unreachable database fails at boot; the `sqlx::Error` maps to `AppError::Database`.
- [x] `AppState` gains a `pub pool: PgPool` field; `AppState::new` (or a new `AppState::with_pool`) accepts it; `main.rs`
  calls `connect_pool(&settings.database_url, ...)` before building the router and aborts (logs + non-zero exit) on `Err`.
- [x] A unit test proves the failure path: `connect_pool` against a closed port returns
  `Err(AppError::Database(_))` (a closed port → deterministic failure).
- [x] An integration test against the **test stack** (`DATABASE_URL_TEST`, `docker-compose.test.yml`) proves the success
  path: `connect_pool` returns `Ok` and a trivial `SELECT 1` runs. 100% coverage on `db.rs` (failure unit + success integ).

#### Files to create / modify

- `apps/api/src/db.rs`
- `apps/api/src/app.rs` (add the `pool` field to `AppState`)
- `apps/api/src/main.rs` (declare `mod db;`; connect before building the router)
- `apps/api/tests/db_pool.rs` (integration test against the test stack)
- `apps/api/Cargo.toml` (`sqlx` with `runtime-tokio`, `tls-rustls`, `postgres` features)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 3 (API Skeleton) — Task 3.5 of 6 (MIDDLE)

PRECONDITIONS
- Task 3.1 done: `AppState` + `build_router`; `main.rs` loads `config::Settings`.
- Task 3.4 done: `crate::error::AppError` exists with a `Database(sqlx::Error)` variant + `From<sqlx::Error>`.
- P1 provides `config::Settings { database_url: String, .. }`, `DATABASE_URL_TEST` for the high-port test stack, and `docker-compose.test.yml` (Postgres on 55432). `sqlx` must use rustls TLS (the project bans `ring`/`openssl` — use `tls-rustls`).

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "9. Configuration & Environment" — `DATABASE_URL` / `DATABASE_URL_TEST` and the fail-fast-at-boot contract.
- docs/DEVELOPMENT_PLAN.md § "Phase 3 — API Skeleton" DoD: "the app boots and exits with a precise error when Postgres/Redis are down".

TASK
Author the `PgPool` provider (eager connect, precise error on failure) and attach the pool to `AppState`. Prove both the failure path (unit) and the success path (integration against the test stack).

DELIVERABLES
1. `apps/api/src/db.rs`:
   ```rust
   use std::time::Duration;

   use sqlx::PgPool;
   use sqlx::postgres::PgPoolOptions;

   use crate::error::AppError;

   /// How long to wait for the first connection before declaring the database unreachable.
   const ACQUIRE_TIMEOUT: Duration = Duration::from_secs(5);

   /// Open the Postgres pool the repositories will share.
   ///
   /// Eagerly establishes the first connection so a misconfigured `DATABASE_URL`
   /// or an unreachable database aborts startup immediately with a precise message,
   /// rather than failing on the first request.
   pub async fn connect_pool(database_url: &str, max_connections: u32) -> Result<PgPool, AppError> {
       PgPoolOptions::new()
           .max_connections(max_connections)
           .acquire_timeout(ACQUIRE_TIMEOUT)
           .connect(database_url)
           .await
           .map_err(AppError::Database)
   }
   ```
2. `apps/api/src/app.rs` — add `pub pool: PgPool` to `AppState` and a constructor that accepts it (e.g. `AppState::new(pool: PgPool) -> Self` carrying `version: env!("CARGO_PKG_VERSION")`); update the Task 3.1 unit test + `Default` accordingly (a `Default` is no longer possible once a real pool is required — drop it, or keep a test-only constructor behind `#[cfg(test)]` that builds a lazy pool with `PgPool::connect_lazy`).
3. `apps/api/src/main.rs` — `mod db;`; before building the router: `let pool = db::connect_pool(&settings.database_url, 10).await?;` then `app::AppState::new(pool)`. An `Err` propagates out of `main` (logged + non-zero exit).
4. A `#[cfg(test)] mod tests` in `db.rs`: `connect_pool("postgres://nobody:nobody@127.0.0.1:1/none", 1).await` returns `Err(AppError::Database(_))` (closed port → deterministic).
5. `apps/api/tests/db_pool.rs` — an integration test gated on the test stack: read `DATABASE_URL_TEST`, call `connect_pool`, assert `Ok`, then `sqlx::query("SELECT 1").execute(&pool).await` succeeds. Document that it requires `docker compose -f docker-compose.test.yml up --wait`.

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed thiserror errors (the connect path uses `?`/`map_err`).
- sqlx TLS via rustls only (`ring`/`openssl` are banned project-wide).
- English-only TIMELESS rustdoc — NO Phase/Task/roadmap references in any committed source/config; no `.gitkeep`; `git switch -c` only.

Verification:
- `cargo nextest run -p api db` — expected: the failure-path unit test passes.
- `docker compose -f docker-compose.test.yml up --wait` then `DATABASE_URL_TEST=postgres://postgres:postgres@127.0.0.1:55432/example_app_test cargo nextest run -p api --test db_pool` — expected: the success-path integration test passes.
- `cargo llvm-cov nextest -p api --lcov --output-path target/lcov.info` — expected: `apps/api/src/db.rs` reports 100% on all metrics (failure unit + success integ).
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `5 / 6` and Last updated to today.
4. Update the P3 row Progress to `5 / 6` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 3.5 ✅ <YYYY-MM-DD> — sqlx PgPool provider (eager connect, fail-fast)`.
6. Commit `feat(api): add sqlx PgPool provider with fail-fast connect` (no Co-Authored-By).
````

---

### Task 3.6 — `RedisStores` handle + JSON telemetry

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: 3.1

#### Description

Author the `Arc<RedisStores>` provider (the single handle that wires every store seam) and the JSON `tracing-subscriber`
init the example owns, attaching the stores handle to `AppState`. This is the **last** task — run the per-phase protocol.

#### Acceptance criteria

- [x] `apps/api/src/stores.rs` exports `fn connect_stores(redis_url: &str, namespace: String) -> Result<Arc<RedisStores>, AppError>`
  calling `RedisStores::connect(redis_url, namespace)` (lazy pool, no I/O at construct), mapping `RedisStoreError` →
  `AuthError` → `AppError`, and wrapping the result in `Arc`.
- [x] `apps/api/src/telemetry.rs` exports `fn init_tracing()` installing a JSON `tracing-subscriber` filtered by
  `RUST_LOG` (default `info`), using `try_init()` so a re-init never panics — the example owns telemetry because the
  adapter installs no subscriber.
- [x] `AppState` gains a `pub stores: Arc<RedisStores>` field; `main.rs` calls `telemetry::init_tracing()` first, then
  `connect_stores(&settings.redis_url, settings.redis_namespace.clone())` before building the router.
- [x] Unit tests prove: `connect_stores` with a malformed `redis_url` returns `Err(AppError::*)`;
  `connect_stores` with a well-formed URL returns `Ok` (the pool is lazy — no live Redis needed); `init_tracing()` called
  twice does not panic. 100% coverage on `stores.rs` and `telemetry.rs`.

#### Files to create / modify

- `apps/api/src/stores.rs`, `apps/api/src/telemetry.rs`
- `apps/api/src/app.rs` (add the `stores` field to `AppState`)
- `apps/api/src/main.rs` (declare `mod stores; mod telemetry;`; init tracing + connect stores)
- `apps/api/Cargo.toml` (`tracing-subscriber` with `json`, `env-filter` features)

#### Agent prompt

````
You are a senior Rust / axum backend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 3 (API Skeleton) — Task 3.6 of 6 (LAST)

PRECONDITIONS
- Tasks 3.1–3.5 done: `AppState` (with `version` + `pool`), `build_router`, the global layers, `/health`, `AppError`, and the `PgPool` provider all exist with 100% coverage.
- The library exposes `bymax_auth_redis::RedisStores::connect(url: &str, namespace: impl Into<Box<str>>) -> Result<RedisStores, RedisStoreError>` (lazy — no I/O at construct) and `impl From<RedisStoreError> for AuthError` (→ `AuthError::Internal`). `config::Settings { redis_url: String, redis_namespace: String, .. }`.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "9. Configuration & Environment" — `REDIS_URL` / `REDIS_NAMESPACE` (keys namespaced `rust_auth_example:…`) and the one-handle `redis_stores(Arc<RedisStores>)` wiring this prepares.
- docs/DEVELOPMENT_PLAN.md § "Phase 3 — API Skeleton" Rules-of-phase: the adapter installs the tracing subscriber here (the library installs none).
- /Users/maximiliano/Documents/MyApps/bymax-one/rust-auth/crates/bymax-auth-redis/src/pool.rs — the `RedisStores::connect` signature + `RedisStoreError` (read; do NOT re-implement).

TASK
Author the `Arc<RedisStores>` provider and the JSON tracing init the example owns, attach the stores handle to `AppState`, then run the per-phase closeout.

DELIVERABLES
1. `apps/api/src/stores.rs`:
   ```rust
   use std::sync::Arc;

   use bymax_auth_types::AuthError;
   use bymax_auth_redis::RedisStores;

   use crate::error::AppError;

   /// Build the single Redis store handle that wires every store seam of the engine.
   ///
   /// `RedisStores::connect` is lazy — it builds a connection pool without any I/O —
   /// so a malformed `REDIS_URL` is the only failure surfaced here; the first real
   /// round-trip happens when a store method runs.
   pub fn connect_stores(redis_url: &str, namespace: String) -> Result<Arc<RedisStores>, AppError> {
       let stores = RedisStores::connect(redis_url, namespace)
           .map_err(|err| AppError::from(AuthError::from(err)))?;
       Ok(Arc::new(stores))
   }
   ```
2. `apps/api/src/telemetry.rs`:
   ```rust
   use tracing_subscriber::EnvFilter;

   /// Install the process-wide tracing subscriber (structured JSON).
   ///
   /// The HTTP adapter installs no subscriber, so the example owns telemetry: this
   /// runs once, before the runtime serves, so the `TraceLayer` spans and every
   /// `tracing` event are formatted as line-delimited JSON filtered by `RUST_LOG`.
   /// `try_init` makes a re-init (e.g. across tests) a no-op instead of a panic.
   pub fn init_tracing() {
       let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
       let _ = tracing_subscriber::fmt().json().with_env_filter(filter).try_init();
   }
   ```
3. `apps/api/src/app.rs` — add `pub stores: std::sync::Arc<RedisStores>` to `AppState` and thread it through the constructor (e.g. `AppState::new(pool, stores)`).
4. `apps/api/src/main.rs` — `mod stores; mod telemetry;`; at the very top of `main`, `telemetry::init_tracing();`, then after the pool: `let stores = stores::connect_stores(&settings.redis_url, settings.redis_namespace.clone())?;` and `app::AppState::new(pool, stores)`.
5. `apps/api/Cargo.toml` — `tracing-subscriber = { version = "0.3", features = ["json", "env-filter"] }`.
6. Unit tests (100% on both files): `stores.rs` — malformed url (`"not-a-url"`) ⇒ `Err`; well-formed url (`"redis://127.0.0.1:6379"`) ⇒ `Ok` (lazy, no live Redis). `telemetry.rs` — `init_tracing(); init_tracing();` does not panic (and, to cover both filter arms, one test sets `RUST_LOG` before calling).

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed thiserror errors.
- The store handle is built once and shared via `Arc` (the engine's one-handle store wiring); the pool stays lazy.
- English-only TIMELESS rustdoc — NO Phase/Task/roadmap references in any committed source/config; no `.gitkeep`; `git switch -c` only.

Verification:
- `cargo nextest run -p api stores telemetry` — expected: the store + telemetry tests pass.
- `cargo llvm-cov nextest -p api --lcov --output-path target/lcov.info` — expected: `apps/api/src/stores.rs` and `apps/api/src/telemetry.rs` report 100% on all metrics.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `cargo +1.90 check` — expected: builds on the MSRV floor.
- (With the local stack up via `docker compose up --wait`) `cargo run -p api` then `curl -s http://localhost:4000/health` — expected: `{"status":"ok","version":"<crate version>"}`, logs emitted as JSON; Ctrl-C drains cleanly.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `6 / 6` and Last updated to today.
4. Update the P3 row Progress to `6 / 6` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 3.6 ✅ <YYYY-MM-DD> — RedisStores handle + JSON telemetry`.
6. Commit `feat(api): add Arc<RedisStores> handle and JSON tracing init` (no Co-Authored-By).
(The LAST task also runs the PER-PHASE protocol — see this file's "## Phase Completion Protocol": once the PR is merged and CI is green, in docs/DEVELOPMENT_PLAN.md set the **P3 Status to ✅** and **Progress `6 / 6`**, set **Active phase** to `P4`, recompute **Overall progress**; set this file's header **Status to ✅**; commit `docs(plan): P3 complete` (no Co-Authored-By).)
````

---

## Phase Completion Protocol

When **Task 3.6** is `✅` and every other task is `✅`:

1. Confirm all 6 tasks are `✅` and the P3 **Definition of Done** in [`DEVELOPMENT_PLAN.md § P3`](../DEVELOPMENT_PLAN.md#phase-3--api-skeleton)
   is met: `GET /health` → 200; the app boots against the local stack and exits with a precise error when Postgres/Redis
   are down; `AppError` serializes to the library's `{ error: { code, message, details } }` envelope with the right HTTP
   status (delegating to `error_response`), `Internal` → opaque 500; the `PgPool` + `Arc<RedisStores>` resolve from
   `AppState` and both connect-failure paths are covered.
2. Ensure the phase PR is **merged** to `main` with **CI green** (all required checks — `format`, `lint`, `typecheck`,
   `msrv`, `unit`, `supply-chain`, `export-usage-check`).
3. In [`DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md): set the **P3 Status** to `✅`, **Progress** `6 / 6`, **Last
   updated** today; set **Active phase** to `P4`; recompute **Overall progress** (`4 / 15 phases`, %).
4. Set this file's header **Status** to `✅` and **Progress** to `6 / 6 tasks`.
5. Commit `docs(plan): P3 complete` (no `Co-Authored-By`).

If any DoD bullet is unmet or CI is red, set P3 to `🟡 Partial`, not `✅`.

---

## Completion log

> Append-only. One line per completed task: `- <id> ✅ YYYY-MM-DD — <summary>`.

- 3.1 ✅ 2026-07-02 — tokio + axum bootstrap (main.rs + AppState)
- 3.4 ✅ 2026-07-02 — typed AppError → IntoResponse (opaque 500)
- 3.5 ✅ 2026-07-02 — sqlx PgPool provider (eager connect, fail-fast)
- 3.6 ✅ 2026-07-02 — RedisStores handle + JSON telemetry
- 3.2 ✅ 2026-07-02 — CORS + tower-http global layers
- 3.3 ✅ 2026-07-02 — GET /health version probe
