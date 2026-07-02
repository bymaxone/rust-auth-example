# Phase 8 — Web Skeleton & Design System

> **Status**: ✅ Done · **Progress**: 6 / 6 tasks · **Last updated**: 2026-07-02
> **Source roadmap**: [`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) § P8
> **Source spec**: [`docs/OVERVIEW.md`](../OVERVIEW.md)
> **Executing a task?** Read **only** that task's `### Task N.n` block + its bounded *REQUIRED READING* — never the whole file. See [token economy](README.md#token-economy--executing-a-single-task).

> **Build integration (resolved).** An earlier build-integration issue — the `@bymax-one/rust-auth/nextjs` barrel
> eagerly initialised its edge WASM, and the library's bare `next/server` import was not Node-ESM resolvable when
> externalized via `serverExternalPackages` — was fixed in the library (the edge WASM now loads lazily via a memoized
> dynamic `import()`, and `next/server.js` is imported fully-specified). The app now **bundles** the package instead of
> externalizing it, so `pnpm -C apps/web build` succeeds; a dedicated `build-web` CI job runs the production build to
> guard against regressions. Type-check, lint, format, and the 100%-covered unit suite are green.

---

## Context

By the end of P7 the backend is complete: the axum API hosts `AuthEngine`, mounts the library router at `/auth/**`
(register / login / logout / refresh / me, email-verification, password-reset, MFA, sessions, OAuth, invitations, the
platform domain, and `ws-ticket`), writes the `audit_log` through `AuditAuthHooks`, and serves the example-owned
`/audit/*` and `/diagnostics/*` routes. P2 already built the `@bymax-one/rust-auth` npm package (`pnpm build:wasm &&
pnpm build`) and `file:`-linked it, and wired the `build-library` CI job + the `audit:exports` gate. What is missing is
the consumer: there is **no `apps/web` yet**.

P8 stands up `apps/web` — the Next.js 16 + React 19 + Tailwind 4 console **shell** — under the **verbatim** shared
design system, consuming all four `@bymax-one/rust-auth` subpaths. The `/react` `AuthProvider` + hooks become the spine
(`app/layout.tsx` + `providers.tsx`); the `/client` fetch client becomes the `lib/` setup
(`createAuthClient` / `createAuthFetch` single-flight); the `/nextjs` edge proxy + WASM verifier protect routes in
`middleware.ts` and back the three `app/api/auth/*` route handlers; and the `/shared` constants drive the exhaustive
error-code localization map. This phase also raises the app shell (64px topbar / 250px sidebar) with the global controls
(tenant selector, delivery-mode chip, `useAuthStatus()` session badge, live toggle) whose view-state persists in the URL
via `nuqs`.

When P8 is done, `pnpm -C apps/web build` succeeds (resolving the `file:`-linked package with `serverExternalPackages`
set); the middleware edge-verifies a valid session cookie via the WASM `verifyJwtToken` and bounces an invalid one to
the matching login **without a backend round-trip**; the shell renders pixel-faithful to the sibling examples; the three
route handlers answer at `/api/auth/{client-refresh,silent-refresh,logout}`; `lib/error-messages.ts` localizes **every**
one of the 38 `AUTH_ERROR_CODES` members (so `pnpm audit:exports` passes); and the new `lib/` + `hooks/` are at 100%
coverage. **This phase builds the shell, providers, middleware, route handlers, and `lib/` client setup ONLY — every
public-page body lands in P9 and every authenticated dashboard / platform surface in P10–P11.**

---

## Rules-of-phase

1. **`lib/` is JSX-free.** Everything under `apps/web/lib/` is plain TypeScript (clients, the error-code map, severity
   helpers) so it can be imported from both server and client modules and unit-tested without a DOM render.
2. **`/nextjs` is server/edge-only.** The subpath carries `import "server-only"` — it may appear **only** in
   `middleware.ts` and the `app/api/auth/*/route.ts` handlers, never in a client component. Importing it into a
   `'use client'` file is a hard error to avoid.
3. **Design system verbatim.** `globals.css`, `tailwind.config.ts`, `postcss.config.mjs`, `components.json`, and
   `components/ui/*` are copied **byte-for-byte** from the sibling and never re-styled — forced dark, brand orange
   `#ff6224`, glass `rgba(255,255,255,0.06)`, Geist + GeistMono. Compose the primitives; never fork one.
4. **Error-code localization is exhaustive.** `lib/error-messages.ts` maps **every** `AUTH_ERROR_CODES` member (the 38
   wire-visible codes) to a message + severity, enforced at compile time with `satisfies Record<AuthErrorCode, …>` and
   gated by `audit:exports` — adding a code to the library and not localizing it must fail.
5. **URL is the source of view-state.** The tenant selector, the live toggle, and every later filter persist via `nuqs`
   so each view is a shareable deep-link; never hold this state in ad-hoc React state.
6. **Overlays above the topbar.** Toasts (`sonner`), menus, and dialogs render above the 64px topbar; the shell layout is
   the sibling-standard 64px topbar + 250px sidebar (collapsible under `lg`).
7. **Memory-safe tests.** Vitest runs with `maxWorkers: '50%'` **baked into `vitest.config.ts`** plus
   `NODE_OPTIONS=--max-old-space-size`; never fan out parallel test agents.
8. **Tokens never in `localStorage`.** The session lives in HttpOnly cookies (+ in-memory for bearer mode); never persist
   an access/refresh token to web storage.
9. **Timeless, English-only.** No `Phase N` / `Task` / roadmap references in any committed source or config; comments
   explain *what/why*, not *which stage*. Conventional Commits, **no `Co-Authored-By` trailer**; branch with
   `git switch -c` (never `git checkout -b`); no `.gitkeep` / empty-dir placeholders.

---

## Reference docs

- [`OVERVIEW.md`](../OVERVIEW.md) — §3 Architecture at a Glance (the `apps/web` → `/react`/`/client`/`/nextjs`/`/shared`
  fan-out), §7 Library Consumption (the `file:` link + `serverExternalPackages` + `outputFileTracingRoot`), §10 The Demo
  Domain & Auth Console (the console areas + global controls).
- [`DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) — § P8 (scope / DoD / rules), §2 Global Conventions (TS strict set,
  memory-safe tests, design-system-verbatim), Appendix B (the export → phase map; P8 owns matrix rows 28-partial, 29, 30).
- [`DASHBOARD.md`](../DASHBOARD.md) — §2 The shared design system (verbatim) + the token table, §3 App shell & global
  controls, §4 Information architecture (the `app/` tree + the protected-route matcher), §5 The client layer (the
  `AuthProvider` / `createAuthClient` / `createAuthProxy` usage shapes).
- Verbatim design-system source (copy byte-for-byte): `~/Documents/MyApps/bymax-one/nest-auth-example/apps/web/`
  (`app/globals.css`, `tailwind.config.ts`, `postcss.config.mjs`, `components.json`, `components/ui/*`) and its
  `next.config.mjs` / `vitest.config.ts` / `proxy.ts` / `app/api/auth/*` handlers as the adapt-and-reuse template.
- /bymax-workflow:standards — universal coding rules (apply the Rust track for shared discipline; the TS track for `apps/web`).

---

## Task index

| ID | Task | Status | Priority | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| 8.1 | Next app scaffold + design system verbatim | ✅ | P0 | M | — |
| 8.2 | Root layout + `AuthProvider` providers | ✅ | P0 | M | 8.1 |
| 8.3 | App shell + global controls (nuqs) | ✅ | P0 | M | 8.2 |
| 8.4 | Edge proxy + WASM route protection | ✅ | P0 | M | 8.1 |
| 8.5 | `/api/auth/*` route handlers | ✅ | P1 | S | 8.4 |
| 8.6 | `lib/` client + exhaustive error localization | ✅ | P0 | M | 8.1 |

---

## Tasks

### Task 8.1 — Next app scaffold + design system verbatim

- **Status**: ✅
- **Priority**: P0
- **Size**: M
- **Depends on**: —

#### Description

Create the `apps/web` Next.js 16 + React 19 + Tailwind 4 package (consuming the `file:`-linked `@bymax-one/rust-auth`)
and copy the shared design system byte-for-byte from the sibling so the console renders with design parity.

#### Acceptance criteria

- [x] `apps/web/package.json` declares `next ^16`, `react ^19`, `react-dom ^19`, `@bymax-one/rust-auth:
  file:../../../rust-auth/packages/rust-auth`, plus `nuqs`, `sonner`, `lucide-react`, `@tanstack/react-query`, `geist`,
  `tailwindcss ^4`, and the test stack (`vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`,
  `playwright`, `@stryker-mutator/*`).
- [x] `apps/web/next.config.mjs` **bundles** `@bymax-one/rust-auth` (no `serverExternalPackages`, since the library
  loads its edge WASM lazily) and sets `outputFileTracingRoot: path.join(import.meta.dirname, '../..')`.
- [x] `app/globals.css`, `tailwind.config.ts`, `postcss.config.mjs`, `components.json`, and `components/ui/*` are
  **byte-identical** to the sibling source (the `#ff6224` primary, glass `0.06`, Geist + GeistMono, forced dark are
  preserved); `diff` against the sibling produces no output.
- [x] `vitest.config.ts` bakes in `test: { maxWorkers: '50%', environment: 'jsdom' }` and a `coverage.thresholds` of 100;
  `tsconfig.json` extends the root `tsconfig.base.json`.
- [x] `pnpm install --frozen-lockfile` resolves the `file:` link; no `.gitkeep` / empty-dir placeholders.

#### Files to create / modify

- `apps/web/package.json`, `apps/web/next.config.mjs`, `apps/web/tsconfig.json`
- `apps/web/app/globals.css`, `apps/web/tailwind.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/components.json`
- `apps/web/components/ui/*` (copied verbatim)
- `apps/web/vitest.config.ts`, `apps/web/vitest.setup.ts`
- `pnpm-workspace.yaml` (ensure `apps/web` is matched), `pnpm-lock.yaml`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 8 (Web Skeleton & Design System) — Task 8.1 of 6 (FIRST)

PRECONDITIONS
- P2 built @bymax-one/rust-auth (pnpm build:wasm && pnpm build) and exposes the 4 subpaths (/client, /react, /nextjs, /shared); the file: link target exists at ../../../rust-auth/packages/rust-auth.
- The pnpm workspace + tsconfig.base.json + the audit:exports gate already exist. There is no apps/web yet.

REQUIRED READING (only these — do not load more):
- docs/OVERVIEW.md § "7. Library Consumption" — the file: link + next.config (serverExternalPackages + outputFileTracingRoot).
- docs/DASHBOARD.md § "2. The shared design system (verbatim)" — the token table (#ff6224, glass 0.06, Geist + GeistMono, forced dark) and the verbatim-copy rule.
- The verbatim source to copy byte-for-byte: ~/Documents/MyApps/bymax-one/nest-auth-example/apps/web/{app/globals.css, tailwind.config.ts, postcss.config.mjs, components.json, components/ui/*} + its next.config.mjs / vitest.config.ts (adapt only the package name and paths).

TASK
Scaffold apps/web (Next 16 + React 19 + Tailwind 4) consuming the file:-linked @bymax-one/rust-auth, and copy the shared design system byte-for-byte. No page bodies, no layout yet (those are 8.2+).

DELIVERABLES
1. `apps/web/package.json`:
   - The dependency set + scripts (typecheck / lint / build / test:cov).
   ```json
   {
     "name": "@rust-auth-example/web",
     "private": true,
     "type": "module",
     "scripts": {
       "dev": "next dev",
       "build": "next build",
       "typecheck": "tsc --noEmit",
       "lint": "next lint --max-warnings 0",
       "test:cov": "NODE_OPTIONS=--max-old-space-size=4096 vitest run --coverage"
     },
     "dependencies": {
       "@bymax-one/rust-auth": "file:../../../rust-auth/packages/rust-auth",
       "next": "^16.0.0",
       "react": "^19.0.0",
       "react-dom": "^19.0.0",
       "geist": "^1.3.0",
       "nuqs": "^2.0.0",
       "sonner": "^1.5.0",
       "lucide-react": "^0.460.0",
       "@tanstack/react-query": "^5.59.0"
     },
     "devDependencies": {
       "tailwindcss": "^4.0.0",
       "@tailwindcss/postcss": "^4.0.0",
       "vitest": "^2.1.0",
       "@vitest/coverage-v8": "^2.1.0",
       "@vitejs/plugin-react": "^4.3.0",
       "jsdom": "^25.0.0",
       "@testing-library/react": "^16.0.0",
       "@playwright/test": "^1.48.0"
     }
   }
   ```
2. `apps/web/next.config.mjs`:
   ```js
   import path from 'node:path'

   /** @type {import('next').NextConfig} */
   export default {
     serverExternalPackages: ['@bymax-one/rust-auth'],
     outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
   }
   ```
3. The design system copied verbatim: `apps/web/app/globals.css`, `apps/web/tailwind.config.ts`,
   `apps/web/postcss.config.mjs`, `apps/web/components.json`, `apps/web/components/ui/*`. Do NOT edit a single token.
4. `apps/web/vitest.config.ts` — `test: { environment: 'jsdom', maxWorkers: '50%', setupFiles: ['./vitest.setup.ts'], coverage: { provider: 'v8', thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 } } }`; `apps/web/vitest.setup.ts` (jest-dom matchers). `apps/web/tsconfig.json` extends `../../tsconfig.base.json`.

Constraints:
- TypeScript strict (no any, no suppression comments). English-only TIMELESS comments — NO Phase/Task/roadmap references in any committed source/config. No .gitkeep / empty-dir scaffolding. git switch -c only.
- The design-system files are copied verbatim — never re-styled, never re-derived; only the package name/paths in next.config / vitest.config may be adapted.

Verification:
- `diff apps/web/app/globals.css ~/Documents/MyApps/bymax-one/nest-auth-example/apps/web/app/globals.css` — expected: no output (byte-identical).
- `grep -q "serverExternalPackages" apps/web/next.config.mjs` — expected: match.
- `pnpm install --frozen-lockfile` — expected: resolves the @bymax-one/rust-auth file: link with no error.
- `find apps/web -name .gitkeep -o -name .keep` — expected: no output.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `1 / 6` and Last updated to today.
4. Update the P8 row Progress to `1 / 6` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 8.1 ✅ <YYYY-MM-DD> — Next app scaffold + design system verbatim`.
6. Commit `chore(web): scaffold apps/web + verbatim design system` (no Co-Authored-By).
````

---

### Task 8.2 — Root layout + `AuthProvider` providers

- **Status**: ✅
- **Priority**: P0
- **Size**: M
- **Depends on**: 8.1

#### Description

Author `app/layout.tsx` (Geist + GeistMono, forced dark, `globals.css`) and `app/providers.tsx` wrapping the tree in the
`/react` `<AuthProvider>` (the typed `authClient`, 300 000 ms revalidate) so `useSession` / `useAuthStatus` hydrate.

#### Acceptance criteria

- [x] `app/layout.tsx` sets `<html lang="en" className="dark …">` (forced dark) with the Geist + GeistMono font variables,
  imports `./globals.css`, exports `metadata`, and renders `<Providers>{children}</Providers>`.
- [x] `app/providers.tsx` is a `'use client'` module that mounts `<AuthProvider client={authClient}
  revalidateInterval={300_000}>`, the `nuqs` `NuqsAdapter`, the TanStack `QueryClientProvider`, and the `sonner`
  `<Toaster>` (overlay above the topbar).
- [x] A minimal `app/page.tsx` placeholder exists so the app builds; `pnpm -C apps/web build` succeeds.
- [x] `useSession()` / `useAuthStatus()` resolve from a test that renders a probe component inside `<Providers>` (no
  unhandled-promise warnings); 100% coverage on `app/providers.tsx`.

#### Files to create / modify

- `apps/web/app/layout.tsx`, `apps/web/app/providers.tsx`, `apps/web/app/page.tsx`
- `apps/web/app/providers.test.tsx`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 8 (Web Skeleton & Design System) — Task 8.2 of 6 (MIDDLE)

PRECONDITIONS
- Task 8.1 done: apps/web exists with the verbatim design system, next.config (serverExternalPackages), and vitest.config (maxWorkers 50%, thresholds 100). The file: link resolves.

REQUIRED READING (only these — do not load more):
- docs/DASHBOARD.md § "5. The client layer" — the AuthProvider usage shape (flat props: client={authClient}, revalidateInterval 300_000; routePrefix lives on createAuthClient).
- DOSSIER §1.8 /react surface: `AuthProvider(props:AuthProviderProps)`, `useSession()=>{user,status,isLoading,refresh,lastValidation}`, `useAuthStatus()=>{isAuthenticated,isLoading}`, default revalidate 300000 ms.
- The sibling template: ~/Documents/MyApps/bymax-one/nest-auth-example/apps/web/app/{layout.tsx,providers.tsx} (adapt to @bymax-one/rust-auth).

TASK
Author the root layout (Geist + GeistMono, forced dark) and the providers module that mounts <AuthProvider> + the nuqs/query/toast providers, plus a minimal page so the app builds.

DELIVERABLES
1. `apps/web/app/layout.tsx`:
   ```tsx
   import type { Metadata } from 'next'
   import type { ReactNode } from 'react'
   import { GeistSans } from 'geist/font/sans'
   import { GeistMono } from 'geist/font/mono'
   import { Providers } from './providers'
   import './globals.css'

   export const metadata: Metadata = {
     title: 'rust-auth-example — Auth Console',
     description: 'Reference console for @bymax-one/rust-auth',
   }

   /** Forced-dark root document; Geist for prose, GeistMono for opaque machine values. */
   export default function RootLayout({ children }: { readonly children: ReactNode }) {
     return (
       <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
         <body>
           <Providers>{children}</Providers>
         </body>
       </html>
     )
   }
   ```
2. `apps/web/app/providers.tsx`:
   ```tsx
   'use client'
   import type { ReactNode } from 'react'
   import { useState } from 'react'
   import { AuthProvider } from '@bymax-one/rust-auth/react'
   import { authClient } from '@/lib/auth-client'
   import { NuqsAdapter } from 'nuqs/adapters/next/app'
   import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
   import { Toaster } from 'sonner'

   /** App-wide providers: session spine + URL state + server-state cache + toasts. */
   export function Providers({ children }: { readonly children: ReactNode }) {
     const [queryClient] = useState(() => new QueryClient())
     return (
       <NuqsAdapter>
         <QueryClientProvider client={queryClient}>
           <AuthProvider client={authClient} revalidateInterval={300_000}>
             {children}
             <Toaster richColors position="top-right" />
           </AuthProvider>
         </QueryClientProvider>
       </NuqsAdapter>
     )
   }
   ```
3. `apps/web/app/page.tsx` — a minimal Overview placeholder (a single glass card) so the build has a root route; real Overview lands later.
4. `apps/web/app/providers.test.tsx` — render a probe that calls `useAuthStatus()` inside `<Providers>`; assert it resolves without throwing; 100% coverage on providers.tsx.

Constraints:
- providers.tsx is `'use client'`; NEVER import @bymax-one/rust-auth/nextjs here (server/edge-only). TypeScript strict, no any/suppression. English-only TIMELESS comments — NO Phase/Task/roadmap references. Design system verbatim (compose, never re-style). git switch -c only.

Verification:
- `pnpm -C apps/web build` — expected: succeeds (resolves the file: package, with serverExternalPackages).
- `grep -q "client={authClient}" apps/web/app/providers.tsx` — expected: match.
- `grep -q "className={`dark" apps/web/app/layout.tsx` — expected: forced-dark class present.
- `pnpm -C apps/web test:cov` — expected: providers.test passes, providers.tsx at 100%.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `2 / 6` and Last updated.
4. Update the P8 row Progress to `2 / 6` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 8.2 ✅ <YYYY-MM-DD> — root layout + AuthProvider providers`.
6. Commit `feat(web): root layout + AuthProvider providers` (no Co-Authored-By).
````

---

### Task 8.3 — App shell + global controls (nuqs)

- **Status**: ✅
- **Priority**: P0
- **Size**: M
- **Depends on**: 8.2

#### Description

Build the 64px topbar / 250px sidebar shell and the topbar global controls — tenant selector, delivery-mode chip,
`useAuthStatus()` session badge, and the live toggle — with all view-state persisted in the URL via `nuqs`.

#### Acceptance criteria

- [x] `components/shell/AppShell.tsx` renders the fixed **64px topbar** + the **250px sidebar** (collapsible under `lg`),
  composing only `components/ui/*` primitives (never re-styled); the active nav glows `--primary`.
- [x] `components/controls/TenantSelector.tsx` uses `nuqs` `useQueryState('tenant')` (default `acme`) and sets the
  `tenant_id` later sent on login/register/reset; `DeliveryModeChip.tsx` renders the configured `TokenDelivery`
  informationally; `LiveToggle.tsx` uses `useQueryState('live')` (boolean) to pause/resume the SSE tail.
- [x] `components/controls/SessionBadge.tsx` consumes `/react` `useAuthStatus()` → renders a skeleton while
  `isLoading`, the email/avatar when `isAuthenticated`, or a "Sign in" affordance otherwise.
- [x] 100% coverage on every new `components/shell/*` and `components/controls/*` file (loading / authenticated /
  unauthenticated branches, the nuqs round-trip).

#### Files to create / modify

- `apps/web/components/shell/AppShell.tsx`, `apps/web/components/shell/Sidebar.tsx`, `apps/web/components/shell/Topbar.tsx`
- `apps/web/components/controls/{TenantSelector,DeliveryModeChip,SessionBadge,LiveToggle}.tsx`
- `apps/web/components/controls/*.test.tsx`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 8 (Web Skeleton & Design System) — Task 8.3 of 6 (MIDDLE)

PRECONDITIONS
- Task 8.2 done: app/layout.tsx + providers.tsx mount <AuthProvider> + NuqsAdapter; useSession/useAuthStatus hydrate; the app builds.

REQUIRED READING (only these — do not load more):
- docs/DASHBOARD.md § "3. App shell & global controls" — the 64px topbar / 250px sidebar, the topbar control table (tenant selector, delivery-mode chip, session badge, live toggle), and the nuqs URL-state rule.
- DOSSIER §1.8 /react surface: `useAuthStatus()=>{isAuthenticated, isLoading}`.
- The sibling shell: ~/Documents/MyApps/bymax-one/nest-auth-example/apps/web/components/ (topbar/sidebar/controls — adapt to this project; same design system).

TASK
Build the app shell (64px topbar / 250px sidebar) and the four topbar global controls, with view-state persisted via nuqs and the session badge driven by useAuthStatus().

DELIVERABLES
1. `apps/web/components/shell/AppShell.tsx` + `Topbar.tsx` + `Sidebar.tsx` — the fixed 64px topbar + 250px collapsible sidebar; the Dashboard/Platform nav sections; active route glows `--primary`. Compose `components/ui/*` only.
2. `apps/web/components/controls/SessionBadge.tsx`:
   ```tsx
   'use client'
   import { useAuthStatus } from '@bymax-one/rust-auth/react'
   import { Skeleton } from '@/components/ui/skeleton'

   /** Cheap topbar identity badge: skeleton → "Sign in" → email/avatar. */
   export function SessionBadge() {
     const { isAuthenticated, isLoading } = useAuthStatus()
     if (isLoading) return <Skeleton className="h-8 w-32 rounded-pill" />
     return isAuthenticated ? <AuthenticatedBadge /> : <SignInButton />
   }
   ```
3. `apps/web/components/controls/TenantSelector.tsx`:
   ```tsx
   'use client'
   import { useQueryState } from 'nuqs'
   import { Select } from '@/components/ui/select'

   const TENANTS = ['acme', 'globex'] as const

   /** Sets tenant_id (URL-persisted) sent on login/register/reset; hidden in the platform section. */
   export function TenantSelector() {
     const [tenant, setTenant] = useQueryState('tenant', { defaultValue: 'acme' })
     // render a Select over TENANTS bound to [tenant, setTenant]
   }
   ```
4. `apps/web/components/controls/DeliveryModeChip.tsx` (renders the configured TokenDelivery) + `LiveToggle.tsx` (`useQueryState('live')` boolean, pauses/resumes the audit tail).
5. Co-located `*.test.tsx` for every control — cover the loading / authenticated / unauthenticated branches and the nuqs round-trip (mock useAuthStatus; assert each branch renders).

Constraints:
- All these are `'use client'` components; NEVER import @bymax-one/rust-auth/nextjs here. View-state goes through nuqs, never ad-hoc state. Compose `components/ui/*` verbatim — never re-style a primitive. Overlays/menus render above the topbar. TypeScript strict, no any/suppression. English-only TIMELESS comments — NO Phase/Task/roadmap references. git switch -c only.

Verification:
- `pnpm -C apps/web build` — expected: succeeds.
- `grep -q "useAuthStatus" apps/web/components/controls/SessionBadge.tsx` — expected: match.
- `grep -q "useQueryState" apps/web/components/controls/TenantSelector.tsx` — expected: match.
- `pnpm -C apps/web test:cov` — expected: shell + controls at 100% (all badge branches covered).

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `3 / 6` and Last updated.
4. Update the P8 row Progress to `3 / 6` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 8.3 ✅ <YYYY-MM-DD> — app shell + global controls`.
6. Commit `feat(web): app shell + topbar global controls` (no Co-Authored-By).
````

---

### Task 8.4 — Edge proxy + WASM route protection

- **Status**: ✅
- **Priority**: P0
- **Size**: M
- **Depends on**: 8.1

#### Description

Wire `middleware.ts` with the `/nextjs` `createAuthProxy` (the edge auth-gating middleware that inspects the session
cookie on `/api/auth/*` and grants or redirects) and the WASM `verifyJwtToken`, protecting `/dashboard/*` and
`/platform/(protected)/*` and redirecting to the matching login on a missing/invalid session — all at the edge, with no
backend round-trip.

#### Acceptance criteria

- [x] `apps/web/proxy.ts` imports `'server-only'` + `createAuthProxy` / `verifyJwtToken` from
  `@bymax-one/rust-auth/nextjs` and `AUTH_ACCESS_COOKIE_NAME` from `/shared`; its `config.matcher` covers
  `/dashboard/:path*`, `/platform/:path*`, and `/api/auth/:path*`.
- [x] A request to a protected path with **no** (or an invalid) access cookie redirects (`307`) to `/auth/login` for
  `/dashboard/*` and to `/platform/login` for `/platform/(protected)/*`; a request with a valid cookie passes through
  (`verifyJwtToken` returns a decoded token — no fetch to the API).
- [x] `/api/auth/*` requests are handed to the `createAuthProxy` instance (an edge auth-gating middleware that inspects
  cookies and grants/redirects); the proxy is constructed with `{ loginPath: '/auth/login', accessTokenSecret:
  AUTH_JWT_SECRET_FOR_PROXY, routePrefix: 'auth' }`.
- [x] The edge verifier uses `AUTH_JWT_SECRET_FOR_PROXY`; the JWT secret is never logged; 100% coverage on the
  proxy/edge-gate decision branches (no cookie / invalid / valid / platform-vs-dashboard target).

#### Files to create / modify

- `apps/web/middleware.ts`, `apps/web/proxy.ts` (the proxy instance)
- `apps/web/middleware.test.ts`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 8 (Web Skeleton & Design System) — Task 8.4 of 6 (MIDDLE)

PRECONDITIONS
- Task 8.1 done: apps/web exists; next.config sets serverExternalPackages: ['@bymax-one/rust-auth'] so the WASM resolves at runtime. Env: INTERNAL_API_URL (proxy target, default http://localhost:4000) and AUTH_JWT_SECRET_FOR_PROXY (the edge HS256 secret, same value as the API's JWT_SECRET).

REQUIRED READING (only these — do not load more):
- docs/DASHBOARD.md § "4. Information architecture" (the protected matcher: /dashboard/* and /platform/(protected)/*) and § "5. The client layer" (the createAuthProxy usage shape + the server-only guard).
- DOSSIER §1.8 /nextjs surface: `verifyJwtToken(token, secret?)=>Promise<DecodedToken>`, `createAuthProxy(config:AuthProxyConfig)=>AuthProxyInstance`, type `AuthProxyConfig`; /shared const `AUTH_ACCESS_COOKIE_NAME`. (Confirm the AuthProxyInstance invocation method against the built dist/**/*.d.ts for /nextjs before wiring.)
- The sibling template: ~/Documents/MyApps/bymax-one/nest-auth-example/apps/web/proxy.ts (adapt — same edge-proxy + verify pattern).

TASK
Author the edge middleware: hand /api/auth/* to the createAuthProxy instance, and edge-verify the session cookie (WASM verifyJwtToken) to protect /dashboard/* and /platform/(protected)/*, redirecting to the matching login on failure.

DELIVERABLES
1. `apps/web/proxy.ts`:
   ```ts
   import 'server-only'
   import { createAuthProxy } from '@bymax-one/rust-auth/nextjs'

   const accessTokenSecret = process.env.AUTH_JWT_SECRET_FOR_PROXY
   if (!accessTokenSecret) throw new Error('AUTH_JWT_SECRET_FOR_PROXY is required for the edge auth gate')

   /** Edge auth-gating middleware: inspects the session cookie on /api/auth/* and grants or redirects (NOT a reverse proxy). */
   export const authProxy = createAuthProxy({ loginPath: '/auth/login', accessTokenSecret, routePrefix: 'auth' })
   ```
2. `apps/web/middleware.ts`:
   ```ts
   import 'server-only'
   import { NextResponse, type NextRequest } from 'next/server'
   import { verifyJwtToken } from '@bymax-one/rust-auth/nextjs'
   import { AUTH_ACCESS_COOKIE_NAME } from '@bymax-one/rust-auth/shared'
   import { authProxy } from './proxy'

   const PROTECTED = [/^\/dashboard(?:\/|$)/, /^\/platform\/(?!login)/]

   /** Edge gate: proxy auth traffic, then WASM-verify the cookie for protected pages (no backend round-trip). */
   export async function middleware(request: NextRequest): Promise<Response> {
     const { pathname } = request.nextUrl
     if (pathname.startsWith('/api/auth/')) {
       return authProxy.proxy(request)
     }
     if (!PROTECTED.some((re) => re.test(pathname))) return NextResponse.next()

     const token = request.cookies.get(AUTH_ACCESS_COOKIE_NAME)?.value
     const decoded = token ? await verifyJwtToken(token, process.env.AUTH_JWT_SECRET_FOR_PROXY) : null
     if (decoded?.isValid) return NextResponse.next()

     const loginPath = pathname.startsWith('/platform') ? '/platform/login' : '/auth/login'
     return NextResponse.redirect(new URL(loginPath, request.url))
   }

   export const config = { matcher: ['/dashboard/:path*', '/platform/:path*', '/api/auth/:path*'] }
   ```
3. `apps/web/middleware.test.ts` — cover: no cookie → redirect to /auth/login; /platform protected + no cookie → redirect to /platform/login; valid cookie (mock verifyJwtToken → decoded) → NextResponse.next(); invalid cookie (mock → null) → redirect. Mock @bymax-one/rust-auth/nextjs.

Constraints:
- @bymax-one/rust-auth/nextjs is server/edge-ONLY (`import "server-only"`) — never reachable from a client component. NEVER log the JWT secret or the token. Fail-closed: any verify error → treat as unauthenticated (redirect). TypeScript strict, no any/suppression. English-only TIMELESS comments — NO Phase/Task/roadmap references. git switch -c only.

Verification:
- `pnpm -C apps/web build` — expected: succeeds (middleware compiles for the edge runtime).
- `grep -q "verifyJwtToken" apps/web/middleware.ts` — expected: match.
- `grep -q "server-only" apps/web/middleware.ts` — expected: match.
- `pnpm -C apps/web test:cov` — expected: middleware.test passes; middleware.ts decision branches at 100%.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `4 / 6` and Last updated.
4. Update the P8 row Progress to `4 / 6` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 8.4 ✅ <YYYY-MM-DD> — edge proxy + WASM route protection`.
6. Commit `feat(web): edge proxy + WASM route protection` (no Co-Authored-By).
````

---

### Task 8.5 — `/api/auth/*` route handlers

- **Status**: ✅
- **Priority**: P1
- **Size**: S
- **Depends on**: 8.4

#### Description

Wire the three `/nextjs` route handlers — `app/api/auth/{client-refresh,silent-refresh,logout}/route.ts` — to
`createClientRefreshHandler` / `createSilentRefreshHandler` / `createLogoutHandler` so the `/client` single-flight
refresh, the edge background refresh, and logout resolve at the documented routes.

#### Acceptance criteria

- [x] `app/api/auth/client-refresh/route.ts` exports the handler from `createClientRefreshHandler(config)` (the
  `/client` single-flight `401 → refresh → replay` target, `CLIENT_REFRESH_ROUTE = "/api/auth/client-refresh"`).
- [x] `app/api/auth/silent-refresh/route.ts` from `createSilentRefreshHandler(config)` and
  `app/api/auth/logout/route.ts` from `createLogoutHandler(config)`; each handler is bound with `AuthHandlerConfig
  { backendUrl: INTERNAL_API_URL, routePrefix: 'auth', loginPath: '/auth/login' }`.
- [x] Each `route.ts` exports the correct HTTP method binding for its handler (confirmed against the handler's contract);
  no business logic is hand-rolled — the factories own it.
- [x] 100% coverage on the three `route.ts` modules (each asserts the exported handler is the factory's result).

#### Files to create / modify

- `apps/web/app/api/auth/client-refresh/route.ts`, `apps/web/app/api/auth/silent-refresh/route.ts`,
  `apps/web/app/api/auth/logout/route.ts`
- `apps/web/app/api/auth/_config.ts` (the shared `AuthHandlerConfig`)
- `apps/web/app/api/auth/*/route.test.ts`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 8 (Web Skeleton & Design System) — Task 8.5 of 6 (MIDDLE)

PRECONDITIONS
- Task 8.4 done: middleware.ts hands /api/auth/* to the createAuthProxy instance; the proxy needs these three route handlers to terminate the refresh/logout flows. Env INTERNAL_API_URL is set.

REQUIRED READING (only these — do not load more):
- DOSSIER §1.8 /nextjs surface: route handlers `createClientRefreshHandler`, `createSilentRefreshHandler`, `createLogoutHandler`; consts `CLIENT_REFRESH_ROUTE="/api/auth/client-refresh"`, `SILENT_REFRESH_ROUTE="/api/auth/silent-refresh"`, `LOGOUT_ROUTE="/api/auth/logout"`; type `AuthHandlerConfig{backendUrl, routePrefix?, loginPath?}`. (Confirm each handler's HTTP method binding from the built /nextjs .d.ts.)
- docs/DASHBOARD.md § "4. Information architecture" (the app/api/auth/* tree).
- The sibling template: ~/Documents/MyApps/bymax-one/nest-auth-example/apps/web/app/api/auth/ (adapt the same handlers to @bymax-one/rust-auth).

TASK
Wire the three /api/auth/* route handlers to the /nextjs factories, sharing one AuthHandlerConfig.

DELIVERABLES
1. `apps/web/app/api/auth/_config.ts`:
   ```ts
   import 'server-only'
   import type { AuthHandlerConfig } from '@bymax-one/rust-auth/nextjs'

   const backendUrl = process.env.INTERNAL_API_URL
   if (!backendUrl) throw new Error('INTERNAL_API_URL is required for the auth route handlers')

   /** Shared config for the /nextjs refresh + logout handlers. */
   export const authHandlerConfig: AuthHandlerConfig = { backendUrl, routePrefix: 'auth', loginPath: '/auth/login' }
   ```
2. `apps/web/app/api/auth/client-refresh/route.ts`:
   ```ts
   import { createClientRefreshHandler } from '@bymax-one/rust-auth/nextjs'
   import { authHandlerConfig } from '../_config'

   /** The /client single-flight target: 401 → this route → replay. */
   export const POST = createClientRefreshHandler(authHandlerConfig)
   ```
3. `apps/web/app/api/auth/silent-refresh/route.ts` (from `createSilentRefreshHandler`) and
   `apps/web/app/api/auth/logout/route.ts` (from `createLogoutHandler`) — same shape; bind the HTTP method (POST/GET) the handler's contract expects.
4. Co-located `route.test.ts` for each — import the route module, assert the exported handler is the factory's result (mock @bymax-one/rust-auth/nextjs to return a sentinel and assert identity); 100% coverage.

Constraints:
- @bymax-one/rust-auth/nextjs is server-ONLY. Do not hand-roll refresh/logout logic — the factories own it. TypeScript strict, no any/suppression. English-only TIMELESS comments — NO Phase/Task/roadmap references. git switch -c only.

Verification:
- `ls apps/web/app/api/auth/client-refresh/route.ts apps/web/app/api/auth/silent-refresh/route.ts apps/web/app/api/auth/logout/route.ts` — expected: all three present.
- `grep -rq "createClientRefreshHandler\|createSilentRefreshHandler\|createLogoutHandler" apps/web/app/api/auth/` — expected: all three referenced.
- `pnpm -C apps/web build` — expected: succeeds.
- `pnpm -C apps/web test:cov` — expected: the three route modules at 100%.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `5 / 6` and Last updated.
4. Update the P8 row Progress to `5 / 6` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 8.5 ✅ <YYYY-MM-DD> — /api/auth/* route handlers`.
6. Commit `feat(web): client/silent-refresh + logout route handlers` (no Co-Authored-By).
````

---

### Task 8.6 — `lib/` client + exhaustive error localization

- **Status**: ✅
- **Priority**: P0
- **Size**: M
- **Depends on**: 8.1

#### Description

Author the JSX-free `lib/` client setup (`createAuthClient` + the `createAuthFetch` single-flight wrapper) and
`lib/error-messages.ts` mapping **every** `AUTH_ERROR_CODES` member from `/shared` to a message + severity (exhaustive —
the export audit checks it). This is the LAST task of P8 — run the per-phase protocol after the per-task protocol.

#### Acceptance criteria

- [x] `lib/auth-client.ts` exports `authClient = createAuthClient({ baseUrl: NEXT_PUBLIC_API_URL, credentials:
  'include', routePrefix: 'auth' })` and `authFetch = createAuthFetch({ routePrefix: 'auth' })` (the single-flight
  `401 → /api/auth/client-refresh → replay` wrapper); a missing `NEXT_PUBLIC_API_URL` throws a precise error.
- [x] `lib/error-messages.ts` declares `AUTH_ERROR_MESSAGES: Record<AuthErrorCode, { message: string; severity:
  ErrorSeverity }>` with `satisfies Record<AuthErrorCode, …>` so **every** one of the 38 `AUTH_ERROR_CODES` members is
  present (compile-time exhaustiveness) + a `localizeAuthError(code: string)` resolver with a generic fallback.
- [x] A unit test iterates `AUTH_ERROR_CODES` and asserts each member has a non-empty `message` and a valid `severity`;
  `pnpm audit:exports` passes (every `/shared` export referenced; the localization map exhaustive).
- [x] Everything under `lib/` is **JSX-free** plain TypeScript; 100% coverage on the new `lib/` (incl. the
  missing-env throw and the fallback branch).

#### Files to create / modify

- `apps/web/lib/auth-client.ts`, `apps/web/lib/error-messages.ts`, `apps/web/lib/severity.ts`
- `apps/web/lib/{auth-client,error-messages}.test.ts`

#### Agent prompt

````
You are a senior Next.js / React frontend engineer working on the rust-auth-example project.

PROJECT: rust-auth-example — the public reference app for bymax-auth / @bymax-one/rust-auth (full-stack auth: JWT(HS256) · MFA-TOTP · OAuth(Google) · sessions · password-reset · invitations · multi-tenant · platform-admin · WASM edge verify). Dual workspace: apps/api in Rust (axum 0.8 + Tokio, consuming bymax-auth-axum/-core/-redis by path to ../../../rust-auth/crates/*) + apps/web in Next.js 16 (consuming @bymax-one/rust-auth by file:). Local stack: Postgres via sqlx, Redis via RedisStores, Mailpit via lettre. Rust edition 2024, toolchain 1.96.0, MSRV 1.90; every crate is #![forbid(unsafe_code)]; NO unwrap/expect/panic!/todo!/unreachable! in non-test code; typed thiserror errors. Quality bar: 100% coverage (cargo-llvm-cov api, Vitest web) + mutation >=95 driven to 100 (cargo-mutants api, Stryker web). The bymax-auth facade crate is a STUB (no pub use) — depend on the concrete crates.

CURRENT PHASE: 8 (Web Skeleton & Design System) — Task 8.6 of 6 (LAST)

PRECONDITIONS
- Task 8.1 done: apps/web exists; the file:-linked @bymax-one/rust-auth resolves its /client and /shared subpaths. Env NEXT_PUBLIC_API_URL is set (the axum API base, default http://localhost:4000). The audit:exports gate parses dist/**/*.d.ts and asserts every /shared export is referenced in apps/web — the localization map must reference AUTH_ERROR_CODES exhaustively.

REQUIRED READING (only these — do not load more):
- DOSSIER §1.8 /client surface: `createAuthClient(config:AuthClientConfig)=>AuthClient` (defaults credentials:'include', timeout 30000, refresh endpoint /api/auth/client-refresh, routePrefix:'auth'), `createAuthFetch(config?:AuthFetchConfig)=>AuthFetch`; /shared: const `AUTH_ERROR_CODES` (38 `auth.*`), type `AuthErrorCode` (38-member union), class `AuthClientError{status,code,body}`.
- docs/DASHBOARD.md § "5. The client layer" (the createAuthClient usage) + § "9. Error & status localization" (the exhaustive map keyed by AUTH_ERROR_CODES, gated by the export audit).
- The sibling template: ~/Documents/MyApps/bymax-one/nest-auth-example/apps/web/lib/ (the auth-client + error-message map — adapt the codes to this package's AUTH_ERROR_CODES).

TASK
Author the JSX-free lib/: the /client setup (createAuthClient + createAuthFetch single-flight) and the exhaustive AUTH_ERROR_CODES → message+severity localization.

DELIVERABLES
1. `apps/web/lib/auth-client.ts`:
   ```ts
   import { createAuthClient, createAuthFetch } from '@bymax-one/rust-auth/client'

   const baseUrl = process.env.NEXT_PUBLIC_API_URL
   if (!baseUrl) throw new Error('NEXT_PUBLIC_API_URL is required to construct the auth client')

   /** Single-flight fetch: one 401 → /api/auth/client-refresh → replay; concurrent 401s share it. */
   export const authFetch = createAuthFetch({ routePrefix: 'auth' })

   /** The framework-agnostic fetch client the Trigger Center calls directly. */
   export const authClient = createAuthClient({ baseUrl, credentials: 'include', routePrefix: 'auth' })
   ```
2. `apps/web/lib/severity.ts` — `export type ErrorSeverity = 'error' | 'warning' | 'info'`.
3. `apps/web/lib/error-messages.ts`:
   ```ts
   import { AUTH_ERROR_CODES, type AuthErrorCode } from '@bymax-one/rust-auth/shared'
   import type { ErrorSeverity } from './severity'

   interface LocalizedAuthError {
     readonly message: string
     readonly severity: ErrorSeverity
   }

   /** English copy for every wire-visible auth code. `satisfies` enforces exhaustiveness at compile time. */
   export const AUTH_ERROR_MESSAGES = {
     'auth.invalid_credentials': { message: 'Incorrect email or password.', severity: 'error' },
     'auth.email_already_exists': { message: 'An account with this email already exists.', severity: 'warning' },
     'auth.too_many_requests': { message: 'Too many attempts — please wait a moment.', severity: 'warning' },
     'auth.account_locked': { message: 'Account temporarily locked. Try again shortly.', severity: 'warning' },
     'auth.mfa_required': { message: 'Enter your authenticator code to continue.', severity: 'info' },
     'auth.token_invalid': { message: 'Your session is no longer valid — please sign in again.', severity: 'error' },
     // … every remaining AUTH_ERROR_CODES member (38 total) …
   } satisfies Record<AuthErrorCode, LocalizedAuthError>

   /** Resolve a localized message; a generic fallback covers an unknown/non-auth code. */
   export function localizeAuthError(code: string): LocalizedAuthError {
     return (AUTH_ERROR_MESSAGES as Record<string, LocalizedAuthError>)[code]
       ?? { message: 'Something went wrong. Please try again.', severity: 'error' }
   }
   ```
4. Tests: `lib/auth-client.test.ts` (mock /client; assert the config passed + that a missing NEXT_PUBLIC_API_URL throws) and `lib/error-messages.test.ts` (iterate AUTH_ERROR_CODES → assert every member has a non-empty message + valid severity; assert localizeAuthError falls back for an unknown code). 100% coverage.

Constraints:
- lib/ is JSX-FREE plain TypeScript (importable from server + client). The localization map MUST be exhaustive over AUTH_ERROR_CODES (the `satisfies` keeps it honest; the export audit gates it). TypeScript strict, no any/suppression. English-only TIMELESS comments — NO Phase/Task/roadmap references. git switch -c only.

Verification:
- `pnpm -C apps/web build` — expected: succeeds (the `satisfies` compiles only if every AuthErrorCode is mapped).
- `pnpm audit:exports` — expected: passes (every /shared export referenced; localization exhaustive).
- `pnpm -C apps/web test:cov` — expected: lib/ at 100% (incl. the missing-env throw + the fallback branch).
- `grep -RL "import .*react" apps/web/lib | wc -l` (or a JSX scan) — expected: no JSX in lib/.

Completion Protocol (after you finish):
1. Set this task's status to ✅ in its block AND the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Update the file-header Progress counter to `6 / 6` and Last updated.
4. Update the P8 row Progress to `6 / 6` in docs/DEVELOPMENT_PLAN.md.
5. Append to ## Completion log: `- 8.6 ✅ <YYYY-MM-DD> — lib/ client + exhaustive error localization`.
6. Commit `feat(web): lib auth client + exhaustive error-code localization` (no Co-Authored-By).
PER-PHASE (this is the LAST task — run after the per-task protocol, once the PR is merged and CI is green): in docs/DEVELOPMENT_PLAN.md set the P8 Status to ✅ and Progress `6 / 6` and Last updated; advance Active phase to P9; recompute Overall progress (`9 / 15 phases`, %); set this file's header Status to ✅; commit `docs(plan): P8 complete`.
````

---

## Phase Completion Protocol

When **Task 8.6** is `✅` and every other task is `✅`:

1. Confirm all 6 tasks are `✅` and the P8 **Definition of Done** in
   [`DEVELOPMENT_PLAN.md § P8`](../DEVELOPMENT_PLAN.md#phase-8--web-skeleton--design-system) is met: `pnpm -C apps/web
   build` succeeds (resolving the `file:` package with `serverExternalPackages`); the middleware edge-verifies a valid
   cookie and bounces an invalid one without a backend round-trip; the shell is design-faithful and the global controls
   drive URL state while `AuthProvider` hydrates `useSession`; 100% coverage on the new `lib/` + `hooks/`.
2. Ensure the phase PR is **merged** to `main` with **CI green** (all required checks, incl. `build-library`,
   `export-usage-check`, and the web `unit` coverage gate).
3. In [`DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md): set the **P8 Status** to `✅`, **Progress** `6 / 6`, **Last
   updated** today; set **Active phase** to `P9`; recompute **Overall progress** (`9 / 15 phases`, %).
4. Set this file's header **Status** to `✅` and **Progress** to `6 / 6 tasks`.
5. Commit `docs(plan): P8 complete` (no `Co-Authored-By`).

If any DoD bullet is unmet or CI is red, set P8 to `🟡 Partial`, not `✅`.

---

## Completion log

> Append-only. One line per completed task: `- <id> ✅ YYYY-MM-DD — <summary>`.

- 8.1 ✅ 2026-07-02 — Next app scaffold + design system verbatim
- 8.2 ✅ 2026-07-02 — root layout + AuthProvider providers
- 8.3 ✅ 2026-07-02 — app shell + global controls
- 8.4 ✅ 2026-07-02 — edge proxy + WASM route protection
- 8.5 ✅ 2026-07-02 — /api/auth/* route handlers
- 8.6 ✅ 2026-07-02 — lib/ client + exhaustive error localization
