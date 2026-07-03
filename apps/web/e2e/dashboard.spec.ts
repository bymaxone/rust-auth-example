/**
 * @fileoverview Hermetic e2e specs for the dashboard console.
 *
 * Every network call is intercepted with page.route() — no backend API,
 * database, Redis, or WebSocket is required. Covers the Overview's
 * unauthenticated + populated states and the edge-protection bounce guarding the
 * `/dashboard/*` tree. The full journeys are exercised by the Rust e2e-api suite
 * and the Vitest component suites.
 *
 * @module e2e/dashboard
 */

import { test, expect } from '@playwright/test';

/** The backend origin the browser targets (mirrors the app + webServer env). */
const API_ORIGIN = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080').origin;

/** A minimal authenticated user for `GET /auth/me`. */
const ME = {
  id: 'u-1',
  email: 'dev@acme.test',
  name: 'Dev User',
  role: 'admin',
  status: 'active',
  tenantId: 'acme',
  emailVerified: true,
  mfaEnabled: false,
  lastLoginAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
};

/** The auth-health aggregate for the Overview cards. */
const AGGREGATE = {
  loginSuccessRate: 0.98,
  verifySuccessRate: 0.91,
  activeSessions: 12,
  mfaEnrolledShare: 0.4,
  emailProvider: 'mailpit',
  oauthGoogleEnabled: true,
};

/** Stub the whole backend as unauthenticated by default. */
test.beforeEach(async ({ page }) => {
  await page.route(`${API_ORIGIN}/**`, (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{"error":"unauthorized"}',
    }),
  );
});

test('overview: shows the sign-in prompt when unauthenticated', async ({ page }) => {
  // With no session the Overview must invite the visitor to sign in.
  await page.goto('/');
  await expect(page.getByText(/Sign in to populate/i)).toBeVisible();
});

test('overview: renders the auth-health cards for an authenticated session', async ({ page }) => {
  // A valid session + aggregate must render the success-rate cards.
  await page.route(`${API_ORIGIN}/auth/me`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }),
  );
  await page.route('**/audit/aggregate', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AGGREGATE),
    }),
  );

  await page.goto('/');
  await expect(page.getByText('98%')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('mailpit')).toBeVisible();
});

test('edge gate: an unauthenticated /dashboard/* visit bounces to login', async ({ page }) => {
  // The WASM edge verifier fail-closes: no session cookie → redirect to login.
  await page.goto('/dashboard/audit');
  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 });
});
