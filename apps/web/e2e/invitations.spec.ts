/**
 * @fileoverview End-to-end journey for the accept-invitation flow.
 *
 * This spec drives the full invitation journey against the live local stack:
 *   1. An admin creates an invitation (via the API directly, since the dashboard
 *      is a future phase). The invitation token is extracted from the Mailpit
 *      inbox at port 8025.
 *   2. The emailed link is opened in the browser.
 *   3. The visitor fills in name + password and submits.
 *   4. The response issues a session and the browser lands on /dashboard.
 *
 * Prerequisites: `pnpm infra:up` (Postgres, Redis, Mailpit) and both dev servers
 * (`pnpm -C apps/api dev` + `pnpm -C apps/web dev`) must be running.
 *
 * @module e2e/invitations
 */

import { test, expect } from '@playwright/test';

/** Base URL for the console (from the Playwright config or the env var). */
const WEB_BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
/** Mailpit HTTP API base URL. */
const MAILPIT_BASE = process.env.MAILPIT_URL ?? 'http://localhost:8025';
/** API base URL for seeding test data. */
const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:8080';

/** Waits up to `maxMs` for a Mailpit message containing `addressTo` and returns the raw HTML body. */
async function waitForMailpitEmail(addressTo: string, maxMs = 15_000): Promise<string> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_BASE}/api/v1/messages`);
    if (!res.ok) throw new Error(`Mailpit API error: ${res.status}`);
    const data = (await res.json()) as {
      messages: Array<{ ID: string; To: Array<{ Address: string }> }>;
    };
    const msg = data.messages.find((m) => m.To.some((r) => r.Address === addressTo));
    if (msg !== undefined && msg !== null) {
      const body = await fetch(`${MAILPIT_BASE}/api/v1/message/${msg.ID}`);
      const detail = (await body.json()) as { HTML: string };
      return detail.HTML;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No Mailpit email for ${addressTo} within ${maxMs} ms`);
}

/** Extracts the invitation accept URL from the email HTML body. */
function extractInvitationUrl(html: string): string {
  const match = /href="([^"]*\/auth\/accept-invitation[^"]*)"/.exec(html);
  const captured = match?.[1];
  if (captured === undefined) throw new Error('Invitation URL not found in email body');
  /* The link points to the API redirect; map it to the console URL. */
  return captured.replace(API_BASE, WEB_BASE);
}

test('invitation journey: create → email → accept → authenticated', async ({ page }) => {
  /* The invited email address is unique per run to avoid collisions. */
  const inviteeEmail = `invitee-${Date.now()}@example.com`;

  /* Step 1 — Create an invitation as a platform admin (seeded credentials). */
  const inviteRes = await page.request.post(`${API_BASE}/auth/invitations`, {
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ email: inviteeEmail, tenantId: 'acme' }),
  });
  /* The invitation endpoint returns 204 — if the stack is down this fails clearly. */
  expect(inviteRes.status()).toBe(204);

  /* Step 2 — Poll Mailpit for the invitation email. */
  const emailHtml = await waitForMailpitEmail(inviteeEmail);
  const acceptUrl = extractInvitationUrl(emailHtml);

  /* Step 3 — Open the invitation link and fill in the form. */
  await page.goto(acceptUrl);
  await expect(page.getByText(/Set your name and a password/i)).toBeVisible();
  await page.getByLabel('Full name').fill('Test Invitee');
  await page.getByLabel('Password').fill('StrongPass!1');
  await page.getByRole('button', { name: /Activate account/i }).click();

  /* Step 4 — Assert the authenticated landing. */
  await expect(page).toHaveURL(/\/dashboard/);
});
