/**
 * @fileoverview Next.js configuration for the rust-auth-example console.
 *
 * The `@bymax-one/rust-auth` package wraps a WASM module; keeping it out of
 * the bundler lets the `.wasm` resolve at runtime. `outputFileTracingRoot` is
 * set to the monorepo root so the standalone output traces dependencies from
 * the workspace root, keeping node_modules paths consistent with pnpm's
 * virtual store layout.
 *
 * @module next.config
 */

import path from 'node:path';

/** @type {import('next').NextConfig} */
export default {
  // The package wraps a WASM module; keep it out of the bundler so the
  // `.wasm` resolves at runtime, and widen tracing to the monorepo root.
  serverExternalPackages: ['@bymax-one/rust-auth'],
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
};
