/**
 * @fileoverview Tests for the Trigger Center action wrappers.
 *
 * Covers: secrets are redacted / passwords stripped, the happy paths, the 429
 * hammer-login path (header + body Retry-After, and the no-429 fallback), the
 * caught-AuthClientError shape, and the unexpected-error branch.
 *
 * @module lib/trigger-actions.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthClientError } from '@bymax-one/rust-auth/shared';

const authClient = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  refresh: vi.fn(),
  forgotPassword: vi.fn(),
}));
const mockAuthFetch = vi.hoisted(() => vi.fn());
vi.mock('./auth-client', () => ({ authClient, authFetch: mockAuthFetch }));

import {
  redactSecrets,
  runRegister,
  runLogin,
  rotateToken,
  hammerLogin,
  forceLockout,
  dispatchVerifyEmail,
  dispatchPasswordReset,
  provokeInvalidCredentials,
} from './trigger-actions';

/** Build a minimal Response with a status, JSON body, and Retry-After header. */
function res(init: { status: number; body?: unknown; retryAfter?: string }): Response {
  return {
    status: init.status,
    ok: init.status < 400,
    headers: { get: (k: string) => (k === 'Retry-After' ? (init.retryAfter ?? null) : null) },
    json: () => Promise.resolve(init.body ?? {}),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('redactSecrets', () => {
  it('redacts secret-keyed fields anywhere in the structure', () => {
    // Tokens, passwords, and recovery codes must never survive to the UI.
    const out = redactSecrets({
      accessToken: 'a',
      nested: { refreshToken: 'r', ok: 1 },
      list: [{ password: 'p', keep: 'x' }],
    });
    expect(out).toEqual({
      accessToken: '<redacted>',
      nested: { refreshToken: '<redacted>', ok: 1 },
      list: [{ password: '<redacted>', keep: 'x' }],
    });
  });

  it('returns primitives unchanged', () => {
    // Non-object values pass through untouched.
    expect(redactSecrets('plain')).toBe('plain');
    expect(redactSecrets(null)).toBeNull();
  });
});

describe('runRegister', () => {
  it('strips the password from the request and redacts response tokens', async () => {
    // The Playground must never echo the password or the issued tokens.
    authClient.register.mockResolvedValueOnce({
      user: { id: '1', email: 'a@b.co' },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    const result = await runRegister({
      email: 'a@b.co',
      password: 'hunter2',
      name: 'A',
      tenantId: 'acme',
    });
    expect(result.request).toEqual({ email: 'a@b.co', name: 'A', tenantId: 'acme' });
    expect(result.response).toMatchObject({
      accessToken: '<redacted>',
      refreshToken: '<redacted>',
    });
    expect(JSON.stringify(result)).not.toContain('hunter2');
  });
});

describe('runLogin', () => {
  it('surfaces the MFA-challenge branch with the temp token redacted', async () => {
    // An MFA-required login must show mfaRequired without leaking the temp token.
    authClient.login.mockResolvedValueOnce({ mfaRequired: true, mfaTempToken: 'TT' });
    const result = await runLogin({ email: 'a@b.co', password: 'p', tenantId: 'acme' });
    expect(result.response).toEqual({ mfaRequired: true, mfaTempToken: '<redacted>' });
  });

  it('catches an AuthClientError into the result shape', async () => {
    // A failed login must be reported, never thrown to the render boundary.
    authClient.login.mockRejectedValueOnce(
      new AuthClientError('bad', 401, { code: 'auth.invalid_credentials', message: 'bad' }),
    );
    const result = await runLogin({ email: 'a@b.co', password: 'p', tenantId: 'acme' });
    expect(result.code).toBe('auth.invalid_credentials');
    expect(result.status).toBe(401);
  });

  it('reports an unexpected non-AuthClientError generically', async () => {
    // A thrown non-library error must not crash the card.
    authClient.login.mockRejectedValueOnce(new Error('network'));
    const result = await runLogin({ email: 'a@b.co', password: 'p', tenantId: 'acme' });
    expect(result.response).toEqual({ error: 'unexpected client error' });
    expect(result.code).toBeUndefined();
  });
});

describe('rotateToken', () => {
  it('redacts the rotated tokens', async () => {
    // Rotation proves it happened without exposing the new tokens.
    authClient.refresh.mockResolvedValueOnce({
      user: { id: '1' },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    const result = await rotateToken();
    expect(result.response).toMatchObject({
      accessToken: '<redacted>',
      refreshToken: '<redacted>',
    });
  });

  it('reports a refresh failure as a typed error', async () => {
    // A failed refresh surfaces the wire code.
    authClient.refresh.mockRejectedValueOnce(
      new AuthClientError('nope', 401, { code: 'auth.refresh_token_invalid', message: 'nope' }),
    );
    const result = await rotateToken();
    expect(result.code).toBe('auth.refresh_token_invalid');
  });
});

describe('hammerLogin', () => {
  it('returns the 429 with the Retry-After header window', async () => {
    // Exceeding the login rate limit must surface 429 + the retry countdown.
    mockAuthFetch.mockResolvedValueOnce(
      res({ status: 429, retryAfter: '42', body: { error: { code: 'auth.too_many_requests' } } }),
    );
    const result = await hammerLogin({ email: 'a@b.co', password: 'p', tenantId: 'acme' }, 3);
    expect(result.status).toBe(429);
    expect(result.code).toBe('auth.too_many_requests');
    expect(result.retryAfterSeconds).toBe(42);
  });

  it('falls back to the body Retry-After when no header is present', async () => {
    // The countdown must still work from the error body details.
    mockAuthFetch.mockResolvedValueOnce(res({ status: 200 })).mockResolvedValueOnce(
      res({
        status: 429,
        body: { error: { code: 'auth.too_many_requests', details: { retryAfterSeconds: 17 } } },
      }),
    );
    const result = await hammerLogin({ email: 'a@b.co', password: 'p', tenantId: 'acme' }, 3);
    expect(result.retryAfterSeconds).toBe(17);
  });

  it('reports no 429 when the limit is never tripped', async () => {
    // If the limit is not reached the card says so rather than fabricating a 429.
    mockAuthFetch.mockResolvedValue(res({ status: 200 }));
    const result = await hammerLogin({ email: 'a@b.co', password: 'p', tenantId: 'acme' }, 2);
    expect(result.status).toBe(200);
    expect(result.response).toEqual({ note: 'no 429 within attempts' });
  });
});

describe('diagnostics dispatch actions', () => {
  it('forceLockout posts to the diagnostics route and returns the status', async () => {
    // Force-lockout drives an account toward lockout via the example route.
    mockAuthFetch.mockResolvedValueOnce(res({ status: 200, body: { locked: true } }));
    const result = await forceLockout('a@b.co', 'acme');
    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/diagnostics/force-lockout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toMatchObject({ status: 200, response: { locked: true } });
  });

  it('dispatchVerifyEmail reports the resend status', async () => {
    // Dispatching a verification email reports the neutral status.
    mockAuthFetch.mockResolvedValueOnce(res({ status: 202 }));
    const result = await dispatchVerifyEmail('a@b.co', 'acme');
    expect(result.status).toBe(202);
  });

  it('dispatchPasswordReset calls forgotPassword and reports dispatched', async () => {
    // The reset dispatch goes through the typed client.
    authClient.forgotPassword.mockResolvedValueOnce(undefined);
    const result = await dispatchPasswordReset('a@b.co', 'acme');
    expect(authClient.forgotPassword).toHaveBeenCalledWith('a@b.co', 'acme');
    expect(result.response).toEqual({ dispatched: true });
  });

  it('forceLockout catches an AuthClientError', async () => {
    // A diagnostics failure is reported, not thrown.
    mockAuthFetch.mockRejectedValueOnce(
      new AuthClientError('x', 403, { code: 'auth.forbidden', message: 'x' }),
    );
    const result = await forceLockout('a@b.co', 'acme');
    expect(result.code).toBe('auth.forbidden');
  });
});

describe('provokeInvalidCredentials', () => {
  it('provokes auth.invalid_credentials with a deliberately wrong password', async () => {
    // The provoke card must elicit a real error code from the API.
    authClient.login.mockRejectedValueOnce(
      new AuthClientError('bad', 401, { code: 'auth.invalid_credentials', message: 'bad' }),
    );
    const result = await provokeInvalidCredentials('a@b.co', 'acme');
    expect(result.code).toBe('auth.invalid_credentials');
  });
});
