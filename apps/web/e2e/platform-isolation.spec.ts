/**
 * @fileoverview Hermetic e2e spec for platform domain isolation (task 11.1).
 *
 * All network calls made by the browser are intercepted with `page.route()` —
 * no backend API, database, or Redis is required. The spec exercises:
 *
 *   1. The platform login page loads and is accessible.
 *   2. A protected platform path (`/platform/users`) without a session cookie
 *      is redirected to `/platform/login` by the edge proxy.
 *   3. The `?reason=wrong-domain` banner is visible on the login page when a
 *      dashboard-domain token is rejected.
 *
 * The full login-and-redirect journey, MFA flow, and session management are
 * covered by the Vitest unit suite; the Playwright spec focuses only on the
 * cross-browser edge-gate and the wrong-domain banner signal.
 *
 * @module e2e/platform-isolation
 */

import { test, expect } from '@playwright/test';

/**
 * The backend origin the browser targets, derived from the same env the app and
 * the Playwright webServer read. Interception keys off this instead of a
 * hardcoded literal, so the spec follows a re-pointed `NEXT_PUBLIC_API_URL`.
 */
const API_ORIGIN = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080').origin;

/**
 * Stub the Rust backend so no live infrastructure is required.
 *
 * Returns 401 for all API calls so the app stays in the unauthenticated state
 * without surfacing a network error or unexpected error banner.
 */
test.beforeEach(async ({ page }) => {
  await page.route(`${API_ORIGIN}/**`, (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{"error":{"code":"auth.platform_auth_required","message":"Platform auth required"}}',
    }),
  );
});

test('platform login page renders the platform-admin heading', async ({ page }) => {
  // The /platform/login page is public — no session gate, no redirect.
  await page.goto('/platform/login');
  await expect(page.getByText('PLATFORM ADMIN', { exact: true })).toBeVisible();
});

test('platform login page shows the sign-in form', async ({ page }) => {
  // The login form is the primary affordance on the public page.
  await page.goto('/platform/login');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
});

test('a protected platform path without a session redirects to /platform/login', async ({
  page,
}) => {
  // The edge proxy gate: no session cookie → redirect to platform login.
  await page.goto('/platform/users');
  await expect(page).toHaveURL(/\/platform\/login/, { timeout: 15_000 });
});

test('the wrong-domain reason banner is visible when redirected with ?reason=wrong-domain', async ({
  page,
}) => {
  // Simulates a dashboard token trying to access the platform tree — the proxy
  // bounces with ?reason=wrong-domain and the login page shows the banner.
  await page.goto('/platform/login?reason=wrong-domain');
  // The `auth.platform_auth_required` message is what `messageForCode` returns for
  // the wrong-domain reason displayed via the ReasonBanner component.
  await expect(page.getByText(/Platform administrator sign-in is required/i)).toBeVisible();
});
