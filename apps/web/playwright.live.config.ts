/**
 * @fileoverview Playwright configuration for the LIVE end-to-end journeys.
 *
 * Unlike the hermetic `playwright.config.ts` (which starts an isolated dev
 * server and intercepts every network call), this config drives the real,
 * fully-wired stack: the Rust/axum API, Postgres, Redis, Mailpit, and the Next
 * console, all already running. It assumes `pnpm infra:up` plus both dev servers
 * are up (the CI job starts them); the specs read one-time codes from the Mailpit
 * REST API and mock only Google via `page.route`, so no real OAuth credentials
 * are needed.
 *
 * Workers are pinned to one for memory safety on the `path`/`file:`-linked stack,
 * and traces are captured on the first retry for post-mortem debugging.
 *
 * @module playwright.live.config
 */

import { defineConfig } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e/live',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
});
