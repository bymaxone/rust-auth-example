# Phase 9 — Public Auth Pages

> **Status**: 📋 ToDo · **Progress**: 0 / 6 tasks · **Last updated**: 2026-06-23
> **Source roadmap**: [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P9
> **Source spec**: [`docs/OVERVIEW.md`](../OVERVIEW.md)
> **Executing a task?** Read **only** that task's `### Task N.n` block + its bounded *REQUIRED READING* — never the whole file. See [token economy](README.md#token-economy--executing-a-single-task).

---

## Context

Phase 8 produced the Next.js console **shell**: `app/layout.tsx` + `providers.tsx` wiring `AuthProvider` from
`@bymax-one/rust-auth/react`, the 64px-topbar / 250px-sidebar app shell with the global controls (tenant selector,
delivery-mode chip, the `useAuthStatus()` session badge), the `lib/` client layer (`authClient` =
`createAuthClient(...)` + `authFetch` = `createAuthFetch(...)`), the `lib/error-messages.ts` localization map keyed by
`AUTH_ERROR_CODES`, the `api/auth/{client-refresh,silent-refresh,logout}/route.ts` handlers, and the middleware WASM
edge verifier (`verifyJwtToken`). What the shell does **not** yet have is any page a logged-out visitor can actually
use — every `(public)/auth/*` route is empty.

This phase fills in the **entire unauthenticated entry surface**: the login page (with the MFA branch), register (with
the tenant selector), the 3-screen forgot/reset-password wizard, verify-email, the MFA challenge, and accept-invitation.
Each page is a thin client component built on the `/react` hooks (`useAuth`, `useSession`) and the `/client` fetch
client (`authClient`, `authFetch`); every error a page can surface is rendered through the shared `<AuthError>` banner
from the `lib/error-messages.ts` map (no raw `auth.*` code shown bare). The phase also lands the shared auth-domain
primitives the later consoles reuse — the segmented `<OtpInput>` (`autocomplete="one-time-code"` +
`inputmode="numeric"`), the `<ExpiryPill>` countdown, and the in-memory MFA-temp / reset-flow holders that move
short-lived proofs between routes **without** touching `localStorage`.

When P9 is done, a full **register → verify-email → login (incl. the MFA branch) → land authenticated** journey works
against the live stack (`pnpm infra:up` + both dev servers); the forgot/reset wizard obtains a `verifiedToken` from the
OTP step and completes a password change; an emailed invitation link accepts to a session;
`pnpm -C apps/web build` succeeds; `pnpm -C apps/web test:cov` reports 100% on the new pages/components; and a Playwright
journey drives the happy path end-to-end. **Only the unauthenticated `(public)/auth/*` surface is built here — the
authenticated dashboard console is P10 and the platform login is P11.**

---

## Rules-of-phase

1. **Consume the library, never hand-roll `fetch`.** Every form action goes through `/react` `useAuth()`
   (`login`/`register`/`forgotPassword`/`resetPassword`) or the `/client` `authClient` / `authFetch` exported from
   `lib/auth-client.ts`. No bespoke `fetch('/api/...')` to an auth route in a page body.
2. **Localized errors only.** Catch `AuthClientError` (from `@bymax-one/rust-auth/shared`), read its `code`, and render
   the message via `lib/error-messages.ts` inside `<AuthError>`. A page never prints a raw `auth.*` string as the
   primary message (the mono code may appear as a secondary developer affordance).
3. **Tokens are cookie- or in-memory-only — never `localStorage`.** The MFA temp token and the reset `verifiedToken`
   are short-lived single-use proofs; move them between routes through the in-memory holders
   (`lib/mfa-challenge-store.ts`, `lib/reset-flow-store.ts`), never `localStorage`/`sessionStorage`, and never in the URL.
4. **Anti-enumeration parity.** `forgot-password` and the verification/OTP resends always show the **same**
   "check your inbox" outcome regardless of whether the account exists — the UI must not branch its message on
   account existence.
5. **OTP accessibility is mandatory.** The segmented 6-digit `<OtpInput>` carries `autocomplete="one-time-code"` +
   `inputmode="numeric"`, each cell individually focusable, paste distributes across cells, backspace navigates back,
   and the complete state glows `--primary`. Mono font for every code/token.
6. **Design system verbatim.** Compose `components/ui/*` and the design tokens (`--primary` `#ff6224`, glass surfaces,
   Geist + GeistMono); never re-style a primitive, never introduce a color outside the token set. Loading is a
   **skeleton**, empty is **action-oriented**, per [`DASHBOARD.md §10`](../DASHBOARD.md#10-accessibility--ux-rules).
7. **`/nextjs` stays server-only.** Public pages are client components — never import `@bymax-one/rust-auth/nextjs`
   (it carries `import "server-only"`) into a page or a `components/auth/*` file.
8. **100% web coverage on what you add.** Every new `app/(public)/auth/**` page and `components/auth/**` /
   `lib/**` module ships its Vitest spec at 100% (lines/branches/functions/statements); `maxWorkers: '50%'` stays baked
   into `vitest.config.ts`. Never fan out parallel test agents.
9. **Timeless, English-only.** No `Phase N` / `Task` / roadmap-stage references in any committed `.ts`/`.tsx`/config
   file; English identifiers, comments, and copy. Conventional Commits, **no `Co-Authored-By` trailer**;
   `git switch -c` only (never `git checkout -b`); no `.gitkeep` / empty-dir scaffolding.

---

## Reference docs

- [`OVERVIEW.md`](../OVERVIEW.md) — §10 The Demo Domain & Auth Console (route table + page jobs), §11 The
  Authentication Pipelines (login→MFA→rotation, reset, the `MfaChallengeResult` bridge), §16 Demonstrated Journeys
  (journeys 1 first verified login, 2 login with MFA, 7 password reset, 15 invitations).
- [`DASHBOARD.md`](../DASHBOARD.md) — §5 The client layer (`/react` + `/client` usage), §6 Auth-domain component
  catalog (`<OtpInput>`, `<ExpiryPill>`, `<AuthError>`), §7 the `(public)/auth/*` page-by-page spec, §9 Error & status
  localization, §10 Accessibility & UX rules.
- [`DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) — § P9 (scope, DoD, rules), §2 Global Conventions (TS strict, coverage,
  memory-safe tests), Appendix B (P9 matrix rows 1, 2, 6, 7, 9, 13).
- Library surface (`@bymax-one/rust-auth`): `/react` `useAuth`/`useSession`; `/client` `createAuthClient` /
  `createAuthFetch` / `AuthClient.{login,register,mfaChallenge,forgotPassword,resetPassword}` / `LoginResult` /
  `MfaChallengeResult { mfaRequired, mfaTempToken }` / `LoginInput` / `RegisterInput` / `ResetPasswordInput`;
  `/shared` `AUTH_ROUTES` / `AUTH_ERROR_CODES` / `AuthClientError`.
- /bymax-workflow:standards — universal coding rules (apply the Rust track).

---

## Task index

| ID | Task | Status | Priority | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| 9.1 | Login page (+ MFA branch) + shared `<AuthError>` / MFA-temp holder | 📋 ToDo | P0 | M | — |
| 9.2 | Register page (tenant selector) | 📋 ToDo | P0 | S | — |
| 9.3 | Forgot / reset-password 3-screen wizard + `<OtpInput>` / `<ExpiryPill>` | 📋 ToDo | P0 | M | — |
| 9.4 | Verify-email page (OTP + anti-enum resend) | 📋 ToDo | P1 | S | — |
| 9.5 | MFA-challenge page (segmented 6-digit) | 📋 ToDo | P1 | M | — |
| 9.6 | Accept-invitation page (name + password) | 📋 ToDo | P1 | S | — |

---

## Tasks

### Task 9.1 — Login page (+ MFA branch) + shared `<AuthError>` / MFA-temp holder

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Build the `(public)/auth/login` page on `useAuth().login`, branching on a `MfaChallengeResult { mfaRequired,
mfaTempToken }` to route to the MFA challenge; land a successful login on `/dashboard`. Also create the shared
`(public)/auth/layout.tsx` card shell, the `<AuthError>` banner (used by every public page), and the in-memory
MFA-temp holder that hands the short-lived temp token to the MFA-challenge page.

#### Acceptance criteria

- [ ] `(public)/auth/login/page.tsx` submits `{ email, password }` (with the selected `tenantId`) via
  `useAuth().login` and renders `<AuthError>` on failure (localized from `lib/error-messages.ts`).
- [ ] On a `LoginResult` that is an `MfaChallengeResult` (`mfaTempToken` present), the page stores the temp token via
  `setPendingMfaChallenge(...)` (in-memory) and routes to `/auth/mfa-challenge`; a `Success` result routes to
  `/dashboard`.
- [ ] `lib/mfa-challenge-store.ts` exposes `setPendingMfaChallenge(token)` / `consumePendingMfaChallenge()` (single
  read, cleared on consume) holding the token in a module-scoped variable only — no `localStorage`/`sessionStorage`/URL.
- [ ] `components/auth/auth-error.tsx` (`<AuthError>`) renders the localized message + the raw `auth.*` code in mono +
  a retry slot, composed from `components/ui/alert`.
- [ ] `(public)/auth/layout.tsx` centers a glass card with the brand and a link to register/forgot-password.
- [ ] Vitest covers: success→`/dashboard`, MFA branch→store-set+redirect, `AuthClientError`→localized banner, the
  holder set/consume/clear — 100% on the new files.

#### Files to create / modify

- `apps/web/app/(public)/auth/layout.tsx`
- `apps/web/app/(public)/auth/login/page.tsx`
- `apps/web/components/auth/auth-error.tsx`
- `apps/web/lib/mfa-challenge-store.ts`
- `apps/web/app/(public)/auth/login/page.test.tsx`, `apps/web/components/auth/auth-error.test.tsx`,
  `apps/web/lib/mfa-challenge-store.test.ts`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 9 (Public Auth Pages) — Task 9.1 of 6 (FIRST)

PRECONDITIONS
- P8 delivered: app/providers.tsx wires <AuthProvider> from @bymax-one/rust-auth/react; lib/auth-client.ts exports
  `authClient` (createAuthClient) + `authFetch` (createAuthFetch); lib/error-messages.ts exports a
  `messageForCode(code)` map covering every AUTH_ERROR_CODES member; the app shell + tenant selector + middleware WASM
  verifier exist. components/ui/* (button, input, card, alert, label) are copied verbatim from the design system.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "11. The Authentication Pipelines" — Stage 2 returns MfaChallengeResult { mfaRequired,
  mfaTempToken } (a 300 s MfaTempClaims bridge) instead of a session; § "16. Demonstrated Journeys" journey 2.
- docs/DASHBOARD.md § "5. The client layer" (the /react + /client usage) and § "6. Auth-domain component catalog"
  (the <AuthError> banner row).
- @bymax-one/rust-auth types: `/react` useAuth()=>{ login, register, logout, forgotPassword, resetPassword };
  `/client` LoginInput { email, password, tenantId }, LoginResult = Success(AuthResult) | MfaChallenge
  (MfaChallengeResult { mfaRequired, mfaTempToken }); `/shared` AuthClientError { status, code, body }.

TASK
Build the login page and the shared primitives it introduces. The page authenticates, branches on the MFA result, and
shows only localized errors. No authenticated dashboard UI here (that is P10) — a successful login just routes to
/dashboard.

DELIVERABLES
1. `apps/web/lib/mfa-challenge-store.ts`:
   - An in-memory, single-read holder for the MFA temp token (module variable; NOT localStorage/URL).
   ```ts
   /** In-memory holder that bridges the MFA temp token from the login page to the challenge page. */
   let pendingMfaTempToken: string | null = null

   /** Stores the short-lived MFA temp token after a login returns an MfaChallengeResult. */
   export function setPendingMfaChallenge(tempToken: string): void {
     pendingMfaTempToken = tempToken
   }

   /** Returns and clears the pending MFA temp token (single use); null if none is pending. */
   export function consumePendingMfaChallenge(): string | null {
     const token = pendingMfaTempToken
     pendingMfaTempToken = null
     return token
   }
   ```
2. `apps/web/components/auth/auth-error.tsx`:
   - The `<AuthError>` banner; localized message + mono code, built from `components/ui/alert`.
   ```tsx
   'use client'
   import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
   import { messageForCode } from '@/lib/error-messages'
   import type { AuthErrorCode } from '@bymax-one/rust-auth/shared'

   export interface AuthErrorProps {
     /** A wire-visible auth error code, or null to render nothing. */
     code: AuthErrorCode | null
   }

   /** Renders a localized auth error with the raw code shown in mono for developers. */
   export function AuthError({ code }: AuthErrorProps): React.ReactElement | null {
     if (code === null) return null
     return (
       <Alert variant="destructive" role="alert">
         <AlertTitle>{messageForCode(code)}</AlertTitle>
         <AlertDescription className="font-mono text-xs">{code}</AlertDescription>
       </Alert>
     )
   }
   ```
3. `apps/web/app/(public)/auth/login/page.tsx`:
   - Client component; submit → useAuth().login → branch on the result.
   ```tsx
   'use client'
   import { useState } from 'react'
   import { useRouter } from 'next/navigation'
   import { useQueryState } from 'nuqs'
   import { useAuth } from '@bymax-one/rust-auth/react'
   import { AuthClientError } from '@bymax-one/rust-auth/shared'
   import type { AuthErrorCode } from '@bymax-one/rust-auth/shared'
   import { setPendingMfaChallenge } from '@/lib/mfa-challenge-store'
   import { AuthError } from '@/components/auth/auth-error'

   export default function LoginPage(): React.ReactElement {
     const { login } = useAuth()
     const router = useRouter()
     const [tenantId] = useQueryState('tenant', { defaultValue: 'acme' })
     const [code, setCode] = useState<AuthErrorCode | null>(null)

     async function onSubmit(email: string, password: string): Promise<void> {
       setCode(null)
       try {
         const result = await login(email, password, { tenantId })
         if ('mfaTempToken' in result && result.mfaRequired) {
           setPendingMfaChallenge(result.mfaTempToken)
           router.push('/auth/mfa-challenge')
           return
         }
         router.push('/dashboard')
       } catch (err) {
         if (err instanceof AuthClientError) setCode(err.code)
         else throw err
       }
     }
     // ...form markup composed from components/ui/{input,button,label,card}; <AuthError code={code} />
   }
   ```
4. `apps/web/app/(public)/auth/layout.tsx` — a centered glass `Card` shell with the brand + register/forgot links.
5. The three `*.test.(ts|tsx)` specs (success route, MFA-branch store+route, AuthClientError→banner, holder
   set/consume/clear) at 100%.

Constraints:
- TypeScript strict, no `any`, no suppression comments. English-only, TIMELESS comments — NO Phase/Task/roadmap
  references in any committed file. Compose components/ui/* verbatim; never re-style. Do NOT import
  @bymax-one/rust-auth/nextjs (server-only) into a page/component. No token in localStorage/sessionStorage/URL.
  No .gitkeep; git switch -c only.

Verification:
- `pnpm -C apps/web typecheck` — expected: exits 0.
- `pnpm -C apps/web lint` — expected: 0 warnings.
- `pnpm -C apps/web test:cov -- app/(public)/auth/login components/auth/auth-error lib/mfa-challenge-store` — expected:
  the new files at 100% (lines/branches/functions/statements).
- `pnpm -C apps/web build` — expected: succeeds (the file:-linked @bymax-one/rust-auth resolves).
- `grep -riE "phase [0-9]|task [0-9]" apps/web/app/\(public\)/auth/login apps/web/components/auth apps/web/lib/mfa-challenge-store.ts` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress to `1 / 6` and Last updated to today.
4. Update the P9 row Progress to `1 / 6` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 9.1 ✅ <YYYY-MM-DD> — login page + MFA branch + <AuthError> + MFA-temp holder`.
6. Commit `feat(web): login page with MFA branch and shared auth-error banner` (no Co-Authored-By).
````

---

### Task 9.2 — Register page (tenant selector)

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: S
- **Depends on**: —

#### Description

Build the `(public)/auth/register` page on `useAuth().register` with the tenant selector feeding `tenantId`; on success
the visitor lands authenticated (the engine issues a session even before email verification) and is routed to
`/auth/verify-email`.

#### Acceptance criteria

- [ ] `(public)/auth/register/page.tsx` submits `{ email, password, name, tenantId }` via `useAuth().register`; the
  `tenantId` comes from the topbar tenant selector (defaults to `'default'`).
- [ ] On success the page routes to `/auth/verify-email` (the session is live pre-verification, per the engine).
- [ ] Validation/`auth.email_already_exists`/`auth.password_too_weak` failures render through `<AuthError>` (localized).
- [ ] A link back to `/auth/login` is present.
- [ ] Vitest covers: success→route, the tenant value is forwarded, `AuthClientError`→banner — 100% on the new file.

#### Files to create / modify

- `apps/web/app/(public)/auth/register/page.tsx`
- `apps/web/app/(public)/auth/register/page.test.tsx`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 9 (Public Auth Pages) — Task 9.2 of 6 (MIDDLE)

PRECONDITIONS
- P8 delivered the AuthProvider + the topbar tenant selector (exposes the selected tenant; default 'default') + the
  lib/error-messages.ts map. A sibling P9 task created components/auth/auth-error.tsx (<AuthError>) — import it; create
  it under components/auth/ if absent.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "10. The Demo Domain & Auth Console" (Register row: create a user, issue a session 201) and the
  Feature Coverage Matrix row 1 ("lands authenticated; session issued even pre-verify"); § "16" journey 1.
- docs/DASHBOARD.md § "7. Page-by-page spec" — the (public)/auth/* register entry; § "9. Error & status localization".
- @bymax-one/rust-auth: `/react` useAuth().register; `/client` RegisterInput { email, password, name, tenantId };
  AuthResult; `/shared` AuthClientError.

TASK
Build the register page only. On success route to /auth/verify-email (do not build the verify page here — that is Task
9.4). The tenant selector value is forwarded as tenantId.

DELIVERABLES
1. `apps/web/app/(public)/auth/register/page.tsx`:
   ```tsx
   'use client'
   import { useState } from 'react'
   import { useRouter } from 'next/navigation'
   import { useAuth } from '@bymax-one/rust-auth/react'
   import { AuthClientError } from '@bymax-one/rust-auth/shared'
   import type { AuthErrorCode } from '@bymax-one/rust-auth/shared'
   import { useSelectedTenant } from '@/hooks/use-selected-tenant'
   import { AuthError } from '@/components/auth/auth-error'

   export default function RegisterPage(): React.ReactElement {
     const { register } = useAuth()
     const router = useRouter()
     const tenantId = useSelectedTenant()
     const [code, setCode] = useState<AuthErrorCode | null>(null)

     async function onSubmit(email: string, password: string, name: string): Promise<void> {
       setCode(null)
       try {
         await register({ email, password, name, tenantId })
         router.push('/auth/verify-email')
       } catch (err) {
         if (err instanceof AuthClientError) setCode(err.code)
         else throw err
       }
     }
     // ...form (email/name/password) from components/ui/*; <AuthError code={code} />; link to /auth/login
   }
   ```
   - If P8 named the tenant accessor differently, use that hook/selector; do not re-implement tenant state.
2. `apps/web/app/(public)/auth/register/page.test.tsx` — success→route, tenant forwarded, error→banner; 100%.

Constraints:
- TS strict, no `any`, no suppression comments. English-only, TIMELESS comments — NO Phase/Task/roadmap references in
  committed files. Compose components/ui/* verbatim. No /nextjs import in a client component. No .gitkeep; git switch -c.

Verification:
- `pnpm -C apps/web typecheck` — expected: exits 0.
- `pnpm -C apps/web lint` — expected: 0 warnings.
- `pnpm -C apps/web test:cov -- app/(public)/auth/register` — expected: 100% on the new file.
- `pnpm -C apps/web build` — expected: succeeds.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress to `2 / 6` and Last updated.
4. Update the P9 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 9.2 ✅ <YYYY-MM-DD> — register page with tenant selector`.
6. Commit `feat(web): register page wired to the tenant selector` (no Co-Authored-By).
````

---

### Task 9.3 — Forgot / reset-password 3-screen wizard + `<OtpInput>` / `<ExpiryPill>`

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Build the password-reset wizard across `(public)/auth/{forgot-password,reset-password}`: screen 1 `forgot-password`
(`useAuth().forgotPassword`, anti-enum always-200) → screen 2 OTP verification (posts to the verify-otp route, returns a
`verifiedToken`) → screen 3 `reset-password` (`useAuth().resetPassword` with the `verifiedToken` proof). Also create the
shared segmented `<OtpInput>` and the `<ExpiryPill>` countdown.

#### Acceptance criteria

- [ ] `(public)/auth/forgot-password/page.tsx` hosts screen 1 (email → `forgotPassword(email, tenantId)`) and screen 2
  (the `<OtpInput>` → `authFetch` POST to `AUTH_ROUTES` verify-otp → `{ verifiedToken }`), with the same
  "check your inbox" message whether or not the account exists.
- [ ] The obtained `verifiedToken` is stored via `lib/reset-flow-store.ts` (in-memory, single read) and the wizard
  routes to `/auth/reset-password`.
- [ ] `(public)/auth/reset-password/page.tsx` reads the `verifiedToken` from the holder, submits the new password via
  `resetPassword({ verifiedToken, newPassword })`, and on success routes to `/auth/login`; with no pending token it
  shows a "start over" state linking back to `/auth/forgot-password`.
- [ ] `components/auth/otp-input.tsx` (`<OtpInput>`): 6 segmented cells, `autocomplete="one-time-code"`,
  `inputmode="numeric"`, paste-distributes, auto-advance, backspace-nav, mono font, complete state glows `--primary`.
- [ ] `components/auth/expiry-pill.tsx` (`<ExpiryPill>`): `MM:SS` countdown from an expiry timestamp; turns
  `--destructive` near expiry; gates the resend.
- [ ] Vitest covers all three screens, the holder, and the OTP/pill behaviors (paste, advance, backspace, expiry) at
  100%.

#### Files to create / modify

- `apps/web/app/(public)/auth/forgot-password/page.tsx`
- `apps/web/app/(public)/auth/reset-password/page.tsx`
- `apps/web/components/auth/otp-input.tsx`
- `apps/web/components/auth/expiry-pill.tsx`
- `apps/web/lib/reset-flow-store.ts`
- The matching `*.test.(ts|tsx)` specs for each of the five files

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 9 (Public Auth Pages) — Task 9.3 of 6 (MIDDLE)

PRECONDITIONS
- P8 delivered useAuth() (forgotPassword/resetPassword), lib/auth-client.ts (`authFetch` = createAuthFetch), the tenant
  selector, and lib/error-messages.ts. A sibling P9 task created components/auth/auth-error.tsx — reuse it.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "10" (the /auth/password/{forgot-password,verify-otp,reset-password,resend-otp} route table —
  verify-otp returns a verifiedToken); § "13" Anti-enumeration (forgot/resend always succeed); § "16" journey 7.
- docs/DASHBOARD.md § "6" (the <OtpInput> + <ExpiryPill> rows) and § "10" (OTP a11y rules); § "7" (the reset wizard).
- @bymax-one/rust-auth: `/react` useAuth().forgotPassword(email, tenantId) / resetPassword(ResetPasswordInput);
  ResetPasswordInput is an exactly-one-proof union (use the verifiedToken proof: { verifiedToken, newPassword });
  `/shared` AUTH_ROUTES (the verify-otp route template), AuthClientError.

TASK
Build the 2-route, 3-screen reset wizard plus the shared <OtpInput> and <ExpiryPill>. The verify-otp call goes through
`authFetch` (the configured /client fetch) to the AUTH_ROUTES verify-otp path and reads { verifiedToken }; the proof is
carried to reset-password via an in-memory holder. Anti-enumeration: the email step shows the same success message
regardless of account existence.

DELIVERABLES
1. `apps/web/lib/reset-flow-store.ts` — in-memory single-read holder for the reset verifiedToken (mirror of the
   MFA-temp holder shape):
   ```ts
   let pendingVerifiedToken: string | null = null
   /** Stores the verifiedToken returned by the reset verify-otp step. */
   export function setResetVerifiedToken(token: string): void { pendingVerifiedToken = token }
   /** Returns and clears the pending verifiedToken (single use); null if none. */
   export function consumeResetVerifiedToken(): string | null {
     const t = pendingVerifiedToken; pendingVerifiedToken = null; return t
   }
   ```
2. `apps/web/components/auth/otp-input.tsx`:
   ```tsx
   'use client'
   export interface OtpInputProps {
     /** Number of segmented cells (6 for TOTP/OTP). */
     length?: number
     /** Fires with the full string once every cell is filled. */
     onComplete: (code: string) => void
   }
   /** Segmented numeric OTP box: one-time-code autofill, numeric IME, paste-distribute, auto-advance, backspace-nav. */
   export function OtpInput({ length = 6, onComplete }: OtpInputProps): React.ReactElement {
     // each <input maxLength={1} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" className="font-mono ...">
     // paste handler distributes digits across cells; complete state adds the --primary glow utility class.
   }
   ```
3. `apps/web/components/auth/expiry-pill.tsx` — `<ExpiryPill expiresAt={Date}>` rendering `MM:SS`, `--destructive` near
   zero, exposing an `isExpired` signal for resend gating.
4. `apps/web/app/(public)/auth/forgot-password/page.tsx` — screens 1 + 2:
   ```tsx
   'use client'
   // screen 1: forgotPassword(email, tenantId) -> always show "If an account exists, check your inbox."
   // screen 2: <OtpInput onComplete={verify} /> where verify posts the code to AUTH_ROUTES verify-otp via authFetch:
   //   const res = await authFetch(AUTH_ROUTES.PASSWORD_VERIFY_OTP, { method: 'POST', body: JSON.stringify({ email, otp, tenantId }) })
   //   const { verifiedToken } = await res.json(); setResetVerifiedToken(verifiedToken); router.push('/auth/reset-password')
   ```
   - Reconcile the exact AUTH_ROUTES key against the installed @bymax-one/rust-auth/shared exports.
5. `apps/web/app/(public)/auth/reset-password/page.tsx`:
   ```tsx
   'use client'
   // const token = consumeResetVerifiedToken(); if (!token) render a "start over" state -> link /auth/forgot-password
   // onSubmit(newPassword): await resetPassword({ verifiedToken: token, newPassword }); router.push('/auth/login')
   ```
6. The five `*.test.(ts|tsx)` specs at 100% (incl. OTP paste/advance/backspace, pill expiry, anti-enum message, holder).

Constraints:
- TS strict, no `any`, no suppression comments. English-only, TIMELESS comments — NO Phase/Task/roadmap references.
  verifiedToken lives ONLY in the in-memory holder — never localStorage/sessionStorage/URL. Anti-enum: identical
  success copy regardless of account existence. Compose components/ui/* verbatim. No /nextjs import in a client file.
  No .gitkeep; git switch -c.

Verification:
- `pnpm -C apps/web typecheck` — expected: exits 0.
- `pnpm -C apps/web lint` — expected: 0 warnings.
- `pnpm -C apps/web test:cov -- app/(public)/auth/forgot-password app/(public)/auth/reset-password components/auth/otp-input components/auth/expiry-pill lib/reset-flow-store` — expected: 100% on all new files.
- `pnpm -C apps/web build` — expected: succeeds.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress to `3 / 6` and Last updated.
4. Update the P9 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 9.3 ✅ <YYYY-MM-DD> — forgot/reset wizard + OtpInput + ExpiryPill`.
6. Commit `feat(web): password-reset wizard with shared OTP input and expiry pill` (no Co-Authored-By).
````

---

### Task 9.4 — Verify-email page (OTP + anti-enum resend)

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: S
- **Depends on**: —

#### Description

Build `(public)/auth/verify-email`: the emailed-code form (the shared `<OtpInput>`) posting to the verify-email route,
plus a Resend control that always returns 204 (anti-enumeration). The email is the current pre-verification session's
address (from `useSession`).

#### Acceptance criteria

- [ ] `(public)/auth/verify-email/page.tsx` renders `<OtpInput>` and, on completion, posts the code via `authFetch` to
  the verify-email route; on 204 it routes to `/dashboard`.
- [ ] A Resend control posts to the resend-verification route and always shows the same neutral confirmation (anti-enum),
  gated by an `<ExpiryPill>` cooldown.
- [ ] The address shown comes from `useSession()` (the session is live pre-verification); an unauthenticated visitor is
  pointed to `/auth/login`.
- [ ] `auth.otp_invalid` / `auth.otp_expired` / `auth.otp_max_attempts` render via `<AuthError>` (localized).
- [ ] Vitest covers: complete→post→route, resend neutral confirmation, error→banner — 100% on the new file.

#### Files to create / modify

- `apps/web/app/(public)/auth/verify-email/page.tsx`
- `apps/web/app/(public)/auth/verify-email/page.test.tsx`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 9 (Public Auth Pages) — Task 9.4 of 6 (MIDDLE)

PRECONDITIONS
- P8 delivered useSession() + lib/auth-client.ts (`authFetch`) + lib/error-messages.ts. Sibling P9 tasks created
  components/auth/{auth-error,otp-input,expiry-pill}.tsx — reuse them (create any that is absent under components/auth/).

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "10" (POST /auth/verify-email -> 204, /auth/resend-verification -> 204 anti-enum); the Feature
  Coverage Matrix row 6; § "16" journey 1 (the code lands in Mailpit at :8025).
- docs/DASHBOARD.md § "7" (verify-email entry) and § "9" (localization) and § "10" (OTP a11y).
- @bymax-one/rust-auth: `/react` useSession()=>{ user, status, ... }; `/client` authFetch; `/shared` AUTH_ROUTES
  (verify-email + resend-verification route templates), AuthClientError.

TASK
Build the verify-email page only. The OTP box submits the emailed code; the resend control is anti-enumeration (always a
neutral confirmation). On a successful verify (204) route to /dashboard. The email is read from the current session.

DELIVERABLES
1. `apps/web/app/(public)/auth/verify-email/page.tsx`:
   ```tsx
   'use client'
   import { useState } from 'react'
   import { useRouter } from 'next/navigation'
   import { useQueryState } from 'nuqs'
   import { useSession } from '@bymax-one/rust-auth/react'
   import { AUTH_ROUTES, AuthClientError } from '@bymax-one/rust-auth/shared'
   import type { AuthErrorCode } from '@bymax-one/rust-auth/shared'
   import { authFetch } from '@/lib/auth-client'
   import { OtpInput } from '@/components/auth/otp-input'
   import { AuthError } from '@/components/auth/auth-error'

   export default function VerifyEmailPage(): React.ReactElement {
     const { user, status } = useSession()
     const router = useRouter()
     const [tenantId] = useQueryState('tenant', { defaultValue: 'acme' })
     const [code, setCode] = useState<AuthErrorCode | null>(null)
     // if (status === 'unauthenticated') -> prompt to /auth/login

     async function verify(otp: string): Promise<void> {
       setCode(null)
       try {
         await authFetch(AUTH_ROUTES.VERIFY_EMAIL, { method: 'POST', body: JSON.stringify({ email: user?.email, otp, tenantId }) })
         router.push('/dashboard')
       } catch (err) {
         if (err instanceof AuthClientError) setCode(err.code)
         else throw err
       }
     }
     async function resend(): Promise<void> {
       // POST AUTH_ROUTES.RESEND_VERIFICATION; ALWAYS show the same "If your email is unverified, a new code is on its way." (anti-enum)
     }
     // <OtpInput onComplete={verify} />; a resend button gated by <ExpiryPill>; <AuthError code={code} />
   }
   ```
   - Reconcile the exact AUTH_ROUTES keys + the verify-email request body field against the installed package + apps/api.
2. `apps/web/app/(public)/auth/verify-email/page.test.tsx` — verify→route, resend neutral confirmation, error→banner;
   100%.

Constraints:
- TS strict, no `any`, no suppression comments. English-only, TIMELESS comments — NO Phase/Task/roadmap references.
  Resend is anti-enumeration (identical neutral copy). Compose components/ui/* verbatim. No /nextjs import in a client
  file. No .gitkeep; git switch -c.

Verification:
- `pnpm -C apps/web typecheck` — expected: exits 0.
- `pnpm -C apps/web lint` — expected: 0 warnings.
- `pnpm -C apps/web test:cov -- app/(public)/auth/verify-email` — expected: 100% on the new file.
- `pnpm -C apps/web build` — expected: succeeds.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress to `4 / 6` and Last updated.
4. Update the P9 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 9.4 ✅ <YYYY-MM-DD> — verify-email page with anti-enum resend`.
6. Commit `feat(web): verify-email page with OTP box and anti-enumeration resend` (no Co-Authored-By).
````

---

### Task 9.5 — MFA-challenge page (segmented 6-digit)

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: M
- **Depends on**: —

#### Description

Build `(public)/auth/mfa-challenge`: read the short-lived MFA temp token from the in-memory holder, render the segmented
6-digit `<OtpInput>`, and complete the challenge via `authClient.mfaChallenge(tempToken, code)`; on success the session
is issued and the page routes to `/dashboard`.

#### Acceptance criteria

- [ ] `(public)/auth/mfa-challenge/page.tsx` calls `consumePendingMfaChallenge()` on mount; with no pending token it
  shows a "session expired — sign in again" state linking `/auth/login`.
- [ ] The `<OtpInput>` (`autocomplete="one-time-code"` + `inputmode="numeric"`) submits via
  `authClient.mfaChallenge(tempToken, code)` and routes to `/dashboard` on the returned `AuthResult`.
- [ ] `auth.mfa_invalid_code` / `auth.mfa_temp_token_invalid` render via `<AuthError>`; an expired temp token surfaces
  the "sign in again" path.
- [ ] An `<ExpiryPill>` reflects the ~300 s temp-token lifetime; expiry disables submission.
- [ ] Vitest covers: no-token state, success→route, invalid-code→banner, expiry→disabled — 100% on the new file.

#### Files to create / modify

- `apps/web/app/(public)/auth/mfa-challenge/page.tsx`
- `apps/web/app/(public)/auth/mfa-challenge/page.test.tsx`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 9 (Public Auth Pages) — Task 9.5 of 6 (MIDDLE)

PRECONDITIONS
- Task 9.1 created lib/mfa-challenge-store.ts (setPendingMfaChallenge/consumePendingMfaChallenge) — the login page sets
  the temp token there before routing here. P8 delivered lib/auth-client.ts (`authClient`) + lib/error-messages.ts.
  Sibling P9 tasks created components/auth/{auth-error,otp-input,expiry-pill}.tsx — reuse them (create if absent).

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "11" (Stage 2 — login returns MfaChallengeResult carrying a ~300 s MfaTempClaims bridge; the second
  factor is a ±2-step TOTP verify); the Feature Coverage Matrix row 9; § "16" journey 2.
- docs/DASHBOARD.md § "6" (the <OtpInput> row) + § "10" (OTP a11y) + § "7" (the mfa-challenge entry).
- @bymax-one/rust-auth: `/client` authClient.mfaChallenge(tempToken: string, code: string): Promise<AuthResult>;
  `/shared` AuthClientError; the AuthErrorCode union (mfa_invalid_code, mfa_temp_token_invalid).

TASK
Build the mfa-challenge page only. It reads the in-memory temp token, submits the TOTP code, and lands on /dashboard.
No login form here (that is Task 9.1) — this page assumes a pending challenge and degrades gracefully when there is none.

DELIVERABLES
1. `apps/web/app/(public)/auth/mfa-challenge/page.tsx`:
   ```tsx
   'use client'
   import { useState, useEffect } from 'react'
   import { useRouter } from 'next/navigation'
   import { AuthClientError } from '@bymax-one/rust-auth/shared'
   import type { AuthErrorCode } from '@bymax-one/rust-auth/shared'
   import { authClient } from '@/lib/auth-client'
   import { consumePendingMfaChallenge } from '@/lib/mfa-challenge-store'
   import { OtpInput } from '@/components/auth/otp-input'
   import { AuthError } from '@/components/auth/auth-error'

   export default function MfaChallengePage(): React.ReactElement {
     const router = useRouter()
     const [tempToken] = useState<string | null>(() => consumePendingMfaChallenge())
     const [code, setCode] = useState<AuthErrorCode | null>(null)

     async function submit(totp: string): Promise<void> {
       if (tempToken === null) return
       setCode(null)
       try {
         await authClient.mfaChallenge(tempToken, totp)
         router.push('/dashboard')
       } catch (err) {
         if (err instanceof AuthClientError) setCode(err.code)
         else throw err
       }
     }
     // if (tempToken === null) -> "Your sign-in expired — sign in again" linking /auth/login
     // else <OtpInput onComplete={submit} /> + <ExpiryPill expiresAt={...} /> + <AuthError code={code} />
   }
   ```
2. `apps/web/app/(public)/auth/mfa-challenge/page.test.tsx` — no-token state, success→route, invalid→banner,
   expiry→disabled; 100%.

Constraints:
- TS strict, no `any`, no suppression comments. English-only, TIMELESS comments — NO Phase/Task/roadmap references.
  The temp token is read once from the in-memory holder — never localStorage/sessionStorage/URL. The OTP box keeps
  autocomplete="one-time-code" + inputmode="numeric". Compose components/ui/* verbatim. No /nextjs import in a client
  file. No .gitkeep; git switch -c.

Verification:
- `pnpm -C apps/web typecheck` — expected: exits 0.
- `pnpm -C apps/web lint` — expected: 0 warnings.
- `pnpm -C apps/web test:cov -- app/(public)/auth/mfa-challenge` — expected: 100% on the new file.
- `pnpm -C apps/web build` — expected: succeeds.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress to `5 / 6` and Last updated.
4. Update the P9 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 9.5 ✅ <YYYY-MM-DD> — mfa-challenge page (segmented 6-digit)`.
6. Commit `feat(web): mfa-challenge page consuming the in-memory temp token` (no Co-Authored-By).
````

---

### Task 9.6 — Accept-invitation page (name + password)

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: S
- **Depends on**: —

#### Description

Build `(public)/auth/accept-invitation`: reachable via the emailed link (the invitation token is the link's query
param), render the name + password form, accept via the invitations-accept route, and land authenticated on
`/dashboard`. This is the LAST task of P9 — after it merges, run the per-phase close-out.

#### Acceptance criteria

- [ ] `(public)/auth/accept-invitation/page.tsx` reads the invitation token from the URL query param, submits
  `{ token, name, password }` via `authFetch` to the invitations-accept route, and on the issued session routes to
  `/dashboard`.
- [ ] A missing/`auth.invalid_invitation_token` token shows an "invalid or expired invitation" state (localized via
  `<AuthError>`); no token in the URL renders a clear "open the link from your email" message.
- [ ] The token is read from the URL only to forward it to the accept call — it is not persisted anywhere else.
- [ ] Vitest covers: valid accept→route, missing-token state, invalid-token→banner — 100% on the new file.
- [ ] A Playwright journey (`e2e/invitations.spec.ts`) drives invite → emailed link (Mailpit) → accept → authenticated,
  against the live stack.

#### Files to create / modify

- `apps/web/app/(public)/auth/accept-invitation/page.tsx`
- `apps/web/app/(public)/auth/accept-invitation/page.test.tsx`
- `apps/web/e2e/invitations.spec.ts`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 9 (Public Auth Pages) — Task 9.6 of 6 (LAST)

PRECONDITIONS
- P8 delivered lib/auth-client.ts (`authFetch`) + lib/error-messages.ts + the Playwright harness (playwright.config.ts).
  A sibling P9 task created components/auth/auth-error.tsx — reuse it. The apps/api invitations surface
  (/auth/invitations + /auth/invitations/accept) exists from P6 and the local stack (Mailpit) runs via pnpm infra:up.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "10" (POST /auth/invitations 204 + /auth/invitations/accept 201 -> AuthResult); the Feature
  Coverage Matrix row 13; § "16" journey 15 (invite → Mailpit link → accept name+password → logged in).
- docs/DASHBOARD.md § "7" (the accept view: name + password reachable via the emailed link).
- @bymax-one/rust-auth: `/client` authFetch; `/shared` AUTH_ROUTES (the invitations-accept route template),
  AuthClientError, the AuthErrorCode union (invalid_invitation_token).

TASK
Build the accept-invitation page and the invitations e2e journey. The page takes the invitation token from the link's
query param, posts name+password to accept, and lands authenticated. This is the final P9 task — after merge, run the
per-phase close-out.

DELIVERABLES
1. `apps/web/app/(public)/auth/accept-invitation/page.tsx`:
   ```tsx
   'use client'
   import { useState } from 'react'
   import { useRouter, useSearchParams } from 'next/navigation'
   import { AUTH_ROUTES, AuthClientError } from '@bymax-one/rust-auth/shared'
   import type { AuthErrorCode } from '@bymax-one/rust-auth/shared'
   import { authFetch } from '@/lib/auth-client'
   import { AuthError } from '@/components/auth/auth-error'

   export default function AcceptInvitationPage(): React.ReactElement {
     const router = useRouter()
     const token = useSearchParams().get('token')
     const [code, setCode] = useState<AuthErrorCode | null>(null)
     // if (!token) render "Open the invitation link from your email." and stop.

     async function accept(name: string, password: string): Promise<void> {
       if (token === null) return
       setCode(null)
       try {
         await authFetch(AUTH_ROUTES.INVITATIONS_ACCEPT, {
           method: 'POST',
           body: JSON.stringify({ token, name, password }),
         })
         router.push('/dashboard')
       } catch (err) {
         if (err instanceof AuthClientError) setCode(err.code)
         else throw err
       }
     }
     // name + password form from components/ui/*; <AuthError code={code} />
   }
   ```
   - Reconcile the exact AUTH_ROUTES key + the accept request body fields against apps/api + the installed package.
2. `apps/web/app/(public)/auth/accept-invitation/page.test.tsx` — valid accept→route, missing-token state,
   invalid-token→banner; 100%.
3. `apps/web/e2e/invitations.spec.ts` — drive invite (admin) → read the Mailpit message → open the link → accept
   (name + password) → assert the authenticated landing, against `pnpm infra:up` + the dev servers.

Constraints:
- TS strict, no `any`, no suppression comments. English-only, TIMELESS comments — NO Phase/Task/roadmap references.
  The token is read from the URL only to forward it to the accept call; do not persist it. Compose components/ui/*
  verbatim. No /nextjs import in a client file. Memory-safe tests: Vitest maxWorkers 50% (baked); run Playwright
  sequentially — never fan out parallel test agents. No .gitkeep; git switch -c.

Verification:
- `pnpm -C apps/web typecheck` — expected: exits 0.
- `pnpm -C apps/web lint` — expected: 0 warnings.
- `pnpm -C apps/web test:cov -- app/(public)/auth/accept-invitation` — expected: 100% on the new file.
- `pnpm -C apps/web build` — expected: succeeds.
- `docker compose up --wait` then `pnpm -C apps/web exec playwright test e2e/invitations.spec.ts` — expected: the
  journey passes against the live stack.
- `pnpm audit:exports` — expected: passes (every consumed @bymax-one/rust-auth export referenced).
- `grep -riE "phase [0-9]|task [0-9]" apps/web/app/\(public\)/auth` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress to `6 / 6` and Last updated.
4. Update the P9 row Progress to `6 / 6` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 9.6 ✅ <YYYY-MM-DD> — accept-invitation page + invitations e2e`.
6. Commit `feat(web): accept-invitation page and invitations e2e journey` (no Co-Authored-By).
(The LAST task also runs the PER-PHASE protocol below: once the PR is merged and CI is green, flip P9 to ✅ / 6 of 6 in
docs/DEVELOPMENT_PLAN.md, advance Active phase to P10, recompute Overall progress to `10 / 15 phases (67%)`, set this
file header Status to ✅, and commit `docs(plan): P9 complete`.)
````

---

## Phase Completion Protocol

When **Task 9.6** is `✅` and every other task is `✅`:

1. Confirm all 6 tasks are `✅` and the P9 **Definition of Done** in
   [`DEVELOPMENT_PLAN.md § P9`](../DEVELOPMENT_PLAN.md#phase-9--public-auth-pages) is met: a full
   register → verify-email → login (incl. the MFA branch) → land-authenticated journey works against the live stack; the
   reset wizard returns a `verifiedToken` and completes; an invitation link accepts to a session; every public-page
   `auth.*` error is localized (no raw code as the primary message); the OTP box honours `autocomplete="one-time-code"`
   + `inputmode="numeric"`; 100% web coverage on the new pages/components.
2. Ensure the phase PR is **merged** to `main` with **CI green** (all required checks, including `unit`/`e2e-web` and
   `export-usage-check`).
3. In [`DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md): set the **P9 Status** to `✅`, **Progress** `6 / 6`, **Last
   updated** today; set **Active phase** to `P10`; recompute **Overall progress** to `10 / 15 phases · 57 / 86 tasks
   (67%)`.
4. Set this file's header **Status** to `✅` and **Progress** to `6 / 6 tasks`.
5. Commit `docs(plan): P9 complete` (no `Co-Authored-By`).

If any DoD bullet is unmet or CI is red, set P9 to `🟡 Partial`, not `✅`.

---

## Completion log

> Append-only. One line per completed task: `- <id> ✅ YYYY-MM-DD — <summary>`.

_(empty — no tasks completed yet)_
