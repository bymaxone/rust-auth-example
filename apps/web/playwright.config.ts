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
 * @module playwright.config
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
});
