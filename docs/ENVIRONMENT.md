# Environment variable reference

Every environment variable consumed by `rust-auth-example`, with its type, default, and the boot-time rule that
validates it. This document mirrors the canonical registry in
[`OVERVIEW.md §9`](./OVERVIEW.md#9-configuration--environment) and
[Appendix A of the development plan](./DEVELOPMENT_PLAN.md#appendix-a--environment-variable-registry), and is reconciled
against the code that actually parses the values at boot:

- **`apps/api`** — [`apps/api/src/config/mod.rs`](../apps/api/src/config/mod.rs): a `figment` loader that layers built-in
  defaults under the process environment, deserializes them into the typed `Settings` struct, then runs hard guards on
  the secret fields. A missing required variable or a violated guard **aborts startup** with a precise `ConfigError` — the
  process never boots with an unsafe or incomplete configuration.
- **`apps/web`** — the Next.js console reads its variables from `process.env`; only `NEXT_PUBLIC_`-prefixed variables are
  inlined into the browser bundle, and every other web variable is server-only.

> The shape (with throwaway local-only placeholders) lives in [`.env.example`](../.env.example) at the repo root, and a
> production template in [`.env.prod.example`](../.env.prod.example). Copy `.env.example` to `.env` and fill it in.

---

## How configuration is loaded

The API loader is [`Settings::load`](../apps/api/src/config/mod.rs). It reads **unprefixed** environment variables (for
example `DATABASE_URL`, `JWT_SECRET`) via `figment`'s `Env::raw()`, so the variable names match the documented `.env`
contract exactly and a matching ambient shell variable overrides the corresponding default.

1. **Defaults, then environment.** Built-in `Defaults` are merged first, then the process environment on top, so any
   optional variable may be omitted and a set variable always wins.
2. **Typed extraction.** The merged figment is deserialized into `Settings`. A missing required field (`DATABASE_URL`,
   `REDIS_URL`, `JWT_SECRET`, `MFA_ENCRYPTION_KEY`) or a value that fails to parse aborts with `ConfigError::Extract`.
3. **Hard guards.** `Settings::validate` then enforces the secret-field guards (see
   [Boot-time validation](#boot-time-validation) below).
4. **Secrets are redacted.** `jwt_secret`, `mfa_encryption_key`, `resend_api_key`, `oauth_google_client_secret`, and both
   connection strings are redacted in the `Settings` `Debug` output, so they are never written to a log even if the struct
   is printed. Secret fields are held in `secrecy::SecretString` and zeroized on drop.

The full boot sequence lives in [`apps/api/src/main.rs`](../apps/api/src/main.rs): install tracing → `Settings::load`
(validate the environment) → `connect_pool` (open Postgres, [fail-fast on an unreachable database](./DATABASE.md)) →
`connect_stores` (Redis) → `build_engine` (assemble and validate the library `AuthConfig`) → bind the port.

---

## `apps/api`

Source of truth: [`apps/api/src/config/mod.rs`](../apps/api/src/config/mod.rs) (the `Settings` struct and its
`Defaults`).

| Variable | Type | Default | Validated at boot |
| --- | --- | --- | --- |
| `API_PORT` | `u16` | `4000` | Parsed as a port; the axum server binds `127.0.0.1:API_PORT`. |
| `APP_ENV` | `development` \| `production` \| `test` | `development` | Maps onto the library `Environment`; drives the production-only guards (secure cookies, HTTPS redirect checks). |
| `LOG_LEVEL` | string | `info` | The `Settings`-level log-filter default. (`RUST_LOG` is read directly by the tracing `EnvFilter`; it is **not** a `Settings` field.) |
| `DATABASE_URL` | string | — (required) | Extraction fails if absent. Used to open the sqlx Postgres pool. |
| `REDIS_URL` | string | — (required) | Extraction fails if absent. Passed to `RedisStores::connect`. |
| `REDIS_NAMESPACE` | string | `rust_auth_example` | Store key namespace; keys become `rust_auth_example:…`. See [`REDIS.md`](./REDIS.md). |
| `JWT_SECRET` | string (secret) | — (required) | `Settings::validate`: `>= 64` bytes (`ConfigError::JwtSecretTooShort`). Additionally **entropy-checked** by the library `AuthConfig::validate` when the engine builds. Zeroized on drop. |
| `MFA_ENCRYPTION_KEY` | base64 (secret) | — (required) | `Settings::validate`: base64 (standard) that decodes to **exactly 32 bytes** (`ConfigError::MfaKeyInvalid`); the AES-256-GCM key that seals TOTP secrets. See [`MFA.md`](./MFA.md). |
| `WEB_ORIGIN` | url | `http://localhost:3000` | CORS allow-origin (and exposes `Retry-After`). In production the library `AuthConfig::validate` requires `https://`. |
| `EMAIL_PROVIDER` | `mailpit` \| `resend` | `mailpit` | Selects the email transport; `resend` requires `RESEND_API_KEY`. See [`EMAIL.md`](./EMAIL.md). |
| `SMTP_HOST` | string | `localhost` | SMTP relay host for the lettre → Mailpit provider. |
| `SMTP_PORT` | `u16` | `1025` | SMTP relay port (the Mailpit listener). |
| `SMTP_FROM` | mailbox | `no-reply@auth.local` | `From` mailbox for outbound mail; validated as a well-formed RFC 5321 mailbox on both transports. |
| `RESEND_API_KEY` | string (secret) | — (unset) | Required when `EMAIL_PROVIDER=resend` (`ConfigError::ResendKeyMissing`); ignored otherwise. Zeroized on drop. |
| `OAUTH_GOOGLE_CLIENT_ID` | string | — (unset) | Google OAuth client id. All three `OAUTH_GOOGLE_*` must be set together or all left unset. See [`OAUTH_GOOGLE.md`](./OAUTH_GOOGLE.md). |
| `OAUTH_GOOGLE_CLIENT_SECRET` | string (secret) | — (unset) | Google OAuth client secret. Zeroized on drop. |
| `OAUTH_GOOGLE_CALLBACK_URL` | url | — (unset) | Absolute redirect URI registered with Google. |

`DATABASE_URL_TEST` is **not** a `Settings` field — it is read directly by the integration tests against the ephemeral
test stack (`postgres://…@localhost:55432/example_app_test`) and is deliberately not modelled in the runtime
configuration.

## `apps/web`

The console reads these from `process.env`. Only `NEXT_PUBLIC_`-prefixed variables reach the browser bundle.

| Variable | Type | Default (dev) | Used for |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | url | `http://localhost:4000` | The browser-visible API base the console calls. |
| `INTERNAL_API_URL` | url | `http://localhost:4000` | The server-side proxy's backend target (route handlers, silent refresh). |
| `AUTH_JWT_SECRET_FOR_PROXY` | string (secret) | *(same as `JWT_SECRET`)* | The `/nextjs` edge verifier's HS256 secret — it must equal `JWT_SECRET` exactly, so the proxy can verify access cookies without an API round-trip. |
| `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED` | `true` \| `false` | `false` | Shows or hides the "Continue with Google" button. |
| `MAILPIT_URL` | url | *(unset)* | Test-only override for the Mailpit REST base used by the e2e suite. |

## Docker Compose (local infrastructure)

Consumed by the Compose files to provision the Postgres and Redis containers — they are **not** part of the `Settings`
schema and must agree with the credentials embedded in `DATABASE_URL` / `REDIS_URL`.

| Variable | Example | Notes |
| --- | --- | --- |
| `POSTGRES_USER` | `postgres` | Postgres superuser created in the container. |
| `POSTGRES_PASSWORD` | `postgres` | Change before any non-local use. |
| `POSTGRES_DB` | `example_app` | Database created on first container start. |
| `REDIS_PASSWORD` | *(prod)* | The Redis `requirepass` value for the production Compose file. |
| `WEB_PORT` | `3000` | Published console port (production Compose). |
| `IMAGE_TAG` | `latest` | Image tag consumed by the production Compose file; set by the release workflow. |

---

## Boot-time validation

`Settings::validate` ([`config/mod.rs`](../apps/api/src/config/mod.rs)) runs after a successful extraction and returns a
typed `ConfigError` whose `Display` names the offending variable and constraint:

| Guard | Rule | Error |
| --- | --- | --- |
| `JWT_SECRET` length | at least `64` bytes (`Settings::JWT_SECRET_MIN_LEN`; for ASCII-only secrets, bytes == characters) | `ConfigError::JwtSecretTooShort { got }` |
| `MFA_ENCRYPTION_KEY` shape | valid standard base64 that decodes to exactly `32` bytes | `ConfigError::MfaKeyInvalid` |
| Resend key presence | when `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` must be set | `ConfigError::ResendKeyMissing` |
| Google OAuth completeness | the three `OAUTH_GOOGLE_*` variables must be **all set or all unset** | `ConfigError::OAuthConfigIncomplete` |
| Required-field presence | `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `MFA_ENCRYPTION_KEY` present | `ConfigError::Extract` (figment) |

A partially-configured Google provider is rejected fast because it would otherwise silently disable sign-in; when all
three variables are present, `Settings::google_oauth()` returns the borrowed credentials.

### Production and deployment guards

Beyond the loader guards above, the library `AuthConfig::validate(environment)` runs when the engine is assembled
([`apps/api/src/engine/config.rs`](../apps/api/src/engine/config.rs)) and, with `APP_ENV=production`, additionally
rejects a low-entropy `JWT_SECRET`, an empty or dangling role hierarchy, an invalid MFA key, and an unsafe OAuth redirect
configuration. Production deployments must also point `DATABASE_URL` / `REDIS_URL` at managed services (no loopback) and
serve the console over HTTPS — see [`.env.prod.example`](../.env.prod.example).

---

## Generating secrets

```bash
# JWT signing secret — 64 bytes (128 hex chars), above the 64-byte floor. Use the SAME value for the API
# JWT_SECRET and the web AUTH_JWT_SECRET_FOR_PROXY.
openssl rand -hex 64

# MFA encryption key — base64-encoded 32 bytes.
openssl rand -base64 32
```

Never reuse the example values, never commit a populated `.env`, and rotate `JWT_SECRET` on a schedule in production.

---

## Keeping this document in sync

This file, [`.env.example`](../.env.example), and the `Settings` loader must change together. If you add, rename, or
remove a variable, update all of:

1. [`apps/api/src/config/mod.rs`](../apps/api/src/config/mod.rs) — the enforcement surface (`Settings` + `Defaults` +
   `validate`).
2. [`.env.example`](../.env.example) and [`.env.prod.example`](../.env.prod.example) — the shapes with placeholders.
3. This document — the human-readable reference.
4. [Appendix A](./DEVELOPMENT_PLAN.md#appendix-a--environment-variable-registry) — the canonical registry.

---

## Further reading

- [`DATABASE.md`](./DATABASE.md) — `DATABASE_URL`, the schema, and the sqlx repositories.
- [`EMAIL.md`](./EMAIL.md) — `EMAIL_PROVIDER`, `SMTP_*`, `RESEND_API_KEY`, and `SMTP_FROM`.
- [`REDIS.md`](./REDIS.md) — `REDIS_URL` and `REDIS_NAMESPACE`.
- [`MFA.md`](./MFA.md) — `MFA_ENCRYPTION_KEY` and the AES-256-GCM sealing of TOTP secrets.
- [`OAUTH_GOOGLE.md`](./OAUTH_GOOGLE.md) — the `OAUTH_GOOGLE_*` variables and the injected TLS transport.
