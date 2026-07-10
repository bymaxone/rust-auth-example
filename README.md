<h1 align="center">rust-auth-example</h1>

<p align="center">
  The public, production-shaped reference app for <a href="https://github.com/bymaxone/rust-auth"><code>bymax-auth</code> / <code>@bymax-one/rust-auth</code></a> —
  registration, MFA, OAuth, sessions, invitations and a multi-tenant + platform-admin console across a Rust/axum API and a Next.js 16 auth console.
</p>

<p align="center">
  <a href="https://github.com/bymaxone/rust-auth-example/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/bymaxone/rust-auth-example/ci.yml?branch=main&style=flat-square&colorA=000000&label=CI" alt="CI status" /></a>
  <img src="https://img.shields.io/badge/coverage-100%25-000000?style=flat-square" alt="coverage" />
  <img src="https://img.shields.io/badge/mutation-%E2%89%A595%25-000000?style=flat-square" alt="mutation score" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-000000?style=flat-square" alt="license" /></a>
  <a href="https://www.rust-lang.org/"><img src="https://img.shields.io/badge/Rust-edition%202024-000000?style=flat-square&logo=rust&logoColor=white" alt="Rust edition 2024" /></a>
  <a href="https://www.rust-lang.org/"><img src="https://img.shields.io/badge/MSRV-1.90-000000?style=flat-square&logo=rust&logoColor=white" alt="MSRV 1.90" /></a>
  <a href="https://github.com/tokio-rs/axum"><img src="https://img.shields.io/badge/axum-0.8-000000?style=flat-square" alt="axum 0.8" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node-24-000000?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node 24" /></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 16" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-000000?style=flat-square&logo=react&logoColor=white" alt="React 19" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind-4-000000?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind 4" /></a>
</p>

<p align="center">
  <a href="https://github.com/bymaxone/rust-auth">📦 Library</a> ·
  <a href="#-quick-start">🚀 Quick Start</a> ·
  <a href="#-whats-inside">✅ Features</a> ·
  <a href="#-architecture">🏗️ Architecture</a> ·
  <a href="docs/OVERVIEW.md">📖 Docs</a>
</p>

---

## ✨ Overview

`bymax-auth` / `@bymax-one/rust-auth` is the **what**; this repository is the **how**. It is a runnable,
production-shaped demo that exercises **every public export** of the consumed library surface across a
Rust/axum API and a first-class Next.js authentication console — registration, password login with MFA,
email verification, password reset, OAuth (Google), session management, invitations, a multi-tenant
dashboard, and a tenant-less platform-admin domain — backed by a single local PostgreSQL + Redis + Mailpit
stack that runs with **zero external credentials** on the happy path.

It is the Rust-stack sibling of the published `@bymax-one/nest-auth` example and follows the same blueprint
and quality bar: 100% coverage on both workspaces, mutation testing, supply-chain scanning, and static
security analysis wired in from the start.

### 🚀 Quick start

```bash
# Clone this repo and the pre-publish library as siblings (consumed by path / file:)
git clone https://github.com/bymaxone/rust-auth-example.git
git clone https://github.com/bymaxone/rust-auth.git    # must sit next to this repo, as ../rust-auth
cd rust-auth-example

pnpm install --frozen-lockfile     # the JS workspace (apps/web + tooling)
cargo build --locked               # the cargo workspace (apps/api)
./scripts/link-library.sh          # build @bymax-one/rust-auth (wasm + dist) and resolve the file: link

cp .env.example .env               # JWT_SECRET >= 64 chars · MFA_ENCRYPTION_KEY = base64 of 32 bytes
set -a && source .env && set +a    # the API reads the process environment (figment), not a .env file

pnpm infra:up                      # postgres:18 + redis:7 + mailpit (healthchecked)
pnpm db:migrate                    # sqlx migrate run --source apps/api/migrations
cargo run -p api --bin seed        # idempotent: acme/globex tenants + tenant & platform admins

cargo run -p api --bin api         # terminal A — the axum API on http://127.0.0.1:4000
pnpm -C apps/web dev               # terminal B — the Next.js console on http://localhost:3000
```

Console → **http://localhost:3000** · API health → **http://localhost:4000/health** · captured emails
(Mailpit) → **http://localhost:8025**.

> The library is **pre-publish** — the Rust crates are consumed by `path` and the browser package by
> `file:` from a sibling `../rust-auth` checkout until it ships. Clone it next to this repo and build it
> first; the full five-minute walkthrough (clone → verified login → enrolled TOTP) is in
> **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)**.

