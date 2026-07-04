/**
 * @fileoverview Mailpit REST helpers for the live e2e journeys.
 *
 * The journeys never read the database to learn a one-time code; they read the
 * delivered mail from Mailpit's REST API exactly as an operator would. The base
 * URL defaults to the local Mailpit UI port and is overridable for CI service
 * containers.
 *
 * @module e2e/live/helpers/mailpit
 */

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

/** A single Mailpit message summary from `GET /api/v1/messages`. */
interface MailpitSummary {
  ID: string;
  To: { Address: string }[];
  Created: string;
}

interface MailpitList {
  messages: MailpitSummary[];
}

interface MailpitMessage {
  Text: string;
  HTML: string;
}

/** Delete every stored message so a journey starts from a clean inbox. */
export async function clearMailpit(): Promise<void> {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
}

/**
 * Poll Mailpit until a message addressed to `to` arrives, then extract the first
 * six-digit code from its text body. Polls because delivery is asynchronous.
 *
 * @param to - The recipient address to match.
 * @param timeoutMs - How long to wait before giving up.
 * @returns The six-digit one-time code.
 * @throws {Error} When no matching code arrives within the timeout.
 */
export async function latestOtp(to: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const listRes = await fetch(`${MAILPIT_URL}/api/v1/messages`);
    if (!listRes.ok) throw new Error(`Mailpit list request failed: ${String(listRes.status)}`);
    const list = (await listRes.json()) as MailpitList;
    // Pick the most recent matching message: the reset flow can leave an earlier verification
    // email to the same address, and `latestOtp` must read the freshest code, not the first.
    const match = list.messages
      .filter((m) => m.To.some((a) => a.Address === to))
      .sort((a, b) => b.Created.localeCompare(a.Created))[0];
    if (match !== undefined) {
      const bodyRes = await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`);
      if (!bodyRes.ok) throw new Error(`Mailpit message request failed: ${String(bodyRes.status)}`);
      const body = (await bodyRes.json()) as MailpitMessage;
      const code = /\b(\d{6})\b/.exec(body.Text)?.[1];
      if (code !== undefined) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`no OTP delivered to ${to} within ${String(timeoutMs)}ms`);
}
