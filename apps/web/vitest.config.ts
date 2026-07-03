/**
 * @fileoverview Vitest configuration for the console unit suite.
 *
 * Runs under jsdom so React components and browser-side modules are available.
 * `maxWorkers: '50%'` is baked in for memory safety, and coverage is gated at
 * 100% across the hand-written surface (the `lib/` client + error map, the edge
 * middleware, the proxy instance, the providers tree, the route handlers, and
 * every composed component). Verbatim design-system primitives ship with their
 * own co-located tests. Path aliases mirror the tsconfig `@/*` mapping.
 *
 * @module vitest.config
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    maxWorkers: '50%',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'e2e', '.stryker-tmp', 'reports'],
    coverage: {
      provider: 'v8',
      include: [
        'lib/**/*.ts',
        'components/**/*.tsx',
        'proxy.ts',
        'app/providers.tsx',
        'app/api/auth/**/*.ts',
        'app/(public)/auth/**/*.tsx',
      ],
      exclude: [
        'node_modules',
        '.next',
        'e2e',
        '**/*.d.ts',
        '**/*.config.ts',
        '**/*.test.ts',
        '**/*.test.tsx',
        // Type-only module: erased at compile time, so it carries no runtime code to measure.
        'lib/severity.ts',
      ],
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        branches: 100,
        lines: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
  resolve: {
    alias: {
      '@': rootDir,
    },
  },
});
