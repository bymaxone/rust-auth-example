# Architecture

How the pieces fit together: the middleware pipeline in front of the axum API, the shared
application state, how errors become the canonical wire envelope, the consumed crate/package
boundaries, and the two identity domains. This expands the diagram in
[`OVERVIEW.md` §3](OVERVIEW.md#3-architecture-at-a-glance); the pipeline deep dive is in
[`OVERVIEW.md` §11](OVERVIEW.md#11-the-authentication-pipelines-deep-dive).

---

## Layered overview

```
Browser ──HTTPS──▶ apps/web (Next.js 16 · React 19) ──/api/auth/*──▶ apps/api (axum 0.8 · Tokio)
   ▲   HttpOnly cookies          proxy.ts: edge WASM verify              AuthRouter (bymax-auth-axum)
   │   access_token              + createAuthProxy rewrite               AuthEngine (bymax-auth-core)
   └── refresh_token, has_session   route handlers (/api/auth/*)         guards · repos · hooks · stores
                                                                              │        │        │
                                                                        PostgreSQL   Redis    Mailpit
                                                                        (sqlx repos) (8 stores) (lettre)
```

The two apps are independently deployable and share no in-process state — everything the
browser needs travels in HttpOnly cookies. The console verifies the session JWT **at the edge**
(WASM `verifyJwtToken`) before a route renders; the API re-verifies as the authority.

---

## Request pipeline (`apps/api`)

`apply_global_layers` in [`apps/api/src/layers.rs`](../apps/api/src/layers.rs) wraps the merged
router. `tower` layers apply **outermost-first**, so tracing sees every request first (including
a CORS preflight) and the body cap sits closest to the handler:

```
TraceLayer                       -> records every request (outermost)
CorsLayer                        -> WEB_ORIGIN allow-list (never `*`); allows `x-tenant-id`; exposes `Retry-After`
SetResponseHeaderLayer x4        -> X-Content-Type-Options: nosniff
                                    X-Frame-Options: DENY
                                    Strict-Transport-Security: max-age=63072000; includeSubDomains
                                    Referrer-Policy: no-referrer
RequestBodyLimitLayer            -> 1 MiB defense-in-depth body cap (innermost)
  └─▶ the merged Router (below)
```

The CORS layer is credentialed, so a wildcard origin is forbidden: the single configured
`WEB_ORIGIN` is parsed to an exact `HeaderValue` (a malformed value aborts at boot via
`AppError::Internal`, never a request-path panic). The mounted `/auth/*` routes additionally
carry the **library adapter's own internal stack** (cookie management and per-route rate
limiting), applied by `AuthRouter`; the layers above govern the example's own routes and the
merged surface as a whole.

### Router composition

[`build_router`](../apps/api/src/app.rs) mounts the library auth surface and merges the
example's own domain routes onto one `Router`:

```rust
use bymax_auth_axum::{AuthRouter, AxumAuthConfig};

let auth = AuthRouter::from_engine(Arc::clone(&state.engine), AxumAuthConfig::default())
    .into_router();                       // route_prefix "auth", default rate_limits, ClientIpSource::PeerAddr
example_routes(state.app_env).with_state(state).merge(auth)
```

`AxumAuthConfig::default()` yields the `auth` prefix, the default `RateLimitConfig`, and
`ClientIpSource::PeerAddr` — override any field with `AxumAuthConfig { field: …,
..Default::default() }`. (The library also ships the `bymax_auth_axum::auth_router(engine,
config)` free function for the one-liner case.) The library router is derived from the engine's
resolved `ControllerToggles`, so only the enabled groups mount. The example's own routes are
`GET /health`, the platform read-API (`/platform/*`, guarded), the example WebSocket
(`GET /ws/example`), and — **Development only** — the audit read-API (`/audit/*`) and the
diagnostics surface (`/diagnostics/*`).

---

## Application state (the DI graph)

[`AppState`](../apps/api/src/app.rs) is the cheaply-cloneable bundle every request needs. It is
assembled once in [`main.rs`](../apps/api/src/main.rs) and injected by value — explicit
dependency injection, no globals:

```
Settings (figment: process env -> validated)
   │
   ├─▶ db::connect_pool        -> PgPool ───────────────┐
   ├─▶ stores::connect_stores  -> Arc<RedisStores> ─────┤
   ├─▶ realtime::channel       -> broadcast::Sender ─────┤
   └─▶ engine::build_engine ───────────────────────────▶ Arc<AuthEngine>
          AuthEngine::builder()
            .config(AuthConfig::nest_compat_defaults / secure_defaults; .validate(Environment))
            .user_repository(Arc<SqlxUserRepository>)             // REQUIRED — the persistence boundary
            .platform_user_repository(Arc<SqlxPlatformUserRepository>)  // REQUIRED iff platform.enabled
            .redis_stores(Arc<RedisStores>)                      // one handle -> all 8 store traits
            .email_provider(Arc<dyn EmailProvider>)              // lettre -> Mailpit | Resend
            .hooks(Arc<AuditAuthHooks>)                          // the audit domain + on_oauth_login policy
            .oauth_provider(Arc<GoogleOAuthProvider>)            // injected TLS HttpClient
```

`AppState` then carries `{ version, app_env, pool, stores, engine, email_provider,
session_events }`. Cloning is pointer-cheap (a pool handle plus `Arc` clones), so it is
duplicated freely per request.

---

## Error propagation (the wire envelope)

[`AppError`](../apps/api/src/error.rs) is the example's top-level error for its own handlers. Its
`IntoResponse` delegates to the adapter's `bymax_auth_axum::error_response`, which serializes the
`AuthError::to_envelope()` projection — the canonical body every error shares:

```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)] Auth(#[from] AuthError),   // rendered verbatim (correct status + stable code)
    #[error("database error")] Database(#[source] sqlx::Error),        // opaque auth.internal (500)
    #[error("internal error")] Internal(#[source] Box<dyn std::error::Error + Send + Sync>),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        match self {
            Self::Auth(err)     => error_response(&err),
            Self::Database(err) => error_response(&AuthError::Internal(Box::new(err))),
            Self::Internal(err) => error_response(&AuthError::Internal(err)),
        }
    }
}
```

The wire body is always:

```json
{ "error": { "code": "auth.invalid_credentials", "message": "…", "details": { } } }
```

The `code` is a stable `auth.*` catalog value; the `details` field is **omitted entirely** (not
`null`) when the variant carries none. A `Database`/`Internal` source collapses to an opaque
`auth.internal` `500` — the source string is logged by the adapter, never serialized — so a
connection string or backend detail can never leak to a client.

---

## Crate boundaries (the consumed surface)

The library is consumed as two parallel dependencies. The Rust crates are layered
foundations-first; `apps/api` depends on them by `path` (`../../../rust-auth/crates/*`), and the
`bymax-auth` facade is a stub, so it depends on the concrete crates directly:

```
foundations:  bymax-auth-types   (claims · DTOs · route consts · AuthError/AuthErrorEnvelope)
              bymax-auth-crypto  (scrypt/argon2 · HMAC-SHA-256 · AES-256-GCM · TOTP)
                     │
              bymax-auth-jwt      (HS256, alg-pinned)                 depends on types + crypto
                     │
              bymax-auth-core     (AuthEngine · builder · trait seams) depends on types + crypto + jwt
                     │
        ┌────────────┴───────────────┐
   bymax-auth-redis            bymax-auth-axum
   (RedisStores -> 8 stores)   (AuthRouter · extractors · DTOs · error_response)
```

`apps/api` names `bymax-auth-axum`, `bymax-auth-core`, `bymax-auth-redis`, `bymax-auth-crypto`
(the seed hashes with scrypt), and `bymax-auth-types` in its `Cargo.toml`; `bymax-auth-jwt`
arrives transitively. See [`OVERVIEW.md` §7](OVERVIEW.md#7-library-consumption).

The browser package `@bymax-one/rust-auth` ships **four subpaths**, each consumed in a specific
place in `apps/web`:

| Subpath                        | Key exports                                                                         | Consumed in                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `@bymax-one/rust-auth/shared`  | `AUTH_ROUTES`, `AUTH_ERROR_CODES`, `AuthClientError`                                 | error-code localization + the auth pages                        |
| `@bymax-one/rust-auth/client`  | `createAuthClient`, `createAuthFetch` (single-flight 401 → refresh → retry)          | the console's fetch client setup                                |
| `@bymax-one/rust-auth/react`   | `AuthProvider`, `useAuth`, `useSession`, `useAuthStatus`                             | [`app/providers.tsx`](../apps/web/app/providers.tsx) + hooks    |
| `@bymax-one/rust-auth/nextjs`  | `createAuthProxy`, `verifyJwtToken`, `createClientRefreshHandler` / `…SilentRefresh…` / `…Logout…` | [`proxy.ts`](../apps/web/proxy.ts) + `app/api/auth/*/route.ts`  |

The `/nextjs` subpath is **server-only**: the WASM `verifyJwtToken` and the HS256 secret
(`AUTH_JWT_SECRET_FOR_PROXY`) must never reach a browser bundle. It runs the edge verify in
[`apps/web/proxy.ts`](../apps/web/proxy.ts) and backs the same-origin refresh/logout handlers.

---

## Two identity domains

The app runs two independent authentication domains in the same browser; they never interfere.

| Aspect          | Tenant dashboard                                  | Platform admin                                       |
| --------------- | ------------------------------------------------- | ---------------------------------------------------- |
| Claims          | `DashboardClaims` (carries `tenant_id`)           | `PlatformClaims` (tenant-less)                       |
| Login route     | `AUTH_LOGIN` (`/auth/login`, needs `X-Tenant-Id`) | `PLATFORM_LOGIN` (`/auth/platform/login`)            |
| Example guards  | `DashboardUser` · `DashboardAdmin`                | `PlatformAdmin`                                      |
| Console area    | `/dashboard/*`                                    | `/platform/*`                                        |

A dashboard token cannot satisfy a platform guard and vice-versa — the guards in
[`apps/api/src/guards/mod.rs`](../apps/api/src/guards/mod.rs) extract distinct claim types, so
the two token families are cryptographically and structurally separate.

---

## The login pipeline (five stages)

The headline flow — a password login with MFA and rotation — runs five stages, each surfaced so
the console can inspect it:

1. **Authenticate** — `UserRepository::find_by_email(email, tenant_id)` (`Ok(None)` for a
   missing or cross-tenant row) + a total `password::verify` (`Ok(false)` on a wrong password,
   never a panic; rehash-on-verify upgrades a stale hash).
2. **Gate** — `BruteForceStore` locks atomically (`auth.account_locked` with a
   `retryAfterSeconds`); if MFA is enabled, `login` returns an `MfaChallengeResult` with a
   300 s `mfa_temp_token` instead of a session.
3. **Issue** — an HS256 JWT (`DashboardClaims` / `PlatformClaims`) with the algorithm hard-pinned
   (a forged `alg:none`/`RS256` is rejected); the refresh token is an opaque `RawRefreshToken`,
   persisted only as `sha256(token)`.
4. **Persist** — `SessionStore::create_session`; rotation swaps the refresh token with a grace
   pointer, and a reuse past grace (`RotateOutcome::Invalid`) revokes the session; the access
   JTI is blacklisted on logout.
5. **Deliver** — per `TokenDelivery`, tokens go to HttpOnly cookies and/or the body; the hooks
   fire (`after_login`, `on_new_session` → `EmailProvider::send_new_session_alert`); on the
   browser, `createAuthFetch` single-flights the transparent refresh.

The full narrative — including registration, verification/reset, OAuth, and invitations — is in
[`OVERVIEW.md` §11](OVERVIEW.md#11-the-authentication-pipelines-deep-dive) and the
[features tour](FEATURES.md).

---

## Further reading

- [Getting started](GETTING_STARTED.md) — clone to a verified login in ~5 minutes.
- [Features](FEATURES.md) — the demonstrated journeys, each with a request/response.
- [`OVERVIEW.md`](OVERVIEW.md) — the master technical blueprint.
- [`DASHBOARD.md`](DASHBOARD.md) — the console build spec and client layer.
