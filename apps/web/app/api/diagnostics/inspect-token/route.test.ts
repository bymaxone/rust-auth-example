/**
 * @fileoverview Tests for the server-only token inspector route.
 *
 * Covers: a valid token is decoded + verified, a missing token is a 400, and a
 * verify failure (e.g. a forged alg:none) reports `verified: false`.
 *
 * @module app/api/diagnostics/inspect-token/route.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const decodeJwtToken = vi.hoisted(() => vi.fn());
const verifyJwtToken = vi.hoisted(() => vi.fn());
vi.mock('@bymax-one/rust-auth/nextjs', () => ({ decodeJwtToken, verifyJwtToken }));

import { POST } from './route';

function post(body: unknown): Request {
  return new Request('http://localhost/api/diagnostics/inspect-token', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/diagnostics/inspect-token', () => {
  it('is unavailable (404) in a production build', async () => {
    // The inspector must not become a verification oracle in production.
    vi.stubEnv('NODE_ENV', 'production');
    const res = await POST(post({ token: 'a.b.c' }));
    expect(res.status).toBe(404);
    expect(decodeJwtToken).not.toHaveBeenCalled();
  });

  it('decodes and verifies a valid token', async () => {
    // A properly signed token decodes and verifies true.
    decodeJwtToken.mockResolvedValueOnce({ isValid: true, header: { alg: 'HS256' } });
    verifyJwtToken.mockResolvedValueOnce({ isValid: true });
    const res = await POST(post({ token: 'a.b.c' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      decoded: { isValid: true, header: { alg: 'HS256' } },
      verified: true,
    });
    expect(decodeJwtToken).toHaveBeenCalledWith('a.b.c');
  });

  it('rejects a request with no token', async () => {
    // An empty token yields a 400 without touching the verifier.
    const res = await POST(post({ token: '' }));
    expect(res.status).toBe(400);
    expect(decodeJwtToken).not.toHaveBeenCalled();
  });

  it('reports verified:false when verification throws (forged alg:none)', async () => {
    // A forged token must verify as rejected, never crash the route.
    decodeJwtToken.mockResolvedValueOnce({ isValid: false, header: { alg: 'none' } });
    verifyJwtToken.mockRejectedValueOnce(new Error('bad signature'));
    const res = await POST(post({ token: 'forged' }));
    await expect(res.json()).resolves.toMatchObject({ verified: false });
  });
});
