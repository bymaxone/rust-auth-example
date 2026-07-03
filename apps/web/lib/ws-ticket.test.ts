/**
 * @fileoverview Tests for the WebSocket ticket helpers.
 *
 * Covers: the ticket is minted through the BFF, the URL upgrades http(s)→ws(s)
 * and carries only the ticket (never a JWT), and the empty-origin fallback.
 *
 * @module lib/ws-ticket.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AUTH_ROUTES } from '@bymax-one/rust-auth/shared';

const mockApiJson = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ apiJson: mockApiJson }));

import { mintWsTicket, buildWsUrl } from './ws-ticket';

const ORIGINAL_URL = process.env.NEXT_PUBLIC_API_URL;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_API_URL = ORIGINAL_URL;
});

describe('mintWsTicket', () => {
  it('mints a single-use ticket through the BFF ws-ticket route', async () => {
    // The ticket is minted over the cookie session, not the JWT.
    mockApiJson.mockResolvedValueOnce({ ticket: 'TCK-123' });
    await expect(mintWsTicket()).resolves.toBe('TCK-123');
    expect(mockApiJson).toHaveBeenCalledWith(AUTH_ROUTES.WS_TICKET, { method: 'POST' });
  });
});

describe('buildWsUrl', () => {
  it('upgrades http to ws and carries only the ticket', () => {
    // The access JWT must never appear in the URL — only the ticket.
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8080';
    expect(buildWsUrl('a b')).toBe('ws://localhost:8080/ws/example?ticket=a%20b');
  });

  it('upgrades https to wss', () => {
    // A TLS origin must open a secure WebSocket.
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    expect(buildWsUrl('t')).toBe('wss://api.example.com/ws/example?ticket=t');
  });

  it('falls back to a relative URL when the origin is unset', () => {
    // With no configured origin the URL is built relative to the host.
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(buildWsUrl('t')).toBe('/ws/example?ticket=t');
  });

  it('falls back to a relative URL when the origin is not a valid absolute URL', () => {
    // A non-URL string (e.g. a misconfigured env) must not throw.
    process.env.NEXT_PUBLIC_API_URL = 'not-a-url';
    expect(buildWsUrl('t')).toBe('/ws/example?ticket=t');
  });
});