> Run test suites **sequentially** with bounded workers — each worker duplicates the linked library and can
> exhaust memory. The caps live in the test configs; see **[docs/OVERVIEW.md §8](docs/OVERVIEW.md#8-local-stack--memory-safe-run)**.

---

## 🔥 What's inside

**The front door**

- ✅ Register → email verification (one-time code) → password login — a session is issued at register and verified out of band
- ✅ MFA (TOTP): QR enrollment, an AEAD-sealed secret (AES-256-GCM), a ±2-step drift challenge, and recovery codes
- ✅ Password-reset wizard: forgot → OTP → set new — anti-enumeration, with a single-use verified token

**Sessions & tokens**

- ✅ Transparent single-flight token rotation (`createAuthFetch`) — one `401` refreshes once, then replays the request
- ✅ Refresh-token reuse defense: a token replayed past its grace window revokes the whole session
- ✅ Session device manager — list, revoke one, log out everywhere; a new-device sign-in emails an alert
- ✅ WebSocket auth via a single-use ~30s ticket, so the access JWT never rides in the URL

**Security**

- ✅ Per-account brute-force lockout + edge rate limiting, with the `Retry-After` countdown surfaced to the UI
- ✅ Edge route protection in middleware via WebAssembly — the HS256 algorithm is pinned, a forged `alg:none`/`RS256` is rejected
- ✅ Secrets only from the environment; the HTTP layer maps library errors and never leaks internals to the client

**Multi-tenant & platform**

- ✅ Tenant isolation — the same email is two different users under two different tenants
- ✅ Invitations — an admin invites a teammate who accepts with a name + password (the token is single-use)
- ✅ A tenant-less **platform-admin** domain with its own token family, guards, and a distinct red console

**OAuth & email**

- ✅ Google OAuth (PKCE + state) with a Create / Link / Reject host policy and an injected TLS `HttpClient`
- ✅ A pluggable `EmailProvider` — lettre → Mailpit in dev, Resend in prod, with no call-site change

**The console (`apps/web`)**

- ✅ A first-class auth console: register / login / MFA / reset screens, Trigger Center, Sessions, OAuth, Account
- ✅ An Audit Explorer with a live SSE tail, and the tenant-less red platform-admin console

**Quality bar**

- ✅ 100% test coverage in both workspaces · mutation ≥ 95% · supply-chain (`cargo-deny` + gitleaks) & static security · English-only, timeless comments · Conventional Commits

---

## 🏗️ Architecture

```
   apps/web (Next.js 16 · React 19 · Tailwind 4)
   Auth console · Trigger Center · Audit live-tail · red platform admin
   consumes @bymax-one/rust-auth → /client · /react · /nextjs (edge WASM verify) · /shared
        │  /api/auth/*  (same-origin edge proxy → rewrites to :4000, edge-verifies the session JWT)
        ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │ apps/api (Rust · axum 0.8 · edition 2024)                           │
   │ AuthEngine (bymax-auth-core) + the library's mounted /auth router   │
   │ the example provides: sqlx repositories · lettre email · OAuth TLS  │
   │ client · Redis/Postgres backends · hooks · the WS ticket endpoint   │
   └───────┬────────────────────┬─────────────────────┬─────────────────┘
           ▼                    ▼                       ▼
   ┌───────────────┐    ┌───────────────┐      ┌────────────────────┐
   │  PostgreSQL   │    │     Redis     │      │      Mailpit       │
   │  sqlx repos   │    │ RedisStores · │      │  lettre SMTP →     │
   │  users/audit  │    │ 8 store traits│      │  browsable :8025   │
   └───────────────┘    └───────────────┘      └────────────────────┘
```

`apps/api` (a cargo workspace) and `apps/web` (a pnpm workspace) are a **dual workspace in one repository**;
they never merge. The API hosts the `AuthEngine` and mounts the library's router; the console consumes the
browser package and edge-verifies the session JWT in middleware via WebAssembly.

> **Coverage rule.** Every public export of the consumed library surface is referenced from at least one
> file under `apps/` — the **[Feature Coverage Matrix](docs/OVERVIEW.md#6-feature-coverage-matrix)** maps
> each shipped export to a demonstrated journey. Full pipeline deep-dive in
> **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## 📖 Documentation

| Doc                                          | What it covers                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| [OVERVIEW](docs/OVERVIEW.md)                 | Master technical blueprint & the feature-coverage matrix                 |
| [GETTING_STARTED](docs/GETTING_STARTED.md)   | Clean clone → first verified login + enrolled TOTP in ~5 minutes         |
| [FEATURES](docs/FEATURES.md)                 | Every journey with its route, an example request/response, and its rule  |
| [ARCHITECTURE](docs/ARCHITECTURE.md)         | The middleware pipeline, the `AppState` DI graph, and the error envelope |
| [ENVIRONMENT](docs/ENVIRONMENT.md)           | Every variable: type, default, and boot-time validation                  |
| [DATABASE](docs/DATABASE.md)                 | The schema (tables, indexes) and the sqlx repositories                   |
| [EMAIL](docs/EMAIL.md)                       | The `EmailProvider` trait, the lettre / Resend transports, the templates |
| [REDIS](docs/REDIS.md)                       | The `RedisStores` handle, the key namespaces, and the store traits       |
| [MFA](docs/MFA.md)                           | TOTP enrollment, AEAD secret storage, and the challenge flow             |
| [OAUTH_GOOGLE](docs/OAUTH_GOOGLE.md)         | Config, the TLS HTTP client, PKCE / state, and the login policy          |
| [DEPLOYMENT](docs/DEPLOYMENT.md)             | The two GHCR images, production config, and the release process          |
| [TROUBLESHOOTING](docs/TROUBLESHOOTING.md)   | Common failures with their cause and fix                                 |
| [DASHBOARD](docs/DASHBOARD.md)               | The `apps/web` console build spec and the shared design system           |
| [Design System](docs/design_system.html)     | The shared, project-agnostic UI design system (rendered reference)       |
| [DEVELOPMENT_PLAN](docs/DEVELOPMENT_PLAN.md) | The phased build plan and quality gates                                  |
| [GO_PUBLIC](docs/GO_PUBLIC.md)               | The branch-protection and visibility checklist                           |
| [RELEASES](docs/RELEASES.md)                 | The release log and how a tag is recorded                                |

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the build steps, the quality-gate set, and the commit
convention. Security reports go through **[SECURITY.md](SECURITY.md)** — never a public issue.

---

## License

MIT © Bymax One. `@bymax-one/rust-auth` is MIT © Bymax One. See [LICENSE](LICENSE).
