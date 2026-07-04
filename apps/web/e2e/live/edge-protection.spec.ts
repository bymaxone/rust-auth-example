/**
 * @fileoverview Live journey: the WASM edge-protection bounce.
 *
 * The Next.js middleware verifies the session cookie at the edge (via the WASM
 * `verifyJwtToken`) before any protected route renders. A request with no session — or a
 * forged/expired cookie — is redirected to `/auth/login` without ever reaching the Rust
 * backend, so the protection holds even when the API is unavailable.
 *
 * @module e2e/live/edge-protection.spec
 */

import { test, expect } from '@playwright/test';

/** The access-cookie name the edge middleware inspects. */
const ACCESS_COOKIE = 'access_token';

test('an unauthenticated dashboard request is bounced to login at the edge', async ({ page }) => {
  // No session cookie at all: the middleware redirects before the route renders.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/auth\/login/);
});

test('a forged session cookie is rejected at the edge with the backend blocked', async ({
  page,
  context,
}) => {
  // A structurally-bogus token fails the WASM signature check, so the edge bounces it to
  // login rather than trusting it.
  await context.addCookies([
    {
      name: ACCESS_COOKIE,
      value: 'forged.not-a-real.jwt',
      url: 'http://localhost:3000',
    },
  ]);

  // Cut the browser off from the Rust API entirely: the rejection must be purely edge-side,
  // so the redirect has to happen with no reachable backend at all.
  await page.route('http://localhost:4000/**', (route) => route.abort());

  await page.goto('/dashboard/sessions');
  await expect(page).toHaveURL(/\/auth\/login/);
});
