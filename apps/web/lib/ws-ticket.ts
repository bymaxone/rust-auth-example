/**
 * @fileoverview Minting and URL construction for the realtime WebSocket ticket.
 *
 * Realtime carries **no JWT in the URL**. Instead the BFF mints a short-lived,
 * single-use ticket over the cookie session (`POST /auth/ws-ticket`), and the
 * browser opens `wss://…?ticket=…` with only that ticket. The access token never
 * appears in a query string or a WebSocket URL.
 *
 * @module lib/ws-ticket
 */

import { AUTH_ROUTES } from '@bymax-one/rust-auth/shared';
import { apiJson } from './api';

/** Mint a short-lived, single-use WebSocket ticket via the BFF (cookie session). */
export async function mintWsTicket(): Promise<string> {
  const { ticket } = await apiJson<{ ticket: string }>(AUTH_ROUTES.WS_TICKET, { method: 'POST' });
  return ticket;
}

/**
 * Build the realtime WebSocket URL for a minted ticket. The `http(s)` API origin
 * is upgraded to `ws(s)` and the ticket — never the JWT — is the only credential.
 *
 * @param ticket - The single-use ticket from {@link mintWsTicket}.
 * @returns The `ws(s)://…/ws/example?ticket=…` URL.
 */
export function buildWsUrl(ticket: string): string {
  // The `?? ''` default is equivalent under mutation: any non-absolute default (the mutant's
  // included) makes `new URL(...)` throw and routes to the identical catch fallback below, so no
  // test can distinguish one empty/invalid default from another.
  // Stryker disable next-line StringLiteral
  const rawBase = process.env.NEXT_PUBLIC_API_URL ?? '';
  try {
    const u = new URL(rawBase);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${u.origin}/ws/example?ticket=${encodeURIComponent(ticket)}`;
  } catch {
    // Missing or non-absolute API URL: fall back to a relative path.
    return `/ws/example?ticket=${encodeURIComponent(ticket)}`;
  }
}
