# Getting started

From a clean clone to a **verified first login** plus an **enrolled TOTP** in about five
minutes. Every command below matches a script in the repo; if a step fails, jump to
[common snags](#common-snags).

This repo is a **dual workspace in one checkout**: a Rust/axum service (`apps/api`) and a
Next.js console (`apps/web`). The API hosts the `AuthEngine` and mounts the library's auth
router; the console consumes the `@bymax-one/rust-auth` browser package. Three local
backends — Postgres, Redis, and Mailpit — make the happy path tangible with zero external
credentials.

---

## Prerequisites

- **Rust `1.96.0`** — pinned in [`rust-toolchain.toml`](../rust-toolchain.toml) (MSRV floor `1.90`).
  `rustup` reads the channel automatically.
- **Node.js 24 (Active LTS)** — pinned in [`.nvmrc`](../.nvmrc), so `nvm use` is enough.
- **pnpm `10.8.x`** — `npm install -g pnpm@10.8` (the `packageManager` field pins it).
- **Docker Compose v2** — verify with `docker compose version`.
- **A sibling `rust-auth` checkout** — the library is consumed pre-publish. Clone it next to
  this repo so the path is `../rust-auth`:

  ```bash
  git clone https://github.com/bymaxone/rust-auth        # sibling of rust-auth-example
  ```

The Rust crates are consumed by `path` (`../../../rust-auth/crates/*`) and the npm package by
`file:`, across the checkout boundary — see [`OVERVIEW.md` §7](OVERVIEW.md#7-library-consumption).

---

## Quick start

```bash
# 1. Clone and enter the example
git clone https://github.com/bymaxone/rust-auth-example && cd rust-auth-example

# 2. Install both workspaces
pnpm install --frozen-lockfile     # the pnpm workspace (apps/web + tooling)
cargo build --locked               # the cargo workspace (apps/api)

# 3. Build the browser package and resolve its file: link
./scripts/link-library.sh          # builds @bymax-one/rust-auth (build:wasm + build), then links it

# 4. Create the env file and load it into the shell
cp .env.example .env               # JWT_SECRET >= 64 chars; MFA_ENCRYPTION_KEY = base64 of 32 bytes
set -a && source .env && set +a    # the API reads the process environment (figment), not a .env file

# 5. Start the local backends and wait for health
pnpm infra:up                      # docker compose up -d --wait: postgres:18 + redis:7 + mailpit

# 6. Apply the database migrations
pnpm db:migrate                    # sqlx migrate run --source apps/api/migrations

# 7. (optional) Seed the demo tenants + a platform admin
cargo run -p api --bin seed        # idempotent: acme/globex tenants + admin@platform.local

# 8. Run both apps (two terminals)
cargo run -p api                   # terminal A — the axum API on :4000
pnpm -C apps/web dev               # terminal B — the Next.js console on :3000
```

> **Why `set -a && source .env`.** The API loads its configuration from the **process
> environment** via `figment` (`Settings::load` → `Env::raw()`), so `.env` must be exported
> into the shell before `cargo run -p api` and `pnpm db:migrate`. Exporting it once lets both
> the API and the web dev server inherit the same values (including `AUTH_JWT_SECRET_FOR_PROXY`,
> which must equal `JWT_SECRET`).

When both apps are up:

- Console → **http://localhost:3000**
- API health → **http://localhost:4000/health**
- Mailpit (captured dev emails) → **http://localhost:8025**

> Need every variable explained? See [`OVERVIEW.md` §9](OVERVIEW.md#9-configuration--environment)
> and [`.env.example`](../.env.example). Want the big picture first? See [architecture](ARCHITECTURE.md).

---

## Your first verified login

The seed does **not** create tenant users with passwords, so the first login goes through
registration — exactly the journey a newcomer should feel.

1. Open **http://localhost:3000/auth/register** and register with an email, a password, and
   (optionally) a tenant from the tenant selector. The console calls `POST /auth/register`
   (`AUTH_REGISTER`) and lands you authenticated — a session is issued even before the email
   is verified.
2. Open **[Mailpit](http://localhost:8025)** and read the one-time code from the
   **verify your email** message. Nothing is ever sent externally in development.
3. Enter the code on **http://localhost:3000/auth/verify-email** → the console calls
   `POST /auth/verify-email` (`AUTH_VERIFY_EMAIL`). Your account is now verified.
4. Sign out from the top bar, then sign back in at **http://localhost:3000/auth/login**
   (`POST /auth/login`, `AUTH_LOGIN`). The profile card populates and the audit live-tail
   shows the event chain.

---

## Enroll a TOTP authenticator

1. Go to **Dashboard → Security / MFA** (`/dashboard/security`).
2. Click **Enable 2FA**. The console calls `POST /auth/mfa/setup` (`MFA_SETUP`) and renders the
   `qr_code_uri` from `MfaSetupResult` plus a grid of recovery codes.
3. Scan the QR with an authenticator app, then confirm a current 6-digit code — the console
   calls `POST /auth/mfa/verify-enable` (`MFA_VERIFY_ENABLE`). The TOTP secret is sealed with
   AES-256-GCM under `MFA_ENCRYPTION_KEY`; it never leaves the server in the clear.
4. Sign out and sign back in: `login` now returns `MfaChallengeResult { mfa_required: true,
   mfa_temp_token }`, the console shows the 6-digit step, and `POST /auth/mfa/challenge`
   (`MFA_CHALLENGE`) issues the session.

That is a verified login plus an enrolled second factor — the full front-door journey.

---

## The tenant admin (for the admin-gated journeys)

Registration always mints a plain `user`, and the admin-gated dashboard surfaces — the
Overview auth-health cards, the **Audit Explorer**, and **inviting a teammate** — require a
tenant **admin**. The seed provisions one under the `acme` tenant so these journeys work out
of the box.

> **DEV ONLY.** A documented local-only fixture (see [`.env.example`](../.env.example)),
> never a real secret.

| Field    | Value                                |
| -------- | ------------------------------------ |
| Login    | http://localhost:3000/auth/login     |
| Email    | `admin@acme.test`                    |
| Password | `ChangeMe!Demo123`                   |
| Tenant   | `acme` (role `admin`, email-verified) |

Sign in as this admin to see the Overview health cards populate, browse the Audit Explorer,
and send an invitation. A registered `user` sees the same console with the admin-only nav
items hidden.

---

## The platform admin (optional)

The seed also provisions a tenant-less **platform** admin — a distinct identity domain with
its own token family and console.

> **DEV ONLY.** A documented local-only fixture (see [`.env.example`](../.env.example)),
> never a real secret.

| Field    | Value                                  |
| -------- | -------------------------------------- |
| Login    | http://localhost:3000/platform/login   |
| Email    | `admin@platform.local`                 |
| Password | `ChangeMe!Demo123`                     |

A dashboard token cannot satisfy a platform guard, and vice-versa — see
[architecture](ARCHITECTURE.md#two-identity-domains).

---

## Common snags

A few first-run issues and where they come from:

1. **`Cannot find module '@bymax-one/rust-auth'`** — the npm package's `dist/`/`wasm/` are
   git-ignored and absent until built. Run [`./scripts/link-library.sh`](../scripts/link-library.sh)
   (it runs `build:wasm` then `build`) before the web build.
2. **`expected the npm package at .../rust-auth/packages/rust-auth`** — the sibling `rust-auth`
   checkout is missing; clone it next to this repo (see [prerequisites](#prerequisites)).
3. **The API aborts at boot with a config error** — a required variable is missing or invalid.
   `JWT_SECRET` must be ≥ 64 chars and `MFA_ENCRYPTION_KEY` must decode to exactly 32 bytes;
   confirm you ran `set -a && source .env && set +a` in the same shell.
4. **Emails never arrive** — the backends are not up. Run `pnpm infra:up` and confirm
   `docker ps` shows Postgres, Redis, and Mailpit healthy.

---

## Running the test suites

```bash
pnpm infra:test:up                 # the ephemeral high-port test stack
cargo nextest run -p api           # the Rust unit + integration suites (bounded --test-threads)
pnpm -C apps/web test              # the Vitest console suites (maxWorkers capped)
pnpm -C apps/web test:e2e          # the Playwright journeys (against a running stack)
```

> Run suites **sequentially** and never fan out parallel test agents — each worker duplicates
> the linked library and can exhaust memory. The caps live in the test configs; see
> [`OVERVIEW.md` §8](OVERVIEW.md#8-local-stack--memory-safe-run).

---

## Stopping the stack

```bash
pnpm infra:down          # stop containers and remove volumes (dev stack)
pnpm infra:test:down     # stop and remove the test stack
```

---

## Where to go next

- [Features](FEATURES.md) — a walkthrough of every demonstrated journey.
- [Architecture](ARCHITECTURE.md) — the request pipelines and the crate boundaries.
- [`OVERVIEW.md`](OVERVIEW.md) — the master technical blueprint.
- [`DASHBOARD.md`](DASHBOARD.md) — the console build spec and the shared design system.
