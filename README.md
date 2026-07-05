<h1 align="center">rust-auth-example</h1>

<p align="center">
  <strong>The public, production-shaped reference app for <code>bymax-auth</code> / <code>@bymax-one/rust-auth</code>.</strong>
</p>

<p align="center">
  <a href="https://github.com/bymaxone/rust-auth-example/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/bymaxone/rust-auth-example/ci.yml?branch=main&style=flat-square&colorA=000000&label=CI" alt="CI status" /></a>
  <img src="https://img.shields.io/badge/coverage-100%25-000000?style=flat-square" alt="coverage" />
  <img src="https://img.shields.io/badge/mutation-%E2%89%A595%25-000000?style=flat-square" alt="mutation score" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-000000?style=flat-square" alt="license" /></a>
  <a href="https://www.rust-lang.org/"><img src="https://img.shields.io/badge/Rust-edition%202024-000000?style=flat-square&logo=rust&logoColor=white" alt="Rust edition 2024" /></a>
  <a href="https://www.rust-lang.org/"><img src="https://img.shields.io/badge/MSRV-1.90-000000?style=flat-square&logo=rust&logoColor=white" alt="MSRV 1.90" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node-24-000000?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node 24" /></a>
  <a href="https://github.com/tokio-rs/axum"><img src="https://img.shields.io/badge/axum-0.8-000000?style=flat-square" alt="axum 0.8" /></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 16" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-000000?style=flat-square&logo=react&logoColor=white" alt="React 19" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind-4-000000?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind 4" /></a>
</p>

<p align="center">
  <a href="./docs/OVERVIEW.md">Overview</a> ·
  <a href="./docs/DEVELOPMENT_PLAN.md">Development Plan</a> ·
  <a href="./docs/DASHBOARD.md">Console Spec</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="./CONTRIBUTING.md">Contributing</a>
</p>

---

## Overview

`bymax-auth` / `@bymax-one/rust-auth` is the **what**; this repository is the
**how**. It is a runnable, production-shaped demo that exercises every public
export of the consumed library surface across a Rust/axum API and a first-class
Next.js authentication console — registration, password login with MFA, email
verification, password reset, OAuth (Google), session management, invitations, a
multi-tenant dashboard, and a tenant-less platform-admin domain — backed by a
single local Postgres + Redis + Mailpit stack that runs with zero external
credentials on the happy path.

It is the Rust-stack sibling of the published `@bymax-one/nest-auth` example and
follows the same blueprint and quality bar: 100% coverage on both workspaces,
mutation testing, supply-chain scanning, and static security analysis wired in
from the start.

## Quick start

```bash
pnpm install          # install the JS workspace + commit hooks
pnpm infra:up         # start Postgres + Redis + Mailpit (healthchecked)

# Run the API (Rust / axum) — listens on http://127.0.0.1:4000
cargo run -p api

# Run the console (Next.js) — serves http://127.0.0.1:3000
pnpm --filter web dev
```

The Mailpit inbox is browsable at <http://localhost:8025>, where every
transactional email (verification codes, reset codes, session alerts, invitations)
lands during a demo run.

## Architecture

```text
apps/web (Next.js 16) ──/api/auth/*──▶ apps/api (axum 0.8)
                                         │  AuthEngine (bymax-auth-core)
                                         ├─▶ PostgreSQL (sqlx repos)
                                         ├─▶ Redis (RedisStores · 8 traits)
                                         └─▶ Mailpit (lettre SMTP)
```

The API hosts the `AuthEngine` and mounts the library's router; the example
provides the repositories, email transport, hooks, OAuth HTTP client, and the
Redis/Postgres backends. The console consumes the browser package (`/client`,
`/react`, `/nextjs`, `/shared`) and edge-verifies the session JWT in middleware
via WebAssembly. See [`docs/OVERVIEW.md`](./docs/OVERVIEW.md) for the full
blueprint and the feature-coverage matrix.

## Documentation

New here? Start with [Getting Started](./docs/GETTING_STARTED.md). The
[Feature Coverage Matrix](./docs/OVERVIEW.md#6-feature-coverage-matrix) maps every shipped library
export to a demonstrated journey.

| Document                                       | What it covers                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| [Getting Started](./docs/GETTING_STARTED.md)   | Clone → local stack → first register / verify / login / MFA walkthrough            |
| [Features](./docs/FEATURES.md)                 | Every journey with its route, an example request/response, and the rule it teaches |
| [Architecture](./docs/ARCHITECTURE.md)         | The middleware pipeline, the `AppState` DI graph, and the error envelope           |
| [Environment](./docs/ENVIRONMENT.md)           | Every variable: type, default, and boot-time validation                            |
| [Database](./docs/DATABASE.md)                 | The schema (tables, indexes) and the sqlx repositories                             |
| [Email](./docs/EMAIL.md)                       | The `EmailProvider` trait, the lettre / Resend transports, and the templates       |
| [Redis](./docs/REDIS.md)                       | The `RedisStores` handle, the key namespaces, and the store traits                 |
| [MFA](./docs/MFA.md)                           | TOTP enrollment, AEAD secret storage, and the challenge flow                       |
| [Google OAuth](./docs/OAUTH_GOOGLE.md)         | Config, the TLS HTTP client, PKCE / state, and the login policy                    |
| [Deployment](./docs/DEPLOYMENT.md)             | The two GHCR images, production config, and the release process                    |
| [Troubleshooting](./docs/TROUBLESHOOTING.md)   | Common failures with their cause and fix                                           |
| [Releases](./docs/RELEASES.md)                 | The release log and how a tag is recorded                                          |
| [Going Public](./docs/GO_PUBLIC.md)            | The branch-protection and visibility checklist                                     |
| [Overview](./docs/OVERVIEW.md)                 | Master technical blueprint and the feature-coverage matrix                         |
| [Development Plan](./docs/DEVELOPMENT_PLAN.md) | The phased build plan and quality gates                                            |
| [Console Spec](./docs/DASHBOARD.md)            | The `apps/web` console build spec and design system                                |
| [Design System](./docs/design_system.html)     | The shared, project-agnostic UI design system                                      |

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the build steps, the quality-gate
set, and the commit convention. Security reports go through the process in
[`SECURITY.md`](./SECURITY.md) — never a public issue.

## License

Licensed under the [MIT License](./LICENSE). Copyright © Bymax One.
