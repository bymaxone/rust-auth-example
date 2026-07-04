/**
 * @fileoverview Playwright configuration for the console end-to-end suite.
 *
 * `testDir` is pinned to `./e2e` so the Playwright runner only ever discovers
 * files under that directory. This keeps Playwright and Vitest on disjoint
 * globs: Vitest owns the co-located `.test.ts` unit suites (and excludes the
 * `e2e` directory), while Playwright owns the `.spec.ts` files under `e2e`.
 * Without the dedicated `testDir`, Playwright's default match would also load
 * the Vitest files, whose top-level `vi.mock(...)` calls throw outside the
 * Vitest runtime.
 *
 * Workers are bounded to one for memory safety, and `forbidOnly` guards against
 * a stray `test.only` reaching CI.
 *
 * The `webServer` starts the Next.js dev server before any browser test runs.
 * Environment variables fall back to CI-safe placeholder values so no live
 * infrastructure is required. The invitation spec intercepts all network calls
 * via `page.route()` — the backend never needs to be reachable.
 *
 * @module playwright.config
 */

import { defineConfig } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  // The live-stack journeys have their own config (`playwright.live.config.ts`); keep them
  // out of the hermetic runner, which points the app at a placeholder backend.
  testIgnore: '**/live/**',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
  },
  webServer: {
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080',
      INTERNAL_API_URL: process.env.INTERNAL_API_URL ?? 'http://localhost:8080',
      AUTH_JWT_SECRET_FOR_PROXY:
        process.env.AUTH_JWT_SECRET_FOR_PROXY ?? 'local_build_only_placeholder_secret_min_32',
    },
  },
});
