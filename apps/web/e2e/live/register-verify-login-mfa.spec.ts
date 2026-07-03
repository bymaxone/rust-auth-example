/**
 * @fileoverview Live journey: first verified login (register -> Mailpit OTP -> verify ->
 * dashboard), then a fresh sign-in on the same account.
 *
 * Runs against the real stack: the Next console talks to the Rust API, which emails the
 * verification code through Mailpit. The code is read from the Mailpit REST API, never the
 * database. TOTP enrolment (the login-with-MFA leg) is driven from the security console once
 * a TOTP generator is available to the runner; this spec proves the headline
 * register -> verify -> login pipeline end to end.
 *
 * @module e2e/live/register-verify-login-mfa.spec
 */

import { test, expect } from '@playwright/test';
import { latestOtp } from './helpers/mailpit';

/** Type a six-digit code into the segmented OTP input by focusing its first cell. */
async function fillOtp(page: import('@playwright/test').Page, code: string): Promise<void> {
  const first = page.locator('[role="group"][aria-label="One-time code input"] input').first();
  await first.click();
  await page.keyboard.type(code);
}

test('register -> verify via Mailpit OTP -> land on the dashboard, then re-login', async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@auth.local`;
  const password = 'Sup3rSecret!pw';

  // Register under the default `acme` tenant; a session goes live immediately.
  await page.goto('/auth/register');
  await page.locator('#register-name').fill('E2E User');
  await page.locator('#register-email').fill(email);
  await page.locator('#register-password').fill(password);
  await page.locator('form button[type="submit"]').click();

  // The engine emailed the verification OTP; read it from Mailpit and verify.
  await expect(page).toHaveURL(/\/auth\/verify-email/);
  const code = await latestOtp(email);
  await fillOtp(page, code);
  await expect(page).toHaveURL(/\/dashboard/);

  // Sign out, then sign back in with the verified credentials.
  await page.goto('/auth/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
});
