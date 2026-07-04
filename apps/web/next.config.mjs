/**
 * @fileoverview Next.js configuration for the rust-auth-example console.
 *
 * `@bymax-one/rust-auth` is bundled (not externalized): its `/nextjs` subpath
 * loads the edge WASM lazily — via a memoized dynamic `import()` on first use, so
 * importing the barrel has no WASM side effect — which lets Turbopack code-split
 * the `.wasm` into an on-demand chunk and resolve the package's `next/server` and
 * `server-only` imports through Next's own export conditions. Externalizing it
 * instead would hand the built package to Node's raw ESM loader during page-data
 * collection, which cannot instantiate the edge WASM, cannot resolve the
 * extensionless `next/server` subpath, and resolves `server-only` to its throwing
 * entry. `outputFileTracingRoot` is set to the monorepo root so standalone output
 * traces dependencies from the workspace root, keeping node_modules paths
 * consistent with pnpm's virtual-store layout.
 *
 * @module next.config
 */

import path from 'node:path';

/* Derive the API origin from NEXT_PUBLIC_API_URL at config-eval time so
   connect-src allows the Rust backend while staying strict (no wildcard).
   If the variable is unset or contains a malformed URL, fall back to 'self'. */
const _apiUrl = process.env.NEXT_PUBLIC_API_URL;
let _apiOrigin = '';
try {
  if (_apiUrl) _apiOrigin = new URL(_apiUrl).origin;
} catch {
  /* Malformed URL — fall back to 'self' only. */
}
/* The realtime WebSocket (`ws-ticket` → `ws(s)://…/ws/example`) targets the same API
   origin upgraded to the `ws`/`wss` scheme. CSP treats `ws:`/`wss:` as origins distinct
   from `http:`/`https:`, so the upgraded origin must be listed explicitly or the browser
   blocks the socket (which would crash the sessions device-manager). */
const _wsOrigin = _apiOrigin ? _apiOrigin.replace(/^http/, 'ws') : '';
const _connectSrc = _apiOrigin ? `'self' ${_apiOrigin} ${_wsOrigin}` : "'self'";

/* Scripts require 'unsafe-inline' in BOTH dev and production. A production build
   serves Next's hydration bootstrap as an inline <script> whose contents change
   per response, so 'script-src self' silently blocks hydration in a deployed app.
   The nonce-based alternative is impractical here: these pages are statically
   prerendered, and Next only stamps a per-request nonce onto its scripts for
   dynamically rendered pages — a static page's inline bootstrap would carry no
   nonce and be blocked. Forcing the whole app into per-request dynamic rendering
   just to satisfy CSP is not worth it for this reference console, so
   'unsafe-inline' is applied uniformly. 'unsafe-eval' is added in dev only, where
   Turbopack rewrites inline HMR scripts and React's error overlay needs eval(). */
const _scriptSrc =
  process.env.NODE_ENV === 'production'
    ? "'self' 'unsafe-inline'"
    : "'self' 'unsafe-inline' 'unsafe-eval'";

/** @type {import('next').NextConfig} */
export default {
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),

  async headers() {
    return [
      {
        /* Apply security headers to every route. */
        source: '/(.*)',
        headers: [
          /* Prevent the auth pages from being embedded in frames (clickjacking). */
          { key: 'X-Frame-Options', value: 'DENY' },
          /* Block MIME-type sniffing attacks on served assets. */
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          /* Send only the origin as Referer on cross-origin requests (and nothing
             when downgrading to HTTP), so invitation tokens and email addresses in
             the path never leak to third parties; same-origin requests still get
             the full URL. */
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          /* Enforce HTTPS for the lifetime of the session. */
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          /* CSP: restrict origins; connect-src includes the API origin so the
             browser does not block calls to NEXT_PUBLIC_API_URL. */
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src ${_scriptSrc}`,
              /* Tailwind and Next inject styles inline in both modes; a style nonce
                 is impractical alongside static prerendering, so 'unsafe-inline'
                 stays for styles. */
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self'",
              `connect-src ${_connectSrc}`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};
