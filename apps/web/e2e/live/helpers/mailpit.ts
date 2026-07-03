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
    const list = (await fetch(`${MAILPIT_URL}/api/v1/messages`).then((r) =>
      r.json(),
    )) as MailpitList;
    const match = list.messages.find((m) => m.To.some((a) => a.Address === to));
    if (match !== undefined) {
      const body = (await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`).then((r) =>
        r.json(),
      )) as MailpitMessage;
      const code = /\b(\d{6})\b/.exec(body.Text)?.[1];
      if (code !== undefined) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`no OTP delivered to ${to} within ${String(timeoutMs)}ms`);
}
