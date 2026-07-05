# Troubleshooting

Common failures mapped to fixes. **Search this page by the exact error message**
(Ctrl/Cmd-F), or scan the section that matches where it broke. Each entry is
symptom → cause → fix.

The quick-reference table covers the failures first-run operators hit most; the sections
below expand them and add the rest.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Cannot find module @bymax-one/rust-auth` | The npm package is unbuilt (`dist/` + `wasm/` are git-ignored and absent) | Run [`scripts/link-library.sh`](../scripts/link-library.sh) (builds `build:wasm` + `build`, then resolves the `file:` link) before the web build |
| `cargo sqlx prepare --check` fails | The offline `.sqlx/` query cache is stale | Re-run `cargo sqlx prepare` against a migrated database and commit the refreshed `.sqlx/` |
| Boot aborts: `JWT_SECRET must be at least 64 bytes` | `JWT_SECRET` missing or too short | `openssl rand -hex 64`; mirror the same value into `AUTH_JWT_SECRET_FOR_PROXY` |
| OAuth callback fails over HTTPS | The library's bundled `ReqwestHttpClient` is plain-HTTP (`ring` banned, no TLS backend) | Inject the rustls (aws-lc-rs) [`TlsHttpClient`](../apps/api/src/oauth/tls_http_client.rs) into `GoogleOAuthProvider` |
| `429` with no readable `Retry-After` in the browser | The response is not CORS-exposed because `Origin` does not match `WEB_ORIGIN` | Set `WEB_ORIGIN` to the exact browser origin; the CORS layer then exposes `Retry-After` |
| OOM / the machine swaps during tests | Parallel test agents duplicate the linked library per worker | Run suites sequentially; bound `cargo nextest --test-threads`, keep Vitest `maxWorkers: '50%'`; **never fan out parallel test agents** |

---

## Setup & install

### `Cannot find module @bymax-one/rust-auth`

- **Symptom.** The web build or typecheck cannot resolve `@bymax-one/rust-auth` (or its
  `/nextjs`, `/react`, `/shared` subpaths).
- **Cause.** The browser package is consumed by a `file:` link to the sibling `rust-auth`
  checkout. Its `dist/` and `wasm/` outputs are git-ignored and do not exist until built.
- **Fix.** From the repo root, run [`scripts/link-library.sh`](../scripts/link-library.sh). It
  builds the package (`pnpm build:wasm` then `pnpm build`) in the sibling checkout, then runs
  `pnpm install` here so the `file:` link resolves. Confirm the sibling checkout exists at
  `../rust-auth/packages/rust-auth`. The script refuses to run in CI — there the
  `build-library` job builds the package instead.
- **See also.** [OVERVIEW §7 — Library Consumption](./OVERVIEW.md#7-library-consumption).

### `cargo sqlx prepare --check` fails

- **Symptom.** `cargo sqlx prepare --check` reports the offline cache is out of date, or the
  API image build fails resolving a `query!`/`query_as!` macro under `SQLX_OFFLINE=true`.
- **Cause.** A SQL query changed but the committed `.sqlx/` cache was not regenerated.
- **Fix.** Bring up a database, apply migrations, then refresh and commit the cache:
  ```bash
  pnpm infra:up
  sqlx migrate run --source apps/api/migrations --database-url "$DATABASE_URL"
  cargo sqlx prepare --workspace -- -p api
  ```
  Commit the updated `.sqlx/` directory. The CI build and the API image both compile with
  `SQLX_OFFLINE=true`, so a stale cache breaks them even though a live database would compile.

---

## Configuration & boot

The API validates its environment at boot and aborts with a precise `ConfigError` (see
[`apps/api/src/config/mod.rs`](../apps/api/src/config/mod.rs)) — the process never starts with
an unsafe or incomplete configuration.

### `JWT_SECRET must be at least 64 bytes (got N)`

- **Cause.** `ConfigError::JwtSecretTooShort` — `JWT_SECRET` is missing, empty, or shorter than
  the 64-byte HS256 floor.
- **Fix.** `openssl rand -hex 64`, set `JWT_SECRET`, and mirror the **same value** into the
  console's `AUTH_JWT_SECRET_FOR_PROXY` (the edge verifier shares the secret).

### `MFA_ENCRYPTION_KEY must be base64-encoded 32 bytes (AES-256-GCM key)`

- **Cause.** `ConfigError::MfaKeyInvalid` — the key is not valid base64, or decodes to a length
  other than 32 bytes.
- **Fix.** `openssl rand -base64 32` and set `MFA_ENCRYPTION_KEY`.

### ``EMAIL_PROVIDER` is `resend` but `RESEND_API_KEY` is not configured``

