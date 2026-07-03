/**
 * @fileoverview Live journey: the sessions device-manager revoke ("log out everywhere else").
 *
 * A verified account signs in from two independent browser contexts (two sessions). From the
 * first, the second session is revoked through the device manager, and the revoked context can
 * no longer reach a protected route — proving server-side session revocation end to end.
 *
 * @module e2e/live/sessions-revoke.spec
 */

import { test, expect, type Browser, type Page } from '@playwright/test';
import { latestOtp } from './helpers/mailpit';

async function fillOtp(page: Page, code: string): Promise<void> {
  const first = page.locator('[role="group"][aria-label="One-time code input"] input').first();
  await first.click();
  await page.keyboard.type(code);
}

/** Register and verify a fresh account in `page`, returning its credentials. */
async function registerVerified(page: Page): Promise<{ email: string; password: string }> {
  const email = `e2e-sess-${Date.now()}@auth.local`;
  const password = 'Sup3rSecret!pw';
  await page.goto('/auth/register');
  await page.locator('#register-name').fill('Session User');
  await page.locator('#register-email').fill(email);
  await page.locator('#register-password').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/auth\/verify-email/);
  await fillOtp(page, await latestOtp(email));
  await expect(page).toHaveURL(/\/dashboard/);
  return { email, password };
}

/** Sign a known account in from a fresh context, returning the context's page. */
async function signInFreshContext(
  browser: Browser,
  email: string,
  password: string,
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/auth/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
  return page;
}

test('revoking another device ends that session server-side', async ({ page, browser }) => {
  const { email, password } = await registerVerified(page);

  // A second sign-in creates a second live session for the same user.
  const second = await signInFreshContext(browser, email, password);

  // From the first device, revoke the other session in the device manager.
  await page.goto('/dashboard/sessions');
  const revoke = page.getByRole('button', { name: /revoke session/i }).first();
  await revoke.click();

  // The revoked context can no longer reach a protected route: its next navigation to a
  // dashboard route is bounced to login.
  await second.goto('/dashboard/sessions');
  await expect(second).toHaveURL(/\/auth\/login/);
  await second.context().close();
});
