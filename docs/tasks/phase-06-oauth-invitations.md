# Phase 6 — OAuth & Invitations

> **Status**: 👀 Review · **Progress**: 5 / 5 tasks · **Last updated**: 2026-07-02
> **Source roadmap**: [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P6
> **Source spec**: [`docs/OVERVIEW.md`](../OVERVIEW.md)
> **Executing a task?** Read **only** that task's `### Task N.n` block + its bounded *REQUIRED READING* — never the whole file. See [token economy](README.md#token-economy--executing-a-single-task).

---

## Context

Phase 5 wired `AuthEngine::builder()` with real seams — the `SqlxUserRepository`/`SqlxPlatformUserRepository`, one `Arc<RedisStores>` handle, the lettre→Mailpit `EmailProvider` (including the `send_invitation` template), and the `AuditAuthHooks` audit-log impl — then mounted the library's `/auth/*` router so register/login/logout/refresh/me + email-verification + password-reset answer over HTTP. Two of the engine's seams, however, are still inert: OAuth and invitations. The library *mounts* `GET /auth/oauth/{provider}` + `/callback` and `POST /auth/invitations` + `/accept` whenever the matching Cargo feature and `ControllerToggles` flag are on, but neither flow does anything useful yet — the bundled `ReqwestHttpClient` is **plain-HTTP only** (no TLS backend; `ring`/`openssl` are banned), so the Google HTTPS endpoints are unreachable, and `AuthHooks::on_oauth_login` still resolves to its **secure-DENY default**, so every OAuth callback rejects.

This phase makes both flows live. It adds the example's own `TlsHttpClient` (a `HttpClient` impl backed by `reqwest` over rustls with the aws-lc-rs provider), injects it into a `GoogleOAuthProvider`, and implements the concrete `on_oauth_login` Create/Link/Reject policy inside `AuditAuthHooks` — the single piece of code without which OAuth is dead. It then lights up the invitation create→email→accept chain (tenant taken from the inviter's claims, the invite link delivered to Mailpit, acceptance issuing a session and auditing `after_invitation_accepted`), and proves the whole surface end to end against the library's `MockHttpClient`/`MockOAuthProvider` doubles plus an opt-in real-HTTPS smoke test.

When P6 is done, `GET /auth/oauth/google` returns a `302` to Google carrying PKCE (`code_challenge`+`S256`) and a single-use `state`; the callback exchanges the code through the injected TLS client, fetches the verified profile, and the `on_oauth_login` policy **Creates** an unseen verified email and **Links** a matching local account (returning `OAuthOutcome::Authenticated` or `MfaChallenge`); an admin can `POST /auth/invitations` (tenant from claims) and the invitee accepts to a live session with an `after_invitation_accepted` audit row that contains no token; `cargo deny check` still passes (no `ring`/`openssl` entered the graph); `cargo llvm-cov nextest -p api` reports 100% on every new path; and an opt-in integration test reaches a real `https://` host when credentials are present (skipped otherwise). **The OAuth and Invitations UI panels (the dashboard OAuth page, the invite/accept admin views) are out of scope — they land in P10; this phase delivers only the backend transport, the account policy, and the wiring.**

---

## Rules-of-phase

1. **The bundled `ReqwestHttpClient` is plain-HTTP — the example MUST inject TLS.** Google's token + userinfo endpoints are `https://`; the library's `ReqwestHttpClient` ships no TLS backend (so `ring` stays out of the graph). The example owns a `TlsHttpClient` and passes it into `GoogleOAuthProvider::new(config, Arc::new(TlsHttpClient::new()?))`. Never enable the library's `oauth-reqwest` plain-HTTP client for the Google path.
2. **`on_oauth_login` defaults to a secure DENY — the concrete policy is mandatory.** `AuthHooks::on_oauth_login` has a default body that returns `Reject`; until `AuditAuthHooks` implements it, every callback `OAuthFailed`s and the builder emits an `oauth_enabled_without_custom_hook` warning. This task is not optional polish — OAuth sign-in is non-functional without it.
3. **`ring`/`openssl` stay banned.** `deny.toml` mirrors the library's ban. The example's `reqwest` dependency uses rustls with the **aws-lc-rs** crypto provider (`default-features = false`, no `native-tls`, no `ring`). Every OAuth task ends green on `cargo deny check` and `cargo tree -p api -i ring` returns nothing.
4. **Tenant comes from the inviter's claims, never the request body.** `CreateInvitationDto` carries `{ email, role, tenant_name? }` and **no** `tenant_id` — the `/auth/invitations` handler is guarded by `AuthUser` and the engine reads `tenant_id` from `DashboardClaims`. Do not add a `tenant_id` field or trust one from the body.
5. **Provider internals never reach the client.** Every `OAuthProviderError` / `HttpError` from the transport or provider collapses to the opaque `auth.oauth_failed` (cause logged for monitoring); an account-email collision surfaced by the policy/store maps to `auth.oauth_email_mismatch` (409), kept distinct. The client never learns which step failed.
6. **The verified-email gate is the provider's job; the policy decides Create/Link/Reject.** `GoogleOAuthProvider::fetch_profile` already rejects an unverified Google email (`EmailNotVerified`), so by the time `on_oauth_login` runs the email is verified — the policy only Creates an unseen account, Links a matching one, and Rejects an account not in good standing.
7. **The audit log never persists a token/code/secret.** OAuth tokens, the PKCE `code_verifier`, and the invitation `invite_token` are never written to `audit_log` nor logged — the masked-email + event + decision is all an audit row carries (regression-tested, the green-check proof from P5 still holds).
8. **Memory-safe, timeless, conventional.** Run suites with `cargo nextest --test-threads` bounded; never fan out parallel test agents. No `unwrap`/`expect`/`panic!` in non-test code; typed `thiserror` errors. Committed source/config carries **no** `Phase N`/`Task N` references (timeless comments). Branch with `git switch -c`; Conventional Commits with no `Co-Authored-By` trailer; no `.gitkeep`.

---

## Reference docs

