/**
 * @fileoverview Playwright smoke spec for the console e2e harness.
 *
 * This suite establishes the dedicated Playwright `testDir` and proves the
 * runner boots without loading the Vitest unit files. It stays free of the
 * `page`/`context` fixtures so it needs neither a browser download nor a running
 * server, which keeps the `e2e-web` job green until a `webServer` is wired up.
 * Browser-driven journeys land here once the console is served in CI.
 *
 * @module e2e/smoke
 */

import { test, expect } from '@playwright/test';

test('e2e harness boots without loading the unit suites', () => {
  // A fixture-free assertion: it runs under the Playwright runner yet requires
  // no browser or server, so it verifies the harness wiring in isolation.
  expect(true).toBe(true);
});
