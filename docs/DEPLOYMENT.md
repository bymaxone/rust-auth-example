# Deployment

Production checklist for shipping `rust-auth-example` (and services built on the same
pattern). This expands [OVERVIEW §18 — Deployment Notes](./OVERVIEW.md#18-deployment-notes).
Work top to bottom; the [production checklist](#production-checklist) at the end is
copy-pasteable into a release PR.

---

## Target topology

Two independently deployable services that talk over JSON/HTTP. All session, one-time-code,
lockout, and reset state lives in Redis, so neither service holds in-process auth state.

- **`apps/api`** — the Rust/axum service. Any container host (Fly.io, Railway, ECS,
  Kubernetes). Needs a managed **PostgreSQL 18** and **Redis 7**. Binds `API_PORT`
  (default `4000`).
- **`apps/web`** — the Next.js console. Any Node 24 host, Vercel, or self-hosted container.
  Reaches the API server-side via `INTERNAL_API_URL` and verifies access cookies at the edge
  with `AUTH_JWT_SECRET_FOR_PROXY`. Binds `PORT` (default `3000`).

Reproduce the topology locally with [`docker-compose.prod.yml`](../docker-compose.prod.yml)
for smoke tests before shipping.

---

## The two container images

Both images are multi-stage and run as a non-root user. They are published to GHCR by
[`release.yml`](../.github/workflows/release.yml) on every `v*` tag (see
[RELEASES.md](./RELEASES.md)); the build context is the repository root for both.

| Image | Dockerfile | Base (runtime) | Port | Entry |
| --- | --- | --- | --- | --- |
| `ghcr.io/bymaxone/rust-auth-example-api` | [`apps/api/Dockerfile`](../apps/api/Dockerfile) | `gcr.io/distroless/cc-debian12:nonroot` | `4000` | `/usr/local/bin/api` |
| `ghcr.io/bymaxone/rust-auth-example-web` | [`apps/web/Dockerfile`](../apps/web/Dockerfile) | `node:24-slim` (non-root `nextjs`) | `3000` | `node server.js` |

- The **API image** compiles the release binary with `cargo build --release --locked -p api`
  against the committed `Cargo.lock`, then copies it into a distroless runtime — no shell, no
  package manager, minimal attack surface.
- The **web image** produces the Next.js **standalone** output (`outputFileTracingRoot` set to
  the monorepo root). Its build-time `ARG`s — `NEXT_PUBLIC_API_URL` and
  `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED` — are inlined into the client bundle and are **not
  secret**. Real secrets (`INTERNAL_API_URL`, `AUTH_JWT_SECRET_FOR_PROXY`) are injected **only
  at container run time**, never as build args or `RUN` env, so they cannot leak through image
  history or build-cache metadata.

The image tag published for `v1.2.3` is the semver **without** the leading `v` (`1.2.3`), plus
a rolling `{major}.{minor}` tag, via `docker/metadata-action`.

---

## Production smoke test (local)

Before shipping a tag, reproduce the full production topology on one machine with
[`docker-compose.prod.yml`](../docker-compose.prod.yml). It runs Postgres, Redis, the API
image, and the web image — no Mailpit, because production uses `EMAIL_PROVIDER=resend`.

```bash
# 1. Copy the prod env template and fill in real secrets.
cp .env.prod.example .env.prod
# Edit .env.prod: POSTGRES_USER/PASSWORD, JWT_SECRET, MFA_ENCRYPTION_KEY,
# AUTH_JWT_SECRET_FOR_PROXY, WEB_ORIGIN, RESEND_API_KEY, SMTP_FROM, REDIS_PASSWORD, ...

# 2. Pull the release images (or omit --pull to build locally from the Dockerfiles).
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --pull always

# 3. Apply migrations against the managed database (run once per release / schema change).
sqlx migrate run --source apps/api/migrations --database-url "$DATABASE_URL"

# 4. Verify the API liveness probe.
curl -sf http://localhost:4000/health
# Expect: {"status":"ok","version":"<crate version>"}

# 5. Verify the console answers.
curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000/auth/login
# Expect: 200

# 6. Tear down when done.
docker compose -f docker-compose.prod.yml --env-file .env.prod down
```

> **Migrations are a pre-deploy step, not an app responsibility.** The API image is distroless
> and contains no `sqlx` CLI. Run `sqlx migrate run --source apps/api/migrations` from the
> deploy host or a dedicated migration job that carries the workspace and the
> [`migrations/`](../apps/api/migrations) directory. The service never self-migrates: if
> applied migrations are missing, a `query_as!`-backed route surfaces an opaque `auth.internal`
> `500` rather than mutating the schema at boot.

---

## Database

- Point `DATABASE_URL` at a **managed Postgres** (no loopback) so writes survive instance
  recycling. The schema backs `AuthUser`/`AuthPlatformUser` exactly; it is applied by the
  numbered files under [`apps/api/migrations/`](../apps/api/migrations).
- The offline `.sqlx/` cache lets the API image build without a database connection
  (`SQLX_OFFLINE=true`). Keep it current with `cargo sqlx prepare` whenever a query changes —
  a stale cache fails the build (see [TROUBLESHOOTING](./TROUBLESHOOTING.md#cargo-sqlx-prepare---check-fails)).

## Redis

- Point `REDIS_URL` at a **managed Redis** so sessions, OTPs, lockout counters, reset and
  invitation tokens, MFA-enrolment state, OAuth-state, and WS tickets are **durable and atomic
  across instances**. `REDIS_NAMESPACE` (default `rust_auth_example`) prefixes every key.
- Losing Redis forces re-authentication (everyone logs in again) but causes **no data loss** —
  durable identity data is in Postgres.
- Enable `appendonly yes` and an eviction policy that never silently drops live keys
  (`volatile-lru` is safe because the library sets a TTL on everything). The prod compose file
  already sets `--appendonly yes --maxmemory-policy volatile-lru` and enforces `--requirepass`.

---

## Secrets & rotation

Secrets come **only from the environment** — never a committed file, never a build arg, never a
log line. The API validates them at boot and aborts with a precise
[`ConfigError`](../apps/api/src/config/mod.rs) if a guard fails.

- **`JWT_SECRET`** — the HS256 signing secret. `Settings::validate` rejects anything shorter
  than `JWT_SECRET_MIN_LEN` (**64 bytes**); generate with `openssl rand -hex 64`.
- **`MFA_ENCRYPTION_KEY`** — the AES-256-GCM key sealing TOTP secrets. Must be **base64 of
  exactly 32 bytes**; generate with `openssl rand -base64 32`.
- **`AUTH_JWT_SECRET_FOR_PROXY`** (web) — the edge verifier's HS256 secret. It **must equal
  `JWT_SECRET`** exactly, or the console's `/nextjs` proxy rejects every access cookie.
- Rotate through the library's dual-key window: sign new tokens with the fresh secret while the
  retired secret still verifies until short-lived access tokens expire, then drop the old
  secret in a follow-up deploy. Update `AUTH_JWT_SECRET_FOR_PROXY` in the **same rollout**.

Both `jwt_secret` and `mfa_encryption_key` are `SecretString` fields, redacted in the `Debug`
output and zeroized on drop; `database_url`/`redis_url` are redacted too because a connection
string can embed a password.

---

## Email delivery

Production sets `EMAIL_PROVIDER=resend`. Mailpit is dev-only.

- Set `RESEND_API_KEY`; if `EMAIL_PROVIDER=resend` and the key is absent, boot aborts with
  `ConfigError::ResendKeyMissing`. Keep the key in the platform secret store.
- `SMTP_FROM` must be a **verified** sender domain in Resend. Publish **SPF**, **DKIM**, and
  **DMARC** records for it, or transactional mail is spam-foldered or hard-bounced.

## Google OAuth over HTTPS

Google sign-in is optional. Set `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`, and
`OAUTH_GOOGLE_CALLBACK_URL` **together** (all three, or none) — a partial set aborts boot with
`ConfigError::OAuthConfigIncomplete`.

The example injects its own [`TlsHttpClient`](../apps/api/src/oauth/tls_http_client.rs)
(reqwest over rustls with the aws-lc-rs provider, HTTPS-only, Mozilla's webpki roots) into
`GoogleOAuthProvider`. The library's bundled `ReqwestHttpClient` ships **no TLS backend** (so
the banned `ring`/`openssl` crates stay off the graph) and therefore cannot reach Google's
`https://` endpoints. Confirm outbound HTTPS to Google is reachable from the API host, and flip
`NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=true` so the console shows the "Continue with Google" button.

---

## Origin, CORS & security headers

- Set **`WEB_ORIGIN`** to the exact `https://` console origin. The API's
  [CORS layer](../apps/api/src/layers.rs) parses it to a single non-wildcard allow-origin
  (credentialed CORS forbids `*`), allows the `x-tenant-id` header inbound, and **exposes
  `Retry-After`** so the browser can read the rate-limit countdown on a `429`. A malformed
  `WEB_ORIGIN` surfaces as an opaque internal error rather than a panic.
- The API sends static security headers on every response: `Strict-Transport-Security`
  (`max-age=63072000; includeSubDomains`), `X-Frame-Options: DENY`, `X-Content-Type-Options:
  nosniff`, and `Referrer-Policy: no-referrer`, plus a 1 MiB request-body cap.
- The console sends its own headers from [`next.config.mjs`](../apps/web/next.config.mjs),
  including a Content-Security-Policy whose `connect-src` is derived from `NEXT_PUBLIC_API_URL`
  (and the upgraded `ws`/`wss` origin). If `NEXT_PUBLIC_API_URL` is unset or malformed,
  `connect-src` falls back to `'self'` and the browser blocks API calls — so set it to the real
  API origin.
- Drive `client_ip_source` to a trusted-forwarded-for source **only behind a trusted proxy**
  that sets the header. The default is `PeerAddr` (see
  [`apps/api/src/app.rs`](../apps/api/src/app.rs)); a client-settable header would let a caller
  forge its rate-limit identity.

## Environment posture

Set **`APP_ENV=production`**. Beyond the library's production-only guards (secure cookies,
`https` redirect checks mapped through `RuntimeEnvironment`), this **withdraws the development
surfaces**: the audit read-API (`/audit/*`) and the diagnostics routes (`/diagnostics/*`) mount
**only** when `APP_ENV=development`. They expose the full audit trail and can force-lock any
account, so they must not be reachable in production. The `/health` probe, the platform
read-API, and the example WebSocket mount in every environment.

---

## Health checks & graceful shutdown

- **Liveness** — `GET /health` returns `200` with `{ "status": "ok", "version": "<crate
  version>" }` (from `CARGO_PKG_VERSION`). Wire it to the orchestrator's liveness/readiness
  probe. Because the API image is distroless (no shell/`wget`), use a native or platform-level
  HTTP probe, not an in-container `CMD-SHELL` check.
- **Graceful shutdown** — the server drains in-flight requests on `SIGTERM` (and Ctrl-C) before
  the listener stops accepting connections. Give the container a termination grace period long
  enough for the longest expected request.

---

## Toolchain pins

Reproduce a build with the same pins the images use:

**Rust `1.96.0`** (MSRV floor `1.90`, proven by the `msrv` CI job) · **Node `24`** · **pnpm
`10.8.x`** (`10.8.1` in the images).

---

## Production checklist

```text
[ ] DATABASE_URL -> managed Postgres (no loopback); sqlx migrate run applied on deploy
[ ] REDIS_URL -> managed Redis (appendonly yes, volatile-lru); durable/atomic across instances
[ ] JWT_SECRET >= 64 bytes, high-entropy (openssl rand -hex 64); validate() rejects short values
[ ] MFA_ENCRYPTION_KEY = base64 of 32 bytes (openssl rand -base64 32)
[ ] AUTH_JWT_SECRET_FOR_PROXY equals JWT_SECRET exactly
[ ] EMAIL_PROVIDER=resend + RESEND_API_KEY set; SMTP_FROM verified; SPF + DKIM + DMARC published
[ ] OAUTH_GOOGLE_* set together (or all unset); TlsHttpClient reaches Google over HTTPS
[ ] WEB_ORIGIN is the https console origin; NEXT_PUBLIC_API_URL is the real API origin
[ ] APP_ENV=production (secure cookies; /audit/* and /diagnostics/* withdrawn)
[ ] client_ip_source only trusts a forwarded header behind a trusted proxy
[ ] TLS terminated for both services; HSTS confirmed in the response headers
[ ] GET /health returns 200; liveness/readiness probes wired
[ ] Graceful SIGTERM drain confirmed; rollback image identified; migration backward-compatible
```

---

## Further reading

- [OVERVIEW §18 — Deployment Notes](./OVERVIEW.md#18-deployment-notes) and
  [§9 — Configuration & Environment](./OVERVIEW.md#9-configuration--environment).
- [Troubleshooting](./TROUBLESHOOTING.md) — boot-time validation and runtime failures.
- [Releases](./RELEASES.md) — how a tag becomes GHCR images and a release row.
- [`SECURITY.md`](../SECURITY.md) — how to report a vulnerability.
