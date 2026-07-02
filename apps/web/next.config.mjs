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
};
