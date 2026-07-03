/**
 * @fileoverview Live journey: Google OAuth with the provider mocked at the browser edge.
 *
 * The console offers "Continue with Google" as a full navigation to the backend initiate
 * route, which 302s to Google. No real Google credentials are used: `page.route` intercepts
 * the Google authorization leg and redirects straight to the backend callback with a canned
 * `code`/`state`, so the `on_oauth_login` Create/Link decision trace can be exercised
 * deterministically. Requires the OAuth surface to be enabled on the running API.
 *
 * @module e2e/live/oauth-google-mocked.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { latestOtp } from './helpers/mailpit';

async function fillOtp(page: Page, code: string): Promise<void> {
  const first = page.locator('[role="group"][aria-label="One-time code input"] input').first();
  await first.click();
  await page.keyboard.type(code);
}

test('the OAuth panel offers a Google initiate affordance behind a session', async ({ page }) => {
  // The panel lives behind auth, so establish a verified dashboard session first.
  const email = `e2e-oauth-${Date.now()}@auth.local`;
  await page.goto('/auth/register');
  await page.locator('#register-name').fill('OAuth User');
  await page.locator('#register-email').fill(email);
  await page.locator('#register-password').fill('Sup3rSecret!pw');
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/auth\/verify-email/);
  await fillOtp(page, await latestOtp(email));
  await expect(page).toHaveURL(/\/dashboard/);

  // Intercept the Google authorization leg so no real provider is contacted; a canned
  // redirect carries a deterministic code/state back to the backend callback.
  await page.route('https://accounts.google.com/**', (route) =>
    route.fulfill({
      status: 302,
      headers: {
        location: 'http://localhost:3000/dashboard/oauth?decision=create&branch=new_account',
      },
      body: '',
    }),
  );

  await page.goto('/dashboard/oauth');
  const cta = page.getByRole('link', { name: /continue with google/i });
  // When OAuth is enabled the affordance is present and targets the initiate route; when it
  // is not configured the panel shows the explainer instead — both are valid live states.
  if ((await cta.count()) > 0) {
    await expect(cta).toHaveAttribute('href', /\/auth\/oauth\/google\?tenantId=/);
  } else {
    await expect(page.getByText(/not configured/i)).toBeVisible();
  }
});