- **Cause.** `ConfigError::ResendKeyMissing` — `EMAIL_PROVIDER=resend` without a
  `RESEND_API_KEY`.
- **Fix.** Set `RESEND_API_KEY`, or use `EMAIL_PROVIDER=mailpit` in local development.

### `OAUTH_GOOGLE_CLIENT_ID, OAUTH_GOOGLE_CLIENT_SECRET, and OAUTH_GOOGLE_CALLBACK_URL must be set together`

- **Cause.** `ConfigError::OAuthConfigIncomplete` — a partial Google configuration (for
  example an id without a secret) would silently disable sign-in, so it is rejected fast.
- **Fix.** Set all three `OAUTH_GOOGLE_*` variables together, or leave all three unset.

### `failed to load configuration from the environment: ...`

- **Cause.** `ConfigError::Extract` — a required variable with no default is missing (for
  example `DATABASE_URL` or `REDIS_URL`), or a value failed to parse into its type.
- **Fix.** Copy [`.env.example`](../.env.example) to `.env` and fill the required variables.
  [OVERVIEW §9](./OVERVIEW.md#9-configuration--environment) lists every variable and its
  default.

---

## Runtime — API

### `EMAIL_PROVIDER=mailpit` — emails not sending / connection refused on `:1025`

- **Symptom.** A transactional send fails; the API cannot reach the SMTP relay on
  `localhost:1025`.
- **Cause.** The local infrastructure (Mailpit) is not running. The lettre provider selects no
  TLS backend and talks plaintext to Mailpit, so a missing relay is a connection error.
- **Fix.** `pnpm infra:up`, then confirm with `docker ps` that `mailpit` is healthy. Browse
  sent mail at [http://localhost:8025](http://localhost:8025). A delivery failure is itself a
  demonstrable path in the Diagnostics panel.

### API exits immediately at startup after `pnpm infra:up`

- **Symptom.** The API process dies on boot with a connection error.
- **Cause.** Postgres or Redis is not healthy yet, so the sqlx pool or `RedisStores` connect
  fails and the crash masks the real cause.
- **Fix.** Wait for the stack: `pnpm infra:up` uses `docker compose up -d --wait`, which only
  returns once every healthcheck (`pg_isready`, `redis-cli ping`, Mailpit `:8025`) passes. Then
  start the API.

### `address already in use` on `:4000` (or `:3000`)

- **Symptom.** The API or console fails to bind its port.
- **Cause.** A previous dev server still holds the port.
- **Fix.** `lsof -i :4000` then `kill <pid>` (likewise for `:3000`).

### Cross-origin request blocked / CORS preflight rejected

- **Symptom.** The browser network tab shows a failed `OPTIONS` preflight or a CORS error on
  API calls.
- **Cause.** The request `Origin` does not exactly match `WEB_ORIGIN`. Credentialed CORS
  forbids a wildcard, so the API allows a single exact origin.
- **Fix.** Set `WEB_ORIGIN` to the exact browser origin (`http://localhost:3000` in dev). The
  [CORS layer](../apps/api/src/layers.rs) allows credentials and the `content-type`,
  `authorization`, and `x-tenant-id` headers.

### `429 Too Many Requests` but the browser cannot read `Retry-After`

- **Symptom.** A rate-limited call returns `429`, yet client code cannot read the
  `Retry-After` header to show a countdown.
- **Cause.** The response is only exposed to browser JS when the CORS layer runs, which
  requires the `Origin` to match `WEB_ORIGIN`. On a mismatch the header is present on the wire
  but not readable from script.
- **Fix.** Set `WEB_ORIGIN` correctly; the CORS layer then `expose_headers([Retry-After])`.
  Tune the limiter budgets and `client_ip_source` via `AxumAuthConfig` only behind a trusted
  proxy.

### OAuth callback fails over HTTPS

- **Symptom.** Google sign-in fails at the token or userinfo step; the mounted `/auth/oauth/*`
  routes answer `auth.oauth_failed`.
- **Cause.** The library's bundled `ReqwestHttpClient` ships no TLS backend (`ring`/`openssl`
  are workspace-banned), so it cannot reach Google's `https://` endpoints.
- **Fix.** The example injects its own [`TlsHttpClient`](../apps/api/src/oauth/tls_http_client.rs)
  (reqwest over rustls with the aws-lc-rs provider, HTTPS-only). Confirm the API host has
  outbound HTTPS to Google and that all three `OAUTH_GOOGLE_*` variables are set.

---

## Runtime — web

### Console loads but every API call is CSP-blocked

- **Symptom.** The browser console shows `Refused to connect ... violates the Content Security
  Policy directive "connect-src"`.
- **Cause.** The CSP `connect-src` in [`next.config.mjs`](../apps/web/next.config.mjs) is
  derived from `NEXT_PUBLIC_API_URL`. If that variable is unset or malformed, `connect-src`
  falls back to `'self'` and the browser blocks calls to the API (and the `ws`/`wss` socket).
- **Fix.** Set `NEXT_PUBLIC_API_URL` to the real API origin at build time (it is inlined into
  the client bundle), then rebuild the console.

### Logged out immediately after login on `localhost`

- **Symptom.** Login succeeds but the next request is unauthenticated.
- **Cause.** `AUTH_JWT_SECRET_FOR_PROXY` does not equal `JWT_SECRET`, so the `/nextjs` edge
  verifier rejects the access cookie; or a `Secure` cookie was set over plain HTTP.
- **Fix.** Make `AUTH_JWT_SECRET_FOR_PROXY` exactly equal `JWT_SECRET`, keep
  `INTERNAL_API_URL=http://localhost:4000` server-side, and stay on `APP_ENV=development`
  locally so cookies are not marked `Secure`.

---

## Containers

### A production container never becomes healthy

- **Symptom.** `docker compose -f docker-compose.prod.yml ... up` never reports the API
  healthy.
- **Cause.** The API image is **distroless** — it has no shell or `wget`, so an in-container
  `CMD-SHELL`/`wget` healthcheck cannot run. The prod compose file therefore starts the web
  service on `service_started`, not `service_healthy`.
- **Fix.** Probe `GET /health` from the orchestrator (a native or platform-level HTTP probe),
  not from inside the container. See [DEPLOYMENT — Health checks](./DEPLOYMENT.md#health-checks--graceful-shutdown).

### Routes return `auth.internal` `500` right after a deploy

- **Symptom.** Requests that touch the database fail with the opaque `auth.internal` envelope.
- **Cause.** Migrations were not applied — the service never self-migrates.
- **Fix.** Run `sqlx migrate run --source apps/api/migrations --database-url "$DATABASE_URL"`
  as a pre-deploy step, then roll the API. The error body never leaks the underlying cause by
  design (see [`apps/api/src/error.rs`](../apps/api/src/error.rs)); check the server logs for
  the source.

---

## Tests — the memory-safe recipe

> **This is a first-class operational constraint, not a footnote.** It mirrors
> [OVERVIEW §8 — Local Stack & Memory-Safe Run](./OVERVIEW.md#8-local-stack--memory-safe-run).

- **Symptom.** The machine swaps or OOMs while running tests, sometimes far past physical RAM.
- **Cause.** The library is consumed via a local `path`/`file:` link, so its crates recompile
  into this build and its WASM/TS reloads into the module graph of **every Vitest fork**.
  Running suites in parallel — or fanning test runs across parallel agents — multiplies memory
  by `workers × runners × agents`.
- **Fix — the recipe.**
  1. **Infra first.** `pnpm infra:up` (Postgres/Redis/Mailpit healthy) before any integration
     run, or the API exits on the sqlx connect and the crash masks the real issue.
  2. **Bound the pools.** Rust: `cargo nextest run -p api --test-threads` at or below
     `cores / 2` (coverage via `cargo llvm-cov nextest`; CI uses `--test-threads 4`). Web:
     keep Vitest **`maxWorkers: '50%'`** baked into the config, plus
     `NODE_OPTIONS=--max-old-space-size=4096` as a guard.
  3. **One package at a time, sequentially, in the main process.** Never let both workspaces'
     suites run at once. **Never fan out parallel `Agent`/`Workflow` runs that each execute a
     test suite** — `cargo-mutants` runs with a capped `--jobs`.
  4. **Prefer build-once over watch when diagnosing.** `cargo build --release` plus a single
     started service beats two watchers under memory pressure.

Static gates (`cargo fmt --check`, `cargo clippy`, `tsc --noEmit`, `eslint .`) are one process
each and are safe to run normally.

### The e2e suite cannot connect to Postgres on `:55432`

- **Symptom.** Integration specs or `sqlx migrate run` fail to connect on the test ports.
- **Cause.** The ephemeral test stack ([`docker-compose.test.yml`](../docker-compose.test.yml),
  Postgres `55432`, Redis `56379`, Mailpit `51025`/`58025`) is not up.
- **Fix.** `pnpm infra:test:up` (it waits for health), apply migrations against
  `DATABASE_URL_TEST`, then run the suite. Tear down with `pnpm infra:test:down`.

---

## Still stuck?

Open an issue with the exact error, your OS, the Rust / Node / pnpm versions, and whether the
infra containers are healthy (`docker ps`). For a suspected vulnerability, follow
[`SECURITY.md`](../SECURITY.md) instead of filing a public issue.
