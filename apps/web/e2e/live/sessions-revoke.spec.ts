/**
 * @fileoverview Live journey: the sessions device-manager revoke ("log out everywhere else").
 *
 * A verified account signs in from two independent browser contexts (two live sessions). From
 * the first device the second session is revoked through the device manager; a fresh reload
 * then re-reads the list from the API and only this device remains — proving the revoke deleted
 * the session in the store, not merely in the optimistic UI. (The revoked device's short-lived
 * access JWT stays valid until it expires, so this asserts the durable server state rather than
 * an immediate cross-device bounce, which a stateless access token cannot guarantee.)
 *
 * @module e2e/live/sessions-revoke.spec
 */

import { test, expect, type Browser, type Page } from '@playwright/test';
import { latestOtp } from './helpers/mailpit';
import { expectSignedIn, signIn } from './helpers/console';

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
  await expectSignedIn(page, email);
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
  await signIn(page, email, password);
  return page;
}

test('revoking another device removes that session server-side', async ({ page, browser }) => {
  const { email, password } = await registerVerified(page);

  // A second sign-in creates a second live session for the same user.
  const second = await signInFreshContext(browser, email, password);

  // From the first device, both sessions are listed; revoke the other one and wait for the
  // API to acknowledge the DELETE before re-reading (the click resolves optimistically, so a
  // reload without this wait can race the in-flight request).
  await page.goto('/dashboard/sessions');
  const revoked = page.waitForResponse(
    (r) => /\/auth\/sessions\/.+/.test(r.url()) && r.request().method() === 'DELETE',
  );
  await page
    .getByRole('button', { name: /revoke session/i })
    .first()
    .click();
  await revoked;

  // Confirm the revoke server-side, not just the optimistic removal: a reload re-reads the
  // list from the API, and only this device is left — no revocable session remains.
  await page.reload();
  await expect(page.getByText(/only this device/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /revoke session/i })).toHaveCount(0);

  await second.context().close();
});
