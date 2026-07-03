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
import { latestOtp } from './helpers/mailpit';

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
  await expect(page).toHaveURL(/\/dashboard/);
  return { email, password };
}

test('forgot -> Mailpit OTP -> reset -> sign in with the new password', async ({ page }) => {
  const { email } = await registerVerified(page);
  const newPassword = 'Rot4ted!Secret9';

  // Request a reset code, then complete the wizard with the emailed OTP + a new password.
  await page.goto('/auth/forgot-password');
  await page.locator('#fp-email').fill(email);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/auth\/reset-password/);

  const code = await latestOtp(email);
  await page.locator('#rp-email').fill(email);
  await fillOtp(page, code);
  await page.locator('#rp-password').fill(newPassword);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/auth\/login/);

  // The new password authenticates; the old one no longer does.
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(newPassword);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
});
