# Features

A guided tour of the demonstrated journeys from the
[Feature Coverage Matrix](OVERVIEW.md#6-feature-coverage-matrix). Each section names the
**route constant** it exercises (from `bymax_auth_types::constants::routes`), shows an example
request/response, and states the **rule it teaches**.

Conventions used below:

- API routes are mounted under the `auth` prefix, so the library surface lives at `/auth/*`.
  The browser reaches them through the console's edge proxy, which rewrites `/api/auth/*` to
  the axum API ([`apps/web/proxy.ts`](../apps/web/proxy.ts)); the `curl` examples call the API
  directly on `:4000`.
- Error bodies are the canonical envelope `{ "error": { "code", "message", "details? } }` — the
  `details` field is omitted entirely when a variant carries none.
- `X-Tenant-Id` scopes a request to a tenant; the platform domain is tenant-less.
- Seeded credentials and the register-first flow are in [getting started](GETTING_STARTED.md).

**Index:** [1](#1-first-verified-login) · [2](#2-login-with-mfa) · [3](#3-wrong-password-then-lockout) ·
[4](#4-rate-limit-envelope) · [5](#5-transparent-token-rotation) · [6](#6-refresh-token-reuse-defense) ·
[7](#7-password-reset-wizard) · [8](#8-oauth-sign-in-google) · [9](#9-bring-your-own-email-provider) ·
[10](#10-multi-tenant-isolation) · [11](#11-session-device-manager) · [12](#12-websocket-auth) ·
[13](#13-edge-route-protection-wasm) · [14](#14-platform-admin-domain) · [15](#15-invitations) ·
[16](#16-roadmap-honesty)

---

## 1. First verified login

Register, read the one-time code from Mailpit, verify, then sign in — the whole front door.

Routes: `AUTH_REGISTER` → `AUTH_VERIFY_EMAIL` → `AUTH_LOGIN`.

```bash
curl -X POST http://localhost:4000/auth/register \
  -H 'Content-Type: application/json' -H 'X-Tenant-Id: acme' \
  -d '{"email":"new@acme.test","password":"Passw0rd!Passw0rd","name":"New User"}'
# 201 Created  ->  { "user": { "id": "…", "email": "new@acme.test", "emailVerified": false, … } }
```

Read the code from **[Mailpit](http://localhost:8025)**, then:

```bash
curl -X POST http://localhost:4000/auth/verify-email \
  -H 'Content-Type: application/json' -H 'X-Tenant-Id: acme' \
  -d '{"email":"new@acme.test","code":"123456"}'          # 204 No Content
```

**Teaching point:** registration issues a session immediately (before verification), so the
console can render the profile card while the user completes email verification out of band.

## 2. Login with MFA

Enroll TOTP, sign out, sign back in, and clear the second-factor challenge.

Routes: `MFA_SETUP` / `MFA_VERIFY_ENABLE` (enroll), then `AUTH_LOGIN` → `MFA_CHALLENGE`.

```bash
# Enroll (authenticated): setup renders a QR + recovery codes
curl -X POST http://localhost:4000/auth/mfa/setup -b cookies.txt
# 200 OK  ->  MfaSetupResult { "secret": "…", "qrCodeUri": "otpauth://totp/…", "recoveryCodes": ["…", …] }

# Later, a login on an MFA-enabled account short-circuits to a challenge:
curl -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' -H 'X-Tenant-Id: acme' \
  -d '{"email":"new@acme.test","password":"Passw0rd!Passw0rd"}'
# 200 OK  ->  MfaChallengeResult { "mfaRequired": true, "mfaTempToken": "<300s JWT>" }

curl -X POST http://localhost:4000/auth/mfa/challenge \
  -H 'Content-Type: application/json' \
  -d '{"mfaTempToken":"<300s JWT>","code":"654321"}'      # 200 OK -> session issued
```

**Teaching point:** an MFA-enabled `login` never issues a session directly — it returns a
short-lived `mfaTempToken` (a 300 s `MfaTempClaims` JWT); the second factor is verified against
the AEAD-sealed TOTP secret with a ±2-step drift window and a constant-time comparison.

## 3. Wrong password, then lockout

Repeated wrong passwords trip the per-account brute-force counter.

Route: `AUTH_LOGIN`. Backed by `BruteForceStore` (atomic Redis Lua).

```bash
# after enough consecutive failures on the same account:
# 401 Unauthorized
{ "error": { "code": "auth.account_locked",
             "message": "…",
             "details": { "retryAfterSeconds": 900 } } }
```

**Teaching point:** the lockout is atomic and account-scoped; the console renders the
`retryAfterSeconds` countdown (`remaining_lockout_secs`) so the user knows exactly when to
retry — no silent, indistinguishable failures.

## 4. Rate-limit envelope

Hammer `POST {AUTH_LOGIN}` past `RateLimitConfig.login` (`5 / 60s`) and the 6th attempt is
throttled at the edge.

```
429 Too Many Requests
Retry-After: 37
{ "error": { "code": "auth.too_many_requests", "message": "…" } }
```

**Teaching point:** the library sets `Retry-After` on the 429; the API exposes that header
through CORS (`expose_headers([RETRY_AFTER])` in [`apps/api/src/layers.rs`](../apps/api/src/layers.rs))
and the console renders the countdown from `AuthClientError`. Rate limiting is keyed by
`ClientIpSource::PeerAddr` by default — switch to `TrustedForwardedFor` only behind a trusted
proxy.

## 5. Transparent token rotation

Let the access token expire (or click **Rotate token** in the Trigger Center) and the request
still succeeds.

Route: `AUTH_REFRESH`. Driven by `/client` `createAuthFetch`.

```bash
curl -X POST http://localhost:4000/auth/refresh -b cookies.txt
# 200 OK  ->  a rotated access token + a new opaque refresh token (RawRefreshToken)
```

**Teaching point:** `createAuthFetch` does **single-flight** transparent refresh — a `401`
triggers exactly one `/auth/refresh`, then replays the original request; concurrent `401`s
share that single refresh. The access token is an HS256 JWT; the refresh token is opaque and
persisted only as `sha256(token)`.

## 6. Refresh-token reuse defense

Replay a refresh token that was already rotated, past its grace window.

Route: `AUTH_REFRESH`.

```bash
curl -X POST http://localhost:4000/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<an already-rotated token>"}'
# 401 Unauthorized -> { "error": { "code": "auth.refresh_token_invalid", "message": "…" } }
```

**Teaching point:** rotation keeps a brief **grace pointer** so a racing in-flight refresh
still resolves; but a token reused *past* grace yields `RotateOutcome::Invalid`, which revokes
the whole session — the Sessions table empties. Replay is a signal of theft, not a retry.

## 7. Password reset wizard

A three-screen flow: request → verify OTP → set a new password.

Routes: `PASSWORD_FORGOT` → `PASSWORD_VERIFY_OTP` → `PASSWORD_RESET` (resend via
`PASSWORD_RESEND_OTP`).

```bash
curl -X POST http://localhost:4000/auth/password/forgot-password \
  -H 'Content-Type: application/json' -H 'X-Tenant-Id: acme' \
  -d '{"email":"new@acme.test"}'                          # 200 OK (identical for unknown emails)

curl -X POST http://localhost:4000/auth/password/verify-otp \
  -H 'Content-Type: application/json' -H 'X-Tenant-Id: acme' \
  -d '{"email":"new@acme.test","code":"123456"}'
# 200 OK  ->  { "verifiedToken": "<short-lived token>" }

curl -X POST http://localhost:4000/auth/password/reset-password \
  -H 'Content-Type: application/json' \
  -d '{"verifiedToken":"<short-lived token>","password":"N3wPassw0rd!N3w"}'   # 204 No Content
```

**Teaching point:** `forgot-password` is anti-enumeration — an unknown email returns the same
`200` as a known one — and the OTP step exchanges the code for a single-use `verifiedToken`, so
the final reset call never re-transmits the code.

## 8. OAuth sign-in (Google)

"Continue with Google" runs a PKCE + state round-trip and consults the host policy.

Routes: `OAUTH_INITIATE` (`/auth/oauth/{provider}`) → `OAUTH_CALLBACK`
(`/auth/oauth/{provider}/callback`). Provider: `GoogleOAuthProvider`.

```bash
curl -i http://localhost:4000/auth/oauth/google        # 302 Found -> https://accounts.google.com/...
# Google redirects back to the callback, which returns a session, a redirect, or an MFA challenge.
```

**Teaching point:** the library ships the Google provider and the PKCE/state orchestration; the
example injects a **TLS `HttpClient`** (the built-in `ReqwestHttpClient` is plain-HTTP). The
`on_oauth_login` hook decides **Create** (an unseen verified email), **Link** (an existing
match), or **Reject** — the default is a secure DENY.

## 9. Bring-your-own email provider

Switch the transactional email transport with no call-site change.

Config: `EMAIL_PROVIDER` (`mailpit` | `resend`) + `RESEND_API_KEY`. Contract: the
`EmailProvider` trait.

```bash
# development (default): lettre -> Mailpit, every email browsable at :8025
EMAIL_PROVIDER=mailpit

# production: set the provider + key, restart — no code changes
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_…
```

**Teaching point:** the engine depends only on the `EmailProvider` trait, so the concrete
transport (lettre → Mailpit vs Resend over rustls) is a wiring detail resolved from `Settings`.
The Diagnostics panel shows the active provider.

## 10. Multi-tenant isolation

The same email is two different users under two different tenants.

Route: `AUTH_REGISTER` / `AUTH_LOGIN` with `X-Tenant-Id`.

```bash
curl -X POST http://localhost:4000/auth/register -H 'X-Tenant-Id: acme'   -d '{…}'   # user A
curl -X POST http://localhost:4000/auth/register -H 'X-Tenant-Id: globex' -d '{…}'   # user B (isolated)
```

**Teaching point:** `UserRepository::find_by_email(email, tenant_id)` returns `Ok(None)` for a
cross-tenant row — never an error — so a login under the wrong tenant fails cleanly, and tenant
scope is a repository concern, not a leaky filter bolted on later.

## 11. Session device manager

List active sessions, revoke one, or log out everywhere else.

Routes: `SESSIONS_LIST` (`GET /auth/sessions`) · `SESSIONS_REVOKE_ONE`
(`DELETE /auth/sessions/{id}`) · `SESSIONS_REVOKE_ALL` (`DELETE /auth/sessions/all`).

```bash
curl http://localhost:4000/auth/sessions -b cookies.txt
# 200 OK -> [ { "id": "…", "device": "…", "ip": "…", "lastActivity": "…", "isCurrent": true }, … ]

curl -X DELETE http://localhost:4000/auth/sessions/all -b cookies.txt   # 204: keeps only the current session
```

**Teaching point:** a new-device sign-in fires `AuthHooks::on_new_session` →
`EmailProvider::send_new_session_alert` (an alert lands in Mailpit) and flags the current row;
FIFO eviction over a per-user max fires `on_session_evicted`.

## 12. WebSocket auth

Mint a single-use ticket, then upgrade — the JWT never travels in the URL.

Route: `AUTH_WS_TICKET` (`POST /auth/ws-ticket`) → the example's own `GET /ws/example`.

```bash
curl -X POST http://localhost:4000/auth/ws-ticket -b cookies.txt
# 200 OK -> { "ticket": "<~30s single-use ticket>" }
# then the browser opens: wss://…/ws/example?ticket=<ticket>
```

**Teaching point:** the ticket is short-lived and single-use — a replay is rejected — so a
long-lived access JWT is never exposed in a WebSocket URL (which leaks into logs and history).

## 13. Edge route protection (WASM)

A `/dashboard/*` route with an expired or forged cookie is bounced without a backend round-trip.

Surface: `/nextjs` `verifyJwtToken` (WASM), used in [`apps/web/proxy.ts`](../apps/web/proxy.ts).

```ts
import { createAuthProxy, verifyJwtToken } from '@bymax-one/rust-auth/nextjs';
// the edge middleware verifies the HS256 session cookie (AUTH_JWT_SECRET_FOR_PROXY) at the edge
```

**Teaching point:** the algorithm is hard-pinned — a forged `alg:none`/`RS256` header is
rejected — so the edge verify is a fast first filter that gates routes instantly; the API
remains the authority.

## 14. Platform admin domain

Sign in to the tenant-less admin console; the two token families never cross.

Routes: `PLATFORM_LOGIN` (`/auth/platform/login`), `PLATFORM_ME`, `PLATFORM_REFRESH`,
`PLATFORM_LOGOUT`, `PLATFORM_MFA_SETUP` / `PLATFORM_MFA_CHALLENGE`.

```bash
curl -X POST http://localhost:4000/auth/platform/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@platform.local","password":"ChangeMe!Demo123"}'
# 200 OK -> a PlatformClaims session (admin, no tenantId)
```

**Teaching point:** a dashboard token cannot satisfy a platform guard and a platform token
cannot satisfy a dashboard guard — they are distinct claim types (`DashboardClaims` vs
`PlatformClaims`) served by distinct repositories and guards.

## 15. Invitations

An admin invites a teammate; the invitee accepts with a name and password.

Routes: `INVITATIONS_CREATE` (`POST /auth/invitations`, tenant from claims) →
`INVITATIONS_ACCEPT` (`POST /auth/invitations/accept`).

```bash
curl -X POST http://localhost:4000/auth/invitations \
  -H 'Content-Type: application/json' -b cookies.txt \
  -d '{"email":"teammate@acme.test"}'                    # 204 No Content (invite emailed)

curl -X POST http://localhost:4000/auth/invitations/accept \
  -H 'Content-Type: application/json' \
  -d '{"token":"<from the email>","name":"Teammate","password":"Passw0rd!Passw0rd"}'
# 201 Created -> the invitee is logged in
```

**Teaching point:** the tenant is taken from the inviter's claims (never the request body), and
accepting the invite records `after_invitation_accepted` in the audit chain — the invite token
is single-use and cannot be replayed.

## 16. Roadmap honesty

Some capabilities are **declared, not faked** — documented as host-app responsibilities built
on the existing seams rather than hidden behind a stub.

Surface: the console's **Roadmap** panel (matches
[`OVERVIEW.md` §6, row 35](OVERVIEW.md#6-feature-coverage-matrix)).

- account-unlink, email-change, account-deletion
- non-Google OAuth providers
- SMS / push MFA factors

**Teaching point:** a reference app earns trust by being explicit about its edges — each of the
above is reachable by implementing an existing trait seam (`OAuthProvider`, `EmailProvider`, a
repository method), and the panel says so instead of pretending it ships.

---

## Further reading

- [Getting started](GETTING_STARTED.md) — clone to a verified login in ~5 minutes.
- [Architecture](ARCHITECTURE.md) — the request pipelines and crate boundaries behind these journeys.
- [`OVERVIEW.md` §11](OVERVIEW.md#11-the-authentication-pipelines-deep-dive) — the pipeline deep dive.
- [`DASHBOARD.md`](DASHBOARD.md) — the console pages that drive every journey above.
