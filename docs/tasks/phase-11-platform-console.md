# Phase 11 — Platform Console

> **Status**: ✅ Done · **Progress**: 4 / 4 tasks · **Last updated**: 2026-07-03
> **Source roadmap**: [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P11
> **Source spec**: [`docs/OVERVIEW.md`](../OVERVIEW.md)
> **Executing a task?** Read **only** that task's `### Task N.n` block + its bounded *REQUIRED READING* — never the whole file. See [token economy](README.md#token-economy--executing-a-single-task).

---

## Context

P9 shipped the unauthenticated dashboard entry points (`(public)/auth/*`) and, with P8 before it, the spine the whole console rides on: the `AuthProvider` + hooks from `@bymax-one/rust-auth/react`, the `lib/auth-client.ts` built on `/client`, the edge middleware built on `/nextjs` (`createAuthProxy` + `verifyJwtToken`), the three refresh route handlers, the design-system primitives in `components/ui/*`, and the exhaustive `auth.*` localization map in `lib/error-messages.ts`. Everything so far lives in the **dashboard** identity domain — tenant-scoped tokens (`DashboardClaims`) hitting `/auth/*`.

This phase adds the second, deliberately separate identity domain: the **platform** console — a tenant-less admin space backed by `PlatformAuthService` over the shipped `/auth/platform/*` routes. The library exposes no platform-specific browser client, so the example wires a thin `lib/platform-client.ts` on top of `createAuthFetch` and the `/shared` platform types (`PlatformLoginResult`, `PlatformAuthResult`, `AuthPlatformUserClient`, `MfaChallengeResult`), then builds the `app/platform/*` tree: a tenant-less login, a `(protected)` admin shell guarded both at the edge (middleware) and in a server layout, the platform MFA enroll/challenge/disable journeys against `PlatformClaims`, a bulk-only platform sessions page, and a read-only platform-users view. The two token families never cross: a valid dashboard token presented at `/platform/(protected)/*` is bounced with an explicit "wrong identity domain" message, and vice-versa.

When P11 is done, signing in at `/platform/login` (no tenant selector) authenticates an admin via `/auth/platform/login`, the `(protected)` shell renders only for a token whose `type === "platform"`, platform MFA enroll→challenge→disable round-trips against the live platform API, revoke-all-platform-sessions clears the admin's sessions and bounces them back to login, and the read-only users view renders `AuthPlatformUserClient` projections with the domain-isolation banner. `pnpm -C apps/web build` succeeds, `pnpm -C apps/web test:cov` reports 100% on the new `app/platform/**` + `lib/platform-*`, `pnpm audit:exports` stays green, and the Playwright platform-isolation journey (a dashboard cookie bounced from the platform console) passes. **This phase adds ONLY the `platform/*` tree and its thin platform client/guard/session layer; it touches no `dashboard/*` page, no `(public)/auth/*` page, and adds no new library surface — it consumes the shipped `/auth/platform/*` routes and the `/shared` platform types verbatim.**

---

## Rules-of-phase

1. **Tenant-less domain.** No tenant selector appears anywhere under `platform/*`, and no `/auth/platform/*` request ever carries `tenant_id` — the platform DTOs (`PlatformLoginDto`) have no `tenantId` field. Importing or rendering the dashboard `<TenantSelector>` in this tree is a defect.
2. **Strict domain separation (defense in depth).** `/platform/(protected)/*` admits a token only when its `type` discriminator is `"platform"`; a valid dashboard token is bounced — never silently 401'd — to `/platform/login?reason=wrong-domain` with an explicit "wrong identity domain" message. Enforce it at BOTH the edge (`middleware.ts`) and the server layout so neither alone is the sole gate.
3. **Consume the shipped surface verbatim.** Hit the `/auth/platform/*` routes (mirroring `constants::routes::PLATFORM_*`) and the `/shared` platform types (`PlatformLoginResult`, `PlatformAuthResult`, `AuthPlatformUserClient`, `MfaChallengeResult`) exactly as published. Do not invent new wire types, re-case fields, or re-shape the union — `PlatformLoginResult` is an untagged `Success | MfaChallenge`.
4. **Platform MFA fail-closed, surfaced honestly.** When `platform.enabled` lacks an MFA config the API refuses MFA-enabled admin login and `/auth/platform/mfa/*` returns `auth.mfa_not_enabled`; the UI states that plainly (a localized banner), never papering over it or pretending MFA succeeded.
5. **Roadmap honesty (no faked breadth).** The platform domain ships ONLY bulk session revoke (`revoke_all_platform_sessions`) — there is no per-session list/revoke route — and no per-platform-user write API. The Sessions and Users pages state these boundaries explicitly rather than mocking a richer surface than the library provides.
6. **Never render or persist secrets.** Platform tokens live in HttpOnly cookies only — never `localStorage`/`sessionStorage`; recovery codes are shown once with a warning; refresh values never reach the DOM; machine values (jti, secret, codes) render in mono. The same never-render-secrets invariant as the dashboard.
7. **Design system verbatim.** Compose `components/ui/*` (`Card`/`Input`/`Button`/`Badge`/`Table`/`Alert`) and the `docs/design_system.html` tokens. The platform domain is visually distinct (its own shell chrome) but must NOT re-style the primitives — distinction comes from layout/labelling, not forked CSS.
8. **Reuse the localization map.** Every `auth.*` error a platform page surfaces is localized through the existing `lib/error-messages.ts` (keyed by `AUTH_ERROR_CODES`) — show the human message to the user and the raw code in mono to the developer; never a bare code.
9. **Memory-safe, fully-covered tests.** Vitest with `maxWorkers: '50%'`; run the suite yourself, sequentially — never fan out parallel test agents. 100% coverage on every new `app/platform/**`, `lib/platform-*`, and route handler.
10. **Timeless, conventional, English-only.** No `Phase N`/`Task` or roadmap references in any committed `.ts`/`.tsx`/Rust/config file; comments explain *what/why*, not *which stage*. `git switch -c` for the branch (never `checkout -b`); Conventional Commits with NO `Co-Authored-By` trailer; no `.gitkeep`.

---

## Reference docs

- [`docs/OVERVIEW.md`](../OVERVIEW.md) § 12 "Identity Domains & Extension Points" — the two token families, the cross-domain deserialization barrier, platform MFA fail-closed.
- [`docs/OVERVIEW.md`](../OVERVIEW.md) § 16 journey 14 "Platform admin domain" — the end-to-end behaviour to demonstrate.
- [`docs/DASHBOARD.md`](../DASHBOARD.md) § 3 (app shell — Dashboard/Platform split; tenant selector hidden in platform), § 4 (information architecture — the `platform/` tree + the middleware protecting `/platform/(protected)/*`), § 5 (the four `@bymax-one/rust-auth` subpaths), § 6 (the **Sessions table** component), § 7 "`/platform/*`" page-by-page spec.
- [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § "Phase 11 — Platform Console" (scope In/Out, DoD, rules-of-phase).
- `/tmp/rust-auth-example-research/DOSSIER.md` § 1.6 (the `/auth/platform/*` route table + status codes + guards) and § 1.8 (`/shared` platform types, `createAuthFetch`, `getSetCookieHeaders`).
- Sibling to copy-and-adapt: `/Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/` — the platform-console pattern (separate admin domain, isolation bounce) in the TypeScript reference app.
- `/bymax-workflow:standards` — universal coding rules (apply the TypeScript/web track).

---

## Task index

| ID | Task | Status | Priority | Size | Depends on |
|---|---|---|---|---|---|
| 11.1 | Platform login + protected shell | ✅ Done | P0 | M | — |
| 11.2 | Platform MFA (enroll / challenge / disable) | ✅ Done | P1 | M | 11.1 |
| 11.3 | Platform sessions (revoke-all) | ✅ Done | P1 | S | 11.1 |
| 11.4 | Platform users (read-only) | ✅ Done | P2 | S | 11.1 |

---

## Tasks

### Task 11.1 — Platform login + protected shell

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Build the tenant-less platform login (`platform/login`) on a thin `lib/platform-client.ts` over `createAuthFetch`, and the `(protected)` admin shell guarded both at the edge (middleware) and in a server layout so only a `type === "platform"` token enters — a dashboard token is bounced with an explicit "wrong identity domain" message.

#### Acceptance criteria

- [ ] `lib/platform-client.ts` exposes `platformClient` with `login`, `mfaChallenge`, `getMe`, `logout`, `refresh`, built on `createAuthFetch` and targeting the literal `/auth/platform/*` routes; **no method accepts or sends `tenantId`**.
- [ ] `platformClient.login` returns the untagged `PlatformLoginResult` and the caller branches `Success` (has `user`/`accessToken`) vs `MfaChallenge` (has `mfaRequired`/`mfaTempToken`).
- [ ] `app/platform/login/page.tsx` renders a login form composed from `components/ui/*` with **no** tenant selector; on `Success` it routes into `(protected)`, on `mfaRequired` it hands the short-lived temp token to the MFA step (in memory only), and it renders the localized "wrong identity domain" banner when `?reason=wrong-domain` is present.
- [ ] `middleware.ts` protects `/platform/(protected)/*` (the matcher excludes `/platform/login`): it `verifyJwtToken`s the access cookie and redirects to `/platform/login?reason=wrong-domain` unless the verified payload's `type === "platform"`.
- [ ] `app/platform/(protected)/layout.tsx` is a server component that re-verifies the platform token and `redirect()`s on a non-platform/absent token (defense in depth) before rendering the distinct platform shell chrome.
- [ ] `app/api/platform/client-refresh/route.ts` proxies the single-flight refresh to `/auth/platform/refresh`, forwarding cookies and re-emitting `Set-Cookie` via `getSetCookieHeaders`.
- [ ] 100% Vitest coverage on the new files; a Playwright check confirms a dashboard cookie is bounced from `/platform/(protected)/*`.

#### Files to create / modify

- `apps/web/lib/platform-client.ts`
- `apps/web/app/platform/login/page.tsx`
- `apps/web/app/platform/(protected)/layout.tsx`
- `apps/web/middleware.ts` (extend with the platform branch)
- `apps/web/app/api/platform/client-refresh/route.ts`
- `apps/web/__tests__/platform/login.test.tsx`, `apps/web/__tests__/platform/guard.test.ts`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 11 (Platform Console) — Task 11.1 of 4 (FIRST)

PRECONDITIONS
- P8/P9 are done: `apps/web` already has the `AuthProvider` (`/react`), `lib/auth-client.ts` (`/client`), the edge middleware using `/nextjs`, the design-system primitives in `components/ui/*`, and the exhaustive `lib/error-messages.ts` localization map (keyed by `AUTH_ERROR_CODES`).
- The axum API already mounts `/auth/platform/*` (platform feature + `ControllerToggles.platform`); `platform.enabled` is configured for the example.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § 12 "Identity Domains & Extension Points" — the two token families and that a dashboard token can never satisfy a platform guard (distinct `type`/`token_type` discriminators that fail cross-domain deserialization).
- docs/DASHBOARD.md § 4 (the `platform/` tree + the middleware protecting `/platform/(protected)/*`) and § 7 "`/platform/*`" (the page job + the "wrong identity domain" bounce state).
- /tmp/rust-auth-example-research/DOSSIER.md § 1.6 (the `/auth/platform/*` route table: POST `/auth/platform/login` 200/MFA public, POST `/auth/platform/mfa/challenge`, GET `/auth/platform/me` PlatformUser, POST `/auth/platform/logout`, POST `/auth/platform/refresh`) and § 1.8 (`/shared` types `PlatformLoginResult`/`PlatformAuthResult`/`AuthPlatformUserClient`/`MfaChallengeResult`/`PlatformJwtPayload`, `createAuthFetch`, `getSetCookieHeaders`, `AUTH_ACCESS_COOKIE_NAME`).
- /Users/maximiliano/Documents/MyApps/bymax-one/nest-auth-example/ — the platform-console pattern (separate admin domain + isolation bounce) to copy-and-adapt.

TASK
Wire the tenant-less platform login and the doubly-guarded `(protected)` admin shell. Build a thin platform browser client (no library platform client exists), the login page, the edge + server guards enforcing `type === "platform"`, and the single-flight refresh proxy. No dashboard page is touched; no new library surface is added.

DELIVERABLES

1. `apps/web/lib/platform-client.ts`:
   - A thin client on `createAuthFetch`; routes mirror `constants::routes::PLATFORM_*`; never sends `tenantId`.
   ```ts
   import { createAuthFetch } from '@bymax-one/rust-auth/client'
   import type {
     PlatformLoginResult,
     PlatformAuthResult,
     AuthPlatformUserClient,
   } from '@bymax-one/rust-auth/shared'

   /** Tenant-less platform endpoints (mirror `constants::routes::PLATFORM_*`). */
   const PLATFORM = {
     login: '/auth/platform/login',
     mfaChallenge: '/auth/platform/mfa/challenge',
     me: '/auth/platform/me',
     logout: '/auth/platform/logout',
     refresh: '/auth/platform/refresh',
   } as const

   const fetcher = createAuthFetch({
     baseUrl: process.env.NEXT_PUBLIC_API_URL!,
     credentials: 'include',                       // HttpOnly platform cookies
     refreshEndpoint: '/api/platform/client-refresh', // single-flight 401 -> platform refresh -> replay
   })

   /** Browser client for the tenant-less platform domain. No `tenantId`, ever. */
   export const platformClient = {
     /** POST /auth/platform/login — untagged `PlatformLoginResult` (Success | MfaChallenge). */
     async login(email: string, password: string): Promise<PlatformLoginResult> {
       const res = await fetcher(PLATFORM.login, { method: 'POST', body: JSON.stringify({ email, password }) })
       return (await res.json()) as PlatformLoginResult
     },
     /** POST /auth/platform/mfa/challenge — completes a login that returned `mfaRequired`. */
     async mfaChallenge(mfaTempToken: string, code: string): Promise<PlatformAuthResult> {
       const res = await fetcher(PLATFORM.mfaChallenge, { method: 'POST', body: JSON.stringify({ mfaTempToken, code }) })
       return (await res.json()) as PlatformAuthResult
     },
     /** GET /auth/platform/me — the admin projection (no secrets). */
     async getMe(): Promise<AuthPlatformUserClient> {
       const res = await fetcher(PLATFORM.me, { method: 'GET' })
       return (await res.json()) as AuthPlatformUserClient
     },
     /** POST /auth/platform/logout — clears the platform cookies (204). */
     async logout(): Promise<void> { await fetcher(PLATFORM.logout, { method: 'POST' }) },
   }
   ```

2. `apps/web/middleware.ts` — extend with the platform branch (edge guard):
   ```ts
   import { verifyJwtToken } from '@bymax-one/rust-auth/nextjs'
   import { AUTH_ACCESS_COOKIE_NAME } from '@bymax-one/rust-auth/shared'
   import { NextResponse, type NextRequest } from 'next/server'

   const PLATFORM_PROTECTED = /^\/platform\/(?!login).+/

   export async function middleware(req: NextRequest) {
     if (!PLATFORM_PROTECTED.test(req.nextUrl.pathname)) return NextResponse.next()
     const token = req.cookies.get(AUTH_ACCESS_COOKIE_NAME)?.value
     const decoded = token ? await verifyJwtToken(token) : null
     // domain isolation: only a VALID PLATFORM token may enter the platform console.
     const isPlatformToken = decoded?.isValid && decoded.payload?.type === 'platform'
     if (!isPlatformToken) {
       const url = req.nextUrl.clone()
       url.pathname = '/platform/login'
       if (decoded?.isValid) url.searchParams.set('reason', 'wrong-domain') // a valid dashboard token -> honest bounce
       return NextResponse.redirect(url)
     }
     return NextResponse.next()
   }
   export const config = { matcher: ['/platform/:path*', '/dashboard/:path*'] }
   ```

3. `apps/web/app/platform/(protected)/layout.tsx` — server-side re-verification (defense in depth) + the distinct platform chrome:
   ```tsx
   import { redirect } from 'next/navigation'
   import { cookies } from 'next/headers'
   import { verifyJwtToken } from '@bymax-one/rust-auth/nextjs'
   import { AUTH_ACCESS_COOKIE_NAME } from '@bymax-one/rust-auth/shared'

   export default async function PlatformShell({ children }: { children: React.ReactNode }) {
     const token = (await cookies()).get(AUTH_ACCESS_COOKIE_NAME)?.value
     const decoded = token ? await verifyJwtToken(token) : null
     const isPlatform = decoded?.isValid && decoded.payload?.type === 'platform'
     if (!isPlatform) redirect('/platform/login?reason=wrong-domain')
     // render the platform shell (own sidebar/labels, NO tenant selector) composed from components/ui/*
     return <section data-domain="platform">{children}</section>
   }
   ```

4. `apps/web/app/platform/login/page.tsx` — tenant-less form; branches the union; surfaces the bounce reason. Compose `components/ui/*`; localize errors via `lib/error-messages.ts`; on `mfaRequired` keep the temp token in memory and reveal the inline MFA step (the challenge submit calls `platformClient.mfaChallenge`).

5. `apps/web/app/api/platform/client-refresh/route.ts` — single-flight target for the platform domain:
   ```ts
   import { NextResponse, type NextRequest } from 'next/server'
   import { getSetCookieHeaders } from '@bymax-one/rust-auth/nextjs'

   /** Example-owned single-flight refresh for the platform domain (targets `/auth/platform/refresh`). */
   export async function POST(req: NextRequest) {
     const upstream = await fetch(`${process.env.INTERNAL_API_URL}/auth/platform/refresh`, {
       method: 'POST',
       headers: { cookie: req.headers.get('cookie') ?? '' },
     })
     const res = new NextResponse(null, { status: upstream.status })
     for (const c of getSetCookieHeaders(upstream)) res.headers.append('set-cookie', c)
     return res
   }
   ```

6. Tests `apps/web/__tests__/platform/{login,guard}.test.*` — cover the Success branch, the `mfaRequired` branch, the `wrong-domain` banner, and the guard bouncing a dashboard token (mock `verifyJwtToken`).

Constraints:
- No tenant selector anywhere; never send `tenantId` to a platform route.
- Enforce `type === "platform"` at BOTH the edge and the server layout.
- Tokens in HttpOnly cookies only — never `localStorage`/`sessionStorage`; the temp MFA token stays in memory.
- Consume `/shared` platform types and the `/auth/platform/*` routes verbatim; do not re-shape the wire.
- English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config file; no `.gitkeep`; `git switch -c` (never `checkout -b`); design-system primitives composed, never re-styled.

Verification:
- `pnpm -C apps/web typecheck` — expected: no type errors.
- `pnpm -C apps/web lint` — expected: clean.
- `pnpm -C apps/web test:cov` — expected: passes with the new `app/platform/**` + `lib/platform-client.ts` at 100% (Vitest `maxWorkers: '50%'`).
- `pnpm -C apps/web build` — expected: production build succeeds.
- `npx playwright test platform-isolation` — expected: a dashboard cookie is redirected from `/platform/(protected)/*` to `/platform/login?reason=wrong-domain`.
- `grep -riE "phase [0-9]|task [0-9]" apps/web/app/platform apps/web/lib/platform-client.ts apps/web/middleware.ts` — expected: no matches.
- `find apps/web/app/platform -name .gitkeep` — expected: no output.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `1 / 4` and Last updated.
4. Update the P11 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 11.1 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(web): platform login and guarded admin shell` (no Co-Authored-By).
````

---

### Task 11.2 — Platform MFA (enroll / challenge / disable)

- **Status**: ✅ Done
- **Priority**: P1
- **Size**: M
- **Depends on**: 11.1

#### Description

Build `platform/(protected)/security` — the TOTP enroll (QR + recovery grid), verify-enable, disable, and regenerate-recovery-codes journeys against `PlatformClaims` over `/auth/platform/mfa/*`, reusing the existing OTP/QR/recovery components, with the platform-MFA **fail-closed** state (`auth.mfa_not_enabled`) surfaced honestly.

#### Acceptance criteria

- [ ] `lib/platform-client.ts` gains `platformMfa` with `setup`, `verifyEnable`, `disable`, `regenerate` targeting `/auth/platform/mfa/{setup,verify-enable,disable,recovery-codes}`; `setup` returns `{ secret, qrCodeUri, recoveryCodes }` (mirroring core `MfaSetupResult`).
- [ ] `app/platform/(protected)/security/page.tsx` renders the QR enrollment card (`qrCodeUri` + the base32 `secret` in mono) and the recovery-code grid (shown once, with a warning), submits the 6-digit code to `verify-enable`, and offers disable + regenerate, each gated by a fresh TOTP via the shared `<OtpInput>`.
- [ ] The login MFA challenge (built in 11.1) round-trips for the platform domain: `mfaRequired` → `<OtpInput>` → `platformClient.mfaChallenge` → session issued.
- [ ] The **fail-closed** path is surfaced honestly: when the API returns `auth.mfa_not_enabled`, the page shows the localized banner explaining platform MFA is unavailable until an MFA config is present — it never fakes enrollment.
- [ ] Recovery codes are never persisted client-side; the secret/codes render only in mono and only once.
- [ ] 100% Vitest coverage on the new files, including the fail-closed branch.

#### Files to create / modify

- `apps/web/lib/platform-client.ts` (extend with `platformMfa`)
- `apps/web/app/platform/(protected)/security/page.tsx`
- `apps/web/__tests__/platform/security.test.tsx`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 11 (Platform Console) — Task 11.2 of 4 (MIDDLE)

PRECONDITIONS
- Task 11.1 is done: `lib/platform-client.ts` (`login`/`mfaChallenge`/`getMe`/`logout`), the guarded `(protected)` shell, and the platform login page exist; the login already branches `mfaRequired` and calls `platformClient.mfaChallenge`.
- The shared MFA components exist from the dashboard/public work: `<OtpInput>` (segmented 6-cell, `autocomplete="one-time-code"` + `inputmode="numeric"`), the QR enrollment card, and the recovery-code grid (auth-domain component catalog, DASHBOARD § 6).

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § 12 "Identity Domains & Extension Points" — "Platform MFA is fail-closed — `platform.enabled` without an MFA config refuses an MFA-enabled admin login."
- docs/DASHBOARD.md § 6 (the OTP input / QR enrollment card / recovery-code grid components) and § 7 "`/platform/*`" (the platform MFA panel: enroll/challenge/disable).
- /tmp/rust-auth-example-research/DOSSIER.md § 1.6 — the platform MFA routes: POST `/auth/platform/mfa/setup` (200, PlatformUser), `/verify-enable` (204, PlatformUser), `/disable` (204, PlatformUser), `/recovery-codes` (200, PlatformUser), and `/auth/platform/mfa/challenge` (200, public; with no `mfa` feature it returns `MfaNotEnabled`). Core `MfaSetupResult{secret, qr_code_uri, recovery_codes}`.

TASK
Build the platform Security/MFA page and extend the platform client with the four MFA methods, reusing the shared OTP/QR/recovery components against `PlatformClaims`. Surface the fail-closed `auth.mfa_not_enabled` state honestly.

DELIVERABLES

1. `apps/web/lib/platform-client.ts` — extend:
   ```ts
   /** Mirrors core `MfaSetupResult` (camelCase over the wire). */
   export interface PlatformMfaSetup { secret: string; qrCodeUri: string; recoveryCodes: string[] }

   export const platformMfa = {
     /** POST /auth/platform/mfa/setup — returns the otpauth URI + recovery codes (200). */
     async setup(): Promise<PlatformMfaSetup> {
       const res = await fetcher('/auth/platform/mfa/setup', { method: 'POST' })
       return (await res.json()) as PlatformMfaSetup
     },
     /** POST /auth/platform/mfa/verify-enable — { code } (len 6) -> 204. */
     async verifyEnable(code: string): Promise<void> {
       await fetcher('/auth/platform/mfa/verify-enable', { method: 'POST', body: JSON.stringify({ code }) })
     },
     /** POST /auth/platform/mfa/disable — { code } (fresh TOTP) -> 204. */
     async disable(code: string): Promise<void> {
       await fetcher('/auth/platform/mfa/disable', { method: 'POST', body: JSON.stringify({ code }) })
     },
     /** POST /auth/platform/mfa/recovery-codes — { code } -> new codes (200). */
     async regenerate(code: string): Promise<string[]> {
       const res = await fetcher('/auth/platform/mfa/recovery-codes', { method: 'POST', body: JSON.stringify({ code }) })
       return (await res.json()) as string[]
     },
   }
   ```
   (`fetcher` is the module-private `createAuthFetch` instance from 11.1.)

2. `apps/web/app/platform/(protected)/security/page.tsx` — client component:
   - "Enable 2FA" → `platformMfa.setup()` → render the QR card (`qrCodeUri`) + the base32 `secret` (mono, copyable) + the recovery-code grid (shown once, warned) → submit `<OtpInput>` 6-digit to `platformMfa.verifyEnable`.
   - "Disable 2FA" and "Regenerate recovery codes" → each gated by a fresh TOTP via `<OtpInput>` → `platformMfa.disable` / `platformMfa.regenerate`.
   - Fail-closed: catch `AuthClientError` with `code === 'auth.mfa_not_enabled'` and render the localized banner from `lib/error-messages.ts` stating platform MFA is unavailable until an MFA config is present — do NOT show an enroll success.
   ```tsx
   import { AuthClientError } from '@bymax-one/rust-auth/shared'
   import { platformMfa } from '@/lib/platform-client'
   import { messageForCode } from '@/lib/error-messages'
   // ... compose components/ui/* + the shared <OtpInput>/QR card/recovery grid; mono for secret + codes.
   ```

3. `apps/web/__tests__/platform/security.test.tsx` — cover enroll→verify-enable, disable, regenerate, and the `auth.mfa_not_enabled` fail-closed banner (mock the client; assert no enroll success renders on the fail-closed path).

Constraints:
- Reuse the shared `<OtpInput>`/QR/recovery components — do not fork them.
- Recovery codes and the secret render only in mono and only once; never persisted client-side.
- Surface fail-closed honestly; never paper over `auth.mfa_not_enabled`.
- English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config; no `.gitkeep`; `git switch -c` only; design-system composed, never re-styled.

Verification:
- `pnpm -C apps/web typecheck` — expected: no type errors.
- `pnpm -C apps/web lint` — expected: clean.
- `pnpm -C apps/web test:cov` — expected: passes; `app/platform/(protected)/security/page.tsx` + the new client methods at 100% (Vitest `maxWorkers: '50%'`).
- `pnpm -C apps/web build` — expected: production build succeeds.
- `pnpm audit:exports` — expected: passes (platform MFA types consumed from `/shared`).
- `grep -riE "phase [0-9]|task [0-9]" apps/web/app/platform/\(protected\)/security` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `2 / 4` and Last updated.
4. Update the P11 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 11.2 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(web): platform MFA enroll/challenge/disable with fail-closed surfacing` (no Co-Authored-By).
````

---

### Task 11.3 — Platform sessions (revoke-all)

- **Status**: ✅ Done
- **Priority**: P1
- **Size**: S
- **Depends on**: 11.1

#### Description

Build `platform/(protected)/sessions` — the current-session card (derived from `/auth/platform/me` + the decoded platform token's `jti`) plus the **revoke-all-platform-sessions** action, honestly documenting that the platform domain ships only bulk revoke (no per-session list/revoke route).

#### Acceptance criteria

- [ ] `lib/platform-client.ts` gains `platformSessions.revokeAll` targeting `DELETE /auth/platform/sessions` (mirrors `revoke_all_platform_sessions`).
- [ ] `app/platform/(protected)/sessions/page.tsx` renders a single current-session card (admin email/role from `getMe`, `lastLoginAt`, and the `jti` from the decoded token in mono) using the shared **Sessions table** styling.
- [ ] A "Revoke all platform sessions" destructive action requires an explicit confirm; on success the admin's own session is gone, so the page routes to `/platform/login`.
- [ ] The page states explicitly that the platform domain exposes ONLY bulk revoke — no per-session enumeration or per-row revoke (unlike the dashboard) — i.e. roadmap honesty, not a faked list.
- [ ] 100% Vitest coverage on the new files, including the confirm + post-revoke redirect.

#### Files to create / modify

- `apps/web/lib/platform-client.ts` (extend with `platformSessions`)
- `apps/web/app/platform/(protected)/sessions/page.tsx`
- `apps/web/__tests__/platform/sessions.test.tsx`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 11 (Platform Console) — Task 11.3 of 4 (MIDDLE)

PRECONDITIONS
- Task 11.1 is done: the platform client (`getMe`/`logout`), the guarded `(protected)` shell, and the login page exist.
- The shared **Sessions table** component exists (DASHBOARD § 6) — columns device/ip/lastActivity/isCurrent with the current row pinned + glow-bordered.

REQUIRED READING (only these — do not load more):
- docs/DASHBOARD.md § 6 (the Sessions table component) and § 7 "`/platform/*`" (platform sessions = revoke-all).
- /tmp/rust-auth-example-research/DOSSIER.md § 1.6 — DELETE `/auth/platform/sessions` (204, PlatformUser) -> `routes::platform::revoke_all`. NOTE: there is NO platform sessions LIST route and `PlatformAuthService` exposes only `login`/`me`/`refresh`/`logout`/`revoke_all_platform_sessions` (§ 1.4) — the platform domain is bulk-revoke only.

TASK
Build the platform sessions page: a current-session card from `getMe` + the decoded token's `jti`, plus a confirmed revoke-all-platform-sessions action that signs the admin out. Honestly document the bulk-only boundary (no per-session list/revoke exists).

DELIVERABLES

1. `apps/web/lib/platform-client.ts` — extend:
   ```ts
   export const platformSessions = {
     /** DELETE /auth/platform/sessions — revoke_all_platform_sessions (bulk only; 204). */
     async revokeAll(): Promise<void> { await fetcher('/auth/platform/sessions', { method: 'DELETE' }) },
   }
   ```

2. `apps/web/app/platform/(protected)/sessions/page.tsx` — client component:
   - Render ONE current-session card (admin email/role + `lastLoginAt` from `platformClient.getMe()`, plus the `jti` decoded from the access token, in mono), styled with the shared Sessions table primitives.
   - A "Revoke all platform sessions" destructive button behind an explicit confirm -> `platformSessions.revokeAll()` -> on success route to `/platform/login` (the admin's own session is now revoked).
   - Render an explicit note: the platform domain ships ONLY bulk revoke — no per-session list/per-row revoke (unlike `/dashboard/sessions`). Do not fabricate a multi-row list.
   ```tsx
   import { useRouter } from 'next/navigation'
   import { platformClient, platformSessions } from '@/lib/platform-client'
   // ... confirm dialog from components/ui/*; mono for jti.
   ```

3. `apps/web/__tests__/platform/sessions.test.tsx` — cover the current-session card render, the confirm gate, and the post-revoke redirect to `/platform/login` (mock the client + router).

Constraints:
- Do NOT invent a per-session list — the library has none; state the boundary honestly.
- The revoke is destructive — require an explicit confirm.
- `jti` and any machine value render in mono; no secrets in the DOM.
- English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config; no `.gitkeep`; `git switch -c` only; design-system composed, never re-styled.

Verification:
- `pnpm -C apps/web typecheck` — expected: no type errors.
- `pnpm -C apps/web lint` — expected: clean.
- `pnpm -C apps/web test:cov` — expected: passes; the sessions page + `platformSessions` at 100% (Vitest `maxWorkers: '50%'`).
- `pnpm -C apps/web build` — expected: production build succeeds.
- `grep -riE "phase [0-9]|task [0-9]" apps/web/app/platform/\(protected\)/sessions` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `3 / 4` and Last updated.
4. Update the P11 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 11.3 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(web): platform sessions revoke-all` (no Co-Authored-By).
````

---

### Task 11.4 — Platform users (read-only)

- **Status**: ✅ Done
- **Priority**: P2
- **Size**: S
- **Depends on**: 11.1

#### Description

Build `platform/(protected)/users` — a read-only roster of platform admins rendered from an example-owned `GET /platform/users` endpoint (guarded by the `PlatformUser` extractor, projecting to `SafeAuthPlatformUser` / `AuthPlatformUserClient`), with the explicit domain-isolation messaging. This is the LAST task in the phase — run the per-phase completion protocol.

#### Acceptance criteria

- [ ] `apps/api` exposes an example-owned `GET /platform/users` handler guarded by `bymax_auth_axum::PlatformUser` so a dashboard token can never reach it; it returns `Vec<SafeAuthPlatformUser>` (serializing as `AuthPlatformUserClient[]`, no secrets).
- [ ] `app/platform/(protected)/users/page.tsx` renders a read-only `Table` (email / role / status / lastLoginAt) of `AuthPlatformUserClient` — no mutation affordances.
- [ ] The page carries an explicit domain-isolation banner ("Platform-only view — a dashboard session is bounced from this domain").
- [ ] The view never renders a secret; values are projection-only (the handler returns `SafeAuthPlatformUser`, never `AuthPlatformUser`).
- [ ] 100% Vitest coverage on the web page; the API handler passes its nextest case and clippy is clean.
- [ ] The phase Definition of Done is met: platform login → shell → MFA → sessions → users all work against the live stack and a dashboard token is bounced from every `(protected)` route.

#### Files to create / modify

- `apps/api/src/platform/users.rs` (example-owned read handler) + its route registration in `apps/api/src/platform/mod.rs`
- `apps/web/app/platform/(protected)/users/page.tsx`
- `apps/web/__tests__/platform/users.test.tsx`, `apps/api/tests/platform_users.rs`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 11 (Platform Console) — Task 11.4 of 4 (LAST)

PRECONDITIONS
- Tasks 11.1–11.3 are done: the platform login, the guarded `(protected)` shell, platform MFA, and platform sessions exist; the edge + server guards enforce `type === "platform"`.
- `apps/api` already wires `PlatformUserRepository` (sqlx/Postgres) and mounts `/auth/platform/*`; the example owns its `platform_users` table/migration.

REQUIRED READING (only these — do not load more):
- docs/DASHBOARD.md § 7 "`/platform/*`" — the read-only platform-users view + the domain-isolation state ("a dashboard session is bounced ... surfaced as an explicit 'wrong identity domain' message").
- docs/OVERVIEW.md § 12 — the platform domain projection (`SafeAuthPlatformUser` -> `AuthPlatformUserClient`, credential-free) and the two-domain isolation.
- /tmp/rust-auth-example-research/DOSSIER.md § 1.1 (`domain::SafeAuthPlatformUser`, ts-export `AuthPlatformUserClient`; `From<AuthPlatformUser> for SafeAuthPlatformUser` drops secrets) and § 1.6 (the `PlatformUser(pub PlatformClaims)` extractor). NOTE: `PlatformUserRepository` has NO list method — the roster is an EXAMPLE-OWNED endpoint querying the example's `platform_users` table directly and projecting to `SafeAuthPlatformUser`.

TASK
Add an example-owned, `PlatformUser`-guarded read-only `GET /platform/users` endpoint and the web page that renders it as a read-only roster with the domain-isolation banner. Then run the per-phase completion protocol (this is the last task in P11).

DELIVERABLES

1. `apps/api/src/platform/users.rs` — the read handler (guarded; projection-only):
   ```rust
   use axum::{extract::State, Json};
   use bymax_auth_axum::PlatformUser;             // FromRequestParts guard: PlatformClaims
   use bymax_auth_types::domain::SafeAuthPlatformUser; // serializes as `AuthPlatformUserClient`
   use crate::{app::AppState, auth::AppError};

   /// Read-only platform-admin roster (example-owned; the library exposes no list route).
   /// The `PlatformUser` guard means a dashboard token can never reach this handler.
   pub async fn list_platform_users(
       PlatformUser(_claims): PlatformUser,
       State(state): State<AppState>,
   ) -> Result<Json<Vec<SafeAuthPlatformUser>>, AppError> {
       // example-owned query against the example's `platform_users` table; projects to the
       // credential-free `SafeAuthPlatformUser` (never `AuthPlatformUser`).
       let admins = state.platform_admins().list_safe().await?;
       Ok(Json(admins))
   }
   ```
   Register it in `apps/api/src/platform/mod.rs` (e.g. `.route("/platform/users", get(users::list_platform_users))`).

2. `apps/web/app/platform/(protected)/users/page.tsx` — server component, read-only table:
   ```tsx
   import { cookies } from 'next/headers'
   import type { AuthPlatformUserClient } from '@bymax-one/rust-auth/shared'

   async function fetchPlatformUsers(): Promise<AuthPlatformUserClient[]> {
     const cookie = (await cookies()).toString()
     const res = await fetch(`${process.env.INTERNAL_API_URL}/platform/users`, {
       headers: { cookie },          // forward the platform cookie; the API guard enforces the domain
       cache: 'no-store',
     })
     return res.json()
   }
   // render a read-only Table (email / role / status / lastLoginAt) from components/ui/* — NO mutation
   // controls — and an isolation banner: "Platform-only view — a dashboard session is bounced here."
   ```

3. Tests:
   - `apps/web/__tests__/platform/users.test.tsx` — read-only table render + the isolation banner (mock fetch); assert no mutation control exists.
   - `apps/api/tests/platform_users.rs` — `GET /platform/users` returns 200 + the projection for a platform token, and is rejected for a dashboard token (no `PlatformClaims`); assert no secret field appears in the body.

Constraints:
- The handler returns `SafeAuthPlatformUser` only — never `AuthPlatformUser`; no secret reaches the wire or the DOM.
- The page is strictly read-only — no write affordances.
- Rust: `#![forbid(unsafe_code)]`; no unwrap/expect/panic in non-test code; typed `AppError` via `thiserror` -> `IntoResponse`.
- English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config; no `.gitkeep`; `git switch -c` only; design-system composed, never re-styled.

Verification:
- `pnpm -C apps/web typecheck` — expected: no type errors.
- `pnpm -C apps/web lint` — expected: clean.
- `pnpm -C apps/web test:cov` — expected: passes; the users page at 100% (Vitest `maxWorkers: '50%'`).
- `pnpm -C apps/web build` — expected: production build succeeds.
- `pnpm audit:exports` — expected: passes.
- `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
- `cargo nextest run -p api platform_users` — expected: passes (200 + projection for a platform token; rejected for a dashboard token; no secret in the body).
- `grep -riE "phase [0-9]|task [0-9]" apps/web/app/platform/\(protected\)/users apps/api/src/platform/users.rs` — expected: no matches.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `4 / 4` and Last updated.
4. Update the P11 row Progress in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 11.4 ✅ <YYYY-MM-DD> — <summary>`.
6. Commit `feat(web): read-only platform users view with domain isolation` (no Co-Authored-By).
(The LAST task also runs the PER-PHASE protocol below: flip P11 to ✅ / 4 of 4, advance the Active phase, recompute Overall %.)
````

---

## Phase Completion Protocol

Run this closeout when the **last** task (11.4) is ✅:

1. Confirm **all four tasks are ✅** and the P11 Definition of Done is met: platform login → guarded admin shell → platform MFA enroll/challenge/disable → revoke-all-platform-sessions → read-only platform users all work against the live stack, and a dashboard token is bounced from every `/platform/(protected)/*` route (and a platform token from `/dashboard/*`).
2. Confirm the PR is merged and CI is green (web `typecheck`/`lint`/`test:cov` at 100% on `app/platform/**` + `lib/platform-*`, `audit:exports`, `build`, and the Playwright platform-isolation journey; the API `platform_users` case and clippy clean).
3. In [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md): set the **P11** Status to ✅, Progress to `4 / 4`, refresh Last updated, advance the **Active phase** pointer to the next phase (P12), and recompute the **Overall progress** percentage.
4. Set this file's header **Status** to ✅.
5. Commit `docs(plan): P11 complete`.
6. If any DoD bullet is unmet, mark the phase 🟡 (Partial) instead of ✅ and record the gap in the Completion log.

---

## Completion log

> Append-only. One line per completed task: `- <id> ✅ YYYY-MM-DD — <summary>`.

- 11.1 ✅ 2026-07-03 — Platform login + protected shell: `lib/platform-client.ts` on `createAuthFetch`, login page with inline MFA step, edge proxy domain isolation, server layout defense-in-depth, `app/api/platform/client-refresh/route.ts`
- 11.2 ✅ 2026-07-03 — Platform MFA: enroll/verify-enable/disable/regenerate flows in `app/platform/(protected)/security/page.tsx`; fail-closed `auth.mfa_not_enabled` surfaced honestly
- 11.3 ✅ 2026-07-03 — Platform sessions (bulk-only): `app/platform/(protected)/sessions/page.tsx` with revoke-all confirm dialog; no per-session list or per-row revoke
- 11.4 ✅ 2026-07-03 — Platform users (read-only): `GET /platform/users` Rust handler (`PlatformAdmin` guard, safe-columns-only SQL, `SafeAuthPlatformUser` response); read-only server-component page with domain-isolation banner
