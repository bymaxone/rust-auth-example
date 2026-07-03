# Phase 10 — Dashboard Console

> **Status**: 🔄 In Progress · **Progress**: 4 / 7 tasks · **Last updated**: 2026-07-03
> **Source roadmap**: [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P10
> **Source spec**: [`docs/OVERVIEW.md`](../OVERVIEW.md)
> **Executing a task?** Read **only** that task's `### Task N.n` block + its bounded *REQUIRED READING* — never the whole file. See [token economy](README.md#token-economy--executing-a-single-task).

---

## Context

Phase 8 produced the Next.js console shell under the shared design system: `app/layout.tsx` + `providers.tsx` (Geist,
forced dark, the `AuthProvider` from `/react`), the 64px topbar / 250px sidebar app shell, the global controls (tenant
selector, delivery-mode indicator, the `useAuthStatus()` session badge) persisted via `nuqs`, the middleware WASM edge
verify, and the `lib/` client setup — `authClient` (`createAuthClient` from `/client`), `authFetch` (`createAuthFetch`),
and the `./shared` error-code localization map. Phase 9 layered the public, unauthenticated pages on top (login with the
MFA branch, register, the forgot/reset wizard, verify-email, mfa-challenge, accept-invitation) and shipped the reusable
`<OtpInput>` segmented 6-digit box. The backend surface those pages drive — the mounted `/auth/*` router, the
example-owned `/audit/*` and `/diagnostics/*` read APIs, OAuth, invitations, the platform domain, and the WebSocket
ticket — has been live since Phases 5–7.

This phase fills in the **authenticated daily-driver console** — the eight `/dashboard/*` surfaces a developer uses to
fire every library feature and watch it land. It builds the **Overview** auth-health page, the **Trigger Center**
playground (a card per feature, each calling `authClient.*` directly, showing the raw request/response, and auto-pivoting
the Audit table to the resulting row), **Security / MFA** (QR TOTP enrollment + verify-enable + disable/regen), the
**Sessions** device manager (table + revoke + log-out-everywhere + a live new-session toast over SSE), the **OAuth**
panel (Continue-with-Google + the `on_oauth_login` Create/Link decision trace), the **Invitations** admin views, and the
**Audit + Account/Diagnostics** surfaces (the virtualized hook-event table with an SSE follow-mode tail and the
no-secrets proof, plus the `me` card and the Diagnostics matrix). Every surface consumes the four `@bymax-one/rust-auth`
subpaths only — never a hand-rolled `fetch`.

When P10 is done, every backend feature is fireable from the Trigger Center and auto-pivots to its audit row; the
Sessions manager lists and revokes against the live API and pops a toast on a new device; the MFA enroll → challenge
round-trips; the OAuth panel renders the decision branch; the Audit Explorer searches, filters, tails live over SSE, and
renders the never-contains-secrets proof; the Diagnostics panel exercises the server-only primitives; `pnpm -C apps/web
build` succeeds and `pnpm -C apps/web test:cov` reports 100% on the new `lib/` + `hooks/` + `components/`. **This phase
delivers only the tenant-scoped `/dashboard/*` console — the tenant-less `/platform/*` admin console is P11, and the
public `(public)/auth/*` pages were P9.**

---

## Rules-of-phase

1. **Four subpaths only — never a hand-rolled `fetch`.** Use `authClient` (`/client`) for the journeys it exposes
   (`register`, `login`, `mfaChallenge`, `getMe`, `refresh`, `logout`, `forgotPassword`, `resetPassword`); use the
   shared `authFetch` (`createAuthFetch`, single-flight 401 → `/auth/refresh` → replay) for the MFA / sessions /
   invitations / audit / diagnostics endpoints `authClient` does not cover; use `useSession` / `useAuth` /
   `useAuthStatus` (`/react`) for session state. `apps/web` never talks to the API by hand.
2. **`/nextjs` is server/edge-only.** It carries `import "server-only"` — never import it into a client component. The
   token inspector decodes through a server route handler that imports `decodeJwtToken` / `verifyJwtToken` from
   `/nextjs`; the client posts the pasted JWT to that route.
3. **Design system, verbatim.** Compose `components/ui/*` — never re-style them. Forced dark + orange `#ff6224` glass;
   charts use rate / percentile series with colour **and** icon **and** label; **skeletons, not spinners**;
   action-oriented empty states ("No events yet — fire something in the Trigger Center").
4. **View state lives in the URL.** Filters, the selected audit row, the active tab, and follow-mode are persisted via
   `nuqs` so a reload and a shared link reproduce the view; the auto-pivot from a Trigger card sets the Audit filter
   through the same `nuqs` state.
5. **Realtime carries no JWT in the URL.** The "Connect realtime" affordance mints a `/auth/ws-ticket` and opens
   `wss://…?ticket=…`; the access JWT is never placed in a query string. The SSE tail uses the cookie session.
6. **No secrets client-side.** Never store a token/code in `localStorage` (HttpOnly cookies / in-memory only); the audit
   **no-secrets proof** is load-bearing — the detail drawer asserts the row carries no token, OTP, recovery code, or
   secret, and the recovery-code grid warns the codes are shown once.
7. **100% web coverage, memory-safe.** Every new `lib/**` + `hooks/**` + `components/**` file is covered to 100% on all
   metrics (Vitest, jsdom); `maxWorkers: '50%'` stays baked into the Vitest config; run suites sequentially in the main
   agent — **never fan out parallel test agents**.
8. **Timeless, English-only, conventional.** No `Phase N` / task / roadmap references in any committed source or config
   (doc-section refs like `OVERVIEW.md §15` are fine); English comments and identifiers; no `.gitkeep` / empty-dir
   scaffolding; `git switch -c` only (never `git checkout -b`); Conventional Commits with **no `Co-Authored-By` trailer**.

---

## Reference docs

- [`OVERVIEW.md`](../OVERVIEW.md) — §10 The Demo Domain & Auth Console (the route → library-call table + the console
  page table), §15 Auth Event Tracking & the Audit Domain (the `/audit/{logs,stream,aggregate}` read API + SSE
  follow-mode), §16 Demonstrated Journeys (4 rate-limit, 5 rotation, 8 OAuth, 11 sessions, 12 WebSocket, 15 invitations).
- [`DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) — § P10 (scope/DoD), §2 Global Conventions, §3 Autonomous Execution
  Model; Appendix B (P10 matrix rows 4, 5, 8, 10, 11, 12, 17, 19, 20, 24, 25, 28).
- [`DASHBOARD.md`](../DASHBOARD.md) — §5 The client layer (the four subpaths + `authClient`/`authFetch`/hooks), §6
  Auth-domain component catalog (OTP box, QR card, recovery grid, sessions table, audit table, diagnostics matrix, token
  inspector, error banner), §7 Page-by-page spec (the per-page job / backing / panels / states), §8 The SSE audit tail
  (follow-mode + `Last-Event-ID`), §9 Error & status localization.
- DOSSIER §1.8 — the npm `@bymax-one/rust-auth` surface (`/client`, `/react`, `/nextjs`, `/shared`) — exact method and
  type names.
- Sibling to copy-and-adapt: `~/Documents/MyApps/bymax-one/nest-auth-example/apps/web/` — the twin console (page
  structure, TanStack Table/Virtual wiring, the SSE hook, the Vitest setup).
- /bymax-workflow:standards — universal coding rules (apply the TypeScript track).

---

## Task index

| ID | Task | Status | Priority | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| 10.1 | Overview page — auth-health cards | ✅ Done | P0 | M | — |
| 10.2 | Trigger Center — fire-every-feature playground | ✅ Done | P0 | L | — |
| 10.3 | Security / MFA — TOTP enrollment lifecycle | ✅ Done | P0 | M | — |
| 10.4 | Sessions — device manager + live new-session toast | ✅ Done | P0 | M | — |
| 10.5 | OAuth panel — Continue with Google + decision trace | 📋 ToDo | P1 | M | — |
| 10.6 | Invitations — admin invite form + pending list | 📋 ToDo | P1 | S | — |
| 10.7 | Audit Explorer + Account / Diagnostics | 📋 ToDo | P1 | M | — |

---

## Tasks

### Task 10.1 — Overview page — auth-health cards

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Build the dashboard root (`/`) Overview page: auth-health cards (login / verify success rates, active-session count,
MFA-enrolled %, email-provider + OAuth status chips) sourced from the example-owned `GET /audit/aggregate` and gated by
`useSession`.

#### Acceptance criteria

- [x] `lib/audit-aggregate.ts` fetches `GET /audit/aggregate` via the shared `authFetch` and returns a typed
  `AuditAggregate`; no hand-rolled `fetch`.
- [x] The Overview page renders, from the aggregate: a login success-rate card, a verify success-rate card, an
  active-session count, an MFA-enrolled %, and an email-provider + OAuth-status chip row, plus a recent-events strip that
  links the Audit tail.
- [x] States are honoured: **skeleton cards** while loading, a "Sign in to populate" state when
  `useSession().status === 'unauthenticated'`, and a per-card error with a retry affordance.
- [x] All values render with colour **and** icon **and** label (no colour-only encoding); composes `components/ui/*`
  verbatim.
- [x] 100% Vitest coverage on the new `lib/` + `components/`.

#### Files to create / modify

- `apps/web/lib/audit-aggregate.ts`
- `apps/web/app/(dashboard)/page.tsx`
- `apps/web/components/overview/HealthCard.tsx`
- `apps/web/components/overview/ProviderChips.tsx`
- `apps/web/lib/audit-aggregate.test.ts`, `apps/web/components/overview/HealthCard.test.tsx`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 10 (Dashboard Console) — Task 10.1 of 7 (FIRST)

PRECONDITIONS
- P8 shipped the console shell: app/layout.tsx + providers.tsx (AuthProvider from /react), the topbar/sidebar, the tenant selector, and lib/auth-fetch.ts exporting the shared `authFetch` (createAuthFetch — single-flight 401 → /auth/refresh → replay) + lib/auth-client.ts exporting `authClient`.
- P9 shipped the public auth pages; a real session can be obtained against the live stack.
- The example-owned `GET /audit/aggregate` endpoint exists (P5) and returns the auth-health counters.

REQUIRED READING (only these — do not load more):
- docs/DASHBOARD.md § "7. Page-by-page spec" → the `/` — Overview block (job, backing `GET /audit/aggregate` + useSession, panels, states) and § "5. The client layer" (the authFetch/useSession contract).
- docs/OVERVIEW.md § "10. The Demo Domain & Auth Console" (the console page table).
- The sibling to copy-and-adapt: ~/Documents/MyApps/bymax-one/nest-auth-example/apps/web/ (a health/overview page + its Vitest setup).

TASK
Build the dashboard root Overview page (route "/") with auth-health cards fed by `GET /audit/aggregate` and gated by useSession; ship its data module, components, and 100% tests.

DELIVERABLES
1. `apps/web/lib/audit-aggregate.ts`:
   - the typed fetch wrapper over the shared authFetch.
   ```ts
   import { authFetch } from './auth-fetch'

   /** Auth-health counters served by the example-owned `GET /audit/aggregate`. */
   export interface AuditAggregate {
     readonly loginSuccessRate: number // 0..1 over the window
     readonly verifySuccessRate: number // 0..1 over the window
     readonly activeSessions: number
     readonly mfaEnrolledPct: number // 0..1
     readonly emailProvider: 'mailpit' | 'resend'
     readonly oauthGoogleEnabled: boolean
   }

   /** Fetch the auth-health aggregate. Throws AuthClientError on a non-2xx response. */
   export async function fetchAuditAggregate(): Promise<AuditAggregate> {
     const res = await authFetch('/audit/aggregate')
     return (await res.json()) as AuditAggregate
   }
   ```
2. `apps/web/app/(dashboard)/page.tsx` — a client component using `useSession()` from '@bymax-one/rust-auth/react': when `status === 'unauthenticated'` render the "Sign in to populate" empty state; while loading render skeleton cards; otherwise call `fetchAuditAggregate()` and render the HealthCard grid + ProviderChips + a recent-events strip linking `/dashboard/audit`.
3. `apps/web/components/overview/HealthCard.tsx` + `ProviderChips.tsx` — compose `components/ui/Card`/`Badge`; each metric shows colour + icon + label; rates render as percentages.
4. `apps/web/lib/audit-aggregate.test.ts` + `components/overview/HealthCard.test.tsx` — cover the happy path, the error path, and the unauthenticated/loading/empty states; each `it()` names the rule it protects.

Constraints:
- No hand-rolled fetch — only authFetch + the /react hooks. /nextjs is server-only; never import it in a client component.
- Compose components/ui/* verbatim — never re-style. Skeletons, not spinners. English-only, TIMELESS comments — NO Phase/Task/roadmap references in committed source. No .gitkeep. git switch -c only.

Verification:
- `pnpm -C apps/web typecheck` — expected: 0 errors.
- `pnpm -C apps/web lint` — expected: 0 warnings.
- `pnpm -C apps/web test:cov` — expected: green; lib/audit-aggregate.ts + the new components at 100% lines/branches/functions.
- `pnpm -C apps/web build` — expected: succeeds (resolves the file:-linked @bymax-one/rust-auth).
- `pnpm audit:exports` — expected: every consumed npm export referenced.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `1 / 7` and Last updated.
4. Update the P10 row Progress in docs/DEVELOPMENT_PLAN.md to `1 / 7`.
5. Append to ## Completion log: `- 10.1 ✅ <YYYY-MM-DD> — Overview auth-health cards`.
6. Commit `feat(web): dashboard overview auth-health cards` (no Co-Authored-By).
````

---

### Task 10.2 — Trigger Center — fire-every-feature playground

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: L
- **Depends on**: —

#### Description

Build the Trigger Center (`/dashboard/trigger`): a card per feature (register · login · force MFA · rotate token ·
hammer login → 429 · force lockout · provoke each `auth.*` error · dispatch verify-email/reset) that calls `authClient.*`
directly, renders the raw request + response JSON, and auto-pivots the Audit table to the resulting row via shared `nuqs`
state.

#### Acceptance criteria

- [x] `lib/trigger-actions.ts` wraps each action over `authClient` (and `authFetch` for `/diagnostics/force-lockout`),
  returning a `TriggerResult { request, response, code?, status?, retryAfterSeconds? }`; an `AuthClientError` is caught
  and surfaced (never thrown to the boundary).
- [x] The "hammer login" card fires logins back-to-back to exceed `RateLimitConfig.login` (5/60) and renders the
  resulting `429 auth.too_many_requests` with its `Retry-After` countdown.
- [x] There is a card for register, login, force-MFA, rotate token (`authClient.refresh`), force lockout, dispatch
  verify-email/reset, and a "provoke error" card that can elicit each `auth.*` code in scope; every card shows the raw
  request and response JSON.
- [x] Firing a card auto-pivots the Audit table: the resulting actor/event is written to the shared `nuqs` URL state the
  Audit Explorer reads.
- [x] 100% Vitest coverage on the new `lib/` + `components/`.

#### Files to create / modify

- `apps/web/lib/trigger-actions.ts`
- `apps/web/lib/audit-pivot.ts`
- `apps/web/app/(dashboard)/dashboard/trigger/page.tsx`
- `apps/web/components/trigger/TriggerCard.tsx`
- `apps/web/lib/trigger-actions.test.ts`, `apps/web/components/trigger/TriggerCard.test.tsx`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 10 (Dashboard Console) — Task 10.2 of 7 (MIDDLE)

PRECONDITIONS
- P8 shipped lib/auth-client.ts (`authClient` exposing register/login/mfaChallenge/getMe/refresh/logout/forgotPassword/resetPassword) + lib/auth-fetch.ts (`authFetch`) + the ./shared error localization map.
- The mounted /auth/* router enforces RateLimitConfig (login 5/60 → 429 auth.too_many_requests with Retry-After) and the example-owned `GET /diagnostics/force-lockout` exists (P5/P7).

REQUIRED READING (only these — do not load more):
- docs/DASHBOARD.md § "7. Page-by-page spec" → the `/dashboard/trigger` — Trigger Center block (job, backing every authClient.* call + diagnostics/force-lockout + the hammer-login, the per-card raw request+response + auto-pivot, states).
- docs/OVERVIEW.md § "16. Demonstrated Journeys" (journeys 3 lockout, 4 rate-limit, 5 rotation) and § "9 / 11" error model.
- DOSSIER §1.8 → /client `authClient` method list + /shared `AuthClientError` ({ status, code, body }) and `AUTH_ERROR_CODES`.
- The sibling: ~/Documents/MyApps/bymax-one/nest-auth-example/apps/web/ (a playground/trigger surface, if present).

TASK
Build the Trigger Center page: a card per feature calling authClient.* directly, each showing the raw request/response and auto-pivoting the Audit table; ship the action module, the pivot state, the components, and 100% tests.

DELIVERABLES
1. `apps/web/lib/trigger-actions.ts`:
   - one async wrapper per action; AuthClientError caught into the result shape.
   ```ts
   import { authClient } from './auth-client'
   import { authFetch } from './auth-fetch'
   import { AuthClientError } from '@bymax-one/rust-auth/shared'

   export interface TriggerResult {
     readonly request: unknown
     readonly response: unknown
     readonly code?: string // AuthClientError.code (an AUTH_ERROR_CODES member) when it failed
     readonly status?: number
     readonly retryAfterSeconds?: number
   }

   /** Fire `attempts` logins back-to-back to trip RateLimitConfig.login (5/60) → 429 auth.too_many_requests. */
   export async function hammerLogin(
     email: string,
     password: string,
     tenantId: string,
     attempts = 7,
   ): Promise<TriggerResult> {
     const request = { email, tenantId, attempts }
     for (let i = 0; i < attempts; i += 1) {
       try {
         await authClient.login({ email, password, tenantId })
       } catch (err) {
         if (err instanceof AuthClientError && err.status === 429) {
           const retryAfterSeconds = Number(
             (err.body as { error?: { details?: { retryAfterSeconds?: number } } })?.error?.details?.retryAfterSeconds,
           )
           return { request, response: err.toJSON(), code: err.code, status: err.status, retryAfterSeconds }
         }
       }
     }
     return { request, response: 'no 429 within attempts', status: 200 }
   }
   ```
2. `apps/web/lib/audit-pivot.ts` — a `useAuditPivot()` hook backed by `nuqs` (`useQueryState('actor')` / `'event'`) exposing `pivotTo({ actor, event })`; the Audit Explorer (10.7) reads the same keys.
3. `apps/web/app/(dashboard)/dashboard/trigger/page.tsx` — the card grid (register, login, force MFA, rotate token via `authClient.refresh`, hammer login, force lockout via `authFetch('/diagnostics/force-lockout')`, dispatch verify-email/reset, provoke each auth.* error). Each card calls a trigger-actions wrapper and calls `pivotTo(...)` on success.
4. `apps/web/components/trigger/TriggerCard.tsx` — renders the action button, the raw request JSON, the raw response JSON (mono), and the 429 Retry-After countdown when `retryAfterSeconds` is present.
5. Tests: `lib/trigger-actions.test.ts` (happy path + the 429 hammer path + a provoked auth.* error) + `components/trigger/TriggerCard.test.tsx`; each `it()` names the rule it protects.

Constraints:
- Only authClient + authFetch + /react hooks — no hand-rolled fetch. /nextjs is server-only.
- Compose components/ui/* verbatim. Mono font for raw JSON. English-only TIMELESS comments — NO Phase/Task references in committed source. No .gitkeep. git switch -c only.

Verification:
- `pnpm -C apps/web typecheck` — expected: 0 errors.
- `pnpm -C apps/web lint` — expected: 0 warnings.
- `pnpm -C apps/web test:cov` — expected: green; trigger-actions.ts + audit-pivot.ts + TriggerCard.tsx at 100%.
- `pnpm -C apps/web build` — expected: succeeds.
- `pnpm audit:exports` — expected: AuthClientError / authClient methods all referenced.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `2 / 7` and Last updated.
4. Update the P10 row Progress in docs/DEVELOPMENT_PLAN.md to `2 / 7`.
5. Append to ## Completion log: `- 10.2 ✅ <YYYY-MM-DD> — Trigger Center playground`.
6. Commit `feat(web): trigger center fire-every-feature playground` (no Co-Authored-By).
````

---

### Task 10.3 — Security / MFA — TOTP enrollment lifecycle

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Build the Security / MFA page (`/dashboard/security`): a QR enrollment card (`qrCodeUri` + base32 `secret` + a
recovery-code grid), a verify-enable OTP step, and disable / regenerate actions — each gated by a fresh TOTP — plus the
AEAD-sealed-secret explainer.

#### Acceptance criteria

- [x] `lib/mfa-api.ts` wraps `POST /auth/mfa/setup` (→ `MfaSetupResult { secret, qrCodeUri, recoveryCodes }`),
  `POST /auth/mfa/verify-enable` (`{ code }`), `POST /auth/mfa/disable` (`{ code }`), and `POST /auth/mfa/recovery-codes`
  (`{ code }` → new codes) over the shared `authFetch`.
- [x] The QR enrollment card renders the `otpauth://` QR from `qrCodeUri`, the copyable mono base32 `secret`, and the
  recovery-code grid (warned "shown once", with a download/copied affordance).
- [x] Verify-enable reuses the `<OtpInput>` 6-digit box; disable and regenerate each require a fresh 6-digit TOTP and use
  a destructive-confirm on disable.
- [x] A "2FA not enabled — enable it" empty state is shown when MFA is off; an "AEAD-sealed secret" explainer is present.
- [x] 100% Vitest coverage on the new `lib/` + `components/`.

#### Files to create / modify

- `apps/web/lib/mfa-api.ts`
- `apps/web/app/(dashboard)/dashboard/security/page.tsx`
- `apps/web/components/mfa/QrEnrollmentCard.tsx`, `apps/web/components/mfa/RecoveryCodeGrid.tsx`
- `apps/web/lib/mfa-api.test.ts`, `apps/web/components/mfa/QrEnrollmentCard.test.tsx`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 10 (Dashboard Console) — Task 10.3 of 7 (MIDDLE)

PRECONDITIONS
- P8 shipped lib/auth-fetch.ts (`authFetch`). P9 shipped the reusable `<OtpInput>` segmented 6-digit box (autocomplete="one-time-code", inputmode="numeric").
- The mounted /auth/mfa/{setup,verify-enable,disable,recovery-codes} routes exist (P5). The mfa/setup body is a camelCase MfaSetupResult; verify-enable/disable/recovery-codes accept a 6-digit `code`.

REQUIRED READING (only these — do not load more):
- docs/DASHBOARD.md § "7. Page-by-page spec" → the `/dashboard/security` — Security / MFA block + § "6. Auth-domain component catalog" → the OTP input, QR enrollment card, and recovery-code grid rows.
- docs/OVERVIEW.md § "16. Demonstrated Journeys" (journey 2, Login with MFA) and § "11" stage 2 (the AEAD-sealed TOTP secret, ±2-step drift).
- DOSSIER §1.4 → MfaService result `MfaSetupResult{secret, qr_code_uri, recovery_codes}` (wire camelCase) + §1.6 MfaVerifyDto/MfaDisableDto/MfaRegenerateRecoveryCodesDto ({ code, len 6 }).
- The sibling: ~/Documents/MyApps/bymax-one/nest-auth-example/apps/web/ (its MFA/security page + QR render).

TASK
Build the Security / MFA page: QR enrollment + verify-enable + disable/regenerate (each gated by a fresh TOTP) + the AEAD explainer; ship the api module, the components, and 100% tests.

DELIVERABLES
1. `apps/web/lib/mfa-api.ts`:
   ```ts
   import { authFetch } from './auth-fetch'

   /** Wire shape (camelCase) of the `POST /auth/mfa/setup` body. */
   export interface MfaSetupResult {
     readonly secret: string // base32, shown once
     readonly qrCodeUri: string // otpauth://totp/...
     readonly recoveryCodes: readonly string[]
   }

   export async function mfaSetup(): Promise<MfaSetupResult> {
     const res = await authFetch('/auth/mfa/setup', { method: 'POST' })
     return (await res.json()) as MfaSetupResult
   }

   /** Enable MFA with the first valid TOTP. 204 on success. */
   export async function mfaVerifyEnable(code: string): Promise<void> {
     await authFetch('/auth/mfa/verify-enable', { method: 'POST', body: JSON.stringify({ code }) })
   }

   export async function mfaDisable(code: string): Promise<void> {
     await authFetch('/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ code }) })
   }

   /** Regenerate one-time recovery codes (gated by a fresh TOTP). Returns the new codes. */
   export async function mfaRegenerateRecoveryCodes(code: string): Promise<readonly string[]> {
     const res = await authFetch('/auth/mfa/recovery-codes', { method: 'POST', body: JSON.stringify({ code }) })
     return ((await res.json()) as { recoveryCodes: string[] }).recoveryCodes
   }
   ```
2. `apps/web/components/mfa/QrEnrollmentCard.tsx` — renders the QR (from `qrCodeUri`), the copyable mono `secret`, and `<RecoveryCodeGrid>`; composes components/ui/Card.
3. `apps/web/components/mfa/RecoveryCodeGrid.tsx` — a 2-col mono grid + a download/copied affordance + the "shown once" warning.
4. `apps/web/app/(dashboard)/dashboard/security/page.tsx` — the lifecycle: setup → `<OtpInput>` verify-enable → enabled view with disable (destructive-confirm) + regenerate (each a fresh TOTP); the "2FA not enabled" empty state; the AEAD-sealed-secret explainer copy.
5. Tests: `lib/mfa-api.test.ts` + `components/mfa/QrEnrollmentCard.test.tsx`; each `it()` names the rule it protects (incl. the "codes shown once" warning and the disable-confirm).

Constraints:
- Only authFetch + /react hooks + the P9 `<OtpInput>` — no hand-rolled fetch. /nextjs is server-only.
- Never persist the secret/recovery codes anywhere client-side beyond the in-memory render; warn they are shown once. Compose components/ui/* verbatim. English-only TIMELESS comments — NO Phase/Task references in committed source. No .gitkeep. git switch -c only.

Verification:
- `pnpm -C apps/web typecheck` — expected: 0 errors.
- `pnpm -C apps/web lint` — expected: 0 warnings.
- `pnpm -C apps/web test:cov` — expected: green; mfa-api.ts + the MFA components at 100%.
- `pnpm -C apps/web build` — expected: succeeds.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `3 / 7` and Last updated.
4. Update the P10 row Progress in docs/DEVELOPMENT_PLAN.md to `3 / 7`.
5. Append to ## Completion log: `- 10.3 ✅ <YYYY-MM-DD> — Security/MFA enrollment lifecycle`.
6. Commit `feat(web): security mfa totp enrollment lifecycle` (no Co-Authored-By).
````

---

### Task 10.4 — Sessions — device manager + live new-session toast

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Build the Sessions device manager (`/dashboard/sessions`): the sessions table (device / ip / lastActivity / isCurrent),
per-row revoke, "log out everywhere else", and a live new-session alert toast driven by the SSE `on_new_session` event.

#### Acceptance criteria

- [x] `lib/sessions-api.ts` wraps `GET /auth/sessions` (→ `SessionInfo[]`), `DELETE /auth/sessions/{id}`, and
  `DELETE /auth/sessions/all` over the shared `authFetch`.
- [x] The sessions table renders device / ip / lastActivity / an **isCurrent** badge / a revoke action; the current row
  is pinned and glow-bordered; revoke is optimistic with rollback on error.
- [x] A "log out everywhere else" action calls `/auth/sessions/all`; an "Only this device" empty state is shown when no
  other sessions exist.
- [x] `hooks/use-new-session-alerts.ts` subscribes to the realtime tail (a ticketed WebSocket — the JWT never in the
  URL), filters `event === 'on_new_session'`, and surfaces a toast + triggers a sessions refetch.
- [x] 100% Vitest coverage on the new `lib/` + `hooks/` + `components/`.

#### Files to create / modify

- `apps/web/lib/sessions-api.ts`
- `apps/web/hooks/use-new-session-alerts.ts`
- `apps/web/app/(dashboard)/dashboard/sessions/page.tsx`
- `apps/web/components/sessions/SessionsTable.tsx`
- `apps/web/lib/sessions-api.test.ts`, `apps/web/hooks/use-new-session-alerts.test.ts`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 10 (Dashboard Console) — Task 10.4 of 7 (MIDDLE)

PRECONDITIONS
- P8 shipped lib/auth-fetch.ts (`authFetch`) + a toast primitive in components/ui/*.
- The mounted /auth/sessions routes exist (P5/P7): GET /auth/sessions (Vec<SessionInfo>), DELETE /auth/sessions/{id}, DELETE /auth/sessions/all. The example-owned `GET /audit/stream` SSE emits `on_new_session` events (P5).

REQUIRED READING (only these — do not load more):
- docs/DASHBOARD.md § "7. Page-by-page spec" → the `/dashboard/sessions` — Sessions block + § "6. Auth-domain component catalog" → the sessions-table row + § "8. Real-time — the SSE audit tail" (the new-session toast is the same stream).
- docs/OVERVIEW.md § "16. Demonstrated Journeys" (journey 11, Session device manager) and § "15" (the on_new_session hook).
- DOSSIER §1.4 → adapter `list_user_sessions`/`revoke_user_session`/`revoke_other_user_sessions` semantics.
- The sibling: ~/Documents/MyApps/bymax-one/nest-auth-example/apps/web/ (its sessions table + SSE/EventSource hook).

TASK
Build the Sessions device manager + the live new-session toast; ship the api module, the SSE hook, the table component, and 100% tests.

DELIVERABLES
1. `apps/web/lib/sessions-api.ts`:
   ```ts
   import { authFetch } from './auth-fetch'

   /** A device session as returned by `GET /auth/sessions`. */
   export interface SessionInfo {
     readonly id: string
     readonly device: string
     readonly ip: string
     readonly lastActivity: string // ISO-8601
     readonly isCurrent: boolean
   }

   export async function listSessions(): Promise<SessionInfo[]> {
     const res = await authFetch('/auth/sessions')
     return (await res.json()) as SessionInfo[]
   }

   /** Revoke one session by id. 204 on success. */
   export async function revokeSession(id: string): Promise<void> {
     await authFetch(`/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
   }

   /** Log out every other device. 204 on success. */
   export async function revokeAllOtherSessions(): Promise<void> {
     await authFetch('/auth/sessions/all', { method: 'DELETE' })
   }
   ```
2. `apps/web/hooks/use-new-session-alerts.ts`:
   ```ts
   'use client'
   import { useEffect } from 'react'

   /** Tail `GET /audit/stream`; on an `on_new_session` event fire a toast + refetch the sessions list. */
   export function useNewSessionAlerts(onAlert: (ip: string) => void): void {
     useEffect(() => {
       const url = `${process.env.NEXT_PUBLIC_API_URL}/audit/stream`
       const source = new EventSource(url, { withCredentials: true })
       const handler = (ev: MessageEvent<string>): void => {
         const row = JSON.parse(ev.data) as { event: string; ip: string }
         if (row.event === 'on_new_session') onAlert(row.ip)
       }
       source.addEventListener('message', handler)
       return () => source.close()
     }, [onAlert])
   }
   ```
3. `apps/web/components/sessions/SessionsTable.tsx` — composes components/ui/Table + Badge; pins the current row (glow border); per-row revoke (optimistic + rollback).
4. `apps/web/app/(dashboard)/dashboard/sessions/page.tsx` — loads listSessions, wires `useNewSessionAlerts` (toast + refetch), the "log out everywhere else" action, the "Only this device" empty state.
5. Tests: `lib/sessions-api.test.ts` + `hooks/use-new-session-alerts.test.ts` (mock EventSource; assert the on_new_session filter + the toast); each `it()` names the rule it protects.

Constraints:
- Only authFetch + /react hooks + EventSource — no hand-rolled fetch for the REST calls. /nextjs is server-only. Realtime carries no JWT in the URL (SSE uses the cookie session; a ws-ticket would be minted separately).
- Compose components/ui/* verbatim. English-only TIMELESS comments — NO Phase/Task references in committed source. No .gitkeep. git switch -c only.

Verification:
- `pnpm -C apps/web typecheck` — expected: 0 errors.
- `pnpm -C apps/web lint` — expected: 0 warnings.
- `pnpm -C apps/web test:cov` — expected: green; sessions-api.ts + use-new-session-alerts.ts + SessionsTable.tsx at 100%.
- `pnpm -C apps/web build` — expected: succeeds.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `4 / 7` and Last updated.
4. Update the P10 row Progress in docs/DEVELOPMENT_PLAN.md to `4 / 7`.
5. Append to ## Completion log: `- 10.4 ✅ <YYYY-MM-DD> — Sessions device manager + new-session toast`.
6. Commit `feat(web): sessions device manager with live new-session toast` (no Co-Authored-By).
````

---

### Task 10.5 — OAuth panel — Continue with Google + decision trace

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: M
- **Depends on**: —

#### Description

Build the OAuth panel (`/dashboard/oauth`): a "Continue with Google" button (gated by
`NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED`), the `on_oauth_login` Create-vs-Link decision trace, and the resulting branch
(session / redirect / MFA challenge).

#### Acceptance criteria

- [ ] "Continue with Google" navigates to `GET /auth/oauth/google` (a 302 to Google's authorize URL) and is hidden
  unless `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED === 'true'`; a "Google OAuth not configured" explainer is shown when disabled.
- [ ] After the callback, the panel renders the `on_oauth_login` decision (Created a new user vs Linked to an existing
  one) and which branch fired (authenticated session / redirect / MFA challenge).
- [ ] The callback-error path renders the localized `auth.*` code via the shared error map.
- [ ] 100% Vitest coverage on the new `lib/` + `components/`.

#### Files to create / modify

- `apps/web/lib/oauth.ts`
- `apps/web/app/(dashboard)/dashboard/oauth/page.tsx`
- `apps/web/components/oauth/DecisionTrace.tsx`
- `apps/web/lib/oauth.test.ts`, `apps/web/components/oauth/DecisionTrace.test.tsx`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 10 (Dashboard Console) — Task 10.5 of 7 (MIDDLE)

PRECONDITIONS
- P8 shipped the ./shared error localization map; P6 wired the Google OAuth flow: GET /auth/oauth/google (302 → authorize_url, PKCE+state) and GET /auth/oauth/google/callback. The `on_oauth_login` policy Creates an unseen verified email and Links a matching one (it defaults to a secure DENY; the example supplies the concrete policy).
- NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED gates whether Google is configured in this environment.

REQUIRED READING (only these — do not load more):
- docs/DASHBOARD.md § "7. Page-by-page spec" → the `/dashboard/oauth` — OAuth block (Continue with Google gated by NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED, the decision trace, the disabled explainer).
- docs/OVERVIEW.md § "16. Demonstrated Journeys" (journey 8, OAuth sign-in) and § "15" (the on_oauth_login Create/Link/Reject decision hook).
- DOSSIER §1.4 → OAuth orchestration (`oauth_initiate`/`oauth_callback`, `OAuthOutcome { Authenticated, MfaChallenge }`).
- The sibling: ~/Documents/MyApps/bymax-one/nest-auth-example/apps/web/ (its OAuth panel, if present).

TASK
Build the OAuth panel: the gated Continue-with-Google button + the on_oauth_login Create/Link decision trace + the resulting branch; ship the helper, the components, and 100% tests.

DELIVERABLES
1. `apps/web/lib/oauth.ts`:
   ```ts
   /** True when Google OAuth is configured in this environment. */
   export function isGoogleOAuthEnabled(): boolean {
     return process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED === 'true'
   }

   /** The browser entry point: a full navigation to the 302 initiate route (PKCE+state are minted server-side). */
   export function googleInitiateUrl(tenantId: string): string {
     const base = process.env.NEXT_PUBLIC_API_URL ?? ''
     return `${base}/auth/oauth/google?tenantId=${encodeURIComponent(tenantId)}`
   }

   /** The Create-vs-Link decision the callback reports back to the panel. */
   export type OAuthDecision = 'created' | 'linked'
   export interface OAuthCallbackTrace {
     readonly decision: OAuthDecision
     readonly branch: 'authenticated' | 'redirect' | 'mfa_challenge'
   }
   ```
2. `apps/web/components/oauth/DecisionTrace.tsx` — renders the decision (Created vs Linked) + the branch that fired; composes components/ui/Card/Badge.
3. `apps/web/app/(dashboard)/dashboard/oauth/page.tsx` — when `isGoogleOAuthEnabled()` render the button (navigates to `googleInitiateUrl(tenantId)`), else the "Google OAuth not configured" explainer; after the callback render `<DecisionTrace>` or the localized error code.
4. Tests: `lib/oauth.test.ts` (enabled/disabled + the initiate URL) + `components/oauth/DecisionTrace.test.tsx` (both decisions + each branch); each `it()` names the rule it protects.

Constraints:
- Read NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED only via the helper. Errors localize through ./shared (never a raw code shown alone). /nextjs is server-only.
- Compose components/ui/* verbatim. English-only TIMELESS comments — NO Phase/Task references in committed source. No .gitkeep. git switch -c only.

Verification:
- `pnpm -C apps/web typecheck` — expected: 0 errors.
- `pnpm -C apps/web lint` — expected: 0 warnings.
- `pnpm -C apps/web test:cov` — expected: green; oauth.ts + DecisionTrace.tsx at 100%.
- `pnpm -C apps/web build` — expected: succeeds.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `5 / 7` and Last updated.
4. Update the P10 row Progress in docs/DEVELOPMENT_PLAN.md to `5 / 7`.
5. Append to ## Completion log: `- 10.5 ✅ <YYYY-MM-DD> — OAuth panel + decision trace`.
6. Commit `feat(web): oauth panel continue-with-google + decision trace` (no Co-Authored-By).
````

---

### Task 10.6 — Invitations — admin invite form + pending list

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: S
- **Depends on**: —

#### Description

Build the Invitations admin views (`/dashboard/invitations`): the invite form (email + role) posting to
`POST /auth/invitations`, and the pending-invites list — each row linking the Mailpit message.

#### Acceptance criteria

- [ ] `lib/invitations-api.ts` wraps `POST /auth/invitations` with a `CreateInvitationInput { email, role, tenantName? }`
  (note: **no** `tenantId` field — the route derives the tenant from the caller's claims) over the shared `authFetch`.
- [ ] The invite form validates email + role and shows a success/error result; a "No pending invites" empty state and
  the expired/invalid-token path are honoured.
- [ ] The pending-invites list is sourced from the example-owned `GET /audit/logs?event=…` (invitation-created events)
  and each row links the Mailpit message (`http://localhost:8025`).
- [ ] 100% Vitest coverage on the new `lib/` + `components/`.

#### Files to create / modify

- `apps/web/lib/invitations-api.ts`
- `apps/web/app/(dashboard)/dashboard/invitations/page.tsx`
- `apps/web/components/invitations/InviteForm.tsx`, `apps/web/components/invitations/PendingList.tsx`
- `apps/web/lib/invitations-api.test.ts`, `apps/web/components/invitations/InviteForm.test.tsx`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 10 (Dashboard Console) — Task 10.6 of 7 (MIDDLE)

PRECONDITIONS
- P8 shipped lib/auth-fetch.ts (`authFetch`). P6 wired POST /auth/invitations (AuthUser-guarded, CreateInvitationDto { email, role, tenantName? } — NO tenantId, it comes from the caller's claims) + the send_invitation email to Mailpit.
- The accept screen (name + password) was built in P9; this task is the admin side only.
- The example-owned `GET /audit/logs?event=…` keyset read API exists (P5).

REQUIRED READING (only these — do not load more):
- docs/DASHBOARD.md § "7. Page-by-page spec" → the `/dashboard/invitations` — Invitations block (the admin invite form + the pending-invites list linking the Mailpit message, states).
- docs/OVERVIEW.md § "16. Demonstrated Journeys" (journey 15, Invitations).
- DOSSIER §1.6 → CreateInvitationDto { email, role, tenantName? } (no tenant_id) + the POST /auth/invitations route (204, AuthUser).
- The sibling: ~/Documents/MyApps/bymax-one/nest-auth-example/apps/web/ (its invitations admin views).

TASK
Build the Invitations admin views: the invite form + the pending-invites list (Mailpit links); ship the api module, the components, and 100% tests.

DELIVERABLES
1. `apps/web/lib/invitations-api.ts`:
   ```ts
   import { authFetch } from './auth-fetch'

   /** Mirrors CreateInvitationDto — note there is NO tenantId (it is taken from the caller's claims). */
   export interface CreateInvitationInput {
     readonly email: string
     readonly role: string
     readonly tenantName?: string
   }

   /** Send a team invitation. 204 on success. */
   export async function createInvitation(input: CreateInvitationInput): Promise<void> {
     await authFetch('/auth/invitations', { method: 'POST', body: JSON.stringify(input) })
   }
   ```
2. `apps/web/components/invitations/InviteForm.tsx` — email + role fields, validation, success/error result; composes components/ui/Form/Input/Select.
3. `apps/web/components/invitations/PendingList.tsx` — reads `GET /audit/logs?event=…` (invitation-created) via authFetch; each row links `http://localhost:8025` (the Mailpit message); the "No pending invites" empty state.
4. `apps/web/app/(dashboard)/dashboard/invitations/page.tsx` — composes the form + the list.
5. Tests: `lib/invitations-api.test.ts` (asserts the body has no tenantId) + `components/invitations/InviteForm.test.tsx`; each `it()` names the rule it protects.

Constraints:
- Only authFetch — no hand-rolled fetch. The invite body MUST NOT include tenantId. /nextjs is server-only.
- Compose components/ui/* verbatim. English-only TIMELESS comments — NO Phase/Task references in committed source. No .gitkeep. git switch -c only.

Verification:
- `pnpm -C apps/web typecheck` — expected: 0 errors.
- `pnpm -C apps/web lint` — expected: 0 warnings.
- `pnpm -C apps/web test:cov` — expected: green; invitations-api.ts + InviteForm.tsx + PendingList.tsx at 100%.
- `pnpm -C apps/web build` — expected: succeeds.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `6 / 7` and Last updated.
4. Update the P10 row Progress in docs/DEVELOPMENT_PLAN.md to `6 / 7`.
5. Append to ## Completion log: `- 10.6 ✅ <YYYY-MM-DD> — Invitations admin views`.
6. Commit `feat(web): invitations admin invite form + pending list` (no Co-Authored-By).
````

---

### Task 10.7 — Audit Explorer + Account / Diagnostics

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: M
- **Depends on**: —

#### Description

Build the Audit Explorer (`/dashboard/audit`): the virtualized hook-event table with a keyset-paginated `GET /audit/logs`
feed, an SSE live tail with follow-mode, and the no-secrets proof; and the Account page (`/dashboard/account`): the `me`
card plus the Diagnostics matrix (hash-strength · lockout · hook log · token inspector). This is the LAST task — run the
per-phase completion protocol.

#### Acceptance criteria

- [ ] `lib/audit-api.ts` fetches `GET /audit/logs?cursor&actor&event&tenantId&limit` → `{ data, nextCursor, hasMore }`
  over the shared `authFetch`; `hooks/use-audit-tail.ts` tails `GET /audit/stream` (SSE) with follow-mode (pin-to-bottom;
  scroll-up pauses with an "N new — jump to latest" pill) and resumes via the browser's native `Last-Event-ID`.
- [ ] The audit table is virtualized (TanStack Virtual), faceted (actor / event / tenant — read from the same `nuqs`
  state the Trigger Center pivots to), and the detail drawer renders the **never-contains-secrets** proof (asserts no
  token / OTP / recovery code / secret in the row).
- [ ] The Account page renders the `me` card (`useSession` / `getMe`) and the Diagnostics matrix calling
  `POST /diagnostics/hash-strength`, `POST /diagnostics/force-lockout`, and `GET /diagnostics/hooks`.
- [ ] The token inspector decodes a pasted JWT through a **server route handler** that imports `decodeJwtToken` /
  `verifyJwtToken` from `@bymax-one/rust-auth/nextjs` (server-only) and demonstrates a forged `alg:none` being rejected;
  no client component imports `/nextjs`.
- [ ] 100% Vitest coverage on all new `lib/` + `hooks/` + `components/`; the per-phase completion protocol is executed.

#### Files to create / modify

- `apps/web/lib/audit-api.ts`, `apps/web/hooks/use-audit-tail.ts`
- `apps/web/app/(dashboard)/dashboard/audit/page.tsx`, `apps/web/components/audit/AuditTable.tsx`
- `apps/web/app/(dashboard)/dashboard/account/page.tsx`, `apps/web/components/account/DiagnosticsMatrix.tsx`
- `apps/web/app/api/diagnostics/inspect-token/route.ts`
- `apps/web/lib/audit-api.test.ts`, `apps/web/hooks/use-audit-tail.test.ts`, `apps/web/components/account/DiagnosticsMatrix.test.tsx`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 10 (Dashboard Console) — Task 10.7 of 7 (LAST)

PRECONDITIONS
- P8 shipped lib/auth-fetch.ts (`authFetch`), the AuthProvider/useSession, and the ./shared types. Task 10.2 shipped lib/audit-pivot.ts (the nuqs actor/event state the audit facets read).
- The example-owned read API exists (P5): GET /audit/logs?cursor&actor&event&tenantId&limit → { data, nextCursor, hasMore } (keyset); GET /audit/stream (SSE; each event id is the keyset cursor, so a reconnect resumes via Last-Event-ID); POST /diagnostics/{hash-strength,force-lockout}; GET /diagnostics/hooks.
- The /nextjs subpath exports decodeJwtToken / verifyJwtToken and carries `import "server-only"`.

REQUIRED READING (only these — do not load more):
- docs/DASHBOARD.md § "7. Page-by-page spec" → the `/dashboard/audit` — Audit and `/dashboard/account` — Account + Diagnostics blocks + § "6. Auth-domain component catalog" → the audit-table, provider/diagnostics-matrix, and token-inspector rows + § "8. Real-time — the SSE audit tail" (follow-mode + Last-Event-ID + virtualization).
- docs/OVERVIEW.md § "15. Auth Event Tracking & the Audit Domain" (the read API + the never-contains-secrets proof) and § "13. Edge protection (WASM)" context for the token inspector.
- DOSSIER §1.8 → /nextjs `decodeJwtToken`/`verifyJwtToken` (server-only) + /shared types.
- The sibling: ~/Documents/MyApps/bymax-one/nest-auth-example/apps/web/ (its audit table + SSE hook + TanStack Virtual wiring).

TASK
Build the Audit Explorer (virtualized table + SSE follow-mode tail + no-secrets proof) and the Account/Diagnostics page (me card + diagnostics matrix + server-side token inspector); ship the modules, components, the server route, and 100% tests. Then run the per-phase completion protocol.

DELIVERABLES
1. `apps/web/lib/audit-api.ts`:
   ```ts
   import { authFetch } from './auth-fetch'

   export interface AuditLogRow {
     readonly id: string // also the keyset cursor / SSE event id
     readonly actor: string
     readonly event: string
     readonly tenantId: string | null
     readonly ip: string
     readonly createdAt: string // ISO-8601
     readonly details: Record<string, unknown>
   }
   export interface AuditPage {
     readonly data: readonly AuditLogRow[]
     readonly nextCursor: string | null
     readonly hasMore: boolean
   }
   export interface AuditQuery {
     readonly cursor?: string
     readonly actor?: string
     readonly event?: string
     readonly tenantId?: string
     readonly limit?: number
   }

   /** Fetch one keyset page of `GET /audit/logs`. */
   export async function fetchAuditPage(query: AuditQuery): Promise<AuditPage> {
     const params = new URLSearchParams()
     for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, String(v))
     const res = await authFetch(`/audit/logs?${params.toString()}`)
     return (await res.json()) as AuditPage
   }
   ```
2. `apps/web/hooks/use-audit-tail.ts` — an EventSource over `${NEXT_PUBLIC_API_URL}/audit/stream`; follow-mode (pin-to-bottom; scroll-up pauses + an "N new" pill); the browser resumes via native Last-Event-ID. Returns the live rows + the follow controls.
3. `apps/web/components/audit/AuditTable.tsx` — TanStack Virtual; faceted by actor/event/tenant (read from lib/audit-pivot.ts nuqs state); a detail drawer with the no-secrets proof (assert no token/otp/recoveryCode/secret key in `details`).
4. `apps/web/app/(dashboard)/dashboard/audit/page.tsx` — composes the table + the tail + the facets.
5. `apps/web/app/api/diagnostics/inspect-token/route.ts`:
   ```ts
   import { decodeJwtToken, verifyJwtToken } from '@bymax-one/rust-auth/nextjs'

   /** Server-only token inspector: decode the header/claims and report verify (a forged alg:none is rejected). */
   export async function POST(req: Request): Promise<Response> {
     const { token } = (await req.json()) as { token: string }
     const decoded = decodeJwtToken(token)
     const verified = await verifyJwtToken(token).then(() => true).catch(() => false)
     return Response.json({ decoded, verified })
   }
   ```
6. `apps/web/components/account/DiagnosticsMatrix.tsx` — calls POST /diagnostics/hash-strength, POST /diagnostics/force-lockout, GET /diagnostics/hooks via authFetch; the token inspector posts to /api/diagnostics/inspect-token; renders hash-strength + needs-rehash badge, the lockout button + countdown, the hook-event count, and the delivery-mode.
7. `apps/web/app/(dashboard)/dashboard/account/page.tsx` — the `me` card (useSession/getMe) + `<DiagnosticsMatrix>`.
8. Tests: `lib/audit-api.test.ts`, `hooks/use-audit-tail.test.ts` (mock EventSource; follow-mode pause/resume), `components/account/DiagnosticsMatrix.test.tsx`; each `it()` names the rule it protects.

Constraints:
- /nextjs is SERVER-ONLY: import it only in app/api/diagnostics/inspect-token/route.ts — never in a client component. All REST via authFetch — no hand-rolled fetch. The no-secrets proof is load-bearing.
- Compose components/ui/* verbatim. Skeletons, not spinners. English-only TIMELESS comments — NO Phase/Task references in committed source. No .gitkeep. git switch -c only.

Verification:
- `pnpm -C apps/web typecheck` — expected: 0 errors.
- `pnpm -C apps/web lint` — expected: 0 warnings.
- `pnpm -C apps/web test:cov` — expected: green; audit-api.ts + use-audit-tail.ts + AuditTable.tsx + DiagnosticsMatrix.tsx at 100%.
- `pnpm -C apps/web build` — expected: succeeds (serverExternalPackages keeps @bymax-one/rust-auth/nextjs server-side).
- `pnpm audit:exports` — expected: decodeJwtToken/verifyJwtToken + every consumed export referenced.
- `grep -riE "phase [0-9]|task [0-9]" apps/web/app apps/web/lib apps/web/hooks apps/web/components` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `7 / 7` and Last updated.
4. Update the P10 row Progress in docs/DEVELOPMENT_PLAN.md to `7 / 7`.
5. Append to ## Completion log: `- 10.7 ✅ <YYYY-MM-DD> — Audit Explorer + Account/Diagnostics`.
6. Commit `feat(web): audit explorer + account diagnostics matrix` (no Co-Authored-By).
7. PER-PHASE protocol: confirm all 7 tasks ✅ + the P10 DoD met + CI green on the merged PR; in docs/DEVELOPMENT_PLAN.md set the P10 Status ✅, Progress 7 / 7, Last updated today, advance the Active phase to P11, recompute Overall progress; set this file's header Status ✅; commit `docs(plan): P10 complete` (no Co-Authored-By). If a DoD bullet is unmet, use 🟡 Partial, not ✅.
````

---

## Phase Completion Protocol

When **Task 10.7** is `✅` and every other task is `✅`:

1. Confirm all 7 tasks are `✅` and the P10 **Definition of Done** in [`DEVELOPMENT_PLAN.md § P10`](../DEVELOPMENT_PLAN.md#phase-10--dashboard-console)
   is met: every backend feature is fireable from the Trigger Center and auto-pivots to its audit row; the Sessions
   manager lists/revokes against the live API; the MFA enroll → challenge round-trips; the OAuth panel shows the decision
   branch; the Audit Explorer searches/filters, tails live over SSE, and renders the never-contains-secrets proof; the
   Diagnostics panel exercises the server-only primitives; 100% web coverage on the new `lib/` + `hooks/` + `components/`.
2. Ensure the phase PR is **merged** to `main` with **CI green** (all required checks, incl. `unit` web coverage and
   `export-usage-check`).
3. In [`DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md): set the **P10 Status** to `✅`, **Progress** `7 / 7`, **Last
   updated** today; set **Active phase** to `P11`; recompute **Overall progress**.
4. Set this file's header **Status** to `✅` and **Progress** to `7 / 7 tasks`.
5. Commit `docs(plan): P10 complete` (no `Co-Authored-By`).

If any DoD bullet is unmet or CI is red, set P10 to `🟡 Partial`, not `✅`.

---

## Completion log

> Append-only. One line per completed task: `- <id> ✅ YYYY-MM-DD — <summary>`.

- 10.1 ✅ 2026-07-03 — Overview auth-health cards
- 10.2 ✅ 2026-07-03 — Trigger Center playground
- 10.3 ✅ 2026-07-03 — Security/MFA enrollment lifecycle
- 10.4 ✅ 2026-07-03 — Sessions device manager + new-session toast
