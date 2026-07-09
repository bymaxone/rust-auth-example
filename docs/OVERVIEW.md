# rust-auth-example — Project Overview

> **About this document.** This is the master technical blueprint for **`rust-auth-example`**, the public reference
> application for the **`bymax-auth`** crate family (published to npm as **`@bymax-one/rust-auth`**). It is the
> authoritative spec an engineer or an AI agent reads to build the repository end-to-end. The repository may not yet
> contain the `apps/` code when you read this — the blueprint comes first. The library is **pre-1.0** (`0.0.0`, every
> crate unpublished) so this example consumes the Rust crates through a **path** dependency to the sibling
> `../rust-auth` checkout, and the browser package through a local `file:` to the built `@bymax-one/rust-auth` npm
> package (see §7).
>
> **Coverage promise.** Every public export of the consumed surface — the Rust `pub` API of the crates the example
> depends on (`bymax-auth-axum`, `bymax-auth-core`, `bymax-auth-redis`, and transitively `bymax-auth-types` /
> `bymax-auth-crypto` / `bymax-auth-jwt`) **and** the npm package's four subpaths (`/client`, `/react`, `/nextjs`,
> `/shared`) — is exercised by this repository, and — the part that matters most — **reachable from the browser**. A
> symbol that is merely referenced in a probe file is *not* considered demonstrated; the
> [Feature Coverage Matrix](#6-feature-coverage-matrix) maps each export to a real, clickable journey in the console.
> If a feature is documented but not demonstrable in the UI, that is a CI-tracked gap, not a finished row.
>
> **Library-API reconciliation.** The facts below are reconciled against the **shipped `pub` surface** of the crates,
> not the prose in the README or the spec. The corrections a reader must respect:
>
> | Symbol / behavior | Shipped truth (authoritative) | Correction applied |
> | --- | --- | --- |
> | The `bymax-auth` facade crate | **stub today** — zero `pub use`, no `[dependencies]`; only the two crate attributes + the hasher `compile_error!` guard | A single-import `use bymax_auth::*` is **not** available. `apps/api` depends directly on `bymax-auth-axum` + `bymax-auth-core` + `bymax-auth-redis`. The export audit measures those crates' `pub` surface. |
> | `ReqwestHttpClient` (built-in) | **plain-HTTP only** — ships no TLS backend (`ring` and `openssl` are workspace-banned) | The example **must supply its own TLS `HttpClient`** to reach Google over HTTPS (`reqwest` + rustls/aws-lc-rs, server-side). The built-in client is for local/test transports only. |
> | `AuthHooks::on_oauth_login` | **default = secure DENY** (the only non-no-op default) | OAuth sign-in **does nothing** until the example wires a concrete `AuthHooks` with a Create/Link/Reject policy; the builder merely warns (`oauth_enabled_without_custom_hook`). |
> | MFA surface | **TOTP only** (RFC 6238), with AES-256-GCM-sealed secrets + recovery codes | No SMS / push / WebAuthn / passkeys. The only delivered OTP is **email**-delivered (password-reset + email-verification). |
> | Platform identity domain | `PlatformClaims` has **no `tenant_id`** — a separate, tenant-less admin domain | The dashboard domain (`DashboardClaims`, tenant-scoped) and the platform domain are distinct token families with distinct repositories, routes, and consoles. |
> | Refresh tokens | **opaque random** (`RawRefreshToken`), **never JWTs**; persisted only as `sha256(token)` | A reader must not treat the refresh token as decodable. Only the access token is a JWT. |
> | Internal-only error sentinels | `TokenExpired` / `TokenRevoked` / `TokenMissing` are `is_internal_only()` and **collapse to `TokenInvalid` on the wire** (`AuthErrorCode::to_wire`) | The browser never sees the three sentinels — it sees `auth.token_invalid`. The catalog has **40** `AuthErrorCode` variants; the npm `AUTH_ERROR_CODES` union has **38** (the wire-visible set). |
> | `AuthErrorCode::PasswordResetTokenExpired` | **by-design unreachable** (reset uses Redis `GETDEL`, so an expired token is indistinguishable from a missing one) | Kept for catalog completeness; never thrown. Treated as catalog-only in the matrix (like a `.audit-ignore` allow-list entry with a reason). |
> | WASM `extract_claims` / `verify_password` | **out of the npm surface** — `extract_claims` is exported by the WASM module but unsurfaced in the npm package; `verify_password` is gated behind `wasm-extra` (off in the npm build) | Not part of the coverage contract. The example demonstrates the npm-surfaced edge functions (`verify_jwt_hs256`, `decode_jwt`) via `verifyJwtToken` / `decodeJwtToken`. |

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [Architecture at a Glance](#3-architecture-at-a-glance)
4. [Tech Stack](#4-tech-stack)
5. [Repository Layout](#5-repository-layout)
6. [Feature Coverage Matrix](#6-feature-coverage-matrix)
7. [Library Consumption](#7-library-consumption)
8. [Local Stack & Memory-Safe Run](#8-local-stack--memory-safe-run)
9. [Configuration & Environment](#9-configuration--environment)
10. [The Demo Domain & Auth Console](#10-the-demo-domain--auth-console)
11. [The Authentication Pipelines (Deep Dive)](#11-the-authentication-pipelines-deep-dive)
12. [Identity Domains & Extension Points](#12-identity-domains--extension-points)
13. [Token, Session & Tenant Security](#13-token-session--tenant-security)
14. [Ecosystem Fit — the `@bymax-one/nest-auth` twin](#14-ecosystem-fit--the-bymax-onenest-auth-twin)
15. [Auth Event Tracking & the Audit Domain](#15-auth-event-tracking--the-audit-domain)
16. [Demonstrated Journeys](#16-demonstrated-journeys)
17. [Testing Strategy](#17-testing-strategy)
18. [Deployment Notes](#18-deployment-notes)
19. [Versioning & Release Tracking](#19-versioning--release-tracking)
20. [Contributing](#20-contributing)
21. [License, Attribution & Status](#21-license-attribution--status)

---

## 1. Purpose

`bymax-auth` / `@bymax-one/rust-auth` is the **what**; this repository is the **how**. It is a runnable,
production-shaped demo that exercises **every public export** of the consumed library surface across a Rust/axum API
and a first-class Next.js auth console. It is three things at once:

1. **A runnable demo.** `docker compose up` + the dev servers bring up a Rust/axum service wired to the library and a
   Next.js console that **drives every authentication feature on demand** and **shows the result in real time** — the
   verification code landing in a local inbox, the TOTP enrolling against a rendered QR, the new session appearing in
   the device list, the access cookie rotating transparently on a 401.
2. **A knowledge base.** It references every public symbol of the library from real code, and the
   [Feature Coverage Matrix](#6-feature-coverage-matrix) is enforced by a CI export-usage audit. It is the canonical
   place to learn *how* to wire the library correctly — `AuthEngine::builder()`, the `UserRepository` /
   `PlatformUserRepository` contracts, the `EmailProvider` / `AuthHooks` / `OAuthProvider` / `HttpClient` seams, the
   `Arc<RedisStores>` one-handle store wiring, the axum `auth_router`, the typed-claim extractors, and the
   browser `/client` + `/react` + `/nextjs` packages with WASM edge verification.
3. **A migration guide.** It shows how to replace a hand-rolled auth stack (controllers reaching straight for an ORM
   to persist sessions and codes) with the cohesive `AuthEngine` — persistence behind `UserRepository`, transport
   behind `EmailProvider`, session/OTP/lockout state behind the Redis store seam, OAuth behind `OAuthProvider`, and
   audit behind `AuthHooks`.

It is the Rust-stack sibling of [`@bymax-one/nest-auth`](https://github.com/bymaxone/nest-auth) (the published
TypeScript/NestJS twin) and follows the same blueprint, voice, and quality bar — full feature parity across two
runtimes. Where the NestJS example proves the library on Node, this example proves the **same auth contract** on Rust:
one axum API hosting the engine, one Next.js console driving the dashboard **and** the tenant-less platform-admin
domain, with a single Postgres + Redis + Mailpit local stack and zero external credentials on the happy path.

---

## 2. Goals & Non-Goals

### Goals

- **Demonstrate every public export** of the consumed crates (`bymax-auth-axum`, `bymax-auth-core`,
  `bymax-auth-redis`, transitively `-types` / `-crypto` / `-jwt`) **and** the npm package's `/client`, `/react`,
  `/nextjs`, `/shared` subpaths — and make each one **reachable from the browser**, not just referenced in code.
- **Mirror production wiring** — `AuthEngine::builder()` wiring a real `UserRepository` / `PlatformUserRepository`
  over sqlx/Postgres, `Arc<RedisStores>` for all session/OTP/lockout/reset/invitation state, a real `EmailProvider`
  (lettre → Mailpit), a concrete `AuthHooks` audit implementation, `GoogleOAuthProvider` with an injected TLS
  `HttpClient`, mounted by `bymax-auth-axum::auth_router`.
- **Run end-to-end with zero external credentials.** The happy path uses local backends — Mailpit as the SMTP sink,
  local Redis for the store seam, local Postgres for users — so a reviewer can evaluate the library without signing up
  for anything. Real providers (Resend email, Google OAuth) are opt-in via env.
- **Be a first-class auth console** — a Trigger Center that fires every feature, a live **Sessions** device manager, an
  **MFA** enrollment surface (QR + recovery codes + TOTP challenge), an **OAuth** "Continue with Google" flow, an
  **Invitations** admin form, a separate **Platform** admin console, and an honest **Diagnostics** panel that surfaces
  the server-only primitives (password-hash strength, brute-force lockout countdown, the audit-hook event log).
- **Show every integration path** — the typed axum extractors (`AuthUser`, `RequireRole<R>`, `PlatformUser`, …) on the
  backend; the framework-agnostic `/client` fetch client and the `/react` hooks (`AuthProvider`, `useAuth`,
  `useSession`, `useAuthStatus`) on the frontend; and the `/nextjs` edge proxy with **WASM JWT verification** for
  middleware route protection without a backend round-trip.
- **Be copy-paste friendly.** Each surface links the exact library API it exercises; snippets are real, typed, and
  lifted from the running code.
- **Stay current.** The example pins the latest stack versions within the library's peer ranges (§4) and reconciles
  its docs against the shipped `pub` surface, never against stale prose.

### Non-Goals

- **Not a starter template.** It optimizes for *teaching the library*, not for cloning into a product. It carries demo
  endpoints (a Diagnostics panel, a force-lockout button) a real app would not.
- **Not an identity platform.** It is not Auth0/Clerk/Keycloak. There is no hosted IdP, no SSO broker, no policy
  engine, no admin SaaS — only what the library actually ships.
- **Not a UI component kit.** The console reuses the shared Bymax design system (§10); it is not a distributable set of
  components.
- **No surface the library does not ship.** MFA is **TOTP-only** (no SMS / push / WebAuthn / passkeys); OAuth ships
  **Google only** (the `OAuthProvider` trait is extensible, but only `GoogleOAuthProvider` exists); there is **no**
  account-unlink, email-change, or account-deletion endpoint. These are shown as **host-app responsibilities** in a
  Roadmap panel, honestly — not faked.
- **Not a database product.** The library ships **no** persistence; the example owns the schema (sqlx/Postgres). The
  `UserRepository` contract is the boundary — the example's schema is illustrative, not prescriptive.
- **No cross-major back-compat.** It tracks one library version line at a time (§19).

---

## 3. Architecture at a Glance

A single Rust/axum API hosts the `AuthEngine` and mounts the library's router (the library ships the routes, DTOs,
extractors, and error mapping — the example provides the repositories, email transport, hooks, OAuth HTTP client, and
the Redis/Postgres backends). A Next.js console drives both identity domains and edge-verifies the session in
middleware via WASM. Three local backends make the happy path tangible without external credentials.

```
        apps/web (Next.js 16 + React 19)  —  the Auth Console + Platform Console
  Dashboard journeys: register · login · email-verify · password-reset · MFA · sessions · OAuth · invitations
  Platform console:   admin login · platform MFA · admin sessions
  @bymax-one/rust-auth →  /react  AuthProvider · useAuth · useSession · useAuthStatus
                          /client createAuthClient · createAuthFetch (single-flight 401→refresh→retry)
                          /nextjs createAuthProxy · verifyJwtToken (WASM edge) · client/silent-refresh + logout handlers
                          /shared AUTH_ROUTES · AUTH_ERROR_CODES · types · AuthClientError
        │  proxy.ts rewrites /api/auth/* to the axum API; cookies minted / refreshed at the edge
        ▼
   ┌──────────────────────────────────────────────────────────────────────────────────┐
   │ apps/api (Rust · axum 0.8 · tokio)                                                 │
   │ bymax-auth-axum :: auth_router(engine, AxumAuthConfig)   →  mounts /auth/**        │
   │ AuthEngine (bymax-auth-core) — builder wires the example's seams:                  │
   │   UserRepository + PlatformUserRepository   ← sqlx / Postgres (example-owned)       │
   │   EmailProvider  ← lettre → Mailpit | Resend     AuthHooks ← audit-log domain       │
   │   OAuthProvider  ← GoogleOAuthProvider + HttpClient (reqwest + rustls, TLS)         │
   │   SessionStore / OtpStore / BruteForceStore / WsTicketStore / PasswordResetStore /  │
   │   InvitationStore / MfaStore / OAuthStateStore   ← one Arc<RedisStores> handle       │
   │ bymax-auth-jwt (HS256, alg-pinned)  ·  bymax-auth-crypto (scrypt/argon2 · TOTP · AEAD) │
   └───────┬────────────────────────────┬───────────────────────────┬───────────────────┘
   users / tenants / invitations    sessions · OTP · locks · state   reset & verification emails
           ▼                            ▼                               ▼
   ┌───────────────┐           ┌────────────────────┐          ┌────────────────────┐
   │  PostgreSQL   │           │       Redis        │          │      Mailpit       │
   │ (sqlx repos)  │           │  8 store traits    │          │  SMTP :1025/:8025  │
   └───────────────┘           └────────────────────┘          └────────────────────┘
```

`apps/api` and `apps/web` are independently deployable. The two **identity domains** — the tenant-scoped **dashboard**
(`DashboardClaims`) and the tenant-less **platform** admin (`PlatformClaims`) — are distinct token families served by
distinct repositories and routes, and rendered by distinct console areas (a `/dashboard/*` tree and a `/platform/*`
tree). The deep dive on the request pipelines is in §11; the extension seams in §12.

---

## 4. Tech Stack

Versions are the **latest stable as of June 2026**, pinned within the library's peer ranges. The Rust toolchain is
pinned to the library's exact channel; the web stack matches the published `@bymax-one/nest-auth` example.

| Layer | Technology | Version | Why |
| --- | --- | --- | --- |
| **Demonstrated library (Rust)** | `bymax-auth-axum` + `bymax-auth-core` + `bymax-auth-redis` (+ `-types`/`-crypto`/`-jwt`) | `0.0.0` (pre-publish `path`) | The subject of the demo; the `bymax-auth` facade is a stub, so the example depends on the concrete crates. |
| **Demonstrated library (browser)** | `@bymax-one/rust-auth` (`/client`, `/react`, `/nextjs`, `/shared`) | `0.0.0` (pre-publish `file:`) | The frontend layer — fetch client, React hooks, Next edge proxy, WASM verifier, shared codes/types. |
| Backend language | Rust (edition 2024) | toolchain **1.96.0**, MSRV **1.90** | The library's pinned channel + MSRV floor; `#![forbid(unsafe_code)]` everywhere. |
| HTTP framework | axum + tower-http | **0.8** / latest | `bymax-auth-axum` targets axum 0.8; the example adds its own domain routes on the same `Router`. |
| Async runtime | Tokio | latest 1.x | The engine is async; `#[tokio::main]` + `axum::serve`. |
| User persistence | sqlx + PostgreSQL | latest / **18** | The example's `UserRepository`/`PlatformUserRepository` over `query!`/`query_as!` with an offline `.sqlx/` cache + `migrations/*.sql`. The library never imports a DB. |
| Store backend | `deadpool-redis` (Redis) | latest / **7** | `RedisStores::connect(url, namespace)` wires all 8 store traits (atomic Lua under the hood). |
| Email sink (local) | Mailpit + `lettre` | latest / latest | A **custom `EmailProvider`** (lettre → Mailpit) renders every transactional email into a browsable inbox — zero credentials. |
| Email provider (opt-in) | Resend (over `reqwest`) | latest | A second `EmailProvider`, gated by `RESEND_API_KEY`. |
| Email templates | `askama` (or `tera`) | latest | The 7 transactional templates (`EmailProvider`'s methods) rendered server-side. |
| OAuth | `GoogleOAuthProvider` (library) + a TLS `HttpClient` (`reqwest` + rustls/aws-lc-rs) | latest | The library ships the Google provider + PKCE/state orchestration; the example injects an HTTPS transport (`ring`/`openssl` are banned). |
| Crypto | `bymax-auth-crypto` (RustCrypto: scrypt default / argon2 · HMAC-SHA-256 · AES-256-GCM · TOTP) | — | Pure-Rust, no `ring`; KATs from RFC 4226/6238/4231. |
| JWT | `bymax-auth-jwt` (HS256, alg-pinned) | — | Access tokens are HS256 JWTs; refresh tokens are opaque (`RawRefreshToken`). |
| Config | `figment` (or `config`) | latest | Layered env → a validated `Settings` struct (fail-fast at boot). |
| Telemetry | `tracing` + `tracing-subscriber` (JSON) | latest | The adapter installs **no** subscriber — the example owns it. |
| Frontend | Next.js (App Router) + React | **16.x** / **19** | First-class console; consumes the WASM client + React hooks. |
| Styling | Tailwind CSS + shadcn `new-york` + Geist | **4.x** | The shared Bymax design system (forced dark, orange glass) — copied verbatim (§10). |
| Data/UI libs | TanStack Query/Table · nuqs · sonner · lucide-react | current | Server-state, the sessions/audit tables, URL-persisted controls, toasts. |
| Package manager | pnpm | **10.8.x** | Workspaces for `apps/web` + tooling; matches the `@bymax-one/*` ecosystem pin. |
| Node runtime (web) | Node.js | **24 (Active LTS)** | `.nvmrc=24`; the Next.js build + the WASM-package build. |
| Tooling (Rust) | `cargo nextest` · `cargo llvm-cov` · `cargo-mutants` · `cargo public-api` · `cargo deny`/`audit`/`vet` · `proptest` | — | 100% coverage + mutation gate + supply-chain + API-surface snapshot. |
| Tooling (web) | Vitest · Playwright · Stryker | — | 100% coverage + e2e + mutation on the frontend. |

---

## 5. Repository Layout

```
rust-auth-example/
├── Cargo.toml                          # [workspace] members = ['apps/api'] (the example's own workspace)
├── Cargo.lock                          # committed (the API is a binary)
├── rust-toolchain.toml                 # channel = "1.96.0", targets += wasm32, components rustfmt/clippy/llvm-tools
├── rustfmt.toml · clippy.toml · deny.toml   # Rust format / lint / supply-chain policy
├── pnpm-workspace.yaml · package.json · pnpm-lock.yaml   # JS workspace = apps/web + the linked npm package
├── tsconfig.base.json · .prettierrc.mjs · .prettierignore · eslint.config.mjs   # apps/web (TS)
├── commitlint.config.mjs · lint-staged.config.mjs · .husky/   # commit governance (both stacks)
├── .nvmrc · .npmrc · .editorconfig · .gitignore · .gitattributes · .gitmessage · .markdown-link-check.json
├── AGENTS.md · CLAUDE.md · README.md · LICENSE · CHANGELOG.md · SECURITY.md · CONTRIBUTING.md · CODE_OF_CONDUCT.md
├── docker-compose.yml                  # postgres:18 + redis:7 + mailpit (each healthchecked)
├── docker-compose.override.yml         # dev log caps (auto-merged)
├── docker-compose.test.yml             # high-port CI stack (pg 55432 · redis 56379 · mailpit 51025/58025, tmpfs)
├── docker-compose.prod.yml             # GHCR prod images
├── docker/
│   ├── postgres/init.sql               # CREATE DATABASE example_app;
│   └── redis/redis.conf
├── scripts/
│   ├── link-library.sh · unlink-library.sh     # build + file:-link @bymax-one/rust-auth pre-publish
│   ├── audit-library-exports.mjs       # CI: every npm export referenced in apps/web (else fail)
│   └── audit-rust-public-api.sh        # CI: cargo public-api snapshot of the consumed crates' pub surface
├── apps/
│   ├── api/                            # ===== the Rust/axum service — hosts AuthEngine + the demo domain =====
│   │   ├── Cargo.toml                  # path deps: bymax-auth-axum / -core / -redis (features: full)
│   │   ├── Dockerfile · build.rs · .env.example
│   │   ├── .sqlx/                      # offline query cache (committed)
│   │   ├── migrations/                 # 0001_init.sql … (users, platform_users, tenants, invitations, audit_log)
│   │   ├── src/
│   │   │   ├── main.rs                 # #[tokio::main]; build engine; auth_router + domain routes; axum::serve(API_PORT)
│   │   │   ├── app.rs                  # compose the Router + AppState; CORS (x-tenant + Retry-After); shutdown signal
│   │   │   ├── config/                 # figment → a validated Settings struct (fail-fast)
│   │   │   ├── engine/                 # AuthEngine::builder() wiring (AuthConfig profile + every seam) — the canonical wiring
│   │   │   ├── repos/                  # UserRepository + PlatformUserRepository impls over sqlx (the boundary)
│   │   │   ├── email/                  # EmailProvider impls (lettre→Mailpit, Resend) + templates/*.html (7 emails)
│   │   │   ├── hooks/                  # AuthHooks impl → the audit domain (+ on_oauth_login Create/Link policy)
│   │   │   ├── oauth/                  # the TLS HttpClient impl injected into GoogleOAuthProvider
│   │   │   ├── redis/                  # RedisStores::connect(...) → the Arc<RedisStores> store handle
│   │   │   ├── audit/                  # GET /audit/* (reads the audit_log the hooks write) + SSE live tail
│   │   │   ├── diagnostics/            # POST /diagnostics/* (hash-strength, force-lockout, hook-event log) — dev-only
│   │   │   ├── health/                 # GET /health
│   │   │   └── telemetry/              # tracing-subscriber (JSON)
│   │   └── tests/                      # axum-test / reqwest + testcontainers (sqlx migrate first)
│   └── web/                            # ===== the Next.js console — consumes @bymax-one/rust-auth =====
│       ├── package.json · Dockerfile · next.config.mjs   # serverExternalPackages: ['@bymax-one/rust-auth']
│       ├── tsconfig.json · tailwind.config.ts · postcss.config.mjs · components.json
│       ├── vitest.config.ts · vitest.setup.ts · playwright.config.ts · stryker.config.json
│       ├── proxy.ts                    # edge proxy → rewrites /api/auth/* to axum; mints/refreshes cookies (WASM verify)
│       ├── app/
│       │   ├── layout.tsx · providers.tsx · globals.css   # Geist + forced dark + AuthProvider + global controls
│       │   ├── page.tsx                # Overview — auth health (login/verify rates, active sessions, provider mix)
│       │   ├── api/auth/{client-refresh,silent-refresh,logout}/route.ts   # the /nextjs route handlers
│       │   ├── (public)/auth/{login,register,forgot-password,reset-password,verify-email,mfa-challenge,accept-invitation}/
│       │   ├── dashboard/{account,security,sessions,invitations,oauth,trigger,audit}/   # the tenant console
│       │   └── platform/{login,(protected)/{security,sessions,users}}/   # the tenant-less admin console
│       ├── components/                 # trigger/ sessions/ mfa/ oauth/ invitations/ audit/ controls/ ui/
│       ├── hooks/                      # thin wrappers over /react (useAuth, useSession, useAuthStatus)
│       ├── lib/                        # the @bymax-one/rust-auth client setup, error-code localization (./shared), severity
│       └── e2e/                        # Playwright specs (the numbered journeys)
└── docs/
    ├── OVERVIEW.md                     # ← you are here (master technical blueprint)
    ├── DASHBOARD.md                    # the apps/web console — full build spec + design system
    ├── DEVELOPMENT_PLAN.md             # phased build plan + quality gates (100% cov, cargo-mutants/Stryker, audits)
    ├── design_system.html              # the shared, project-agnostic UI design system (open in a browser) — already present
    ├── GETTING_STARTED.md              # clone → first verified login + first enrolled TOTP in ~5 minutes
    ├── FEATURES.md                     # guided feature tour + the end-to-end journeys
    ├── ARCHITECTURE.md                 # the request pipelines & crate boundaries (public vs internal)
    ├── ENVIRONMENT.md                  # full env-var reference
    ├── DATABASE.md                     # the users/platform_users/tenants/invitations/audit schema & sqlx repos
    ├── EMAIL.md                        # the EmailProvider contract, the 7 templates, Mailpit vs Resend
    ├── OAUTH_GOOGLE.md                 # the GoogleOAuthProvider + the injected TLS HttpClient + the on_oauth_login hook
    ├── REDIS.md                        # the 8 store traits, the namespace, the 20 key prefixes
    ├── MFA.md                          # TOTP enrollment, the AEAD-sealed secret, recovery codes, the challenge flow
    ├── DEPLOYMENT.md                   # production checklist & version pins
    ├── TROUBLESHOOTING.md              # symptom → cause → fix (incl. the memory-safe run recipe)
    ├── RELEASES.md                     # which library version each branch tracks
    ├── tasks/                          # per-phase task files + README (anatomy + status conventions)
    └── mutation/                       # cargo-mutants/Stryker BASELINE / HISTORY / IMPLEMENTATION_PLAN
```

> **Improvement over a thin demo.** Like the `@bymax-one/nest-auth` example, this repo keeps `apps/api` as the
> centerpiece and makes `apps/web` a **real console** — a Trigger Center, a live Sessions device manager, an MFA
> enrollment surface, an OAuth flow, an Invitations admin, a separate Platform console, and a server-only Diagnostics
> panel — not a button list. It deliberately keeps the **two-service shape** (no `apps/worker`): WebSocket
> authentication is demonstrated *within* `apps/api` (the `ws-ticket` mint) and `apps/web` (the browser connect), which
> needs no second backend. `apps/web` also demonstrates the **WASM edge verifier**: `proxy.ts`/middleware verifies the
> session JWT at the edge (`verifyJwtToken`) to protect routes without a backend round-trip.

---

## 6. Feature Coverage Matrix

Every row maps to a public feature/export of the consumed surface. Each is exercised in this repository **and**
reachable from the browser (the "Demonstrated in" column names the API surface and the console surface that drives it).
`Status ✅` here means the export is **contracted and mapped** to a real, browser-reachable journey in this blueprint —
it is the coverage contract the CI export audit enforces, not an implementation-complete marker (the repo carries no
`apps/` code yet; build progress lives in [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md)).

| #   | Library feature | Library surface | Demonstrated in | Status |
| --- | --- | --- | --- | --- |
| 1   | Registration | `AuthEngine::register(RegisterInput, &RequestContext) -> LoginResult` · `POST /auth/register` (201) · `/client` `AuthClient.register` | `apps/web` **Register** page → `authClient.register(...)`; lands authenticated (session issued even pre-verify) | ✅ |
| 2   | Password login (+ MFA branch) | `AuthEngine::login -> LoginResult` (`Success` \| `MfaChallenge`) · `POST /auth/login` · `AuthClient.login` | **Login** page; branches on `MfaChallengeResult { mfaRequired, mfaTempToken }` → MFA step | ✅ |
| 3   | Logout (single session) | `AuthEngine::logout(access, refresh, sub)` · `POST /auth/logout` (204) · `AuthClient.logout` | top-bar **Sign out**; revokes the JTI + refresh, clears cookies | ✅ |
| 4   | Token refresh / rotation | `AuthEngine::refresh -> RotatedTokens` · `POST /auth/refresh` · `/client` `createAuthFetch` single-flight 401→refresh→retry | transparent on any 401; a **Rotate token** button in the Trigger Center proves it | ✅ |
| 5   | Current user (`me`) | `AuthEngine::me -> SafeAuthUser` · `GET /auth/me` · `/react` `useSession` / `AuthClient.getMe` | the profile card + `SessionStatus` badge, populated by `useSession()` | ✅ |
| 6   | Email verification (OTP) | `verify_email` / `resend_verification_email` · `POST /auth/verify-email` (204), `/auth/resend-verification` (204, anti-enum) | **Verify email** page (code from Mailpit) + **Resend** (always 204) | ✅ |
| 7   | Password reset (forgot → verify-OTP → reset) | `initiate_reset` / `verify_reset_otp -> verifiedToken` / `reset_password` / `resend_reset_otp` · `/auth/password/*` · `AuthClient.forgotPassword`/`resetPassword` | **Forgot/Reset** 3-screen wizard; the OTP step returns a `verifiedToken` | ✅ |
| 8   | MFA setup / enable (TOTP) | `mfa_setup -> MfaSetupResult { secret, qr_code_uri, recovery_codes }` / `mfa_verify_enable` · `/auth/mfa/setup` (200), `/auth/mfa/verify-enable` (204) | **Security → Enable 2FA**: renders the `qrCodeUri` + recovery codes; submit a 6-digit code | ✅ |
| 9   | MFA login challenge | `dashboard_mfa_challenge -> AuthResult` · `POST /auth/mfa/challenge` (200) · `AuthClient.mfaChallenge` | the TOTP step after an `mfaRequired` login | ✅ |
| 10  | MFA disable / regen recovery codes | `mfa_disable` / `mfa_regenerate_recovery_codes -> Vec<code>` · `/auth/mfa/disable` (204), `/auth/mfa/recovery-codes` (200) — both need a fresh TOTP | **Security**: Disable 2FA / Regenerate codes, each gated by a current TOTP | ✅ |
| 11  | Session management (list / revoke) | `list_user_sessions` / `revoke_user_session` / `revoke_other_user_sessions` · `GET /auth/sessions`, `DELETE /auth/sessions/{id}`, `/auth/sessions/all` | **Sessions** device table (device/ip/lastActivity/isCurrent) + per-row revoke + "log out everywhere else" | ✅ |
| 12  | OAuth login (Google, PKCE + state) | `oauth_initiate -> authorize_url` / `oauth_callback -> OAuthOutcome` · `GoogleOAuthProvider` · `GET /auth/oauth/{provider}` (302), `/callback` (200/302) | **Continue with Google** → 302 to Google → callback returns a session, a redirect, or an MFA challenge | ✅ |
| 13  | Invitations (create / accept) | `invite` / `accept_invitation -> AuthResult` · `POST /auth/invitations` (204, tenant from claims), `/auth/invitations/accept` (201) | admin **Invite teammate** form; the invitee opens the link → **Accept invite** (name + password) → logged in | ✅ |
| 14  | Platform admin domain | `PlatformAuthService` (`login`/`me`/`refresh`/`logout`/`revoke_all_platform_sessions`) · `/auth/platform/*` | the separate **Platform** console (`PlatformAuthResult` — admin, no `tenantId`) | ✅ |
| 15  | Platform MFA | `routes::platform_mfa::*` (engine MFA with `MfaContext::Platform`) · `/auth/platform/mfa/*` | the same enroll / challenge / disable journeys inside the Platform console | ✅ |
| 16  | JWT issuance & verification (HS256) | `bymax-auth-jwt` `hs256::sign`/`verify`/`decode_unverified` · engine `verify_access_token`/`verify_platform_token` | issued on every auth success; **edge-verified** in the browser (row 29) | ✅ |
| 17  | WebSocket auth (single-use ticket) | `issue_ws_ticket` / `redeem_ws_ticket` · `POST /auth/ws-ticket` · extractors `WsAuthUser` / `WsAuthUserFromHeader` | **Connect realtime** mints a ~30 s ticket; the browser opens `wss://…?ticket=…` (the JWT never in the URL) | ✅ |
| 18  | Password hashing (scrypt/argon2, PHC, rehash-on-verify) | `bymax-auth-crypto::password::hash`/`verify`/`needs_rehash` · `PasswordParams` | server-only; surfaced in the **Diagnostics** panel (hash-strength + needs-rehash badge) | ✅ |
| 19  | Rate limiting (per-route edge) | `RateLimitConfig` (21 limits) via `tower_governor` | server-edge; the **Trigger Center** "hammer login" demo surfaces `429 auth.too_many_requests` + `Retry-After` | ✅ |
| 20  | Brute-force / account lockout | `BruteForceStore` (+ `remaining_lockout_secs`) | the **Diagnostics** "force lockout" button → the login form shows the lockout countdown | ✅ |
| 21  | New-session alerts / eviction | `AuthHooks::on_new_session` / `on_session_evicted` · `EmailProvider::send_new_session_alert` | a new-device sign-in emails an alert (Mailpit) + flags the current session in the **Sessions** table | ✅ |
| 22  | RBAC guards / authorization | extractors `AuthUser` / `CurrentUser` / `OptionalAuthUser` / `UserStatus` / `MfaSatisfied` / `RequireRole<R>` / `SelfOrAdmin<A>` / `PlatformUser` / `RequirePlatformRole<R>` · `role_satisfies` | the example's domain routes (audit/diagnostics) guard with these; the console renders allowed/denied | ✅ |
| 23  | Token delivery modes (cookie / bearer / both) | `enum TokenDelivery { Cookie, Bearer, Both }` | a **Settings** toggle shows cookie auto-send vs bearer-in-memory (the configured mode) | ✅ |
| 24  | Auth lifecycle hooks (14) | `AuthHooks` (`before_register`/`after_*`/`on_oauth_login`/`on_new_session`/…) · `HookContext` | the example's audit-hook impl; the **Audit** panel renders the hook-event stream | ✅ |
| 25  | Transactional email contracts (7) | `EmailProvider` (`send_password_reset_otp`/`send_email_verification_otp`/`send_mfa_enabled`/`…`/`send_invitation`) · `SessionInfo`/`InviteData` | every email lands in Mailpit; the **Diagnostics** panel links the inbox | ✅ |
| 26  | Multi-tenant scoping | `tenant_id` on claims/DTOs · `hashed_identifier_for` · `TenantIdResolver` | a **tenant selector** on login/register/reset; the platform domain is tenant-less by contrast | ✅ |
| 27  | Native Rust HTTP client | `bymax-auth-client::AuthClient` (8 ops: register/login/mfa_challenge/me/refresh/logout/forgot_password/reset_password) | exercised by `apps/api` integration tests (service-to-service); documented in `FEATURES.md` | ✅ |
| 28  | TS fetch client / React hooks / Next proxy | `/client` `createAuthClient`/`createAuthFetch` · `/react` `AuthProvider`/`useAuth`/`useSession`/`useAuthStatus` · `/nextjs` `createAuthProxy` + `createClientRefreshHandler`/`createSilentRefreshHandler`/`createLogoutHandler` | the entire `apps/web` console is built on these | ✅ |
| 29  | Edge JWT verify (WASM) | `verify_jwt_hs256` / `decode_jwt` (WASM) · `/nextjs` `verifyJwtToken` / `decodeJwtToken` | `proxy.ts`/middleware edge-verifies the session for instant route protection | ✅ |
| 30  | Stable error model & code catalog | `AuthError` / `AuthErrorCode` (40) / `AuthErrorEnvelope` · `error_response` / `AuthRejection` · `/shared` `AUTH_ERROR_CODES` (38) / `AuthClientError` | every error renders a localized message from `./shared`; the **Trigger Center** can provoke each path | ✅ |
| 31  | Config profiles & validation | `AuthConfig::nest_compat_defaults`/`secure_defaults`/`validate(Environment)` · `AuthEngineBuilder` (all seams) | `apps/api/src/engine/` (the canonical wiring); the **Settings** page shows the resolved config | ✅ |
| 32  | Validation extractors / DTOs | `ValidatedJson<T>` / `ValidatedQuery<T>` · the `garde`-validated DTOs (`RegisterDto`, `LoginDto`, `MfaVerifyDto`, …) | the library's own routes (driven by the console); a 422 path shows `Validation { details }` | ✅ |
| 33  | Repository contracts | `UserRepository` (11 methods) · `PlatformUserRepository` (6 methods) · `RepositoryError` | `apps/api/src/repos/` over sqlx — the headline "bring-your-own persistence" lesson | ✅ |
| 34  | OAuth transport seam | `HttpClient` trait · `HttpRequest`/`HttpResponse` · (built-in `ReqwestHttpClient` is plain-HTTP) | `apps/api/src/oauth/` injects a TLS `HttpClient` so `GoogleOAuthProvider` reaches Google | ✅ |
| 35  | Roadmap honesty (host-app surface) | declared-but-not-shipped: account-unlink, email-change, account-deletion, non-Google OAuth, SMS/push MFA | the **Roadmap** panel documents each as a host-app responsibility built on the existing seams | ✅ |

> **On the error catalog (row 30).** `AuthErrorCode` has **40** variants, but three are `is_internal_only()`
> (`TokenExpired`, `TokenRevoked`, `TokenMissing`) and collapse to `TokenInvalid` via `to_wire()`, and one
> (`PasswordResetTokenExpired`) is by-design unreachable (reset uses Redis `GETDEL`). The browser-visible set — the npm
> `AUTH_ERROR_CODES` union — is therefore **38**. The export audit asserts every `AUTH_ERROR_CODES` member is
> **localized** in `apps/web` (achievable for all 38), not that every one is triggerable from a journey; the
> catalog-only codes are allow-listed with a reason, exactly as an export-audit ignore entry is.

> **On server-only primitives (rows 18, 20, 22, 24, 25, 27).** Password hashing, brute-force lockout, the guards, the
> hooks, the email contracts, and the native Rust client have no *direct* browser API. They satisfy the
> browser-exercisable rule through their **observable effects**: the **Diagnostics** panel surfaces hash strength and
> forces a lockout (the login form then shows the countdown), the **Audit** panel renders the hook-event stream, every
> email is browsable in Mailpit, and the guards gate the example's own domain routes (the console renders allowed vs
> denied). None is probe-only.

> **Coverage rule.** Every public export of the consumed surface is referenced from at least one file in this
> repository. Two CI steps enforce it: `scripts/audit-library-exports.mjs` parses the built npm package's
> `dist/**/*.d.ts` for the four subpaths, extracts every exported symbol, and word-boundary-searches the `apps/web`
> corpus, failing the build if any export is unused; and `scripts/audit-rust-public-api.sh` runs `cargo public-api`
> against the consumed crates and checks every `pub` item is referenced in `apps/api` (or allow-listed with a reason).
> Genuinely-internal symbols that leak into the surface may be allow-listed with a reason — never to silence a
> demonstrable export. The matrix above is reconciled against both scripts.

---

## 7. Library Consumption

The library is consumed as two parallel dependencies — the Rust crates (server) and the npm package (browser). **None
is published yet** (`0.0.0`), so the example consumes both through local links to the sibling `../rust-auth` checkout.

### Current consumption — Rust crates (pre-publish `path`)

The `bymax-auth` **facade crate is a stub** (zero `pub use`, no `[dependencies]`), so `apps/api` depends on the
concrete crates directly — this is the supported path today and the surface the export audit measures:

```toml
# apps/api/Cargo.toml
[dependencies]
bymax-auth-axum  = { path = "../../../rust-auth/crates/bymax-auth-axum",  features = ["full"] }
bymax-auth-core  = { path = "../../../rust-auth/crates/bymax-auth-core",  features = ["full"] }
bymax-auth-redis = { path = "../../../rust-auth/crates/bymax-auth-redis", features = ["mfa", "oauth", "platform"] }
# bymax-auth-types / -crypto / -jwt arrive transitively; depend on them explicitly only if a type is named directly.
```

`features = ["full"]` lights up every optional group (`sessions`, `mfa`, `oauth`, `oauth-reqwest`, `platform`,
`invitations`) so the example can demonstrate them all. The example's `Cargo.toml` is its **own** workspace
(`members = ['apps/api']`) — it does not join the library's workspace; the path deps reach across the checkout
boundary.

> **Why path, not git/registry.** A `path` dependency rebuilds against the sibling's live source — edit the library,
> rebuild the example. Once the crates publish, switch each `path` to a pinned `version` and record the exact tested
> version per branch in `docs/RELEASES.md` (§19).

### Current consumption — the npm package (`@bymax-one/rust-auth`)

`apps/web` consumes the published-shape npm package, which wraps the WASM module (`bindings/bymax-auth-wasm`). The
package's `dist/` and `wasm/` are git-ignored and **absent until built**, so the example must build it first:

```bash
# scripts/link-library.sh (run once, and after any library change):
cd ../rust-auth/packages/rust-auth && pnpm install && pnpm build:wasm && pnpm build   # produces dist/ + wasm/
# then this repo links it:
#   apps/web/package.json → "@bymax-one/rust-auth": "file:../../../rust-auth/packages/rust-auth"
cd ../../../rust-auth-example && pnpm install
```

The package has **no root export** — only four subpaths: `@bymax-one/rust-auth/client` (browser-safe fetch client),
`/react` (the hooks + `AuthProvider`), `/nextjs` (`import "server-only"` — the edge proxy, route handlers, and WASM JWT
helpers), and `/shared` (browser-safe codes + ts-rs-generated types + `AuthClientError`). Next.js must externalize it
so the WASM resolves at runtime:

```js
// apps/web/next.config.mjs
export default {
  serverExternalPackages: ['@bymax-one/rust-auth'],
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
}
```

The build-first ordering is wired into the dev script and a dedicated **`build-library`** CI job (`apps/web` jobs
`needs: build-library`), so a fresh clone and every CI run rebuild the package before consuming it.

### After the library publishes

Switch the Rust `path` deps to pinned `version`s and the npm `file:` to a pinned semver range; `main` then records the
exact tested versions per branch in `docs/RELEASES.md`.

A dedicated `apps/api/src/engine/` module (the canonical wiring) plus the `apps/web/lib/` client setup reference the
otherwise-hard-to-exercise exports (the config-resolver traits, the advanced result types, the `/shared` constants).
Symbols that can be driven from the UI are demonstrated there, not in a probe; the wiring module is the floor, not the
ceiling.

---

## 8. Local Stack & Memory-Safe Run

### Local backends (Docker Compose)

The happy path runs with **zero external credentials**. Three local containers make auth tangible, each with a
healthcheck so `pnpm infra:up` (or `docker compose up --wait`) only returns when the stack is ready:

| Service | Image | Host port | Purpose | Healthcheck |
| --- | --- | --- | --- | --- |
| PostgreSQL | `postgres:18-alpine` | `5432` | the `UserRepository`/`PlatformUserRepository` store (sqlx). | `pg_isready` |
| Redis | `redis:7-alpine` | `6379` | `RedisStores` — all 8 store traits (sessions, OTP, lockout, reset, invitation, MFA, OAuth-state, WS-ticket). | `redis-cli ping` |
| Mailpit | `axllent/mailpit` (digest-pinned) | SMTP `1025`, UI `8025` | a local SMTP inbox; the lettre `EmailProvider` sends here, so every transactional email is browsable at `http://localhost:8025`. | `wget` `:8025` |

`apps/api` listens on **`4000`** (`API_PORT`), `apps/web` on **`3000`** (both bound to `127.0.0.1`). The test stack
(`docker-compose.test.yml`) uses deliberately high ports — Postgres `55432`, Redis `56379`, Mailpit `51025`/`58025` —
with `tmpfs` volumes, so it never contends with the running dev stack. If Mailpit is down, an email send surfaces a
delivery error — itself a demonstrable path in the Diagnostics panel.

### Memory-safe run recipe (read before running tests)

> **This is a first-class operational constraint, not a footnote.** It is copied into `docs/TROUBLESHOOTING.md`.

**The hazard.** Because the library is consumed via a local `path`/`file:` link, its crates are recompiled into the
example's build and its WASM/TS is reloaded into the module graph of **every Vitest fork**. Running multiple test
suites in parallel — or fanning test runs across parallel agents — multiplies memory by `workers × runners × agents`
and has OOM'd a 36 GB machine past 70 GB into swap on a sibling repo. The Rust side has the inverse hazard: an
unbounded `cargo test`/`cargo-mutants` parallelism saturates cores and RAM during the long mutation runs.

**The recipe.**

1. **Infra first:** `pnpm infra:up` (Postgres/Redis/Mailpit healthy) — otherwise `apps/api` exits on the sqlx connect
   and the crash masks the real issue.
2. **Bound the pools:** Rust tests run with `cargo nextest run -p api --test-threads <= cores/2`; coverage with
   `cargo llvm-cov nextest`. Web tests run with Vitest `maxWorkers: '50%'` **baked into the config**, plus
   `NODE_OPTIONS=--max-old-space-size=4096` as a guard.
3. **One package at a time, sequentially, in the main process.** **Never** fan out parallel `Agent`/`Workflow` runs
   that each execute a test suite, and never let both apps' suites run at once. CI runs each package's coverage as a
   separate sequential step; `cargo-mutants` runs with a capped `--jobs`.
4. **Prefer build-once over watch when diagnosing** — `cargo build --release` + `node apps/web/.next` beats two
   watchers under memory pressure. Start one service at a time in its own terminal.

Static gates (`cargo fmt --check`, `cargo clippy`, `tsc --noEmit`, `eslint .`) are one process each — safe to run
normally.

---

## 9. Configuration & Environment

Every variable is `UPPER_SNAKE_CASE`; browser-exposed ones are `NEXT_PUBLIC_`. The API validates its environment at
boot (a missing/invalid var aborts startup with a precise message). The root `.env.example` documents each variable;
`docs/ENVIRONMENT.md` carries the full reference table.

| Variable | Service | Default (dev) | Used for |
| --- | --- | --- | --- |
| `API_PORT` | api | `4000` | `axum::serve` bind |
| `RUST_LOG` / `LOG_LEVEL` | api | `info` | the `tracing` filter |
| `DATABASE_URL` | api | `postgres://postgres:postgres@localhost:5432/example_app` | sqlx pool |
| `DATABASE_URL_TEST` | api | `postgres://…@localhost:55432/example_app_test` | the test stack |
| `REDIS_URL` | api | `redis://localhost:6379` | `RedisStores::connect` |
| `REDIS_NAMESPACE` | api | `rust_auth_example` | the store key namespace (keys → `rust_auth_example:…`) |
| `JWT_SECRET` | api | *(dev value ≥ 64 chars)* | the HS256 `HsKey`; the builder rejects short/low-entropy secrets |
| `MFA_ENCRYPTION_KEY` | api | *(base64 32-byte dev value)* | the AES-256-GCM key sealing TOTP secrets |
| `EMAIL_PROVIDER` | api | `mailpit` | `mailpit` (lettre → SMTP) \| `resend` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` | api | `localhost` / `1025` / `no-reply@auth.local` | the lettre provider |
| `RESEND_API_KEY` | api | *(unset ⇒ Mailpit)* | switches the `EmailProvider` to Resend |
| `OAUTH_GOOGLE_CLIENT_ID` / `_CLIENT_SECRET` / `_CALLBACK_URL` | api | *(unset ⇒ OAuth disabled)* | the `GoogleOAuthProvider` config |
| `WEB_ORIGIN` | api | `http://localhost:3000` | CORS allow-origin (+ exposes `Retry-After`) |
| `AUTH_JWT_SECRET_FOR_PROXY` | web | *(same as `JWT_SECRET`)* | the `/nextjs` edge verifier's HS256 secret |
| `INTERNAL_API_URL` | web | `http://localhost:4000` | the proxy's backend target |
| `NEXT_PUBLIC_API_URL` | web | `http://localhost:4000` | the console's API base |
| `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED` | web | `false` | shows/hides the "Continue with Google" button |

### Canonical wiring

The single source of truth for how the library is configured is `apps/api/src/engine/` — a builder that returns a
fully-wired `AuthEngine` from the validated `Settings`. It picks an `AuthConfig` profile, then attaches every seam the
example owns; the common store path is the **one-handle** `redis_stores(Arc<RedisStores>)`:

```rust
// apps/api/src/engine/mod.rs (shape) — the canonical wiring
use std::sync::Arc;
use bymax_auth_core::{AuthEngine, AuthConfig, config::Environment};
use bymax_auth_redis::RedisStores;

pub fn build_engine(settings: &Settings) -> Result<AuthEngine, BuildError> {
    // 1) A config profile, then validate it for the target environment (fail-fast).
    let mut config = AuthConfig::nest_compat_defaults();      // or ::secure_defaults() under the `argon2` feature
    config.jwt.secret = secrecy::SecretString::from(settings.jwt_secret.clone()); // ≥ 64 chars, entropy-checked by validate()
    config.platform.enabled = true;                           // light up the platform admin domain
    config.controllers = ControllerToggles { sessions: true, mfa: true, oauth: true, invitations: true, ..config.controllers };
    config.validate(Environment::Development)?;               // aborts on a weak secret, empty role hierarchy, etc.

    // 2) One Redis handle wires every store seam (lazy pool, no I/O at construct).
    let stores = Arc::new(RedisStores::connect(&settings.redis_url, settings.redis_namespace.clone())?);

    // 3) Build the engine — required seams + the example's own implementations.
    AuthEngine::builder()
        .config(config)
        .environment(Environment::Development)
        .user_repository(Arc::new(SqlxUserRepository::new(pool.clone())))            // REQUIRED — the boundary
        .platform_user_repository(Arc::new(SqlxPlatformUserRepository::new(pool)))   // REQUIRED iff platform.enabled
        .redis_stores(stores)                                                       // session/otp/brute-force/reset/… 
        .email_provider(Arc::new(resolve_email_provider(settings)))                 // lettre→Mailpit | Resend
        .hooks(Arc::new(AuditAuthHooks::new(audit_pool)))                           // the audit domain + on_oauth_login policy
        .oauth_provider(Arc::new(GoogleOAuthProvider::new(google_cfg, tls_http_client())))  // injected TLS HttpClient
        .build()                                                                    // -> Result<AuthEngine, ConfigError>
        .map_err(BuildError::from)
}
```

The router is then mounted with `bymax_auth_axum::auth_router(engine, AxumAuthConfig { route_prefix: "auth".into(),
rate_limits: RateLimitConfig::default(), client_ip_source: ClientIpSource::PeerAddr, ..Default::default() })`, and the
example's own domain routes (`/audit/*`, `/diagnostics/*`, `/health`) are merged onto the same `Router`. Every optional
route group is **doubly gated** — a Cargo feature *and* a runtime `ControllerToggles` flag — so the mounted surface
exactly matches the configured one.

---

## 10. The Demo Domain & Auth Console

The library ships the **routes, DTOs, extractors, and error mapping**; the example provides the **backends** (repos,
email, hooks, OAuth transport, Redis/Postgres) and a thin **domain surface** (audit + diagnostics + health) plus the
console that drives everything. The library's mounted endpoint surface (default prefix `/auth`):

| Route | Library call | Purpose |
| --- | --- | --- |
| `POST /auth/register` | `AuthEngine::register` | create a user, issue a session (201) |
| `POST /auth/login` | `AuthEngine::login` | password login → `AuthResult` or `MfaChallengeResult` |
| `POST /auth/logout` | `AuthEngine::logout` | revoke JTI + refresh, clear cookies (204) |
| `POST /auth/refresh` | `AuthEngine::refresh` | rotate the token pair |
| `GET /auth/me` | `AuthEngine::me` | the current `SafeAuthUser` |
| `POST /auth/verify-email` · `/auth/resend-verification` | `verify_email` / `resend_verification_email` | email-verification OTP (resend is anti-enumeration, always 204) |
| `POST /auth/password/{forgot-password,verify-otp,reset-password,resend-otp}` | `initiate_reset` / `verify_reset_otp` / `reset_password` / `resend_reset_otp` | the reset wizard (`verify-otp` returns a `verifiedToken`) |
| `POST /auth/mfa/{setup,verify-enable,challenge,disable,recovery-codes}` | `mfa_setup` / `mfa_verify_enable` / `dashboard_mfa_challenge` / `mfa_disable` / `mfa_regenerate_recovery_codes` | TOTP enrollment, login challenge, disable, regen |
| `GET /auth/sessions` · `DELETE /auth/sessions/{id}` · `/auth/sessions/all` | `list_user_sessions` / `revoke_user_session` / `revoke_other_user_sessions` | the device manager |
| `GET /auth/oauth/{provider}` · `/auth/oauth/{provider}/callback` | `oauth_initiate` / `oauth_callback` | Google sign-in (PKCE + state) |
| `POST /auth/invitations` · `/auth/invitations/accept` | `invite` / `accept_invitation` | team invitations |
| `POST /auth/ws-ticket` | `issue_ws_ticket` | a single-use WebSocket ticket (~30 s) |
| `… /auth/platform/*` · `/auth/platform/mfa/*` | `PlatformAuthService` · `routes::platform_mfa` | the tenant-less admin domain |
| `GET /audit/{logs,stream}` *(example-owned)* | reads the `audit_log` the hooks write | keyset list + SSE live tail |
| `POST /diagnostics/{hash-strength,force-lockout}` · `GET /diagnostics/hooks` *(example-owned, dev)* | `password::needs_rehash` · `BruteForceStore` · the hook log | surface the server-only primitives |

Token delivery follows the configured `TokenDelivery`: `Cookie` sets the access/refresh/`has_session` cookies + a body
`{ user }`; `Bearer` returns `{ user, accessToken, refreshToken }`; `Both` does both. The refresh cookie is always
path-scoped (`/auth`) and `SameSite=Strict`.

### The console (`apps/web`)

Two consoles share the **shared Bymax design system** (forced dark, orange glass, Geist + mono — §4) and persist view
state in the URL via `nuqs`. **Global controls** (top bar): a **tenant selector** (sets `tenant_id` on
login/register/reset), a **delivery-mode** indicator, and the session/user badge from `useAuthStatus()`.

| Area | Page | Job |
| --- | --- | --- |
| `/` | **Overview** | Auth health — login/verify success rates, active sessions, MFA-enrolled %, email provider + OAuth status. |
| `/dashboard/trigger` | **Trigger Center** | The Playground — fire every feature (register, login, force MFA, rotate token, hammer login → 429, force lockout, provoke each `auth.*` error), each auto-pivoting to the resulting audit row. |
| `/dashboard/security` | **Security / MFA** | Enroll TOTP (QR + recovery codes), challenge, disable, regenerate — the `useOtpInput`-style 6-digit box + the AEAD-sealed-secret story. |
| `/dashboard/sessions` | **Sessions** | The device manager — list (device/ip/lastActivity/isCurrent), per-row revoke, "log out everywhere else", live new-session alerts. |
| `/dashboard/oauth` | **OAuth** | "Continue with Google" → the PKCE/state round-trip → session / redirect / MFA challenge; shows the `on_oauth_login` Create vs Link decision. |
| `/dashboard/invitations` | **Invitations** | Admin invite form + the accept flow (the invitee's name + password screen). |
| `/dashboard/audit` | **Audit** | The hook-event stream (every `AuthHooks` call) — faceted, virtualized, SSE live tail. |
| `/dashboard/account` | **Account** | The `me` profile card + the email-verification + password-reset entry points + the `Diagnostics` link. |
| `/platform/*` | **Platform console** | The tenant-less admin domain — admin login, platform MFA, admin sessions (mirrors the dashboard surfaces against `PlatformClaims`). |
| `/auth/*` *(public)* | **Public auth pages** | login, register, forgot/reset password, verify email, MFA challenge, accept invitation — the unauthenticated entry points. |

> The full information architecture, the panel/chart catalog, the backing-API table, the SSE follow-mode UX, and the
> rendering of every design-system primitive (the OTP box, the QR enrollment card, the recovery-code grid, the sessions
> table, the tenant selector, the platform console shell) live in [`docs/DASHBOARD.md`](DASHBOARD.md).

---

## 11. The Authentication Pipelines (Deep Dive)

The engine runs several pipelines; the example surfaces each so it can be inspected in the UI. The headline flow — a
**password login with MFA + rotation** — has five stages:

```
  request ─▶ [1] authenticate ─▶ [2] gate ─────▶ [3] issue ──────▶ [4] persist ────▶ [5] deliver
            UserRepository       BruteForce +     HS256 access +     SessionStore       TokenDelivery
            .find_by_email +     MFA check →       opaque refresh     .create_session    (cookies | bearer)
            password::verify     MfaChallenge or   (RawRefreshToken)  (+ blacklist on    + AuthHooks
            (+ rehash-on-verify) AuthResult        bymax-auth-jwt     rotate/evict)       .after_login / on_new_session
```

Key design facts the example proves:

- **Stage 1 — Authenticate.** `UserRepository::find_by_email(email, tenant_id)` returns `Ok(None)` for a missing or
  cross-tenant row (never an error), and `password::verify` is **total** — it returns `Ok(false)` for a wrong password,
  never panics, accepts legacy `scrypt:hex:hex` hashes, and `needs_rehash` flags a stale parameter set so the engine can
  transparently upgrade the hash on a successful login.
- **Stage 2 — Gate.** `BruteForceStore` records failures and locks the account atomically (Redis Lua); a locked account
  returns `auth.account_locked` with a `retryAfterSeconds`. If MFA is enabled, login returns a `MfaChallengeResult`
  carrying a short-lived `mfa_temp_token` (an `MfaTempClaims` JWT, 300 s) instead of a session — the second factor is
  verified against the AEAD-sealed TOTP secret with a ±2-step drift window and constant-time comparison.
- **Stage 3 — Issue.** The access token is an **HS256 JWT** (`DashboardClaims` / `PlatformClaims`) signed with the
  zeroizing `HsKey`; the algorithm is **hard-pinned** (a forged `alg:none` or `RS256` header is rejected — CVE-2015-9235
  defense). The refresh token is an **opaque random** `RawRefreshToken` (never a JWT), exposed once to the client and
  persisted only as `sha256(token)`.
- **Stage 4 — Persist.** `SessionStore::create_session` records the session; `rotate` swaps the refresh token on every
  use with a **grace pointer** (a brief window where the old token still resolves, tolerating a racing in-flight refresh),
  and an `RotateOutcome::Invalid` on a reused-past-grace token triggers a full revoke (refresh-token-reuse defense). The
  access JTI is blacklisted on logout (`blacklist_access` / `is_blacklisted`). Session eviction (FIFO over a per-user
  max) fires `on_session_evicted`.
- **Stage 5 — Deliver.** Per `TokenDelivery`, the tokens go to HttpOnly cookies and/or the body. The hooks fire
  (`after_login`, and `on_new_session` → `EmailProvider::send_new_session_alert` for a new device). On the browser, the
  `/client` `createAuthFetch` does **single-flight** transparent refresh: a 401 triggers one `/auth/refresh`, then
  replays the original request; concurrent 401s share the one refresh.

Other pipelines — registration (`before_register` reject/override hook → create → `after_register`), email-verification
and password-reset (OTP `put`/`verify`/`try_begin_resend` with anti-enumeration always-204 resends), OAuth
(`initiate` mints PKCE+state → Google → `callback` exchanges code, fetches profile, consults `on_oauth_login` for the
Create/Link/Reject decision), and invitations (`invite` → emailed token → `accept_invitation` → session) — are each
walked in `docs/ARCHITECTURE.md` and `docs/FEATURES.md`.

Crate boundaries: the library's public surface is the engine + builder, the axum router + extractors + DTOs + error
mapping, the trait contracts (repository / email / hooks / oauth / http / stores / resolvers), the crypto + JWT
primitives, the typed claims/results/errors, and the browser package's four subpaths. Everything else (the engine's
internal services, the Redis Lua sources, the crypto implementations) is internal — the example depends only on the
public surface.

---

## 12. Identity Domains & Extension Points

Two identity domains and a small set of trait seams define the integration surface; the example wires a real
implementation for each and documents how to bring your own.

### Two identity domains

| Domain | Claims | `tenant_id`? | Repository | Routes | Console |
| --- | --- | --- | --- | --- | --- |
| **Dashboard** (tenant-scoped end users) | `DashboardClaims` | yes | `UserRepository` (11 methods) | `/auth/*` | `/dashboard/*` |
| **Platform** (tenant-less admins) | `PlatformClaims` | no | `PlatformUserRepository` (6 methods) | `/auth/platform/*` | `/platform/*` |

The two are deliberately separate token families: a dashboard token can never satisfy a platform guard and vice-versa
(distinct `token_type` discriminators that fail cross-domain deserialization). Platform MFA is **fail-closed** —
`platform.enabled` without an MFA config refuses an MFA-enabled admin login.

### The extension seams

| Seam | Contract | Built-in reference | This example wires | Bring-your-own |
| --- | --- | --- | --- | --- |
| User persistence | `UserRepository` (11 async methods) | `InMemoryUserRepository` (`testing` feature) | **sqlx / Postgres** — the boundary | any DB (`DATABASE.md`) |
| Platform persistence | `PlatformUserRepository` (6 methods) | `InMemoryPlatformUserRepository` | **sqlx / Postgres** | any DB |
| Email transport | `EmailProvider` (7 send methods) | `NoOpEmailProvider` | a **lettre → Mailpit** provider (zero-cred) + Resend (opt-in) | SendGrid/SES (`EMAIL.md`) |
| Store backend | 8 store traits (`SessionStore`, `OtpStore`, `BruteForceStore`, `WsTicketStore`, `PasswordResetStore`, `InvitationStore`, `MfaStore`, `OAuthStateStore`) | `InMemoryStores` (`testing`) | **Redis** via one `Arc<RedisStores>` | any KV (`REDIS.md`) |
| Lifecycle hooks | `AuthHooks` (14 methods, all defaulted; `on_oauth_login` defaults to **DENY**) | `NoOpAuthHooks` | an **audit-log** impl + an `on_oauth_login` Create/Link policy | any side-effect sink |
| OAuth provider | `OAuthProvider` (4 methods) | `GoogleOAuthProvider` | the built-in Google provider | a custom provider |
| OAuth transport | `HttpClient` (1 method) | `ReqwestHttpClient` (**plain-HTTP only**) | a **TLS** `reqwest` + rustls client | any HTTP stack |
| Config resolvers | `TenantIdResolver` / `CookieDomainResolver` / `MaxSessionsResolver` | — | optional demo resolvers | per-app policy |

The headline "bring-your-own" lessons are the two repositories — the example's `SqlxUserRepository` is a real
`query_as!`-backed implementation of all 11 methods (and `RepositoryError::Conflict` maps to `auth.email_already_exists`
— a missing row is `Ok(None)`, never an error) — and the `EmailProvider`, a ~7-method lettre adapter that makes the
demo's emails **actually appear** in a browsable inbox. Writing each seam is documented end-to-end in `docs/DATABASE.md`,
`docs/EMAIL.md`, `docs/REDIS.md`, and `docs/OAUTH_GOOGLE.md`, including the **atomicity requirements** on the store
seam (the one place a naive implementation introduces a security bug). The `testing`-feature in-memory doubles
(`InMemoryStores`, `InMemoryUserRepository`, `MockHttpClient`, `MockOAuthProvider`) back the API test suite so e2e runs
need no Redis.

---

## 13. Token, Session & Tenant Security

The library is security-first by design; the example makes each mechanism visible and testable.

- **Algorithm-pinned JWTs.** Access tokens are HS256 only; `hs256::verify` rejects any other `alg` (including `none`)
  before touching the signature — the **Diagnostics** panel lets you paste a forged `alg:none` token and watch it bounce.
  `VerifyOptions` defaults to server-strict (`validate_exp`/`validate_iat` on, zero leeway).
- **Opaque, hashed refresh tokens.** A refresh token is a 256-bit random `RawRefreshToken`, never a JWT, exposed to the
  client once and persisted only as `redis_hash()` = `sha256(token)` — an operator with Redis access cannot replay it,
  and rotation with a grace pointer defends against refresh-token reuse (a reused past-grace token revokes the whole
  session).
- **AEAD-sealed MFA secrets.** TOTP secrets are sealed with AES-256-GCM (`MFA_ENCRYPTION_KEY`) before they touch
  Postgres; recovery codes are one-time. The TOTP verify is constant-time with a ±2-step drift window, and a used step
  is marked (`mark_totp_used`) to block replay within the window.
- **SHA-256 tenant identifiers.** Where the engine needs a storage key spanning tenant + email it uses
  `hashed_identifier_for(tenant_id, email)` — never the plaintext — so two tenants sharing a recipient never collide and
  an operator cannot enumerate which emails exist.
- **Multi-tenant isolation.** Every dashboard claim and DTO carries `tenant_id`; `find_by_email(email, tenant_id)` is
  tenant-scoped, so the same email under `acme` and `globex` is two isolated users. The platform domain is tenant-less
  by contrast (a single admin space).
- **Anti-enumeration.** `resend-verification`, `forgot-password`, and `resend-otp` always return success (204/200)
  whether or not the account exists — the console surfaces the same "check your inbox" regardless.
- **Never-log-secrets invariant.** `AuthUser`/`CreateUserData`/`UpdateMfaData`/`RawRefreshToken`/`HsKey`/`MfaSetupResult`
  all have **redacting `Debug`** impls, the engine hands hooks a `SafeAuthUser` (never the password hash or MFA secret),
  and the audit domain persists no token, code, or secret — a regression test asserts the audit row never contains the
  emailed OTP, and the **Audit** drawer renders that proof as a green check.
- **Brute-force lockout + rate limits.** `BruteForceStore` locks an account after repeated failures (with a
  `remaining_lockout_secs` countdown), and `RateLimitConfig` applies 21 per-route token-bucket limits at the edge — both
  exercisable from the Trigger Center / Diagnostics, both returning `Retry-After`.

Full treatment in `docs/MFA.md`, `docs/REDIS.md`, and `docs/ARCHITECTURE.md`.

---

## 14. Ecosystem Fit — the `@bymax-one/nest-auth` twin

`bymax-auth` / `@bymax-one/rust-auth` is the **Rust-stack twin** of the published
[`@bymax-one/nest-auth`](https://github.com/bymaxone/nest-auth) (NestJS 11 + React 19 + Next.js 16). They are **the same
auth contract on two runtimes** — JWT access/refresh with rotation, sessions + JTI blacklist, TOTP MFA + recovery
codes, OAuth (Google), RBAC with a role hierarchy, brute-force protection, password reset, email verification, tenant
invitations, and a platform-admin domain — designed so a team can pick the runtime that fits a service and keep
identical token shapes, error codes, cookie names, and route paths across both.

| Concern | `@bymax-one/nest-auth` (TS) | `bymax-auth` / `@bymax-one/rust-auth` (this example) |
| --- | --- | --- |
| Backend | NestJS 11 + Express | **Rust + axum 0.8 + Tokio** |
| Engine wiring | `BymaxAuthModule.forRootAsync` (DI) | `AuthEngine::builder()` (explicit) |
| Persistence seam | `IUserRepository` | `UserRepository` trait (sqlx in this example) |
| Email seam | `IEmailProvider` | `EmailProvider` trait (lettre in this example) |
| Store seam | Redis adapters | `RedisStores` (one handle, 8 traits) |
| Browser layer | `@bymax-one/nest-auth/react` + `/nextjs` | `@bymax-one/rust-auth` `/react` + `/nextjs` (+ **WASM edge verify**) |
| Token shapes / cookie names / error codes / routes | — | **identical** (the `/shared` constants are generated from the same ts-rs source) |

The headline cross-runtime fact is the **shared wire contract**: the cookie names (`access_token`, `refresh_token`,
`has_session`), the route templates (`AUTH_ROUTES`), and the error codes (`AUTH_ERROR_CODES`) are byte-identical to the
NestJS twin, so a Next.js frontend can point at either backend unchanged. This example demonstrates that by reusing the
exact `/shared` constants the TypeScript library also ships. `@bymax-one/nest-auth` is an **illustrative peer** here,
not a dependency — the example proves the Rust runtime in isolation.

---

## 15. Auth Event Tracking & the Audit Domain

Where a logging example would correlate logs to traces, this example's observability is its **auth audit log** — a
first-class, queryable record of every authentication event, produced entirely through the library's `AuthHooks` seam.

- **The source.** The library calls the example's `AuthHooks` impl at every lifecycle point (`after_register`,
  `after_login`, `after_logout`, `after_email_verified`, `after_password_reset`, `after_mfa_enabled`/`_disabled`,
  `after_mfa_recovery_codes_regenerated`, `after_invitation_accepted`, `on_new_session`, `on_session_evicted`, plus the
  decision hooks `before_register` and `on_oauth_login`). Each hook receives a `SafeAuthUser` (never secrets) + a
  `HookContext` (ip, user-agent, sanitized headers). The example's `AuditAuthHooks` writes a row to an `audit_log`
  Postgres table — the library never imports a DB, so persistence is purely the host's choice.
- **The decision hooks.** `before_register` can reject or override (role/status/email_verified) a sign-up;
  `on_oauth_login` — which **defaults to a secure DENY** — is implemented by the example with a concrete policy: Create a
  new user when the verified Google email is unseen, Link to an existing local user when it matches, and Reject
  otherwise. Without this impl OAuth silently does nothing (the builder warns); the example makes the policy explicit
  and visible in the OAuth panel.
- **The read API.**
  - `GET /audit/logs?cursor&actor&event&tenantId&limit` → `{ data, nextCursor, hasMore }`, keyset pagination.
  - `GET /audit/stream` → SSE; each event's `id` is the row's keyset cursor, so a reconnect resumes from `Last-Event-ID`.
- **The UI.** The **Audit** page renders the hook-event stream with a follow-mode live tail (pinned-to-bottom
  auto-scroll; scroll-up pauses with an "N new — jump to latest" pill), a faceted filter bar (by actor/event/tenant),
  and a detail drawer that includes the **never-contains-secrets** proof. `tracing` spans cover the same events for
  operators who prefer logs.

---

## 16. Demonstrated Journeys

`docs/FEATURES.md` expands each of these into a request/response + teaching-point walkthrough. The numbered journeys:

1. **First verified login in 60 seconds** — `register` → the verification code lands in Mailpit (`:8025`) →
   `verify-email` → `login` → the profile card populates and the audit live-tail shows the event chain.
2. **Login with MFA** — enroll TOTP (`mfa/setup` renders a QR + recovery codes; `mfa/verify-enable`), sign out, sign
   back in → `login` returns `mfaRequired` → enter the 6-digit code → `mfa/challenge` → session issued.
3. **Wrong password, then lockout** — repeated wrong passwords trip `BruteForceStore`; the login form shows the
   `auth.account_locked` countdown (`remaining_lockout_secs`).
4. **Rate-limit envelope** — "hammer login" in the Trigger Center exceeds `RateLimitConfig.login` (5/60) → `429
   auth.too_many_requests` with a `Retry-After`, rendered by `AuthClientError`.
5. **Transparent token rotation** — let the access token expire (or click **Rotate token**) → the `/client`
   `createAuthFetch` single-flights a `/auth/refresh` and replays the request; the Sessions row shows the rotated token.
6. **Refresh-token reuse defense** — replay an old refresh token past the grace window → the whole session is revoked
   (`RotateOutcome::Invalid`); the Sessions table empties.
7. **Password reset wizard** — `forgot-password` (anti-enum 200) → the OTP from Mailpit → `verify-otp` returns a
   `verifiedToken` → `reset-password`; an unknown email returns the same 200.
8. **OAuth sign-in (Google)** — "Continue with Google" → the PKCE+state round-trip → `on_oauth_login` decides
   Create vs Link → a session (or a 302, or an MFA challenge); the panel shows which branch fired.
9. **Bring-your-own provider** — switch email from lettre→Mailpit to Resend by setting `RESEND_API_KEY`, with no
   call-site change; the Diagnostics panel shows the active provider.
10. **Multi-tenant isolation** — register the same email under `acme` and `globex` (tenant selector) → two isolated
    users; a login under the wrong tenant fails.
11. **Session device manager** — sign in from a second "device" (a second browser) → a new-session alert email +
    a second row in **Sessions**; revoke it, or "log out everywhere else".
12. **WebSocket auth** — **Connect realtime** mints a ~30 s `ws-ticket`; the browser opens `wss://…?ticket=…` (the JWT
    never in the URL); the ticket is single-use (a replay is rejected).
13. **Edge route protection (WASM)** — open a `/dashboard/*` route with an expired/forged cookie → the Next.js
    middleware `verifyJwtToken` (WASM) bounces to `/auth/login` without a backend round-trip.
14. **Platform admin domain** — sign in to the tenant-less **Platform** console; a dashboard token cannot satisfy a
    platform guard (and vice-versa); enroll platform MFA.
15. **Invitations** — an admin invites a teammate (Mailpit link) → the invitee accepts (name + password) → logged in,
    with the audit chain recording `after_invitation_accepted`.
16. **Roadmap honesty** — the **Roadmap** panel documents account-unlink / email-change / account-deletion /
    non-Google OAuth / SMS-push MFA as host-app responsibilities built on the existing seams — declared, not faked.

---

## 17. Testing Strategy

| Layer | Tool | Scope |
| --- | --- | --- |
| API unit | `cargo nextest` | the engine wiring, each `UserRepository`/`EmailProvider`/`AuthHooks` impl, the config builder, the domain routes, the error mapping |
| API property / KAT | `proptest` + RFC vectors | crypto/JWT edges exercised via the example's wiring (TOTP drift, PHC round-trips, alg-pin rejection) |
| API integration | `cargo nextest` + `testcontainers` (or the test stack) | the full HTTP surface against the `testing` in-memory doubles **and** a real Postgres/Redis (`sqlx migrate` first); the native `bymax-auth-client::AuthClient` round-trip |
| API coverage | `cargo llvm-cov nextest` | **100%** lines/regions/functions, non-executable glue excluded |
| Web unit | Vitest 4 (jsdom) | every `lib/**` + `components/**` + `hooks/**`; the OTP box, the sessions table, the error-code localization, the `/react` hook wrappers |
| Web e2e | Playwright | the live journeys (register → Mailpit → verify → login → MFA) against a running stack |
| Mutation — API | `cargo-mutants` | **caught ratio ≥ 95% (mandatory floor), driven toward 100%**; surviving mutants documented as provable equivalents in `docs/mutation/` |
| Mutation — web | Stryker | **break ≥ 95** (`lib/**` 100), driven toward 100; survivors documented |

The quality floor is **100% coverage** (all metrics) in both workspaces, with non-executable glue stripped from scope
so the number stays meaningful, and a **mandatory mutation floor of ≥ 95** on both sides driven as close to 100% as
achievable (the library itself holds the same bar). `cargo-mutants` has no Stryker-style `break` config — the gate is a
CI script that computes `caught / (caught + missed)` and fails below the threshold, with documented equivalents in
`docs/mutation/`. The `maxWorkers`/`--test-threads` caps from §8 are baked into the configs. Every test names the
scenario and the rule it protects (e.g. *"verify rejects a reused refresh token past grace — protects the
rotation-reuse defense"*).

CI gates (`.github/workflows/ci.yml`): `lint` (`cargo clippy -- -D warnings` + ESLint) · `format` (`cargo fmt --check`
+ Prettier) · `typecheck` (`cargo check` + `tsc`) · `unit` (coverage, both workspaces) · `e2e-api` · `e2e-web` ·
`export-usage-check` (the npm-export audit + the `cargo public-api` snapshot). Mutation (`mutation.yml`) runs post-merge
on `main` (`--in-diff`, scoped to the merge's changed API lines) and on manual dispatch (full API surface) — never on PRs
or a schedule, per the org cost policy. The npm package is built first so the `file:`
link resolves; a placeholder `DATABASE_URL` lets the build run without a database.

---

## 18. Deployment Notes

The example ships as two container images (`apps/api/Dockerfile` multi-stage Rust build → a distroless runtime;
`apps/web/Dockerfile` the Next.js standalone build) via `release.yml` on a `v*` tag, pushed to GHCR with OIDC. A
production checklist:

- Point `DATABASE_URL` at a managed Postgres and `REDIS_URL` at a managed Redis (so sessions/OTP/lockout are durable
  and atomic across instances); run `sqlx migrate run` on deploy.
- Set a strong `JWT_SECRET` (≥ 64 chars, high-entropy — the builder's `validate()` rejects weak ones) and a real
  `MFA_ENCRYPTION_KEY` (base64 32 bytes); rotate them through the documented dual-key window.
- Set `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` (or wire your own `EmailProvider`) and a verified `SMTP_FROM` domain;
  Mailpit is dev-only.
- Configure Google OAuth (`OAUTH_GOOGLE_*`) and confirm the example's TLS `HttpClient` reaches Google (the built-in
  `ReqwestHttpClient` is plain-HTTP and will not).
- Set `WEB_ORIGIN` to your `https://` console origin (CORS + `Retry-After` exposure) and `AUTH_JWT_SECRET_FOR_PROXY`
  for the edge verifier; drive `client_ip_source: TrustedForwardedFor` only behind a trusted proxy.
- Use a graceful-shutdown signal so in-flight requests drain on `SIGTERM`.

---

## 19. Versioning & Release Tracking

The example tracks **one library version line at a time**. `docs/RELEASES.md` records which version each branch tracks.

| Branch | Tracks library version | Notes |
| --- | --- | --- |
| `main` | `bymax-auth-*` `path` → pinned crate version; `@bymax-one/rust-auth` `file:` → `^0.0.x` | pre-publish today via `path`/`file:`; pins the semver ranges once the crates + package ship. |
| `next` | upcoming line | tracks the next library version (e.g. the `bymax-auth` facade landing, or new `OAuthProvider` implementations). |

When the library publishes (the registry-publish pipeline is the one piece still pending on the library side — see the
Decisions below), `release.yml` records the exact tested versions per commit, and the path/file links become pinned
ranges.

---

## 20. Contributing

The bar for any change is: **does this make the library clearer to learn or more completely demonstrated?**
Concretely:

- A new library export ⇒ a new Feature Coverage Matrix row **and** a browser-reachable way to exercise it (a Trigger
  Center card or a dedicated panel) — not just a probe reference.
- Code is exemplary: Rust edition 2024, `#![forbid(unsafe_code)]`, no `unwrap`/`expect`/`panic!` in non-test code,
  typed `thiserror` errors, `cargo fmt` + `cargo clippy -- -D warnings` clean, `#![deny(missing_docs)]` honoured; on the
  web side TypeScript strict (no `any`); Clean Code sizing (functions ≤ 50 lines, files ≤ 800), SRP/SOLID, English-only
  comments/identifiers/commits, Conventional Commits with **no `Co-Authored-By` trailer**, timeless comments (no
  phase/task references in committed files).
- All gates green before a PR: `cargo fmt --check && cargo clippy -- -D warnings && cargo llvm-cov nextest && pnpm
  -C apps/web test:cov && pnpm audit:exports`.

---

## 21. License, Attribution & Status

- **License.** MIT © Bymax One. `bymax-auth` / `@bymax-one/rust-auth` is MIT © Bymax One.
- **Status.** ✅ Build complete — both workspaces (`apps/api` axum + `apps/web` Next.js) are implemented, tested
  (100% coverage + mutation ≥ 95 on both), and documented. The public-readiness prep is merged; the first `v*` tag
  and the public-visibility flip are the remaining manual release steps. See
  [`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md) for the phase dashboard.
- **Document version.** OVERVIEW `1.0.0`, reconciled against the shipped `pub` surface of the consumed crates +
  the `@bymax-one/rust-auth` npm package, and audited (lib-coverage + structure + Rust-contracts) on the date of writing.

### Decisions taken (for maintainer review)

These resolve the open questions the research surfaced; each is a sensible default grounded in the mission directives
and the library's shipped surface — flag any you want changed.

- **Consume the concrete crates, not the facade.** The `bymax-auth` facade is a stub (zero `pub use`), so `apps/api`
  depends on `bymax-auth-axum` + `bymax-auth-core` + `bymax-auth-redis` directly. The Rust export audit measures those
  crates' `pub` surface. If/when the facade lands, the example can collapse to a single import — tracked on `next`.
- **Dogfood the upstream npm package — do not build a parallel WASM client.** `apps/web` consumes
  `@bymax-one/rust-auth` (the published-shape package wrapping `bindings/bymax-auth-wasm`) via `file:`, built first by
  `scripts/link-library.sh` + a `build-library` CI job. Building a second wasm client would duplicate the dogfood target.
- **Full quality bar.** 100% coverage on all metrics in both workspaces + a mandatory mutation floor of ≥ 95
  (`cargo-mutants` for the API, Stryker for the web), driven toward 100, survivors documented in `docs/mutation/`. CI is
  strong from the first phase (the repo is private now, public later — go-public hardening is built in, not retrofitted).
- **Persistence = sqlx + Postgres** (`query!`/`query_as!` + an offline `.sqlx/` cache + `migrations/*.sql`). The schema
  backs `AuthUser`/`AuthPlatformUser` exactly (including `mfa_recovery_codes`, `oauth_provider`/`oauth_provider_id`,
  platform `updated_at`/`platform_id`).
- **OAuth TLS transport = `reqwest` + rustls (aws-lc-rs), server-side only.** `ring` and `openssl` are workspace-banned;
  the example injects a rustls-backed `HttpClient` so `GoogleOAuthProvider` reaches Google over HTTPS. This never enters
  the wasm edge build (which does no Google HTTP), so there is no conflict with the no-`ring` policy.
- **Concrete `AuthHooks` with an explicit OAuth policy.** Because `on_oauth_login` defaults to DENY, the example wires
  an `AuditAuthHooks` that Creates on an unseen verified email, Links on a match, and Rejects otherwise — and writes the
  audit log. The policy is visible in the OAuth panel.
- **Two-service shape (no `apps/worker`).** WebSocket auth is shown within `apps/api` (the ticket mint) + `apps/web`
  (the browser connect); cross-service token propagation needs no second backend for this demo.
- **English-only docs.** No repo-level exception applies; all docs, comments, and prompts are English.
- **WASM `extract_claims` / `verify_password` are out-of-surface.** Not in the npm published exports, so not part of the
  coverage contract; the example demonstrates `verify_jwt_hs256` / `decode_jwt` via `verifyJwtToken` / `decodeJwtToken`.
- **~15-phase plan** (P0–P14), mirroring the auth-domain shape condensed from the sibling's 21 phases, one phase = one
  PR = one review cycle — detailed in `docs/DEVELOPMENT_PLAN.md`.
- **Toolchain pins.** Rust channel `1.96.0` (MSRV floor `1.90`) matching the library; Node 24; pnpm 10.8.x.

### Suggested build order (for the implementer)

The companion `docs/DEVELOPMENT_PLAN.md` breaks this blueprint into ~15 phases. The recommended order:

1. **Repo foundation** — the dual (cargo + pnpm) workspace, the Rust + TS toolchains, the shared design-system files,
   the full CI/CD + go-public scaffolding.
2. **Local stack** — `docker-compose.yml` (Postgres + Redis + Mailpit, each healthchecked) + the env contract.
3. **Library consumption** — the `path` deps + the `file:`-linked npm package (built first) + the export audits.
4. **API skeleton** — the axum bootstrap, `figment` config, `/health`, the typed `AppError`, the sqlx pool + the Redis
   `RedisStores` handle.
5. **Schema & repositories** — the `migrations/*.sql` + the `SqlxUserRepository`/`SqlxPlatformUserRepository`.
6. **Engine wiring** — `AuthEngine::builder()` + the `EmailProvider` (lettre→Mailpit) + the `AuditAuthHooks` + the
   `auth_router` mount.
7. **OAuth + invitations** — `GoogleOAuthProvider` + the TLS `HttpClient` + the `on_oauth_login` policy + the invitation
   flow.
8. **Platform + WebSocket** — the platform domain wiring + the `ws-ticket` surface.
9. **Web skeleton** — Next.js 16 + the copied design system + `AuthProvider` + the global controls + the WASM proxy.
10. **Public auth pages** — login/register/forgot-reset/verify-email/mfa-challenge/accept-invitation.
11. **Dashboard console** — Trigger Center, Security/MFA, Sessions, OAuth, Invitations, Audit, Account.
12. **Platform console** — the tenant-less admin surfaces.
13. **Testing** — 100% coverage (cargo-llvm-cov + Vitest) + the Playwright journeys.
14. **Mutation** — `cargo-mutants` (API) + Stryker (web) to ≥ 95 → 100, with `docs/mutation/`.
15. **Documentation & release** — every `docs/*.md`, the export audits, the go-public hardening, and the first tag.

---

_End of the master blueprint for `rust-auth-example`._
