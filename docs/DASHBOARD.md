# rust-auth-example — The Auth Console (`apps/web`)

> **Scope.** This is the build spec for `apps/web`, the Next.js console that drives every feature of
> `@bymax-one/rust-auth` from the browser. It is the companion to [`OVERVIEW.md`](./OVERVIEW.md) (the master blueprint)
> and [`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md) (the phased plan — the console is built in P8–P11). The
> authoritative source for the raw design tokens and primitives is [`design_system.html`](./design_system.html) — open
> it in a browser; this document specifies how the auth domain is *rendered on top of it*, never re-styling it.

---

## Table of Contents

1. [Purpose & principles](#1-purpose--principles)
2. [The shared design system (verbatim)](#2-the-shared-design-system-verbatim)
3. [App shell & global controls](#3-app-shell--global-controls)
4. [Information architecture](#4-information-architecture)
5. [The client layer — consuming `@bymax-one/rust-auth`](#5-the-client-layer--consuming-bymax-onerust-auth)
6. [Auth-domain component catalog](#6-auth-domain-component-catalog)
7. [Page-by-page spec](#7-page-by-page-spec)
8. [Real-time — the SSE audit tail](#8-real-time--the-sse-audit-tail)
9. [Error & status localization](#9-error--status-localization)
10. [Accessibility & UX rules](#10-accessibility--ux-rules)
11. [Testing the console](#11-testing-the-console)

---

## 1. Purpose & principles

`apps/web` is a **real console**, not a button list. It exists to make every public export of the
`@bymax-one/rust-auth` package — the `/client` fetch client, the `/react` hooks, the `/nextjs` edge proxy + WASM
verifier, and the `/shared` codes/types — **reachable from the browser** and visibly correct. It drives two identity
domains (the tenant-scoped **dashboard** and the tenant-less **platform**) against the Rust/axum API.

Principles:

- **Demonstrate, don't decorate.** Every surface links the exact library API it exercises; a feature that cannot be
  fired from the UI is a CI-tracked coverage gap (the export audit), not a finished row.
- **Honest states.** Loading is a **skeleton**, never a spinner; empty is **action-oriented** ("No sessions yet — sign
  in from another device to see one here"); error renders the localized `auth.*` message + a retry.
- **Edge-first auth.** Route protection happens in middleware via the **WASM JWT verifier** (`verifyJwtToken`) — no
  backend round-trip to decide whether to render a protected page.
- **Design parity.** The console is visually indistinguishable from the sibling `@bymax-one/*` examples — same forced
  dark, same orange glass, same Geist. The design system is copied verbatim and never overridden.

---

## 2. The shared design system (verbatim)

Copied byte-for-byte from a sibling example into `apps/web` (in P8): `globals.css`, `tailwind.config.ts`,
`postcss.config.mjs`, `components.json` (shadcn `new-york`), and `components/ui/*`. The reference is
[`design_system.html`](./design_system.html). The tokens this console relies on:

| Token | Value | Used for |
| --- | --- | --- |
| `--primary` | `#ff6224` (brand orange) | primary actions, focus rings, active nav, the OTP-complete state |
| `--accent` | `#f97316` | secondary emphasis, chart series 2 |
| `--glass-card-bg` | `rgba(255, 255, 255, 0.06)` | every card / panel surface |
| `--glass-border` | `rgba(255, 255, 255, 0.10)` | card / input borders |
| `--shadow-primary` | `0 0 24px rgba(255, 98, 36, 0.4)` | the glow on the active CTA / verified state |
| `--radius` (+ `-sm/-md/-lg/-xl/-pill`) | `0.75rem` … `9999px` | cards `--radius-lg`, inputs `--radius-md`, badges `--radius-pill` |
| Fonts | **Geist Sans** (body) + **GeistMono** (codes, tokens, JTI, hashes) | mono is mandatory for every opaque value |

Rules: **forced dark** (no theme toggle); never introduce a new color outside the token set; never re-style a
`components/ui/*` primitive (compose, don't fork); mono font for every machine value (TOTP codes, recovery codes, JTIs,
`sha256` hashes, refresh-token previews, error codes).

---

## 3. App shell & global controls

A fixed **64px topbar** + a **250px sidebar** (collapsible under `lg`), the sibling-standard shell. The sidebar splits
into **Dashboard** and **Platform** sections; the active route glows `--primary`.

**Topbar (global controls), left→right:**

| Control | Source | Behavior |
| --- | --- | --- |
| Brand + repo link | static | links the GitHub repo + the OVERVIEW. |
| **Tenant selector** | local state → `tenant_id` | sets the `tenant_id` sent on `login`/`register`/`reset` (`acme` / `globex` / custom). Hidden inside the Platform section (it is tenant-less). |
| **Delivery-mode** chip | `/settings` config | shows the configured `TokenDelivery` (`Cookie` / `Bearer` / `Both`) — informational. |
| **Session badge** | `/react` `useAuthStatus()` | `authenticated` (user email + avatar) / `unauthenticated` (Sign in) / `loading` (skeleton); a menu with **Sign out** (`useAuth().logout`). |
| **Live toggle** | local state | pauses/resumes the SSE audit tail (§8). |

All view state (filters, the selected tenant, the active facet) is persisted in the URL via **`nuqs`**, so every view
is a shareable deep-link. Global toasts use **sonner**; protected routes are gated by the middleware WASM verifier (§5)
before the page renders.

---

## 4. Information architecture

```
apps/web/app/
├── layout.tsx · providers.tsx · globals.css        # Geist + forced dark + <AuthProvider> + global controls
├── page.tsx                                         # / — Overview (auth health)
├── api/auth/
│   ├── client-refresh/route.ts                      # createClientRefreshHandler  (/client single-flight target)
│   ├── silent-refresh/route.ts                      # createSilentRefreshHandler  (edge background refresh)
│   └── logout/route.ts                              # createLogoutHandler
├── (public)/auth/                                   # unauthenticated entry points (P9)
│   ├── login · register · forgot-password · reset-password
│   ├── verify-email · mfa-challenge · accept-invitation
├── dashboard/                                        # the tenant console (P10) — guarded by middleware
│   ├── trigger · security · sessions · oauth · invitations · audit · account
└── platform/                                         # the tenant-less admin console (P11)
    ├── login
    └── (protected)/{security · sessions · users}
```

Middleware (`proxy.ts` / `middleware.ts`) protects `/dashboard/*` and `/platform/(protected)/*`: it edge-verifies the
session cookie with the WASM `verifyJwtToken` and redirects to the matching login on failure (coarse, UX-only RBAC —
the backend guards remain the authority).

---

## 5. The client layer — consuming `@bymax-one/rust-auth`

The console is built entirely on the package's four subpaths. Nothing in `apps/web` talks to the API by hand-rolled
`fetch`.

**`/react` — the provider + hooks (the spine):**

```tsx
// app/providers.tsx
import { AuthProvider } from '@bymax-one/rust-auth/react'
import { authClient } from '@/lib/auth-client'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider client={authClient} revalidateInterval={300_000}>
      {children}
    </AuthProvider>
  )
}
```

- `useSession()` → `{ user, status, isLoading, refresh, lastValidation }` — drives the profile card + the session badge.
- `useAuth()` → `{ login, register, logout, forgotPassword, resetPassword }` — every form action (`tenantId` defaults to
  the selected tenant).
- `useAuthStatus()` → `{ isAuthenticated, isLoading }` — the cheap topbar badge + the route guards' client fallback.

**`/client` — the fetch client (the `lib/` setup):**

```ts
// lib/auth-client.ts
import { createAuthClient } from '@bymax-one/rust-auth/client'

export const authClient = createAuthClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,   // the axum API
  credentials: 'include',                       // HttpOnly cookies
  routePrefix: 'auth',
})
// createAuthFetch backs the single-flight 401 → /auth/refresh → replay used by every authenticated call.
```

`authClient` exposes `register` / `login` / `mfaChallenge` / `getMe` / `refresh` / `logout` / `forgotPassword` /
`resetPassword`, and the **Trigger Center** calls each directly so a reviewer can see the raw request/response.

**`/nextjs` — the edge proxy + route handlers + WASM verifier (server/edge only):**

```ts
// middleware.ts (edge)
import { createAuthProxy, verifyJwtToken } from '@bymax-one/rust-auth/nextjs'
export const proxy = createAuthProxy({
  backendUrl: process.env.INTERNAL_API_URL!,
  routePrefix: 'auth',
  loginPath: '/auth/login',
})
// the three route handlers are wired in app/api/auth/*/route.ts:
//   createClientRefreshHandler · createSilentRefreshHandler · createLogoutHandler
```

> **Server-only guard.** The `/nextjs` subpath carries `import "server-only"` — it must never be imported into a client
> component. The `lib/` files that use it are server modules; the route handlers and middleware are the only consumers.

**`/shared` — codes + types:** `AUTH_ROUTES`, `AUTH_ERROR_CODES` (the 38 wire-visible codes), the cookie-name
constants, and the ts-rs-generated types (`AuthUserClient`, `LoginResult`, `AuthErrorResponse`, …) + `AuthClientError`.
The error-localization map (§9) is keyed by `AUTH_ERROR_CODES`.

---

## 6. Auth-domain component catalog

Each design-system primitive, rendered for the auth domain. None re-styles `components/ui/*` — they compose it.

| Component | Built from | Used in | Notes |
| --- | --- | --- | --- |
| **OTP input** (`<OtpInput>`) | `Input` + a 6-cell segmented row | mfa-challenge, verify-email, reset-OTP | mono font; paste-distributes, auto-advances, backspace nav; `autocomplete="one-time-code"` + `inputmode="numeric"`; the complete state glows `--primary`. |
| **Countdown pill** (`<ExpiryPill>`) | `Badge` `--radius-pill` | mfa-temp token, reset OTP, cooldowns | `MM:SS`; turns `--destructive` near expiry; drives resend gating. |
| **QR enrollment card** | `Card` + a QR render of `qr_code_uri` | security/MFA enroll | shows the `otpauth://` QR + the base32 secret (mono, copyable) + the recovery-code grid. |
| **Recovery-code grid** | `Card` + a 2-col mono grid | post-enroll, regenerate | one-time codes; a "Download / Copied" affordance; warns they are shown once. |
| **Sessions table** | `Table` + `Badge` | sessions, platform sessions | columns device / ip / lastActivity / **isCurrent** badge / revoke; the current row is pinned + glow-bordered. |
| **Audit table** | virtualized `Table` (TanStack) | audit | faceted (actor/event/tenant), detail drawer, live tail (§8), the never-contains-secrets green-check proof. |
| **Provider/diagnostics matrix** | `Card` grid | account/diagnostics | email provider (Mailpit/Resend) + OAuth status + hash-strength + lockout countdown + hook-event count. |
| **Tenant selector** | `Select` | topbar | sets `tenant_id`; hidden in the platform section. |
| **Token inspector** | `Card` + mono + `verifyJwtToken` | account/diagnostics | paste a JWT → decoded header/claims + a forged `alg:none` → "rejected" demo. |
| **Error banner** (`<AuthError>`) | `Alert` `--destructive` | every form | localized message from `./shared` + the raw `auth.*` code (mono) + retry. |

---

## 7. Page-by-page spec

Each page states its **job**, the **backing API** (library call · route · client method), the **panels**, and the
**states** (loading / empty / error). Matrix-row references are to [`OVERVIEW.md §6`](./OVERVIEW.md#6-feature-coverage-matrix).

### `/` — Overview (rows 5, 24, 25)
- **Job:** auth health at a glance.
- **Backing:** `GET /audit/aggregate` (example-owned) + `useSession`.
- **Panels:** login/verify success-rate cards, active-session count, MFA-enrolled %, email-provider + OAuth status
  chips, a recent-events strip (links the Audit tail).
- **States:** skeleton cards while loading; "Sign in to populate" when unauthenticated; per-card error with retry.

### `/dashboard/trigger` — Trigger Center (rows 1–4, 6, 7, 9, 19, 20, 30)
- **Job:** the Playground — fire every feature and watch it land.
- **Backing:** every `authClient.*` call directly; `GET /diagnostics/force-lockout`; the rate-limit "hammer login".
- **Panels:** a card per action (register · login · force MFA · rotate token · hammer login → 429 · force lockout ·
  provoke each `auth.*` error · dispatch verify-email/reset). Each card shows the **raw request + response JSON** and
  **auto-pivots** the Audit table to the resulting row.
- **States:** inline result per card; the 429 card renders the `Retry-After` countdown.

### `/dashboard/security` — Security / MFA (rows 8, 10)
- **Job:** TOTP enrollment lifecycle.
- **Backing:** `mfa/setup` → `MfaSetupResult` · `mfa/verify-enable` · `mfa/disable` · `mfa/recovery-codes`.
- **Panels:** the QR enrollment card (QR + base32 secret + recovery grid), the verify-enable OTP box, the disable +
  regenerate actions (each gated by a fresh TOTP), an "AEAD-sealed secret" explainer.
- **States:** "2FA not enabled — enable it" empty state; the destructive-confirm on disable.

### `/dashboard/sessions` — Sessions (rows 11, 21)
- **Job:** the device manager.
- **Backing:** `GET /auth/sessions` · `DELETE /auth/sessions/{id}` · `/auth/sessions/all`.
- **Panels:** the sessions table (current row pinned), per-row revoke, "log out everywhere else", a live new-session
  alert toast (a new device emails an alert → a toast + a new row).
- **States:** "Only this device" empty state; optimistic revoke with rollback on error.

### `/dashboard/oauth` — OAuth (row 12)
- **Job:** the Google sign-in round-trip + the Create/Link decision.
- **Backing:** `GET /auth/oauth/google` (302) · `/callback`.
- **Panels:** "Continue with Google" (hidden unless `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED`), a decision trace showing
  whether `on_oauth_login` Created or Linked, the resulting session / redirect / MFA-challenge branch.
- **States:** a "Google OAuth not configured" explainer when disabled; the callback-error path renders the localized code.

### `/dashboard/invitations` — Invitations (row 13)
- **Job:** invite a teammate; accept an invite.
- **Backing:** `POST /auth/invitations` (admin) · `/auth/invitations/accept` (invitee).
- **Panels:** the admin invite form (email + role), a pending-invites list (links the Mailpit message), the accept view
  (name + password) reachable via the emailed link.
- **States:** "No pending invites"; the expired/invalid-token path on accept.

### `/dashboard/audit` — Audit (rows 24, 25)
- **Job:** the hook-event stream.
- **Backing:** `GET /audit/logs` (keyset) + `GET /audit/stream` (SSE).
- **Panels:** the virtualized audit table, the faceted filter bar (actor/event/tenant), the detail drawer (Overview /
  Raw entry / **no-secrets proof**), and the live tail with follow-mode (§8).
- **States:** "No events yet — fire something in the Trigger Center"; a stale-cursor reload.

### `/dashboard/account` — Account + Diagnostics (rows 18, 20, 23)
- **Job:** the profile + the server-only primitives.
- **Backing:** `useSession`/`getMe` + `POST /diagnostics/{hash-strength,force-lockout}` + `GET /diagnostics/hooks`.
- **Panels:** the `me` profile card, the verify-email + change-password entry points, the **Diagnostics** matrix
  (password-hash strength + needs-rehash badge, the brute-force lockout button + countdown, the hook-event count, the
  token inspector, the delivery-mode).
- **States:** standard.

### `/platform/*` — Platform console (rows 14, 15)
- **Job:** the tenant-less admin domain (P11).
- **Backing:** the platform client (`PlatformAuthService` via `/auth/platform/*`).
- **Panels:** platform login, the protected admin shell, platform MFA (enroll/challenge/disable), platform sessions
  (revoke-all), a read-only platform-users view.
- **States:** a dashboard session is bounced from the platform console (and vice-versa) — surfaced as an explicit
  "wrong identity domain" message.

### `(public)/auth/*` — Public pages (rows 1, 2, 6, 7, 9, 13)
- **Job:** the unauthenticated entry points (P9): login (MFA branch), register, forgot/reset wizard, verify-email,
  mfa-challenge, accept-invitation.
- **Backing:** `useAuth().*` + `authClient.*`.
- **States:** the anti-enumeration paths show the same "check your inbox" regardless of account existence.

---

## 8. Real-time — the SSE audit tail

The Audit page tails `GET /audit/stream` (Server-Sent Events). UX:

- **Follow-mode** — pinned-to-bottom auto-scroll while new events arrive; scrolling up **pauses** follow and shows an
  "**N new — jump to latest**" pill that resumes on click.
- **Resumable** — each event's `id` is the row's keyset cursor; on reconnect the browser sends `Last-Event-ID` so no
  event is missed across a drop.
- **The live toggle** (topbar) pauses/resumes the stream globally; a paused stream shows a muted "Live paused" chip.
- **Backpressure** — the table is virtualized (TanStack Virtual); only visible rows render, so a fast tail never janks.

The same SSE stream powers the new-session toast on the Sessions page (an `on_new_session` event surfaces as a toast +
a row).

---

## 9. Error & status localization

Every error the UI shows comes from `@bymax-one/rust-auth/shared`:

- `AuthClientError` (thrown by `/client`) carries `{ status, code, body }`; the `code` is one of the 38
  `AUTH_ERROR_CODES`.
- `lib/error-messages.ts` maps **every** `AUTH_ERROR_CODES` member to a human string (English) — the
  `scripts/audit-library-exports.mjs` gate asserts the map is exhaustive (every code localized), so adding a code to the
  library and not localizing it fails CI.
- The `<AuthError>` banner renders the localized message + the raw `auth.*` code in mono (so a developer sees both).
- Status mapping: `auth.too_many_requests` / `auth.account_locked` render their `retryAfterSeconds` as a countdown;
  `auth.mfa_required` routes to the MFA step; `auth.token_invalid` (the wire-collapsed sentinel) triggers a silent
  refresh before surfacing.

---

## 10. Accessibility & UX rules

- The OTP box honours `autocomplete="one-time-code"` + `inputmode="numeric"`; each cell is individually focusable;
  paste distributes across cells.
- All interactive elements are keyboard-reachable; focus rings use `--primary`; the sidebar is an `aria` nav.
- **Skeletons, not spinners**, for every loading state; **action-oriented empty states**; destructive actions
  (disable MFA, revoke all, logout-everywhere) require an explicit confirm.
- Mono font for every machine value (codes, tokens, JTIs, hashes) — never a proportional font for an opaque string.
- No secret is ever rendered in full where it should not be: refresh tokens show a `sha256` preview, the audit drawer
  proves no code/token is present, recovery codes are shown once with a warning.

---

## 11. Testing the console

| Layer | Tool | Scope |
| --- | --- | --- |
| Unit | Vitest 4 (jsdom) | every `lib/**`, `hooks/**`, and `components/**` — the OTP box (paste/advance/backspace), the countdown, the sessions table, the error-localization map exhaustiveness, the client wiring. |
| Component | Vitest + Testing Library | the page panels in isolation (mocked `authClient`/hooks), the loading/empty/error states. |
| E2E | Playwright | the numbered journeys (`OVERVIEW.md §16`) against a live stack: register → Mailpit → verify → login → MFA; reset wizard; sessions revoke; OAuth (mocked Google); edge-protection bounce; platform login isolation. |

Coverage is **100%** on `lib/**` + `hooks/**` + `components/**` (Vitest `thresholds`), with the mutation gate (Stryker,
`lib/**` 100) on top — both with `maxWorkers: '50%'` baked in for memory safety (`OVERVIEW.md §8`).

---

_End of the console build spec for `rust-auth-example`._
