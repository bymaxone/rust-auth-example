# Phase 14 — Docs, Public-Readiness & Release

> **Status**: 🔄 In Progress · **Progress**: 6 / 7 tasks · **Last updated**: 2026-07-05
> (14.7's release.yml is finalized; the first `v*` tag + the go-public visibility flip are deferred to a human trigger.)
> **Source roadmap**: [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P14
> **Source spec**: [`docs/OVERVIEW.md`](../OVERVIEW.md)
> **Executing a task?** Read **only** that task's `### Task N.n` block + its bounded *REQUIRED READING* — never the whole file. See [token economy](README.md#token-economy--executing-a-single-task).

---

## Context

By the end of P13 both workspaces are functionally complete and fully hardened: the axum API (`apps/api`) wires
`AuthEngine::builder()` with real sqlx repositories, `Arc<RedisStores>`, a lettre `EmailProvider`, the `AuditAuthHooks`,
and a rustls-backed `GoogleOAuthProvider`; the Next.js console (`apps/web`) consumes `@bymax-one/rust-auth` and exercises
every journey in the browser. Coverage is 100% on all metrics in both workspaces (`cargo-llvm-cov nextest` API, Vitest
web), mutation is ≥ 95 driven toward 100 (`cargo-mutants` API, Stryker web), and the CI/security pipeline (`ci.yml`,
`codeql.yml`, `scorecard.yml`, `mutation.yml`, `mutation-nightly.yml`) runs green. What is still missing is the
human-facing layer: the documentation set is incomplete (only `OVERVIEW.md`, `DEVELOPMENT_PLAN.md`, `DASHBOARD.md` exist),
the README has no badge header, the export audits are present but not yet enforced as hard merge gates, the security
headers / CORS pass has not been finalized for a public origin, and no version has ever been tagged or released.

Phase 14 closes that gap. It authors every `docs/*.md` (GETTING_STARTED, FEATURES, ARCHITECTURE, ENVIRONMENT, DATABASE,
EMAIL, REDIS, MFA, OAUTH_GOOGLE, DEPLOYMENT, TROUBLESHOOTING, RELEASES), finalizes the README badge header + architecture
diagram + Documentation table, turns `audit:exports` and `audit:public-api` into hard `ci.yml` gates and reconciles the
35-row Feature Coverage Matrix against both, runs the security-headers/CORS final pass plus the go-public readiness
checklist (Appendix E), and ships `release.yml` (OIDC → GHCR `…-api`/`…-web` images, idempotent) before cutting the
first `v*` tag and recording it in `RELEASES.md`.

When P14 is done, `npx markdown-link-check` is clean across `docs/**` and `README.md`; `pnpm audit:exports` and
`./scripts/audit-rust-public-api.sh` are **required** (not `continue-on-error`) `ci.yml` checks and pass; the Feature
Coverage Matrix reconciles against both audits; CI is fully green including `codeql` + `scorecard` + the security gates;
the repo carries every go-public file with a clean secret scan; `release.yml` validates and the first tag produces two
GHCR images plus a `RELEASES.md` row. **This phase writes documentation, CI gates, and release plumbing only — no
application logic and no new library surface; every committed doc-as-config and source comment stays timeless (no
phase/task references).**

---

## Rules-of-phase

1. **Identifiers are verbatim, never paraphrased.** Every crate path, route const, trait method, error code, and
   environment variable named in a doc must match the shipped surface exactly (`bymax_auth_axum::auth_router`,
   `constants::routes::AUTH_REGISTER`, `auth.too_many_requests`, `MFA_ENCRYPTION_KEY`). The contract is
   [`OVERVIEW.md §6`](../OVERVIEW.md#6-feature-coverage-matrix) — reconcile against the code/audit, never against memory.
2. **Timeless, English-only docs-as-config.** No `Phase N` / `Fase N` / `Task` / roadmap-stage references in any
   committed doc, README, workflow, or comment. A doc-section reference (`OVERVIEW.md §16`) is allowed; a plan-stage name
   is not. Scrub any pre-existing reference in a file you touch.
3. **Audits become hard gates — never weaken to pass.** `audit:exports` (npm `.d.ts` → `apps/web`) and
   `audit-rust-public-api.sh` (`cargo public-api` → `apps/api`) must FAIL the `export-usage-check` job on an
   unreferenced export; allow-list only genuinely-internal leaked symbols with a written reason, never a demonstrable
   export.
4. **Security defaults are production-shaped.** tower-http security headers, a CORS allow-list (not `*`), `Retry-After`
   exposed on 429, secrets only via env, no PII/tokens/codes in logs or audit rows; `WEB_ORIGIN` must be `https://` in
   production and `client_ip_source: TrustedForwardedFor` only behind a trusted proxy.
5. **CI hardening invariants hold.** Least-privilege `permissions` (top-level `contents: read`, widen per job),
   `concurrency` cancel-in-progress except `release` (`cancel-in-progress: false`), pinned action versions, OIDC trusted
   publishing (`id-token: write` only on the publish job), untrusted `${{ }}` passed via `env:` never interpolated into a
   script body, `timeout-minutes` on every job. CI job names are **contractual** — branch protection references them.
6. **Release is idempotent.** `release.yml` guards each image with `docker manifest inspect` so a re-run of the same tag
   is a no-op; `docker/metadata-action` derives the semver tags; the `update-releases-doc` job appends the
   library-version row read from `apps/api/Cargo.toml`.
7. **Go-public hardening, not retrofit.** Every Appendix E file is present and correct; the secret scan is clean (only
   Mailpit/test fixtures, no real keys); branch protection is documented for the GitHub UI step. Security reports route
   to email per `SECURITY.md`, never a public issue.
8. **Conventional Commits, no `Co-Authored-By`; `git switch -c` only** (never `git checkout -b`). One task `🔄` at a
   time; never start a task until its `Depends on` are `✅`.

---

## Reference docs

- [`OVERVIEW.md`](../OVERVIEW.md) — §11 The Authentication Pipelines, §15 Audit Domain, §16 Demonstrated Journeys (the
  16 journeys for FEATURES.md), §18 Deployment Notes, §19 Versioning & Release Tracking, §20 Contributing, §21 License /
  Status.
- [`DASHBOARD.md`](../DASHBOARD.md) — the whole console spec (app shell, client layer, page-by-page, SSE audit tail) for
  the console-facing docs.
- [`DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) — § P14, §2 Global Conventions, §3 Autonomous Execution Model,
  Appendix A (Env Registry), Appendix C (Quality Gates), Appendix D (CI/CD Matrix), Appendix E (Go-Public Checklist).
- Sibling sources to copy-and-adapt: `~/Documents/MyApps/bymax-one/nest-auth-example/` (the same auth domain — its
  `docs/*.md`, README badge header, `release.yml`) and `~/Documents/MyApps/bymax-one/rust-auth/` (the library's
  `deny.toml`, `.github/workflows/`, `SECURITY.md`, the consumed `pub` surface).
- /bymax-workflow:standards — universal coding rules (apply the Rust track).

---

## Task index

| ID | Task | Status | Priority | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| 14.1 | GETTING_STARTED + FEATURES + ARCHITECTURE | ✅ | P0 | M | 2026-07-05 |
| 14.2 | Domain docs (ENVIRONMENT, DATABASE, EMAIL, REDIS, MFA, OAUTH_GOOGLE) | ✅ | P0 | M | 2026-07-05 |
| 14.3 | Ops docs (DEPLOYMENT, TROUBLESHOOTING, RELEASES) | ✅ | P1 | M | 2026-07-05 |
| 14.4 | README badge header + diagram + Documentation table | ✅ | P1 | S | 2026-07-05 |
| 14.5 | Enforce export/public-api audits + link-check | ✅ | P0 | M | 2026-07-05 |
| 14.6 | Security hardening + go-public checklist | ✅ | P0 | M | 2026-07-05 |
| 14.7 | release.yml + first tag | 🔄 | P1 | M | 14.6 |

---

## Tasks

### Task 14.1 — GETTING_STARTED + FEATURES + ARCHITECTURE

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Author the three orientation docs: `GETTING_STARTED.md` (clone → a verified first login + an enrolled TOTP in ~5
minutes), `FEATURES.md` (the 16 demonstrated journeys, each with a request/response + teaching point), and
`ARCHITECTURE.md` (the request pipelines + the crate boundaries of the consumed library surface).

#### Acceptance criteria

- [ ] `docs/GETTING_STARTED.md` walks clone → `pnpm install --frozen-lockfile` + `cargo build --locked` →
  `./scripts/link-library.sh` → `pnpm infra:up` (or `docker compose up --wait`) → `sqlx migrate run` → run both apps →
  register → read the OTP in Mailpit (`:8025`) → `verify-email` → `login` → `mfa/setup` enroll, all reachable in ~5 min.
- [ ] `docs/FEATURES.md` documents **all 16 journeys** from `OVERVIEW.md §16` (first verified login, MFA login, lockout,
  rate-limit envelope, token rotation, refresh-reuse defense, reset wizard, OAuth, BYO provider, multi-tenant isolation,
  session manager, WebSocket auth, edge WASM protection, platform admin, invitations, roadmap honesty), each with the
  route const (`AUTH_REGISTER`, `AUTH_VERIFY_EMAIL`, `MFA_CHALLENGE`, …), an example request/response, and the rule it
  teaches.
- [ ] `docs/ARCHITECTURE.md` shows the axum middleware order (`TraceLayer` → optional `CorsLayer` →
  `SetSensitiveRequestHeadersLayer` → `RequestBodyLimitLayer` → `CookieManagerLayer`), the `AppState` DI graph, the
  `AppError`→`AuthError::to_envelope` mapping, and the crate-boundary stack (`bymax-auth-types` → `-crypto` → `-jwt` →
  `-core` → `-redis`/`-axum`; npm `@bymax-one/rust-auth` 4 subpaths + the WASM edge verify).
- [ ] `npx markdown-link-check` is clean on the three files; no phase/task references.

#### Files to create / modify

- `docs/GETTING_STARTED.md`, `docs/FEATURES.md`, `docs/ARCHITECTURE.md`

#### Agent prompt

````
You are a senior open-source maintainer / release engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 14 (Docs, Public-Readiness & Release) — Task 14.1 of 7 (FIRST)

PRECONDITIONS
- P0–P13 done: both apps are functionally complete, 100% covered, mutation-hardened; CI/security pipeline green.
- docs/OVERVIEW.md, docs/DEVELOPMENT_PLAN.md, docs/DASHBOARD.md, docs/design_system.html exist; the other docs/*.md do not yet.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "16. Demonstrated Journeys" — the 16 journeys, verbatim, for FEATURES.md.
- docs/OVERVIEW.md § "11. The Authentication Pipelines (Deep Dive)" + § "3. Architecture at a Glance" — for ARCHITECTURE.md.
- docs/DEVELOPMENT_PLAN.md § "2. Global Conventions" (the run/gate commands) — for GETTING_STARTED.md.
- The sibling (same domain, copy & adapt voice/structure, NOT NestJS specifics): ~/Documents/MyApps/bymax-one/nest-auth-example/docs/{GETTING_STARTED.md,FEATURES.md,ARCHITECTURE.md}.

TASK
Author the three orientation docs so a newcomer can get to a verified login + enrolled TOTP in ~5 minutes and understand the request pipelines and crate boundaries. Documentation only — change no code.

DELIVERABLES
1. `docs/GETTING_STARTED.md`:
   - Prerequisites (Rust 1.96.0, Node 24, pnpm 10.8.x, Docker), then the exact happy path:
   ```bash
   git clone <repo> && cd rust-auth-example
   pnpm install --frozen-lockfile
   cargo build --locked
   ./scripts/link-library.sh          # builds @bymax-one/rust-auth (build:wasm + build) and file:-links it
   cp .env.example .env               # JWT_SECRET >= 64, MFA_ENCRYPTION_KEY = base64 32 bytes
   pnpm infra:up                      # docker compose up --wait: postgres + redis + mailpit
   (cd apps/api && sqlx migrate run)
   # terminal A: cargo run -p api        terminal B: pnpm -C apps/web dev
   # register at http://localhost:3000/auth/register -> read the OTP at http://localhost:8025 (Mailpit)
   # verify-email -> login -> Security/MFA: enroll TOTP (scan the QR, confirm a 6-digit code)
   ```
2. `docs/FEATURES.md`:
   - One section per journey (16 total), each: the route const + an example request/response + the teaching point.
   ```md
   ## 4. Rate-limit envelope
   Hammer `POST {AUTH_LOGIN}` past `RateLimitConfig.login` (5/60) and the 6th attempt returns:
   `429 Too Many Requests` · `Retry-After: 37` · body `{ "error": { "code": "auth.too_many_requests", "message": "..." } }`
   Teaching point: the library sets `Retry-After`; the console renders it from `AuthClientError`.
   ```
3. `docs/ARCHITECTURE.md`:
   - The axum middleware order + the AppState DI graph + the error envelope + the crate-boundary stack.
   ```md
   ## Request pipeline (apps/api)
   TraceLayer -> [CorsLayer] -> SetSensitiveRequestHeadersLayer -> RequestBodyLimitLayer -> CookieManagerLayer
   -> bymax_auth_axum::auth_router(engine, AxumAuthConfig) merged onto the example Router.
   AppError (thiserror + IntoResponse) wraps AuthRejection; library errors delegate to AuthError::to_envelope
   -> { "error": { "code", "message", "details? } }.

   ## Crate boundaries (consumed surface)
   bymax-auth-types -> bymax-auth-crypto -> bymax-auth-jwt -> bymax-auth-core -> { bymax-auth-redis, bymax-auth-axum }
   npm @bymax-one/rust-auth: /client /react /nextjs /shared (the /nextjs WASM verifyJwtToken runs at the edge).
   ```

Constraints:
- Identifiers verbatim (route consts, error codes, crate paths). English-only, timeless comments — NO Phase/Task/roadmap references in any committed file. No .gitkeep. git switch -c only. Design-system references stay verbatim where relevant.
- Documentation only: do not modify apps/api or apps/web source.

Verification:
- `ls docs/GETTING_STARTED.md docs/FEATURES.md docs/ARCHITECTURE.md` — expected: all three present.
- `grep -c '^## ' docs/FEATURES.md` — expected: >= 16 (one section per journey).
- `npx markdown-link-check docs/GETTING_STARTED.md docs/FEATURES.md docs/ARCHITECTURE.md --config .markdown-link-check.json` — expected: no dead links.
- `grep -riE "phase [0-9]|task [0-9]" docs/GETTING_STARTED.md docs/FEATURES.md docs/ARCHITECTURE.md` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `1 / 7` and Last updated.
4. Update the P14 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 14.1 ✅ <YYYY-MM-DD> — getting-started + features + architecture docs`.
6. Commit `docs: getting-started, features, architecture` (no Co-Authored-By).
````

---

### Task 14.2 — Domain docs (ENVIRONMENT, DATABASE, EMAIL, REDIS, MFA, OAUTH_GOOGLE)

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Author the six domain-reference docs: the environment-variable reference, the Postgres schema + sqlx repositories, the
`EmailProvider` + 7 templates, the 8 store traits + namespace + prefixes, TOTP + AEAD + recovery, and the
`GoogleOAuthProvider` + TLS `HttpClient` + `on_oauth_login` policy.

#### Acceptance criteria

- [ ] `docs/ENVIRONMENT.md` documents every variable (`API_PORT`, `WEB_ORIGIN`, `DATABASE_URL`, `REDIS_URL`,
  `REDIS_NAMESPACE`, `JWT_SECRET` ≥ 64, `MFA_ENCRYPTION_KEY` base64-32, `EMAIL_PROVIDER`, `SMTP_*`, `RESEND_API_KEY`,
  `OAUTH_GOOGLE_*`, `AUTH_JWT_SECRET_FOR_PROXY`, `NEXT_PUBLIC_*`, …) with type, default, and the boot-time `Settings`
  validation rule (a missing/invalid var aborts startup).
- [ ] `docs/DATABASE.md` documents the schema (`users`, `platform_users`, `tenants`, `invitations`, `audit_log` — backing
  `AuthUser`/`AuthPlatformUser` exactly, incl. `mfa_recovery_codes`, `oauth_provider`/`oauth_provider_id`, platform
  `updated_at`/`platform_id`), the `SqlxUserRepository` (11 `UserRepository` methods) + `SqlxPlatformUserRepository` (6
  `PlatformUserRepository` methods), and the `Conflict → auth.email_already_exists` / missing-row → `Ok(None)` semantics.
- [ ] `docs/EMAIL.md` documents the `EmailProvider` trait (7 `send_*` methods) + the lettre→Mailpit and Resend providers
  + the 7 transactional templates.
- [ ] `docs/REDIS.md` documents the 8 store traits (`SessionStore`, `OtpStore`, `BruteForceStore`, `WsTicketStore`,
  `PasswordResetStore`, `InvitationStore`, `MfaStore`, `OAuthStateStore`), the `NamespacedRedis` namespace, and the
  `Prefix` enum (20 prefixes), all wired through one `Arc<RedisStores>`.
- [ ] `docs/MFA.md` documents `totp::verify` (RFC 6238, drift ±2), `aead::encrypt`/`decrypt` (AES-256-GCM,
  `MFA_ENCRYPTION_KEY`), the base32 secret + `provisioning_uri`, and recovery codes.
- [ ] `docs/OAUTH_GOOGLE.md` documents `GoogleOAuthProvider::new(config, http)`, the rustls (aws-lc-rs) TLS `HttpClient`
  (because `ReqwestHttpClient` is plain-HTTP and `ring`/`openssl` are banned), and the `on_oauth_login` Create/Link/Reject
  policy (default DENY).
- [ ] `npx markdown-link-check` clean on all six; no phase/task references.

#### Files to create / modify

- `docs/ENVIRONMENT.md`, `docs/DATABASE.md`, `docs/EMAIL.md`, `docs/REDIS.md`, `docs/MFA.md`, `docs/OAUTH_GOOGLE.md`

#### Agent prompt

````
You are a senior open-source maintainer / release engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 14 (Docs, Public-Readiness & Release) — Task 14.2 of 7 (MIDDLE)

PRECONDITIONS
- P0–P13 done. apps/api carries the figment Settings loader, migrations/*.sql, the two Sqlx repositories, the lettre/Resend EmailProvider + email_templates/*.html, the rustls HttpClient + GoogleOAuthProvider, and the Arc<RedisStores> wiring.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "9. Configuration & Environment" + Appendix A in DEVELOPMENT_PLAN — for ENVIRONMENT.md (the full var table + boot validation: JWT_SECRET >= 64, MFA_ENCRYPTION_KEY base64-32, prod WEB_ORIGIN https).
- docs/OVERVIEW.md § "12. Identity Domains & Extension Points" + § "15. Audit Domain" — the trait seams (EmailProvider, store traits, hooks).
- The shipped surface and the example wiring (copy exact signatures): apps/api/src/{config,db,auth,oauth,redis}/** and apps/api/migrations/*.sql; the consumed crates at ../../../rust-auth/crates/{bymax-auth-core,bymax-auth-redis}.
- The sibling (same domain, adapt to Rust/sqlx): ~/Documents/MyApps/bymax-one/nest-auth-example/docs/{ENVIRONMENT.md,DATABASE.md,EMAIL.md,REDIS.md,MFA.md,OAUTH_GOOGLE.md}.

TASK
Author the six domain-reference docs with verbatim identifiers from the shipped surface. Documentation only — change no code.

DELIVERABLES
1. `docs/ENVIRONMENT.md`:
   - A table of every variable with type / default / validation rule.
   ```md
   | Variable | Type | Default | Validated at boot |
   | --- | --- | --- | --- |
   | `JWT_SECRET` | string | — (required) | `AuthConfig::validate`: >= 64 chars, entropy-checked |
   | `MFA_ENCRYPTION_KEY` | base64 | — (required) | decodes to exactly 32 bytes (AES-256) |
   | `WEB_ORIGIN` | url | `http://localhost:3000` | must be `https://` in production (CORS + Retry-After) |
   | `EMAIL_PROVIDER` | `mailpit\|resend` | `mailpit` | `resend` requires `RESEND_API_KEY` + verified `SMTP_FROM` |
   ```
2. `docs/DATABASE.md`:
   - The 5 tables + the two repository contracts.
   ```md
   ## SqlxUserRepository (impl bymax_auth_core::traits::repository::UserRepository)
   find_by_id, find_by_email, create, update_password, update_last_login, update_email_verified,
   update_mfa, find_by_oauth_id, create_with_oauth, link_oauth, update_status  (11 methods)
   Missing/cross-tenant row -> Ok(None); a unique-violation -> RepositoryError::Conflict -> auth.email_already_exists.
   ```
3. `docs/EMAIL.md`: the `EmailProvider` trait (7 send_* methods: send_password_reset_token, send_password_reset_otp, send_email_verification_otp, send_mfa_enabled, send_mfa_disabled, send_new_session_alert, send_invitation) + the lettre→Mailpit + Resend providers + the 7 templates.
4. `docs/REDIS.md`:
   ```md
   ## One handle, every seam
   `Arc<RedisStores>` (RedisStores::connect(url, namespace)) implements all 8 store traits:
   SessionStore, OtpStore, BruteForceStore, WsTicketStore, PasswordResetStore, InvitationStore, MfaStore, OAuthStateStore.
   Keys are namespaced via NamespacedRedis; the Prefix enum has 20 nest-parity prefixes
   (Rt, Rv, Rp, Sess, Sd, Lf, Otp, Resend, Wst, Pr, Prv, Inv, Prt, Prp, Psess, Psd, MfaSetup, Mfa, Tu, Os).
   ```
5. `docs/MFA.md`: `totp::verify(secret, code, unix_time, window)` (constant-time, drift ±2), `aead::encrypt`/`decrypt` (AES-256-GCM `b64(nonce):b64(tag):b64(ct)` keyed by `MFA_ENCRYPTION_KEY`), `encode_secret_base32` + `provisioning_uri`, recovery-code grid.
6. `docs/OAUTH_GOOGLE.md`:
   ```md
   The built-in ReqwestHttpClient is plain-HTTP (ring banned), so the example injects a rustls(aws-lc-rs) HttpClient:
   `GoogleOAuthProvider::new(config: GoogleOAuthConfig, http: Arc<dyn HttpClient>)`.
   on_oauth_login (default = secure DENY) policy: Create on an unseen verified email, Link on a match, Reject otherwise.
   ```

Constraints:
- Identifiers verbatim. English-only, timeless — NO Phase/Task/roadmap references. No .gitkeep. git switch -c only.
- Documentation only: do not modify source.

Verification:
- `ls docs/ENVIRONMENT.md docs/DATABASE.md docs/EMAIL.md docs/REDIS.md docs/MFA.md docs/OAUTH_GOOGLE.md` — expected: all six present.
- `grep -q 'MFA_ENCRYPTION_KEY' docs/ENVIRONMENT.md && grep -q 'on_oauth_login' docs/OAUTH_GOOGLE.md && grep -q 'OAuthStateStore' docs/REDIS.md` — expected: exit 0.
- `npx markdown-link-check docs/ENVIRONMENT.md docs/DATABASE.md docs/EMAIL.md docs/REDIS.md docs/MFA.md docs/OAUTH_GOOGLE.md --config .markdown-link-check.json` — expected: no dead links.
- `grep -riE "phase [0-9]|task [0-9]" docs/ENVIRONMENT.md docs/DATABASE.md docs/EMAIL.md docs/REDIS.md docs/MFA.md docs/OAUTH_GOOGLE.md` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `2 / 7` and Last updated.
4. Update the P14 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 14.2 ✅ <YYYY-MM-DD> — environment/database/email/redis/mfa/oauth docs`.
6. Commit `docs: domain reference set (env, db, email, redis, mfa, oauth)` (no Co-Authored-By).
````

---

### Task 14.3 — Ops docs (DEPLOYMENT, TROUBLESHOOTING, RELEASES)

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: M
- **Depends on**: —

#### Description

Author the three operations docs: `DEPLOYMENT.md` (the production checklist + version pins), `TROUBLESHOOTING.md`
(symptom → cause → fix, including the memory-safe test recipe), and `RELEASES.md` (the branch → library-version tracking
table, seeded for the first tag).

#### Acceptance criteria

- [ ] `docs/DEPLOYMENT.md` covers the two GHCR images (`…-api` distroless, `…-web` Next standalone), the `OVERVIEW.md §18`
  production checklist (managed `DATABASE_URL`/`REDIS_URL`, `sqlx migrate run` on deploy, strong `JWT_SECRET` +
  `MFA_ENCRYPTION_KEY`, `EMAIL_PROVIDER=resend`, Google OAuth + the TLS `HttpClient`, `WEB_ORIGIN` https +
  `AUTH_JWT_SECRET_FOR_PROXY`, graceful `SIGTERM` shutdown), and the toolchain pins (Rust 1.96.0 / MSRV 1.90, Node 24,
  pnpm 10.8.x).
- [ ] `docs/TROUBLESHOOTING.md` is a symptom → cause → fix table including: `file:` link unresolved (build the npm
  package first), `cargo sqlx prepare --check` stale, container not healthy, OAuth fails over HTTPS (plain-HTTP
  `ReqwestHttpClient`), 429 with no `Retry-After` exposed, and the **memory-safe test recipe** (bounded
  `cargo nextest --test-threads` / Vitest `maxWorkers: '50%'`, never fan out parallel test agents).
- [ ] `docs/RELEASES.md` has the branch → tracked-library-version table (`main` / `next`) per `OVERVIEW.md §19` plus a
  tested-version log table with a pre-release seed row, ready for `release.yml` to append to.
- [ ] `npx markdown-link-check` clean on all three; no phase/task references.

#### Files to create / modify

- `docs/DEPLOYMENT.md`, `docs/TROUBLESHOOTING.md`, `docs/RELEASES.md`

#### Agent prompt

````
You are a senior open-source maintainer / release engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 14 (Docs, Public-Readiness & Release) — Task 14.3 of 7 (MIDDLE)

PRECONDITIONS
- P0–P13 done; both Dockerfiles exist (apps/api distroless, apps/web Next standalone); the figment Settings loader + sqlx migrations are in place.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "18. Deployment Notes" (the production checklist) + § "19. Versioning & Release Tracking" (the branch table) + § "17. Testing Strategy" (the memory-safe caps).
- docs/DEVELOPMENT_PLAN.md § "2. Global Conventions" (toolchain pins, memory-safe tests) + Appendix C (Notes: memory safety).
- The sibling (adapt to Rust/sqlx/cargo): ~/Documents/MyApps/bymax-one/nest-auth-example/docs/{DEPLOYMENT.md,TROUBLESHOOTING.md,RELEASES.md}.

TASK
Author DEPLOYMENT.md, TROUBLESHOOTING.md, and RELEASES.md. Documentation only — change no code.

DELIVERABLES
1. `docs/DEPLOYMENT.md`:
   - The two images, the prod checklist, and the version pins.
   ```md
   ## Production checklist
   - [ ] DATABASE_URL -> managed Postgres (no loopback); run `sqlx migrate run` on deploy.
   - [ ] REDIS_URL -> managed Redis (durable, atomic sessions/OTP/lockout across instances).
   - [ ] JWT_SECRET >= 64 chars high-entropy (validate() rejects weak); MFA_ENCRYPTION_KEY = base64 32 bytes.
   - [ ] EMAIL_PROVIDER=resend + RESEND_API_KEY + a verified SMTP_FROM (Mailpit is dev-only).
   - [ ] OAUTH_GOOGLE_* set; confirm the rustls HttpClient reaches Google (ReqwestHttpClient is plain-HTTP).
   - [ ] WEB_ORIGIN = https console origin; AUTH_JWT_SECRET_FOR_PROXY set; TrustedForwardedFor only behind a trusted proxy.
   - [ ] Graceful SIGTERM drains in-flight requests.
   ## Toolchain pins: Rust 1.96.0 (MSRV floor 1.90) · Node 24 · pnpm 10.8.x.
   ```
2. `docs/TROUBLESHOOTING.md`:
   ```md
   | Symptom | Cause | Fix |
   | --- | --- | --- |
   | `Cannot find module @bymax-one/rust-auth` | npm pkg not built (dist/ + wasm/ git-ignored) | `./scripts/link-library.sh` (build:wasm + build) before the web build |
   | `cargo sqlx prepare --check` fails | offline `.sqlx/` cache stale | re-run `cargo sqlx prepare` against the test stack and commit |
   | OAuth callback fails over HTTPS | built-in ReqwestHttpClient is plain-HTTP (ring banned) | inject the rustls(aws-lc-rs) HttpClient into GoogleOAuthProvider |
   | OOM / machine swaps during tests | parallel test agents duplicate the library per worker | run suites sequentially; `cargo nextest --test-threads` bounded, Vitest maxWorkers '50%'; NEVER fan out parallel test agents |
   ```
3. `docs/RELEASES.md`: the branch table (main / next, per OVERVIEW §19) + a tested-version log with a `_pre-release_` seed row that `release.yml` will prepend to (lib-version read from apps/api/Cargo.toml).

Constraints:
- Identifiers verbatim. English-only, timeless — NO Phase/Task/roadmap references. No .gitkeep. git switch -c only.
- Documentation only: do not modify source.

Verification:
- `ls docs/DEPLOYMENT.md docs/TROUBLESHOOTING.md docs/RELEASES.md` — expected: all three present.
- `grep -qiE "maxWorkers|test-threads" docs/TROUBLESHOOTING.md` — expected: exit 0 (the memory-safe recipe is present).
- `npx markdown-link-check docs/DEPLOYMENT.md docs/TROUBLESHOOTING.md docs/RELEASES.md --config .markdown-link-check.json` — expected: no dead links.
- `grep -riE "phase [0-9]|task [0-9]" docs/DEPLOYMENT.md docs/TROUBLESHOOTING.md docs/RELEASES.md` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `3 / 7` and Last updated.
4. Update the P14 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 14.3 ✅ <YYYY-MM-DD> — deployment/troubleshooting/releases docs`.
6. Commit `docs: deployment, troubleshooting, releases` (no Co-Authored-By).
````

---

### Task 14.4 — README badge header + diagram + Documentation table

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: S
- **Depends on**: —

#### Description

Finalize `README.md` with the centered badge header, the architecture diagram, the Documentation table linking the
`docs/*.md` set, and the Feature Coverage Matrix link.

#### Acceptance criteria

- [ ] The badge header carries: CI (`ci.yml`), coverage, mutation, license (MIT), Rust edition 2024, MSRV 1.90, Node 24,
  axum 0.8, Next 16, React 19, Tailwind 4.
- [ ] An ASCII (or mermaid) architecture diagram mirrors `OVERVIEW.md §3` (apps/web → proxy/edge WASM → apps/api →
  Postgres/Redis/Mailpit; the consumed library crates).
- [ ] A `## Documentation` table links every `docs/*.md` authored in this phase (GETTING_STARTED, FEATURES, ARCHITECTURE,
  ENVIRONMENT, DATABASE, EMAIL, REDIS, MFA, OAUTH_GOOGLE, DEPLOYMENT, TROUBLESHOOTING, RELEASES) plus OVERVIEW,
  DEVELOPMENT_PLAN, DASHBOARD.
- [ ] A link to the Feature Coverage Matrix (`OVERVIEW.md §6`).
- [ ] `npx markdown-link-check README.md` clean; no phase/task references.

#### Files to create / modify

- `README.md`

#### Agent prompt

````
You are a senior open-source maintainer / release engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 14 (Docs, Public-Readiness & Release) — Task 14.4 of 7 (MIDDLE)

PRECONDITIONS
- A README.md skeleton was seeded in P0; the docs/*.md set is authored (Tasks 14.1–14.3). ci.yml + the badges' target workflows exist.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "3. Architecture at a Glance" (the diagram) + § "6. Feature Coverage Matrix" (the link).
- docs/DEVELOPMENT_PLAN.md Appendix E (the README badge requirement: CI, coverage, mutation, license, Rust edition, MSRV, Node, axum, Next, React, Tailwind).
- The sibling badge house-style (copy & adapt the badge SVG shields, swap NestJS->axum + Prisma->sqlx): ~/Documents/MyApps/bymax-one/nest-auth-example/README.md.

TASK
Finalize README.md: the badge header, the architecture diagram, the Documentation table, and the matrix link. Documentation only — change no code.

DELIVERABLES
1. `README.md`:
   - The centered badge row (one shields.io badge per item):
   ```md
   <p align="center">
     <a href="../../actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/bymaxone/rust-auth-example/ci.yml?label=CI"></a>
     <img alt="coverage" src="https://img.shields.io/badge/coverage-100%25-brightgreen">
     <img alt="mutation" src="https://img.shields.io/badge/mutation-%E2%89%A595-brightgreen">
     <img alt="license" src="https://img.shields.io/badge/license-MIT-blue">
     <img alt="rust edition" src="https://img.shields.io/badge/rust-edition%202024-orange">
     <img alt="MSRV" src="https://img.shields.io/badge/MSRV-1.90-orange">
     <img alt="node" src="https://img.shields.io/badge/node-24-339933">
     <img alt="axum" src="https://img.shields.io/badge/axum-0.8-000000">
     <img alt="next" src="https://img.shields.io/badge/Next.js-16-000000">
     <img alt="react" src="https://img.shields.io/badge/React-19-61DAFB">
     <img alt="tailwind" src="https://img.shields.io/badge/Tailwind-4-06B6D4">
   </p>
   ```
   - A tagline + an ASCII/mermaid architecture diagram (mirror OVERVIEW §3).
   - A `## Documentation` table linking docs/*.md (GETTING_STARTED, FEATURES, ARCHITECTURE, ENVIRONMENT, DATABASE, EMAIL, REDIS, MFA, OAUTH_GOOGLE, DEPLOYMENT, TROUBLESHOOTING, RELEASES, OVERVIEW, DEVELOPMENT_PLAN, DASHBOARD).
   - A link to the [Feature Coverage Matrix](docs/OVERVIEW.md#6-feature-coverage-matrix).

Constraints:
- 11 badges minimum (the items listed). English-only, timeless — NO Phase/Task/roadmap references. git switch -c only.
- Documentation only: do not modify source.

Verification:
- `grep -c 'img.shields.io' README.md` — expected: >= 11.
- `grep -q 'OVERVIEW.md#6-feature-coverage-matrix' README.md` — expected: exit 0.
- `npx markdown-link-check README.md --config .markdown-link-check.json` — expected: no dead links (badge endpoints ignored per the config).
- `grep -riE "phase [0-9]|task [0-9]" README.md` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `4 / 7` and Last updated.
4. Update the P14 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 14.4 ✅ <YYYY-MM-DD> — README badge header + diagram + docs table`.
6. Commit `docs(readme): badge header, architecture diagram, documentation table` (no Co-Authored-By).
````

---

### Task 14.5 — Enforce export/public-api audits + link-check

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Turn `audit:exports` (npm) and `audit:public-api` (`cargo public-api`) into hard `ci.yml` gates, reconcile the 35-row
Feature Coverage Matrix against both audits, and make `markdown-link-check` clean across the whole docs set.

#### Acceptance criteria

- [ ] In `ci.yml`, the `export-usage-check` job runs `pnpm audit:exports` (against the built `@bymax-one/rust-auth`
  `dist/**/*.d.ts` for the 4 subpaths) AND `./scripts/audit-rust-public-api.sh` (`cargo public-api` over the 3 consumed
  crates), both **required** (no `continue-on-error`, no `|| true`), failing the build on any unreferenced export.
- [ ] The `.audit-ignore`/allow-list only contains genuinely-internal leaked symbols (each with a written reason); the 3
  internal-only error sentinels + the unreachable `PasswordResetTokenExpired` + the out-of-surface WASM
  `extract_claims`/`verify_password` are handled per `OVERVIEW.md §6` / Appendix B.
- [ ] The Feature Coverage Matrix (`OVERVIEW.md §6`) reconciles against both audits — every shipped export maps to a
  matrix row + a demonstrated-in journey; the reconciliation is recorded.
- [ ] A `markdown-link-check` CI step (or the existing one) runs over `docs/**` + `README.md` and is clean.
- [ ] `pnpm audit:exports` and `./scripts/audit-rust-public-api.sh` both exit 0 locally; `ci.yml` parses.

#### Files to create / modify

- `.github/workflows/ci.yml` (make `export-usage-check` + the link-check required)
- `scripts/audit-library-exports.mjs`, `scripts/audit-rust-public-api.sh`, `.audit-ignore` (reconcile)
- `docs/OVERVIEW.md` (§6 matrix reconciliation note, if a row needs updating)

#### Agent prompt

````
You are a senior open-source maintainer / release engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 14 (Docs, Public-Readiness & Release) — Task 14.5 of 7 (MIDDLE)

PRECONDITIONS
- P2 wired the two audit scripts (scripts/audit-library-exports.mjs + scripts/audit-rust-public-api.sh) + .audit-ignore; the export-usage-check job exists in ci.yml. apps/web references the npm exports; apps/api references the crate pub items.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "6. Feature Coverage Matrix" (the Coverage rule + the 35 rows) + § "7. Library Consumption".
- docs/DEVELOPMENT_PLAN.md Appendix B (Library Export -> Phase Coverage Map: which codes are allow-listed + why) + Appendix C (Export usage / Public-API gates) + Appendix D (the export-usage-check job).
- The existing scripts + workflow: scripts/audit-library-exports.mjs, scripts/audit-rust-public-api.sh, .audit-ignore, .github/workflows/ci.yml.

TASK
Make both audits hard merge gates, reconcile the matrix against them, and make link-check clean across all docs. Edit CI/scripts/docs only — no application logic.

DELIVERABLES
1. `.github/workflows/ci.yml` — the `export-usage-check` job runs BOTH audits as required steps (remove any continue-on-error / `|| true`); add (or confirm) a markdown-link-check step over docs/** + README.md.
   ```yaml
   export-usage-check:
     runs-on: ubuntu-latest
     timeout-minutes: 15
     permissions:
       contents: read
     steps:
       - uses: actions/checkout@v5
       # ... pnpm/action-setup@v4 (before node), setup-node@v5 node 24, rust-toolchain pinned, build-library ...
       - run: pnpm audit:exports                 # FAILS on any unreferenced npm export
       - run: ./scripts/audit-rust-public-api.sh  # cargo public-api over the 3 consumed crates; FAILS on unreferenced pub item
   ```
2. `scripts/audit-rust-public-api.sh` — confirm it runs `cargo public-api -p bymax-auth-core` (+ -axum, -redis) and exits non-zero on an unreferenced pub item; only allow-list genuinely-internal leaked symbols.
3. `.audit-ignore` — reconcile: keep only the 3 internal-only sentinels (collapse to TokenInvalid), the unreachable PasswordResetTokenExpired, each with a `# reason:` line; the WASM extract_claims/verify_password are out-of-surface (NOT in the npm .d.ts), so not allow-listed.
4. `docs/OVERVIEW.md` § 6 — record the reconciliation (every shipped export -> a matrix row + a demonstrated-in journey).

Constraints:
- Never weaken a gate to pass — fix the missing reference or allow-list with a written reason. English-only, timeless — NO Phase/Task references in ci.yml/scripts/docs. git switch -c only.

Verification:
- `pnpm audit:exports` — expected: exit 0 (every npm export referenced or allow-listed with a reason).
- `./scripts/audit-rust-public-api.sh` — expected: exit 0 (every consumed pub item referenced).
- `grep -n 'continue-on-error' .github/workflows/ci.yml` — expected: no match on the export-usage-check job.
- `npx markdown-link-check docs/*.md README.md --config .markdown-link-check.json` — expected: no dead links.
- `grep -riE "phase [0-9]|task [0-9]" .github/workflows/ci.yml scripts/audit-rust-public-api.sh` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `5 / 7` and Last updated.
4. Update the P14 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 14.5 ✅ <YYYY-MM-DD> — export + public-api audits enforced, matrix reconciled, link-check clean`.
6. Commit `ci: enforce export + public-api audits as hard gates` (no Co-Authored-By).
````

---

### Task 14.6 — Security hardening + go-public checklist

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Run the security-headers / CORS final pass on the API and complete the go-public readiness checklist (Appendix E):
secret-scan clean, branch-protection prep documented, and every go-public file present and correct.

#### Acceptance criteria

- [ ] The API applies tower-http security headers and a CORS **allow-list** (not `*`) scoped to `WEB_ORIGIN`, allowing
  `x-tenant-id` and exposing `Retry-After`; `client_ip_source: TrustedForwardedFor` is documented as proxy-only; secrets
  only via env; no PII/tokens/codes in logs or audit rows (regression-guarded).
- [ ] The secret scan (gitleaks/TruffleHog) is clean — no real keys, only Mailpit/test fixtures.
- [ ] Every Appendix E file is present and correct: `LICENSE` (MIT), `SECURITY.md` (report → email), `CODE_OF_CONDUCT.md`,
  `CONTRIBUTING.md`, `CHANGELOG.md`, `CLAUDE.md`, `AGENTS.md`, `.github/ISSUE_TEMPLATE/*` + `PULL_REQUEST_TEMPLATE.md` +
  `CODEOWNERS`, the 4 Copilot review files (< 4000 chars on the instruction files), and the README badge header.
- [ ] Branch protection for `main` (PR-only, required checks by name, signed commits, linear history) is documented for
  the GitHub-UI step (it cannot be set from code).
- [ ] No phase/task references in any committed doc-as-config; `codeql` + `scorecard` + secret-scan run green/informational.

#### Files to create / modify

- `apps/api/src/app.rs` (CORS allow-list + security headers final pass, if needed)
- `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `.github/**` (reconcile go-public files)
- `docs/DEPLOYMENT.md` (the branch-protection prep note, if not already present)

#### Agent prompt

````
You are a senior open-source maintainer / release engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 14 (Docs, Public-Readiness & Release) — Task 14.6 of 7 (MIDDLE)

PRECONDITIONS
- P0 scaffolded the go-public files (LICENSE, SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, the 4 Copilot files, issue/PR templates, CODEOWNERS) + codeql.yml + scorecard.yml + secret-scan. P3 wired CORS + the tower-http security layers. This task is the final reconciliation pass before going public.

REQUIRED READING (only these — do not load more):
- docs/DEVELOPMENT_PLAN.md Appendix E (Go-Public Readiness Checklist) + § "Branch protection" note in § 3.
- docs/OVERVIEW.md § "13. Token, Session & Tenant Security" (CORS allow-list, Retry-After, never-log-secrets) + § "21. License / Status".
- apps/api/src/app.rs (the existing CORS + security-header layers) — only to verify/tighten, not to rewrite.
- The library SECURITY.md as the template: ~/Documents/MyApps/bymax-one/rust-auth/SECURITY.md.

TASK
Finalize the security-headers/CORS pass and complete every go-public checklist item. Touch app.rs only to tighten CORS to an allow-list + expose Retry-After if not already; otherwise edit docs-as-config only.

DELIVERABLES
1. `apps/api/src/app.rs` (only if the pass finds a gap):
   ```rust
   /// CORS scoped to the configured web origin — never a wildcard in production.
   fn cors_layer(settings: &Settings) -> CorsLayer {
       CorsLayer::new()
           .allow_origin(settings.web_origin.parse::<HeaderValue>().expect_used_only_at_boot())
           .allow_headers([CONTENT_TYPE, HeaderName::from_static("x-tenant-id")])
           .expose_headers([HeaderName::from_static("retry-after")])
           .allow_credentials(true)
   }
   ```
   (No new unwrap/expect in request paths; boot-time parse failures abort startup via the typed Settings loader.)
2. Reconcile every Appendix E file: confirm LICENSE/SECURITY.md/CODE_OF_CONDUCT.md/CONTRIBUTING.md/CHANGELOG.md/CLAUDE.md/AGENTS.md + .github/ISSUE_TEMPLATE/* + PULL_REQUEST_TEMPLATE.md + CODEOWNERS + the 4 Copilot files are present, correct, and carry NO phase/task references; SECURITY.md routes reports to email (not a public issue).
3. Document the branch-protection prep (GitHub-UI step) in docs/DEPLOYMENT.md (or a go-public section): main PR-only, required checks by name (every ci.yml job + codeql + scorecard + mutation), signed commits, linear history.

Constraints:
- CORS allow-list, never `*`; Retry-After exposed; no secrets/PII/codes in logs or audit rows. #![forbid(unsafe_code)]; no unwrap/expect/panic in request paths; typed thiserror. English-only, timeless — NO Phase/Task references. git switch -c only.

Verification:
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `cargo nextest run -p api` — expected: passes (incl. the never-log-secrets + CORS regression tests).
- `gitleaks detect --no-git -v` — expected: no leaks (only fixtures/Mailpit).
- `ls LICENSE SECURITY.md CODE_OF_CONDUCT.md CONTRIBUTING.md CHANGELOG.md CLAUDE.md AGENTS.md .github/PULL_REQUEST_TEMPLATE.md .github/CODEOWNERS` — expected: all present.
- `grep -riE "phase [0-9]|task [0-9]" SECURITY.md CONTRIBUTING.md .github/copilot-instructions.md .github/instructions/*.md` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `6 / 7` and Last updated.
4. Update the P14 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 14.6 ✅ <YYYY-MM-DD> — security/CORS final pass + go-public checklist complete`.
6. Commit `chore(security): finalize headers/CORS + go-public readiness` (no Co-Authored-By).
````

---

### Task 14.7 — release.yml + first tag

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: M
- **Depends on**: 14.6

#### Description

Finalize `release.yml` (OIDC → GHCR `…-api`/`…-web` images, idempotent) and cut the first `v*` tag; the release records a
row in `RELEASES.md`. This is the LAST task — it also runs the per-phase completion protocol.

#### Acceptance criteria

- [ ] `.github/workflows/release.yml` triggers on tag `v*`, top-level `permissions: contents: read`; the build job adds
  `packages: write` + `id-token: write` (OIDC), logs into GHCR, derives semver tags via `docker/metadata-action`, builds
  + pushes `ghcr.io/bymaxone/rust-auth-example-api` and `…-web` via `docker/build-push-action`, and is **idempotent**
  (`docker manifest inspect` guards a re-run of the same tag); untrusted `${{ github.ref_name }}` passed via `env:`;
  `concurrency` with `cancel-in-progress: false`.
- [ ] An `update-releases-doc` job (`contents: write`) prepends a row to `docs/RELEASES.md`, reading the library version
  from `apps/api/Cargo.toml`.
- [ ] The tag ↔ version guard is present (the tag must match the workspace version).
- [ ] The first `v*` tag is cut, `release.yml` produces both images, and `RELEASES.md` gains the release row.
- [ ] `release.yml` parses; least-privilege + pinned actions + `timeout-minutes`.

#### Files to create / modify

- `.github/workflows/release.yml`, `docs/RELEASES.md`

#### Agent prompt

````
You are a senior open-source maintainer / release engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 14 (Docs, Public-Readiness & Release) — Task 14.7 of 7 (LAST)

PRECONDITIONS
- Task 14.6 done: security/CORS finalized, go-public checklist complete, secret scan clean. release.yml was seeded in P0 (validates without publishing); both Dockerfiles exist (apps/api distroless, apps/web Next standalone); docs/RELEASES.md exists with the branch table + a pre-release seed row.

REQUIRED READING (only these — do not load more):
- docs/DEVELOPMENT_PLAN.md Appendix D (the release.yml row: OIDC + GHCR …-api/…-web, docker manifest inspect idempotency, metadata-action semver, update-releases-doc) + Appendix E (the first-tag item).
- docs/OVERVIEW.md § "18. Deployment Notes" (the two images) + § "19. Versioning & Release Tracking".
- The gold source (copy & adapt image names + build args): ~/Documents/MyApps/bymax-one/nest-auth-example/.github/workflows/release.yml — re-verify the current docker/metadata-action + build-push-action majors via context7/WebSearch (these actions move; pin the current major).

TASK
Finalize release.yml and cut the first v* tag. CI/release plumbing only — no application logic.

DELIVERABLES
1. `.github/workflows/release.yml`:
   ```yaml
   name: release
   on:
     push:
       tags: ['v*']
   permissions:
     contents: read
   concurrency:
     group: release-${{ github.ref }}
     cancel-in-progress: false
   jobs:
     build-and-push:
       runs-on: ubuntu-latest
       timeout-minutes: 30
       permissions:
         contents: read
         packages: write
         id-token: write
       strategy:
         matrix:
           image: [api, web]
       env:
         TAG: ${{ github.ref_name }}   # untrusted ref via env, never inlined into a script
       steps:
         - uses: actions/checkout@v5
         - uses: docker/login-action@<pin>       # ghcr.io, OIDC
         - id: meta
           uses: docker/metadata-action@<pin>    # semver tags from TAG
           with:
             images: ghcr.io/bymaxone/rust-auth-example-${{ matrix.image }}
         # idempotency: emit publish=false when this tag's manifest exists, else publish=true
         - id: check
           run: |
             if docker manifest inspect "ghcr.io/bymaxone/rust-auth-example-${{ matrix.image }}:${TAG}" >/dev/null 2>&1; then
               echo "exists, skipping"; echo "publish=false" >> "$GITHUB_OUTPUT"
             else
               echo "publish=true" >> "$GITHUB_OUTPUT"
             fi
         - uses: docker/build-push-action@<pin>
           if: steps.check.outputs.publish == 'true'
           with:
             context: .
             file: apps/${{ matrix.image }}/Dockerfile
             push: true
             tags: ${{ steps.meta.outputs.tags }}
     update-releases-doc:
       needs: build-and-push
       runs-on: ubuntu-latest
       permissions:
         contents: write
       steps:
         - uses: actions/checkout@v5
         # read the library version from apps/api/Cargo.toml, prepend a row to docs/RELEASES.md, commit via git-auto-commit-action
   ```
2. `docs/RELEASES.md` — confirm the tested-version log table is ready for the prepended row (lib-version from apps/api/Cargo.toml).
3. Cut the first tag: `git tag v0.1.0 && git push origin v0.1.0` (after the phase PR merges) and confirm release.yml produces both images + the RELEASES.md row.

Constraints:
- Least-privilege; OIDC id-token:write only on the publish job; pin all actions; timeout-minutes; untrusted refs ONLY via env. Idempotent (docker manifest inspect). English-only, timeless — NO Phase/Task references. git switch -c only.

Verification:
- `ls .github/workflows/release.yml` — expected: present.
- `grep -q 'docker manifest inspect' .github/workflows/release.yml && grep -q 'id-token: write' .github/workflows/release.yml` — expected: exit 0 (idempotency + OIDC).
- `grep -q 'rust-auth-example-api' .github/workflows/release.yml && grep -q 'rust-auth-example-web' .github/workflows/release.yml` — expected: exit 0 (both images).
- `gh run list --workflow release.yml --limit 1` — expected: the first tag's run succeeded; `gh api /orgs/bymaxone/packages/container/rust-auth-example-api/versions` lists the new tag.
- `grep -riE "phase [0-9]|task [0-9]" .github/workflows/release.yml` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `7 / 7` and Last updated.
4. Update the P14 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 14.7 ✅ <YYYY-MM-DD> — release.yml OIDC/GHCR + first v* tag`.
6. Commit `ci(release): OIDC GHCR images + cut first tag` (no Co-Authored-By).
(The LAST task also runs the PER-PHASE protocol: once the PR is merged and CI is green, set P14 Status ✅ / Progress 7 / 7 in docs/DEVELOPMENT_PLAN.md, set Active phase to `— (all phases complete)`, recompute Overall progress to `15 / 15 phases (100%)`, set this file's header Status ✅, and commit `docs(plan): P14 complete`.)
````

---

## Phase Completion Protocol

When **Task 14.7** is `✅` and every other task is `✅`:

1. Confirm all 7 tasks are `✅` and the P14 **Definition of Done** in [`DEVELOPMENT_PLAN.md § P14`](../DEVELOPMENT_PLAN.md#phase-14--docs-public-readiness--release)
   is met: every `docs/*.md` present + `markdown-link-check` clean; the Feature Coverage Matrix reconciles against both
   audits; CI fully green including `codeql` + `scorecard` + the security gates; the repo is ready to flip public; the
   first tag is cut and `release.yml` produces both images + records `RELEASES.md`.
2. Ensure the phase PR is **merged** to `main` with **CI green** (all required checks).
3. In [`DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md): set the **P14 Status** to `✅`, **Progress** `7 / 7`, **Last
   updated** today; set **Active phase** to `— (all phases complete)`; recompute **Overall progress** to
   `15 / 15 phases (100%)`.
4. Set this file's header **Status** to `✅` and **Progress** to `7 / 7 tasks`.
5. Commit `docs(plan): P14 complete` (no `Co-Authored-By`).

If any DoD bullet is unmet or CI is red, set P14 to `🟡 Partial`, not `✅`.

---

## Completion log

> Append-only. One line per completed task: `- <id> ✅ YYYY-MM-DD — <summary>`.

- 14.1 ✅ 2026-07-05 — getting-started + features + architecture docs
- 14.2 ✅ 2026-07-05 — environment/database/email/redis/mfa/oauth docs
- 14.3 ✅ 2026-07-05 — deployment/troubleshooting/releases docs
- 14.4 ✅ 2026-07-05 — README badge header + diagram + docs table
- 14.5 ✅ 2026-07-05 — export + public-api audits enforced (already required), docs-link-check job added, link-check clean
- 14.6 ✅ 2026-07-05 — security/CORS pass verified + go-public checklist complete (branch-protection prep in GO_PUBLIC.md)
- 14.7 🔄 2026-07-05 — release.yml finalized (OIDC/GHCR matrix, tag↔version guard, idempotent); first v\* tag + go-public flip deferred to a human trigger
