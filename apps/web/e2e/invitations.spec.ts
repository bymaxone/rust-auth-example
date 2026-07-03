/**
 * @fileoverview Hermetic e2e spec for the accept-invitation page (task 9.6).
 *
 * All network calls made by the browser are intercepted with page.route() —
 * no backend API, database, Redis, or Mailpit is required. The full invitation
 * journey (create → email → accept at the API layer) is covered by the Rust
 * e2e-api suite.
 *
 * @module e2e/invitations
 */

import { test, expect } from '@playwright/test';

/**
 * The backend origin the browser targets, derived from the same env the app and
 * the Playwright webServer read. Interception keys off this instead of a
 * hardcoded literal, so the spec follows a re-pointed `NEXT_PUBLIC_API_URL`.
 */
const API_ORIGIN = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080').origin;

/** Glob pattern matching the invitation-accept endpoint the page posts to. */
const ACCEPT_ROUTE = '**/auth/invitations/accept';

/** Next.js page route for the accept-invitation form. */
const ACCEPT_PAGE = '/auth/accept-invitation';

/** The invitation token passed via query string. */
const TOKEN = 'test-inv-token';

/**
 * Stub the Rust backend so no live infrastructure is required.
 *
 * `AuthProvider` calls `getMe()` on every mount, targeting the
 * `NEXT_PUBLIC_API_URL` origin (`API_ORIGIN`). Returning 401 keeps the user in
 * the unauthenticated state without causing a network error that could delay
 * hydration or surface an unexpected error banner in any test.
 */
test.beforeEach(async ({ page }) => {
  await page.route(`${API_ORIGIN}/**`, (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{"error":"unauthorized"}',
    }),
  );
});

/**
 * Wait until React has hydrated the form element.
 *
 * React 18 / 19 sets an internal property whose key starts with `__reactFiber$`
 * directly on every DOM node it reconciles. The assignment is own and enumerable
 * (plain `elem[key] = fiber`), so it appears in `Object.keys(elem)`. Because the
 * fiber is attached synchronously during `hydrateRoot`, checking for it on the
 * `<form>` element is a reliable "all synthetic event-handlers are registered"
 * signal — including the `onSubmit` that calls `e.preventDefault()`.
 *
 * Without this guard Playwright can click the submit button before React's
 * delegation listeners are wired up, causing the browser to fall back to its
 * native GET form-submission.  That submission strips `?token=…` from the URL
 * (the inputs have no `name` attributes, so the query string is empty after
 * submission), `useSearchParams().get('token')` returns null, and the early-return
 * in the accept handler fires — leaving the page in the "no token" state and
 * making the test assertion fail.
 */
async function waitForFormHydration(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const form = document.querySelector('form');
      return form !== null && Object.keys(form).some((k) => k.startsWith('__reactFiber'));
    },
    { timeout: 15_000 },
  );
}

test('accept-invitation: shows guidance when the URL carries no token', async ({ page }) => {
  await page.goto(ACCEPT_PAGE);
  await expect(page.getByText(/Open the invitation link from your email/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Activate account/i })).not.toBeVisible();
});

test('accept-invitation: navigates away from the form on a successful accept', async ({ page }) => {
  // Mock the accept endpoint so the page reaches router.push('/dashboard') without a backend.
  await page.route(ACCEPT_ROUTE, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );

  await page.goto(`${ACCEPT_PAGE}?token=${TOKEN}`);
  await waitForFormHydration(page);

  await expect(page.getByText(/Set your name and a password/i)).toBeVisible();
  await page.getByLabel('Full name').fill('Test Invitee');
  await page.getByLabel('Password').fill('StrongPass!1');
  await page.getByRole('button', { name: /Activate account/i }).click();

  // After a successful accept the page calls router.push('/dashboard'). The Next.js
  // proxy.ts middleware protects /dashboard — with no session cookie present in this
  // hermetic test it redirects to /auth/login, confirming the navigation was triggered.
  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 });
});

test('accept-invitation: shows error banner when the network request fails', async ({ page }) => {
  // Aborting the request simulates any connectivity failure; the page catches it as a
  // non-AuthClientError and surfaces the generic auth.internal message.
  await page.route(ACCEPT_ROUTE, (route) => route.abort());

  await page.goto(`${ACCEPT_PAGE}?token=${TOKEN}`);
  await waitForFormHydration(page);

  await expect(page.getByRole('button', { name: /Activate account/i })).toBeVisible();
  await page.getByLabel('Full name').fill('Test Invitee');
  await page.getByLabel('Password').fill('StrongPass!1');
  await page.getByRole('button', { name: /Activate account/i }).click();

  await expect(page.getByText(/Something went wrong on our side/i)).toBeVisible();
});
