/**
 * @fileoverview Live journey: the password-reset wizard (forgot -> Mailpit OTP -> reset ->
 * sign in with the new password), against the real stack.
 *
 * A fresh account is registered and verified first so the reset targets a real, verified
 * user; the reset code is read from Mailpit, never the database.
 *
 * @module e2e/live/reset-wizard.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { clearMailpit, latestOtp } from './helpers/mailpit';
import { expectSignedIn, signIn } from './helpers/console';

async function fillOtp(page: Page, code: string): Promise<void> {
  const first = page.locator('[role="group"][aria-label="One-time code input"] input').first();
  await first.click();
  await page.keyboard.type(code);
}

/** Register and verify a fresh account, returning its credentials. */
async function registerVerified(page: Page): Promise<{ email: string; password: string }> {
  const email = `e2e-reset-${Date.now()}@auth.local`;
  const password = 'Sup3rSecret!pw';
  await page.goto('/auth/register');
  await page.locator('#register-name').fill('Reset User');
  await page.locator('#register-email').fill(email);
  await page.locator('#register-password').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/auth\/verify-email/);
  await fillOtp(page, await latestOtp(email));
  await expectSignedIn(page, email);
  return { email, password };
}

test('forgot -> Mailpit OTP -> reset -> sign in with the new password', async ({
  page,
  browser,
}) => {
  const { email } = await registerVerified(page);
  const newPassword = 'Rot4ted!Secret9';

  // Clear the inbox so the reset code is the only message addressed to this account.
  await clearMailpit();

  // A reset is initiated by a signed-out user who forgot their password, from a fresh
  // browser session with no live session cookie.
  const recovery = await browser.newContext();
  const rp = await recovery.newPage();

  // Screen 1: request a reset code. The wizard advances in place to the OTP screen.
  await rp.goto('/auth/forgot-password');
  await rp.locator('#fp-email').fill(email);
  await rp.locator('form button[type="submit"]').click();

  // Screen 2: enter the emailed OTP; verifying it routes to the new-password screen.
  const code = await latestOtp(email);
  await fillOtp(rp, code);
  await expect(rp).toHaveURL(/\/auth\/reset-password/);

  // Screen 3: choose a new password; success routes to the login page.
  await rp.locator('#rp-email').fill(email);
  await rp.locator('#rp-password').fill(newPassword);
  await rp.locator('form button[type="submit"]').click();
  await expect(rp).toHaveURL(/\/auth\/login/);

  // The new password authenticates.
  await signIn(rp, email, newPassword);
  await recovery.close();
});
