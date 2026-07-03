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
const _connectSrc = _apiOrigin ? `'self' ${_apiOrigin}` : "'self'";

/* Next.js (Turbopack) injects inline bootstrap scripts whose content changes on
   every HMR update, making hash-based CSP impractical in dev mode.  React's
   dev-mode error overlay also needs eval() for call-stack reconstruction.
   Allow 'unsafe-inline' and 'unsafe-eval' outside production; a nonce-based
   policy is the correct replacement for production builds. */
const _scriptSrc =
  process.env.NODE_ENV === 'production' ? "'self'" : "'self' 'unsafe-inline' 'unsafe-eval'";

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
          /* Ensure only the origin (no full URL) is sent as Referer, limiting
             invitation-token and email-address leakage to third-party sub-resources. */
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
              /* Tailwind's generated styles require unsafe-inline in dev;
                 a nonce-based policy can replace this in production builds. */
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self'",
              `connect-src ${_connectSrc}`,
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};
