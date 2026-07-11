/**
 * @fileoverview Shared console session helpers for the live e2e journeys.
 *
 * After a successful register/verify or sign-in the public flows route to
 * `/dashboard`, which the console forwards to the Overview root (`/`). A journey
 * has "landed" when the topbar user menu — which only renders for an authenticated
 * session — reveals the signed-in email, a real end-to-end signal that the session
 * cookie is honoured, not merely a URL check.
 *
 * @module e2e/live/helpers/console
 */

import { expect, type Page } from '@playwright/test';

/** Generous ceiling for a post-auth redirect (login → `/dashboard` → `/`) under load. */
const LANDING_TIMEOUT_MS = 15_000;

/** Per-attempt ceiling inside the sign-in retry loop. */
const ATTEMPT_TIMEOUT_MS = 8_000;

/** How many times {@link signIn} resubmits on a transient login failure. */
const SIGN_IN_ATTEMPTS = 3;

/**
 * Assert the browser has landed on the authenticated console for `email`. The
 * topbar shows the display name (not the email), so the signed-in email is
 * confirmed by opening the user menu, whose label carries the address.
 *
 * @param page - The page under test.
 * @param email - The signed-in account's email, shown in the user-menu label.
 * @param timeout - How long to wait for the landing (ms).
 */
export async function expectSignedIn(
  page: Page,
  email: string,
  timeout: number = LANDING_TIMEOUT_MS,
): Promise<void> {
  await expect(page).toHaveURL(/\/$/, { timeout });
  // The user-menu trigger only renders for an authenticated session; opening it
  // reveals the email in the menu label.
  const menu = page.getByTestId('user-menu-trigger');
  await expect(menu).toBeVisible({ timeout });
  await menu.click();
  await expect(page.getByText(email)).toBeVisible({ timeout });
  // Close the menu so it never overlays the next step in a journey.
  await page.keyboard.press('Escape');
}

/**
 * Sign in from the login page and assert the authenticated console landing.
 *
 * The public auth pages run a background session probe on mount that can, on rare
 * occasions, abort an in-flight submit (surfaced as a generic error with no session
 * established); because the account is only ever signed in from a clean page here,
 * resubmitting is safe, so a failed attempt is retried.
 *
 * @param page - The page under test (a clean, unauthenticated page).
 * @param email - The account email.
 * @param password - The account password.
 */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  for (let attempt = 1; attempt <= SIGN_IN_ATTEMPTS; attempt += 1) {
    await page.goto('/auth/login');
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);
    await page.locator('form button[type="submit"]').click();
    try {
      await expectSignedIn(page, email, ATTEMPT_TIMEOUT_MS);
      return;
    } catch (error) {
      if (attempt === SIGN_IN_ATTEMPTS) throw error;
    }
  }
}
