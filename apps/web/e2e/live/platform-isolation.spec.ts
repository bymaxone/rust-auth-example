/**
 * @fileoverview Live journey: platform-domain isolation.
 *
 * A dashboard (tenant) session must never satisfy the platform console. After a real
 * dashboard sign-in, navigating to a `/platform/*` route is rejected at the edge and routed
 * to the platform login — the two token families never cross over.
 *
 * @module e2e/live/platform-isolation.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { latestOtp } from './helpers/mailpit';
import { expectSignedIn } from './helpers/console';

async function fillOtp(page: Page, code: string): Promise<void> {
  const first = page.locator('[role="group"][aria-label="One-time code input"] input').first();
  await first.click();
  await page.keyboard.type(code);
}

test('a dashboard session cannot enter the platform console', async ({ page }) => {
  // Establish a real dashboard session (register -> verify -> dashboard).
  const email = `e2e-iso-${Date.now()}@auth.local`;
  await page.goto('/auth/register');
  await page.locator('#register-name').fill('Isolation User');
  await page.locator('#register-email').fill(email);
  await page.locator('#register-password').fill('Sup3rSecret!pw');
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/auth\/verify-email/);
  await fillOtp(page, await latestOtp(email));
  await expectSignedIn(page, email);

  // The dashboard cookie is not a platform credential: the platform area rejects it.
  await page.goto('/platform/users');
  await expect(page).toHaveURL(/\/platform\/login/);
});