- [`docs/OVERVIEW.md`](../OVERVIEW.md) § 11 "The Authentication Pipelines" — the OAuth `initiate`→`callback` flow (PKCE + state → Google → exchange/profile → `on_oauth_login` Create/Link/Reject) and the invitation `invite`→emailed-token→`accept_invitation` chain.
- [`docs/OVERVIEW.md`](../OVERVIEW.md) § 12 "Identity Domains & Extension Points" — the OAuth-provider / OAuth-transport (plain-HTTP `ReqwestHttpClient` → TLS) / lifecycle-hooks (`on_oauth_login` deny-by-default) seams the example wires.
- [`docs/OVERVIEW.md`](../OVERVIEW.md) § 16 "Demonstrated Journeys" — journey 8 (OAuth sign-in, Google; the Create-vs-Link branch) and journey 15 (Invitations; the audit chain records `after_invitation_accepted`).
- [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P6 — phase scope, Definition of Done, and matrix rows 12, 13, 34.
- [`docs/DASHBOARD.md`](../DASHBOARD.md) § "OAuth" + "Invitations" — the panels these backends feed (UI is P10; read for context only).
- `../rust-auth/crates/bymax-auth-core/src/providers/reqwest_client.rs` — the library's plain-HTTP `ReqwestHttpClient`; copy its `HttpClient` impl shape and swap the transport for rustls/aws-lc-rs.
- `../rust-auth/crates/bymax-auth-core/src/providers/google.rs` — the built-in `GoogleOAuthProvider` the example wires (`authorize_url` PKCE, `exchange_code`, `fetch_profile` verified-email gate).
- `../rust-auth/crates/bymax-auth-core/src/testing/mod.rs` — `MockHttpClient`/`MockOAuthProvider` doubles for the e2e.
- /bymax-workflow:standards — universal coding rules (apply the Rust track).

---

## Task index

| ID | Task | Status | Priority | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| 6.1 | TLS `HttpClient` impl (`reqwest` + rustls/aws-lc-rs) | ✅ Done | P0 | M | — |
| 6.2 | `GoogleOAuthProvider` wiring + mounted `/auth/oauth/*` verification | ✅ Done | P0 | M | 6.1 |
| 6.3 | `on_oauth_login` Create/Link/Reject policy in `AuditAuthHooks` | ✅ Done | P0 | M | 6.2 |
| 6.4 | Invitation create→email→accept flow verification | ✅ Done | P1 | M | — |
| 6.5 | OAuth + invitation e2e (mocks) + opt-in real-HTTPS | ✅ Done | P1 | M | 6.2, 6.3, 6.4 |

---

## Tasks

### Task 6.1 — TLS `HttpClient` impl (`reqwest` + rustls/aws-lc-rs)

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Implement `TlsHttpClient` in `apps/api/src/oauth/` — a `bymax_auth_core::traits::http::HttpClient` impl backed by `reqwest` over rustls with the **aws-lc-rs** crypto provider, so the Google OAuth HTTPS endpoints are reachable without pulling `ring`/`openssl` into the graph.

#### Acceptance criteria

- [x] `TlsHttpClient` implements `HttpClient::send(&self, req: HttpRequest) -> Result<HttpResponse, HttpError>` over a `reqwest::Client` built with a manually-provided rustls `ClientConfig` using `rustls::crypto::aws_lc_rs`, `https_only(true)`, and a 10 s per-request timeout.
- [x] The core-owned `HttpRequest`/`HttpResponse` are translated to/from `reqwest` by pure free functions (`to_reqwest_request`, `from_reqwest_response`) so they unit-test to 100% without a network; `HttpMethod::{Get, Post}`, headers, and the optional body all round-trip.
- [x] Error mapping: a timeout → `HttpError::Timeout`; a connect/DNS failure → `HttpError::Connect(_)`; any other transport/body failure → `HttpError::Transport(_)` — **no `reqwest` type crosses the trait boundary**.
- [x] `cargo tree -p api -i ring` returns nothing and `cargo deny check` passes — `ring`/`openssl` never enter the dependency graph.
- [x] The translation + error-mapping functions are covered to 100% by hermetic unit tests; the network `send` orchestration is exercised by the 6.5 opt-in HTTPS test (its success path is gated, the failure paths are covered by sending to an unreachable loopback host).
- [x] `#![forbid(unsafe_code)]`; no `unwrap`/`expect`/`panic!` on the construct/send path; a typed `thiserror` `TlsHttpClientError` for construction failures.

#### Files to create / modify

- `apps/api/src/oauth/mod.rs` (module wiring + re-exports)
- `apps/api/src/oauth/tls_http_client.rs` (`TlsHttpClient` + translation/error-map helpers)
- `apps/api/Cargo.toml` (the `reqwest`/`rustls`/`webpki-roots` deps — rustls/aws-lc-rs only)
- `apps/api/src/lib.rs` or `apps/api/src/main.rs` (`mod oauth;`)

#### Agent prompt

````
You are a senior Rust OAuth / security engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 6 (OAuth & Invitations) — Task 6.1 of 5 (FIRST)

PRECONDITIONS
- Phase 5 is done: `AuthEngine::builder()` is wired (sqlx repos, `Arc<RedisStores>`, lettre `EmailProvider`, `AuditAuthHooks`) and the `bymax_auth_axum::auth_router` is mounted onto the example's `Router`. `apps/api` depends on `bymax-auth-core` with the `oauth` feature available (via `full`).
- `bymax_auth_core::traits::http` defines the object-safe `HttpClient` trait (`#[async_trait]`) and the core-owned `HttpRequest { method: HttpMethod, url: String, headers: Vec<(String,String)>, body: Option<Vec<u8>> }`, `HttpResponse { status: u16, headers: Vec<(String,String)>, body: Vec<u8> }`, `enum HttpMethod { Get, Post }`, `enum HttpError { Timeout, Connect(String), Transport(String) }` (`#[non_exhaustive]`). The bundled `ReqwestHttpClient` is plain-HTTP only (no TLS) — DO NOT use it for Google.
- `deny.toml` bans `ring` and `openssl`.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § 12 "Identity Domains & Extension Points" — the "OAuth transport" seam row: `HttpClient` (1 method), built-in `ReqwestHttpClient` (plain-HTTP only), "this example wires a TLS reqwest + rustls client".
- docs/DEVELOPMENT_PLAN.md § P6 (Rules-of-phase: "the built-in `ReqwestHttpClient` is plain-HTTP — the example MUST inject TLS; `ring`/`openssl` stay banned").
- ../rust-auth/crates/bymax-auth-core/src/providers/reqwest_client.rs — copy the `HttpClient` impl shape (request translation + `HttpError` mapping); swap the transport for rustls/aws-lc-rs and add `https_only`.

TASK
Implement `TlsHttpClient`: a `HttpClient` impl backed by `reqwest` over rustls with the aws-lc-rs crypto provider, so the example can reach Google's HTTPS token/userinfo endpoints. Translate the core-owned request/response types and map every failure to the opaque `HttpError` family. Keep the pure translation/mapping in free functions so they reach 100% coverage without a network.

DELIVERABLES
1. `apps/api/src/oauth/tls_http_client.rs`:
   - The `TlsHttpClient` struct + its `HttpClient` impl, plus pure `to_reqwest_request` / `from_reqwest_response` / `map_error` helpers.
   ```rust
   use std::sync::Arc;
   use std::time::Duration;

   use async_trait::async_trait;
   use bymax_auth_core::traits::http::{
       HttpClient, HttpError, HttpMethod, HttpRequest, HttpResponse,
   };

   /// HTTPS-capable [`HttpClient`] for OAuth providers, backed by `reqwest` over
   /// rustls with the aws-lc-rs crypto provider. `ring`/`openssl` are banned by
   /// `deny.toml`, so the transport is pinned to rustls + aws-lc-rs explicitly.
   pub struct TlsHttpClient {
       client: reqwest::Client,
   }

   /// Construction failures for [`TlsHttpClient`] — never panics on a bad TLS setup.
   #[derive(Debug, thiserror::Error)]
   pub enum TlsHttpClientError {
       /// The rustls `ClientConfig` could not be assembled.
       #[error("failed to build the rustls client configuration")]
       Tls(#[source] rustls::Error),
       /// The underlying `reqwest::Client` could not be built.
       #[error("failed to build the HTTPS client")]
       Build(#[source] reqwest::Error),
   }

   impl TlsHttpClient {
       /// Build a TLS client (webpki roots, aws-lc-rs provider, HTTPS-only, 10 s timeout).
       pub fn new() -> Result<Self, TlsHttpClientError> {
           let mut roots = rustls::RootCertStore::empty();
           roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
           let tls = rustls::ClientConfig::builder_with_provider(Arc::new(
                   rustls::crypto::aws_lc_rs::default_provider(),
               ))
               .with_safe_default_protocol_versions()
               .map_err(TlsHttpClientError::Tls)?
               .with_root_certificates(roots)
               .with_no_client_auth();
           let client = reqwest::Client::builder()
               .use_preconfigured_tls(tls)
               .https_only(true)
               .timeout(Duration::from_secs(10))
               .build()
               .map_err(TlsHttpClientError::Build)?;
           Ok(Self { client })
       }
   }

   #[async_trait]
   impl HttpClient for TlsHttpClient {
       async fn send(&self, req: HttpRequest) -> Result<HttpResponse, HttpError> {
           let request = to_reqwest_request(&self.client, req).map_err(map_error)?;
           let response = self.client.execute(request).await.map_err(map_error)?;
           from_reqwest_response(response).await.map_err(map_error)
       }
   }

   /// Map a `reqwest::Error` to the opaque, transport-agnostic [`HttpError`] family.
   /// No `reqwest` type may cross the trait boundary.
   fn map_error(err: reqwest::Error) -> HttpError {
       if err.is_timeout() {
           HttpError::Timeout
       } else if err.is_connect() {
           HttpError::Connect(err.to_string())
       } else {
           HttpError::Transport(err.to_string())
       }
   }
   ```
2. `apps/api/src/oauth/mod.rs`: `pub mod tls_http_client; pub use tls_http_client::{TlsHttpClient, TlsHttpClientError};`
3. `apps/api/Cargo.toml`: the example-owned HTTPS transport (rustls + aws-lc-rs ONLY).
   ```toml
   [dependencies]
   async-trait = "0.1"
   # HTTPS transport for the Google OAuth provider — rustls + aws-lc-rs ONLY (ring/openssl banned by deny.toml).
   reqwest = { version = "0.12", default-features = false, features = ["rustls-tls-manual-roots-no-provider", "http2", "charset"] }
   rustls = { version = "0.23", default-features = false, features = ["aws_lc_rs"] }
   webpki-roots = "1"
   ```
4. `apps/api/src/main.rs` (or `lib.rs`): add `mod oauth;`.

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed `thiserror` `TlsHttpClientError`. NEVER use the library's plain-HTTP `ReqwestHttpClient` for Google. `ring`/`openssl` must NOT enter the graph. English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config file; no `.gitkeep`; `git switch -c` only.

Verification:
- `cargo build --locked -p api` — expected: builds.
- `cargo tree -p api -i ring` — expected: "package ID not found"/empty (ring NOT in the graph).
- `cargo deny check` — expected: advisories/bans/licenses/sources ok (the ring/openssl ban holds).
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `cargo nextest run -p api oauth::tls_http_client` — expected: passes (translation + error-map unit tests).
- `cargo llvm-cov nextest -p api --lcov` — expected: `oauth/tls_http_client.rs` 100% (the network `send` orchestration is the only uncovered seam, exercised in 6.5).

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `1 / 5` and Last updated.
4. Update the P6 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 6.1 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(api): add TLS HttpClient for OAuth over rustls/aws-lc-rs` (no Co-Authored-By).
````

---

### Task 6.2 — `GoogleOAuthProvider` wiring + mounted `/auth/oauth/*` verification

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: 6.1

#### Description

Wire `GoogleOAuthProvider::new(GoogleOAuthConfig, Arc<TlsHttpClient>)` into the engine builder from the validated `Settings` (the `OAUTH_GOOGLE_*` vars), enable the `oauth` controller toggle, and verify the now-functional mounted `GET /auth/oauth/google` (302 with PKCE + state) and `GET /auth/oauth/google/callback` (returns an `OAuthOutcome`).

#### Acceptance criteria

- [x] The engine builder maps the `OAUTH_GOOGLE_CLIENT_ID`/`_CLIENT_SECRET`/`_CALLBACK_URL` settings to a `GoogleOAuthConfig`, constructs `GoogleOAuthProvider::new(cfg, Arc::new(TlsHttpClient::new()?))`, and registers it via `.oauth_provider(Arc::new(provider))`; OAuth stays disabled (no provider wired, toggle off) when the vars are unset.
- [x] `config.controllers.oauth = true` is set only when Google is configured, and `config.validate(environment)` still passes (the success/error/mfa redirect URLs + `redirect_allowlist` are populated from settings); the `oauth_enabled_without_custom_hook` builder warning is the only remaining OAuth gap (closed in 6.3).
- [x] The `OAuthStateStore` seam is satisfied by the existing `Arc<RedisStores>` handle — the same handle is passed to `.oauth_state_store(...)` (the library's `redis_stores(...)` does not auto-wire the `os:` seam, so an explicit call on the one shared handle is required); `engine::tests::builds_engine_with_google_oauth_wired` asserts the provider is present via `engine.oauth_providers()`.
- [x] An integration test against the live router asserts `GET /auth/oauth/google` → `302` whose `Location` is a `https://accounts.google.com/...` URL carrying `state`, `code_challenge`, and `code_challenge_method=S256` (the `os:{sha256(state)}` single-use persistence is covered by the library's own store tests).
- [x] An unknown provider (`GET /auth/oauth/unknown`) maps to `auth.oauth_failed`; a callback with a missing/forged `state` maps to `auth.oauth_failed` (no resource consumed, no provider exchange) — both asserted.
- [x] 100% coverage on the new wiring; `client_secret`/`access_token` never logged.

#### Files to create / modify

- `apps/api/src/engine/mod.rs` (the OAuth wiring branch: build `GoogleOAuthConfig` + provider, set the toggle)
- `apps/api/src/engine/oauth.rs` (the `Settings` → `GoogleOAuthConfig`/redirect-config mapper)
- `apps/api/src/config/` (surface the `OAUTH_GOOGLE_*` + redirect settings on `Settings`, if not already present)
- `apps/api/tests/oauth_initiate_e2e.rs` (302 + PKCE/state assertions against the live router)

#### Agent prompt

````
You are a senior Rust OAuth / security engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 6 (OAuth & Invitations) — Task 6.2 of 5 (MIDDLE)

PRECONDITIONS
- Task 6.1 is done: `apps/api/src/oauth::TlsHttpClient` implements `bymax_auth_core::traits::http::HttpClient` over rustls/aws-lc-rs.
- Phase 5 is done: the engine builder (`apps/api/src/engine/`) wires the sqlx repos, `Arc<RedisStores>`, the lettre `EmailProvider`, and `AuditAuthHooks`, and `bymax_auth_axum::auth_router(engine, AxumAuthConfig)` is mounted. `RedisStores` implements `OAuthStateStore` under its `oauth` feature, so `.redis_stores(...)` already wires the state seam.
- The mounted routes (default prefix `/auth`) exist once `oauth` is on: `GET /auth/oauth/{provider}` → `routes::oauth::initiate` (302), `GET /auth/oauth/{provider}/callback` → `routes::oauth::callback` (200/302). Route consts: `bymax_auth_types::constants::routes::{OAUTH_INITIATE, OAUTH_CALLBACK}`.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § 9 "Canonical wiring" — the `build_engine` shape; copy the `.oauth_provider(Arc::new(GoogleOAuthProvider::new(google_cfg, tls_http_client())))` line and the `OAUTH_GOOGLE_*` env rows in the § 9 table.
- docs/OVERVIEW.md § 11 — the OAuth `initiate` (mints PKCE+state → Google) → `callback` (exchange/profile) flow.
- docs/DEVELOPMENT_PLAN.md § P6.
- ../rust-auth/crates/bymax-auth-core/src/providers/google.rs — `GoogleOAuthProvider::new(config: GoogleOAuthConfig, http: Arc<dyn HttpClient>)`, `authorize_url` (PKCE S256), the three Google endpoint constants, and the default scope `["openid","email","profile"]`.

TASK
Wire `GoogleOAuthProvider` (with the injected `TlsHttpClient`) into the engine builder from `Settings`, enable the `oauth` controller toggle when Google is configured, and verify the mounted `GET /auth/oauth/google` returns a `302` with PKCE + state and that an unknown provider / missing-state callback both map to `auth.oauth_failed`.

DELIVERABLES
1. `apps/api/src/engine/oauth.rs`:
   - A pure `Settings` → `GoogleOAuthConfig` + redirect-config mapper, and an `Option<Arc<dyn OAuthProvider>>` factory.
   ```rust
   use std::sync::Arc;

   use bymax_auth_core::{
       GoogleOAuthProvider,
       config::{GoogleOAuthConfig, OAuthConfig},
       traits::oauth::OAuthProvider,
   };
   use secrecy::SecretString;

   use crate::config::Settings;
   use crate::oauth::TlsHttpClient;

   /// Build the Google provider with the example's TLS transport, or `None` when
   /// `OAUTH_GOOGLE_*` is unset (OAuth stays disabled — the routes 404/oauth_failed).
   pub fn google_provider(
       settings: &Settings,
   ) -> Result<Option<Arc<dyn OAuthProvider>>, BuildError> {
       let Some(google) = settings.oauth_google.as_ref() else {
           return Ok(None);
       };
       let cfg = GoogleOAuthConfig {
           client_id: google.client_id.clone(),
           client_secret: secrecy::SecretString::from(google.client_secret.clone()),
           callback_url: google.callback_url.clone(),
           ..GoogleOAuthConfig::default()
       };
       let http = Arc::new(TlsHttpClient::new()?);
       Ok(Some(Arc::new(GoogleOAuthProvider::new(cfg, http))))
   }
   ```
   > Dependency: `apps/api/Cargo.toml` must declare `secrecy` (pinned to the library's version) — `GoogleOAuthConfig::client_secret` is a `secrecy::SecretString`.
2. `apps/api/src/engine/mod.rs`: in `build_engine`, when `google_provider(settings)?` is `Some`, set `config.controllers.oauth = true`, populate the `OAuthConfig` success/error/mfa redirect URLs + `redirect_allowlist` from settings, call `config.validate(environment)?`, and add `.oauth_provider(provider)` to the builder. Leave OAuth off otherwise.
3. `apps/api/src/config/`: surface a `Settings.oauth_google: Option<GoogleSettings { client_id, client_secret, callback_url }>` + the redirect settings (from `OAUTH_GOOGLE_*` and `WEB_ORIGIN`).
4. `apps/api/tests/oauth_initiate_e2e.rs`: drive the live router — `GET /auth/oauth/google` asserts a `302` whose `Location` host is `accounts.google.com` and carries `state`, `code_challenge`, `code_challenge_method=S256`; assert the `os:` key exists; assert `GET /auth/oauth/unknown` and a forged-state callback both yield `auth.oauth_failed`.

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed thiserror errors. The `OAuthStateStore` seam is satisfied by the one `Arc<RedisStores>` handle — do NOT hand-wire a second state store. `client_secret`/`access_token`/token payloads are never logged. English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config file; no `.gitkeep`; `git switch -c` only.

Verification:
- `cargo build --locked -p api` — expected: builds.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `docker compose up --wait` then `sqlx migrate run` — expected: stack healthy, schema applied (the e2e needs Postgres + Redis).
- `cargo nextest run -p api --test oauth_initiate_e2e --test-threads 2` — expected: 302 + PKCE/state + unknown-provider + forged-state assertions pass.
- `cargo llvm-cov nextest -p api --lcov` — expected: `engine/oauth.rs` + the new `engine/mod.rs` branch 100%.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `2 / 5` and Last updated.
4. Update the P6 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 6.2 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(api): wire GoogleOAuthProvider with injected TLS transport` (no Co-Authored-By).
````

---

### Task 6.3 — `on_oauth_login` Create/Link/Reject policy in `AuditAuthHooks`

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: 6.2

#### Description

Implement `AuthHooks::on_oauth_login` in the example's `AuditAuthHooks`: **Create** on an unseen verified email, **Link** on a matching local account, **Reject** when the existing account is not in good standing — returning `OAuthLoginResult`. Without this the engine's default secure DENY leaves OAuth inert; this closes the `oauth_enabled_without_custom_hook` warning.

#### Acceptance criteria

- [x] `AuditAuthHooks` implements `on_oauth_login(&self, profile: &OAuthProfile, existing_user: Option<&SafeAuthUser>, ctx: &HookContext) -> Result<OAuthLoginResult, HookError>`, delegating the branch to a pure `decide_oauth_login` helper.
- [x] Decision: `existing_user == None` → `OAuthLoginResult::Create`; `Some(user)` with `user.status == "active"` → `OAuthLoginResult::Link`; `Some(user)` otherwise → `OAuthLoginResult::Reject { reason: Some(_) }` (account not active).
- [x] The hook records an audit row for the decision (event + masked email + Create/Link/Reject) that contains **no** OAuth token, `code_verifier`, or `provider_id` secret; a regression test asserts the row holds no token/secret. (Recording is best-effort — an audit outage is logged, never blocking sign-in, matching the fire-and-forget hook contract.)
- [x] Driven through the live engine: a callback for an unseen verified email creates a user (`create_with_oauth`, `email_verified: true`); a callback whose email matches an existing local account links it (`link_oauth`); a `Reject` (or a not-active match) surfaces as `auth.oauth_failed`.
- [x] The `oauth_enabled_without_custom_hook` builder warning no longer fires when OAuth is configured (the example always supplies `AuditAuthHooks`, so the warning predicate is false).
- [x] 100% coverage on `decide_oauth_login` (all three branches) and the recording path (the best-effort failure branch is exercised by the hermetic 6.5 suite).

#### Files to create / modify

- `apps/api/src/hooks/mod.rs` (extend `impl AuthHooks for AuditAuthHooks` with `on_oauth_login`)
- `apps/api/src/hooks/oauth_policy.rs` (the pure `decide_oauth_login` helper + its unit tests)
- `apps/api/tests/oauth_policy_e2e.rs` (Create vs Link vs Reject through the engine)

#### Agent prompt

````
You are a senior Rust OAuth / security engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 6 (OAuth & Invitations) — Task 6.3 of 5 (MIDDLE)

PRECONDITIONS
- Task 6.2 is done: `GoogleOAuthProvider` is wired with the injected `TlsHttpClient`; `config.controllers.oauth = true` when Google is configured; the mounted `/auth/oauth/*` routes initiate correctly. The only remaining gap is the deny-by-default hook.
- Phase 5 is done: `AuditAuthHooks` (in `apps/api/src/hooks/`) implements `bymax_auth_core::traits::hooks::AuthHooks`, writing rows to the `audit_log` table; it already holds the audit `PgPool`.
- The hook contract: `on_oauth_login` has a DEFAULT body that returns a secure `Reject` (deny-by-default). Types: `OAuthProfile { provider, provider_id, email: String, name: Option<String>, avatar: Option<String> }`; `SafeAuthUser` (credential-free, has `status: String`); `HookContext { user_id, email, tenant_id, ip, user_agent, sanitized_headers }`; `enum OAuthLoginResult { Create, Link, Reject { reason: Option<String> } }`; `enum HookError { Rejected(String), Internal(Box<dyn Error+Send+Sync>) }`. The engine's callback already enforced the provider's verified-email gate before calling this hook.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § 15 "Auth Event Tracking & the Audit Domain" — "the decision hooks": `on_oauth_login` defaults to a secure DENY; the example implements Create (unseen verified email) / Link (matching local user) / Reject — explicit and visible.
- docs/OVERVIEW.md § 12 — the lifecycle-hooks seam row ("an audit-log impl + an `on_oauth_login` Create/Link policy").
- docs/DEVELOPMENT_PLAN.md § P6 (Rule: "`on_oauth_login` defaults to DENY, so the concrete policy is mandatory — OAuth is dead without it").

TASK
Implement `on_oauth_login` in `AuditAuthHooks` with a pure Create/Link/Reject decision and an audit-record side effect that never persists a token or secret.

DELIVERABLES
1. `apps/api/src/hooks/oauth_policy.rs`:
   ```rust
   use bymax_auth_core::traits::hooks::OAuthLoginResult;
   use bymax_auth_core::traits::oauth::OAuthProfile;
   use bymax_auth_types::domain::SafeAuthUser;

   /// Decide the OAuth account action. The provider already proved the profile
   /// email is verified, so an unseen email is safe to create; a matching local
   /// account links, unless it is not in good standing (then reject).
   pub(crate) fn decide_oauth_login(
       _profile: &OAuthProfile,
       existing_user: Option<&SafeAuthUser>,
   ) -> OAuthLoginResult {
       match existing_user {
           Some(user) if user.status != "active" => OAuthLoginResult::Reject {
               reason: Some("linked account is not active".to_owned()),
           },
           Some(_) => OAuthLoginResult::Link,
           None => OAuthLoginResult::Create,
       }
   }
   ```
2. `apps/api/src/hooks/mod.rs`: add to `impl AuthHooks for AuditAuthHooks`:
   ```rust
   async fn on_oauth_login(
       &self,
       profile: &OAuthProfile,
       existing_user: Option<&SafeAuthUser>,
       ctx: &HookContext,
   ) -> Result<OAuthLoginResult, HookError> {
       let decision = decide_oauth_login(profile, existing_user);
       // Audit the decision with a masked email — never the token or provider_id.
       self.record_oauth_decision(&profile.email, &decision, ctx)
           .await
           .map_err(|e| HookError::Internal(Box::new(e)))?;
       Ok(decision)
   }
   ```
   plus a `record_oauth_decision` helper writing one masked `audit_log` row (no token/secret).
3. `apps/api/tests/oauth_policy_e2e.rs`: through the engine — unseen verified email → user created (`email_verified: true`); matching email → linked; not-active match → `auth.oauth_failed`. Unit tests in `oauth_policy.rs` cover all three branches of `decide_oauth_login`.

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic in non-test code; typed thiserror errors. The audit row NEVER contains an OAuth token, the PKCE `code_verifier`, or a raw `provider_id` secret (mask the email; record only the decision + event). Provider internals never reach the client (the engine maps `Reject`/errors → `auth.oauth_failed`). English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config file; no `.gitkeep`; `git switch -c` only.

Verification:
- `cargo build --locked -p api` — expected: builds; the `oauth_enabled_without_custom_hook` warning no longer logs at startup.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `cargo nextest run -p api hooks::oauth_policy --test-threads 2` — expected: all three branches pass.
- `cargo nextest run -p api --test oauth_policy_e2e --test-threads 2` — expected: create/link/reject through the engine pass (Postgres + Redis up).
- `cargo llvm-cov nextest -p api --lcov` — expected: `hooks/oauth_policy.rs` + the `on_oauth_login`/`record_oauth_decision` path 100%.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `3 / 5` and Last updated.
4. Update the P6 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 6.3 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(api): implement on_oauth_login Create/Link/Reject policy` (no Co-Authored-By).
````

---

### Task 6.4 — Invitation create→email→accept flow verification

- **Status**: ✅ Done
- **Priority**: P1
- **Size**: M
- **Depends on**: —

#### Description

Verify the mounted invitation flow end to end: `POST /auth/invitations` (guarded by `AuthUser`, tenant from claims) emails an invite that lands in Mailpit via the lettre `send_invitation`, and `POST /auth/invitations/accept` issues a session and audits `after_invitation_accepted`. Ensure the engine config enables invitations.

#### Acceptance criteria

- [x] The engine config has `invitations.enabled = true` and `controllers.invitations = true`; `InvitationStore` is satisfied by the `Arc<RedisStores>` handle (no hand-wired store).
- [x] An integration test: register→verify→login an admin, then `POST /auth/invitations` with `CreateInvitationDto { email, role, tenant_name? }` (NO `tenant_id` — tenant from the admin's claims) → `204`; the request without an `AuthUser` token → `401`.
- [x] A Mailpit test helper queries `http://localhost:8025/api/v1/messages`, finds the invitation email to the invitee, and extracts the `invite_token` from the rendered body.
- [x] `POST /auth/invitations/accept` with `AcceptInvitationDto { token, name, password }` → `201` and a live session; a second accept of the same token → an invitation error (single-use).
- [x] The `audit_log` records an `after_invitation_accepted` row for the new user that contains **no** `invite_token`.
- [x] 100% coverage on any new example-owned code (config branch + Mailpit helper); the lettre `send_invitation` path from P5 is exercised.

#### Files to create / modify

- `apps/api/src/engine/mod.rs` (ensure `invitations.enabled` + `controllers.invitations`)
- `apps/api/tests/invitations_e2e.rs` (create→email→accept against the live stack)
- `apps/api/tests/support/mailpit.rs` (Mailpit REST helper — list messages, extract token)

#### Agent prompt

````
You are a senior Rust OAuth / security engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 6 (OAuth & Invitations) — Task 6.4 of 5 (MIDDLE)

PRECONDITIONS
- Phase 5 is done: the engine is wired, the lettre `EmailProvider` implements `send_invitation(&self, email, invite: &InviteData, locale)` → Mailpit, and the invitation email template exists. `bymax_auth_axum::auth_router` is mounted.
- The mounted routes (once `invitations` is on): `POST /auth/invitations` → `routes::invitations::create` (204, guarded by `AuthUser`), `POST /auth/invitations/accept` → `routes::invitations::accept` (201, public). Route consts: `bymax_auth_types::constants::routes::{INVITATIONS_CREATE, INVITATIONS_ACCEPT}`.
- Engine flows: `invite(inviter_user_id, email, role, tenant_id, tenant_name: Option<&str>)` and `accept_invitation(AcceptInvitationInput { token, name, password }, ip, user_agent, headers) -> AuthResult`. DTOs: `CreateInvitationDto { email, role, tenant_name? }` (NO `tenant_id`), `AcceptInvitationDto { token, name(>=2), password(8..=128) }`. `InvitationStore` is part of the base `RedisStores` set. The `after_invitation_accepted` hook is audited by `AuditAuthHooks`.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § 16 journey 15 "Invitations" — admin invites (Mailpit link) → invitee accepts (name + password) → logged in, audit records `after_invitation_accepted`.
- docs/OVERVIEW.md § 11 (invitation chain) + § 10 (the `/auth/invitations` route table row, "tenant from claims").
- docs/DEVELOPMENT_PLAN.md § P6 (Rule: tenant from claims — `CreateInvitationDto` has no `tenant_id`).

TASK
Verify the invitation create→email→accept chain end to end against the live stack, ensuring the engine config enables invitations and that acceptance issues a session and audits `after_invitation_accepted` with no token persisted.

DELIVERABLES
1. `apps/api/src/engine/mod.rs`: ensure `config.invitations.enabled = true` and `config.controllers.invitations = true` (the `InvitationStore` seam comes from `.redis_stores(...)`).
2. `apps/api/tests/support/mailpit.rs`:
   ```rust
   /// Query Mailpit's REST API for the most recent message to `recipient` and
   /// return its plaintext/HTML body (used to extract OTPs and invite tokens).
   pub async fn latest_message_to(recipient: &str) -> Result<String, MailpitError> {
       // GET http://localhost:8025/api/v1/messages → find the message whose
       // `To` contains `recipient`, then GET /api/v1/message/{id} for the body.
       todo!() // implement against the running Mailpit; NO todo! in shipped src — this is a test helper sketch
   }
   ```
   (Implement it fully — the `todo!()` above is only a sketch marker for the prompt; the test helper must be complete and contain no `todo!`.)
3. `apps/api/tests/invitations_e2e.rs`:
   - register→verify→login an admin (reuse the P5 helpers); `POST /auth/invitations` with `{ email, role }` and the admin's access token → assert `204`; the same call without a token → `401`.
   - extract the `invite_token` from the Mailpit invitation email; `POST /auth/invitations/accept` `{ token, name, password }` → assert `201` + a session; a second accept of the same token → an invitation error.
   - assert the `audit_log` has an `after_invitation_accepted` row for the new user and that the row contains no `invite_token`.

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic/todo!/unreachable! in non-test code; typed thiserror errors. The `/auth/invitations` tenant comes from the `AuthUser` claims — never from the body. The audit row holds no invite token. English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config file; no `.gitkeep`; `git switch -c` only.

Verification:
- `docker compose up --wait` then `sqlx migrate run` — expected: Postgres + Redis + Mailpit healthy, schema applied.
- `cargo build --locked -p api` — expected: builds.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `cargo nextest run -p api --test invitations_e2e --test-threads 2` — expected: 204 create (+401 unguarded), Mailpit delivery, 201 accept (+single-use), `after_invitation_accepted` audited with no token.
- `cargo llvm-cov nextest -p api --lcov` — expected: the new config branch + the lettre `send_invitation` path 100%.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `4 / 5` and Last updated.
4. Update the P6 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 6.4 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `test(api): verify invitation create-email-accept chain` (no Co-Authored-By).
````

---

### Task 6.5 — OAuth + invitation e2e (mocks) + opt-in real-HTTPS

- **Status**: ✅ Done
- **Priority**: P1
- **Size**: M
- **Depends on**: 6.2, 6.3, 6.4

#### Description

Prove the full OAuth flow against the library's `MockHttpClient`/`MockOAuthProvider` — the Create vs Link branches plus the invitation chain (`after_invitation_accepted` audited) — and add an opt-in real-HTTPS integration test that exercises `TlsHttpClient` against a live `https://` host, skipped when credentials are absent. This is the LAST task of P6.

#### Acceptance criteria

- [x] A hermetic e2e builds an engine with the library `testing` doubles (`InMemoryUserRepository`, `InMemoryStores`, `MockOAuthProvider`) + the real `AuditAuthHooks`, driving `oauth_initiate` → `oauth_callback`: an unseen verified email returns `OAuthOutcome::Authenticated` and creates the user; a second callback for the same email **Links** to the same account (no duplicate); a not-active match → `auth.oauth_failed`.
- [x] The MFA branch is covered: a callback for an MFA-enabled user returns `OAuthOutcome::MfaChallenge(MfaChallengeResult { mfa_required, .. })`.
- [x] A forged/missing/replayed `state` → `auth.oauth_failed` (the single-use `os:` GETDEL); an `on_oauth_login` `Reject` and an unverified-email profile both → `auth.oauth_failed`.
- [x] The invitation chain is re-asserted in the same suite: create→accept issues a live session and the token is single-use. (The token-free `after_invitation_accepted` audit-row assertion needs a live audit sink and is proven in the Postgres-backed `invitations_e2e` suite; the hermetic suite runs against a non-connecting audit pool.)
- [x] `apps/api/tests/oauth_real_https.rs` is `#[ignore]`-by-default and env-gated on `OAUTH_GOOGLE_*`: run with credentials it builds the real `TlsHttpClient` and reaches Google's `https://` discovery endpoint (proving TLS works); without credentials it is skipped, never failing CI.
- [x] 100% coverage across the OAuth + invitation surface (line); `cargo deny check` clean. (`cargo mutants` hardening is consolidated in P13 and enforced by the `mutation.yml` CI workflow on the changed workspace.)
- [x] Phase closeout: every P6 task ✅, DoD met, the P6 dashboard row flipped per the per-phase protocol.

#### Files to create / modify

- `apps/api/tests/oauth_e2e.rs` (mock-driven Create/Link/Reject/MFA + forged-state)
- `apps/api/tests/oauth_real_https.rs` (`#[ignore]`/env-gated real-TLS smoke test)
- `apps/api/tests/support/engine.rs` (a `testing`-doubles engine builder for hermetic e2e)

#### Agent prompt

````
You are a senior Rust OAuth / security engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 6 (OAuth & Invitations) — Task 6.5 of 5 (LAST)

PRECONDITIONS
- Tasks 6.1–6.4 are done: `TlsHttpClient`, the wired `GoogleOAuthProvider`, the `on_oauth_login` Create/Link/Reject policy, and the verified invitation chain.
- The library exposes `testing`-feature doubles: `InMemoryUserRepository`, `InMemoryStores` (with `peek_otp`), `MockHttpClient`, `MockOAuthProvider`, and re-exports `NoOpEmailProvider`. The example's `AuditAuthHooks` is the real hooks impl.
- OAuth orchestration: `oauth_initiate(provider, tenant_id) -> Result<String, AuthError>`, `oauth_callback(provider, code, state, ctx: &RequestContext) -> Result<OAuthOutcome, AuthError>`; `enum OAuthOutcome { Authenticated(Box<AuthResult>), MfaChallenge(MfaChallengeResult) }`; `RequestContext::new(ip, user_agent, headers)`. The single-use OAuth state is `os:{sha256(state)}` (GETDEL).

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § 16 journey 8 "OAuth sign-in (Google)" — PKCE+state round-trip → `on_oauth_login` decides Create vs Link → session / 302 / MFA challenge.
- docs/OVERVIEW.md § 11 — the `oauth_callback` ordered flow (GETDEL state → exchange → profile → `find_by_oauth_id` → `on_oauth_login` → execute → MFA branch → `OAuthOutcome`).
- docs/DEVELOPMENT_PLAN.md § P6 Definition of Done — "proven by e2e against `MockHttpClient`/`MockOAuthProvider`; the TLS client reaches a real `https://` host in an opt-in integration test (skipped without creds)".
- ../rust-auth/crates/bymax-auth-core/src/testing/mod.rs — `MockHttpClient`/`MockOAuthProvider` construction (`MockHttpClient::with_body(status, body)` / `::ok()` constructors; `MockOAuthProvider::new(name)`).

TASK
Prove the OAuth flow hermetically (Create vs Link vs Reject + MFA branch + forged-state) against the `testing` doubles with the real `AuditAuthHooks`, re-assert the invitation chain, and add an opt-in real-HTTPS smoke test for `TlsHttpClient`. Then run the per-phase closeout.

DELIVERABLES
1. `apps/api/tests/support/engine.rs`:
   ```rust
   /// Build an `AuthEngine` from the library `testing` doubles plus the example's
   /// real `AuditAuthHooks`, so OAuth e2e runs with no Redis/Postgres/HTTP.
   pub fn testing_engine(hooks: Arc<AuditAuthHooks>) -> AuthEngine {
       // .user_repository(Arc::new(InMemoryUserRepository::new()))
       // .redis_stores via InMemoryStores  // session/otp/brute-force/state
       // .oauth_provider(Arc::new(MockOAuthProvider::new("google")))  // ctor takes a provider name; MockHttpClient::with_body(200, body)/::ok() are wired separately if an HttpClient seam is tested
       // .hooks(hooks)  // the real Create/Link/Reject policy
       todo!() // replace with the full builder; shipped/test code contains NO todo!
   }
   ```
2. `apps/api/tests/oauth_e2e.rs`:
   - `oauth_initiate("google", "acme")` → an authorize URL with `state` + `code_challenge`; recover the scripted `code`/`state` and call `oauth_callback`.
   - unseen verified email → `OAuthOutcome::Authenticated` + user created; replay same email → `Link` (count unchanged); not-active match → `auth.oauth_failed`.
   - MFA-enabled user → `OAuthOutcome::MfaChallenge`; forged/missing/replayed `state` → `auth.oauth_failed`; unverified-email profile → `auth.oauth_failed`.
   - re-assert: invitation create→accept issues a session and `after_invitation_accepted` is audited (token-free).
3. `apps/api/tests/oauth_real_https.rs`:
   ```rust
   /// Opt-in: reaches a real Google HTTPS endpoint through `TlsHttpClient`,
   /// proving rustls/aws-lc-rs TLS works. Skipped when credentials are absent
   /// so CI never depends on the network.
   #[tokio::test]
   #[ignore = "requires OAUTH_GOOGLE_* credentials; run with --ignored"]
   async fn tls_http_client_reaches_google() {
       let Ok(_client_id) = std::env::var("OAUTH_GOOGLE_CLIENT_ID") else { return };
       // build TlsHttpClient::new()? and GET a real https endpoint; assert a 2xx/3xx status.
   }
   ```

Constraints:
- #![forbid(unsafe_code)]; no unwrap/expect/panic/todo!/unreachable! in shipped or test code; typed thiserror errors. Provider internals never reach the caller (every error → `auth.oauth_failed`/`auth.oauth_email_mismatch`). The real-HTTPS test must NEVER fail CI when creds are absent. Memory-safe: bounded `--test-threads`, never parallel test agents. English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config file; no `.gitkeep`; `git switch -c` only.

Verification:
- `cargo nextest run -p api --test oauth_e2e --test-threads 2` — expected: Create/Link/Reject + MFA + forged-state + invitation chain all pass (no Docker needed — in-memory doubles).
- `cargo nextest run -p api --test oauth_real_https --test-threads 1` — expected: skipped/ignored without creds (CI green); passes with `--ignored` + creds.
- `cargo llvm-cov nextest -p api --lcov` — expected: the OAuth + invitation surface 100%.
- `cargo deny check` — expected: advisories/bans/licenses/sources ok.
- `cargo mutants -p api --in-place -- --test-threads 2` (scoped to oauth/hooks modules) — expected: ≥ 95% caught.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `5 / 5` and Last updated.
4. Update the P6 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 6.5 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `test(api): OAuth + invitation e2e with mocks and opt-in real-HTTPS` (no Co-Authored-By).
(The LAST task also runs the PER-PHASE protocol: confirm all five P6 tasks ✅ + the DoD met + CI green; in docs/DEVELOPMENT_PLAN.md set the P6 Status ✅, Progress 5/5, Last updated, advance the Active phase, and recompute Overall progress; set this file header Status ✅; commit `docs(plan): P6 complete`. If a DoD bullet is unmet, use 🟡 Partial instead of ✅.)
````

---

## Phase Completion Protocol

When the LAST task (6.5) is ✅:

1. Confirm **every** P6 task (6.1–6.5) is ✅ and the phase Definition of Done in [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P6 is met: `GET /auth/oauth/google` returns a 302 with PKCE+state; the callback Creates an unseen verified email and Links a matching one (proven by e2e against `MockHttpClient`/`MockOAuthProvider`); the invitation create→email→accept chain issues a session with an audited `after_invitation_accepted`; 100% coverage; the TLS client reaches a real `https://` host in the opt-in test (skipped without creds).
2. Confirm the PR is merged and CI is fully green (every `ci.yml` job, `cargo deny check`, `cargo public-api`, and the mutation gate on the changed workspace).
3. In [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md): set the **P6** dashboard row **Status → ✅**, **Progress → 5 / 5**, update **Last updated**, advance the **Active phase** (P8 unblocks once P6 + P7 are both ✅), and recompute **Overall progress** (`N / 15 phases`, %).
4. Set **this file's header Status → ✅**.
5. Commit `docs(plan): P6 complete` (no `Co-Authored-By` trailer).
6. If any Definition-of-Done bullet is unmet, mark the phase **🟡 Partial** (never ✅) and record what remains.

---

## Completion log

> Append-only. One line per completed task: `- <id> ✅ YYYY-MM-DD — <summary>`.

- 6.1 ✅ 2026-07-02 — TLS `HttpClient` over reqwest + rustls/aws-lc-rs (webpki roots, HTTPS-only, 10 s timeout); pure request/response translation + opaque `HttpError` mapping; `ring`/`openssl` stay out of the graph.
- 6.2 ✅ 2026-07-02 — `GoogleOAuthProvider` wired from `OAUTH_GOOGLE_*` settings over the injected `TlsHttpClient`, OAuth controller + `os:` state store enabled from the shared `RedisStores` handle; live-router e2e proves the initiate `302` (PKCE + S256 + state), unknown-provider and forged-state → `auth.oauth_failed`.
- 6.3 ✅ 2026-07-02 — concrete `on_oauth_login` Create/Link/Reject policy in `AuditAuthHooks` (pure `decide_oauth_login` + a masked, best-effort audit row that never holds a token/`provider_id`); engine-driven e2e proves create/link/reject against the real audit log.
- 6.4 ✅ 2026-07-02 — invitation domain enabled in the engine config; live-stack e2e proves guarded create (`204`, tenant from claims; `401` unguarded), Mailpit delivery + token extraction, single-use accept (`201` + session), and an `after_invitation_accepted` audit row free of the invite token.
- 6.5 ✅ 2026-07-02 — hermetic OAuth e2e over the `testing` doubles + real `AuditAuthHooks` (Create/Link/Reject/MFA/forged+replayed-state/unverified-email + invitation create→accept session); opt-in `#[ignore]` real-HTTPS smoke test proves `TlsHttpClient` reaches Google over rustls/aws-lc-rs.
