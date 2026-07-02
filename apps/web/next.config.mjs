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
          /* CSP: restrict origins; adjust connect-src when the BFF URL is known. */
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self'",
              /* Tailwind's generated styles require unsafe-inline in dev;
                 a nonce-based policy can replace this in production builds. */
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};
