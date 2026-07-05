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
function res(init: {
  status: number;
  body?: unknown;
  retryAfter?: string;
  rejectJson?: boolean;
}): Response {
  return {
    status: init.status,
    ok: init.status < 400,
    headers: { get: (k: string) => (k === 'Retry-After' ? (init.retryAfter ?? null) : null) },
    json: () =>
      init.rejectJson ? Promise.reject(new Error('not json')) : Promise.resolve(init.body ?? {}),
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
    expect(result.request).toEqual({ email: 'a@b.co', tenantId: 'acme' });
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
    expect(result.request).toEqual({ action: 'refresh' });
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
    const input = { email: 'a@b.co', password: 'p', tenantId: 'acme' };
    mockAuthFetch.mockResolvedValueOnce(
      res({ status: 429, retryAfter: '42', body: { error: { code: 'auth.too_many_requests' } } }),
    );
    const result = await hammerLogin(input, 3);
    // Each attempt POSTs the raw credentials to the login route.
    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/auth/login',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    );
    expect(result.request).toEqual({ email: 'a@b.co', tenantId: 'acme', attempts: 3 });
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

  it('omits retryAfterSeconds when neither a header nor body details are present', async () => {
    // Without a retry hint the countdown is simply absent.
    mockAuthFetch.mockResolvedValueOnce(
      res({ status: 429, body: { error: { code: 'auth.too_many_requests' } } }),
    );
    const result = await hammerLogin({ email: 'a@b.co', password: 'p', tenantId: 'acme' }, 3);
    expect(result.status).toBe(429);
    expect(result).not.toHaveProperty('retryAfterSeconds');
  });

  it('omits retryAfterSeconds when the header is present but not a finite number', async () => {
    // A non-numeric Retry-After ('soon' → NaN) must not surface as a NaN countdown:
    // both the presence check and the finiteness check must hold before it is included.
    mockAuthFetch.mockResolvedValueOnce(
      res({
        status: 429,
        retryAfter: 'soon',
        body: { error: { code: 'auth.too_many_requests' } },
      }),
    );
    const result = await hammerLogin({ email: 'a@b.co', password: 'p', tenantId: 'acme' }, 3);
    expect(result.status).toBe(429);
    expect(result).not.toHaveProperty('retryAfterSeconds');
  });

  it('reads the body Retry-After only through the full optional chain', async () => {
    // With no header and a 429 body that lacks `error`, the deep countdown lookup must
    // tolerate the missing `error`/`details`/`code` links and fall back to the default code.
    mockAuthFetch.mockResolvedValueOnce(res({ status: 429, body: {} }));
    const result = await hammerLogin({ email: 'a@b.co', password: 'p', tenantId: 'acme' }, 3);
    expect(result.status).toBe(429);
    expect(result.code).toBe('auth.too_many_requests');
    expect(result).not.toHaveProperty('retryAfterSeconds');
    expect(result.response).toEqual({});
  });

  it('tolerates a 429 with no header and an unparseable body', async () => {
    // A 429 whose body cannot be parsed (and with no header) yields the default code,
    // no countdown, and the { status } placeholder response.
    mockAuthFetch.mockResolvedValueOnce(res({ status: 429, rejectJson: true }));
    const result = await hammerLogin({ email: 'a@b.co', password: 'p', tenantId: 'acme' }, 3);
    expect(result.status).toBe(429);
    expect(result.code).toBe('auth.too_many_requests');
    expect(result).not.toHaveProperty('retryAfterSeconds');
    expect(result.response).toEqual({ status: 429 });
  });

  it('handles a 429 whose body is not JSON, using the header and defaults', async () => {
    // A non-JSON 429 body must still yield the code default + header countdown.
    mockAuthFetch.mockResolvedValueOnce(res({ status: 429, retryAfter: '10', rejectJson: true }));
    const result = await hammerLogin({ email: 'a@b.co', password: 'p', tenantId: 'acme' }, 3);
    expect(result.code).toBe('auth.too_many_requests');
    expect(result.retryAfterSeconds).toBe(10);
    expect(result.response).toEqual({ status: 429 });
  });

  it('reports no 429 when the limit is never tripped', async () => {
    // If the limit is not reached the card says so rather than fabricating a 429.
    mockAuthFetch.mockResolvedValue(res({ status: 200 }));
    const result = await hammerLogin({ email: 'a@b.co', password: 'p', tenantId: 'acme' }, 2);
    // Exactly `attempts` requests are fired — the loop stops at `i < attempts`, not one past.
    expect(mockAuthFetch).toHaveBeenCalledTimes(2);
    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.status).toBe(200);
    expect(result.response).toEqual({ note: 'no 429 within attempts' });
  });

  it('surfaces a non-2xx non-429 response as an error result instead of continuing', async () => {
    // A 500 mid-loop must not be silently swallowed or mislabeled as success.
    mockAuthFetch.mockResolvedValueOnce(
      res({ status: 500, body: { error: { code: 'auth.internal' } } }),
    );
    const result = await hammerLogin({ email: 'a@b.co', password: 'p', tenantId: 'acme' }, 5);
    expect(result.status).toBe(500);
    expect(result.code).toBe('auth.internal');
  });

  it('uses http.error code when the non-2xx body carries no wire code', async () => {
    // A non-2xx body without an auth code must still surface as an error.
    mockAuthFetch.mockResolvedValueOnce(res({ status: 503, body: {} }));
    const result = await hammerLogin({ email: 'a@b.co', password: 'p', tenantId: 'acme' }, 5);
    expect(result.status).toBe(503);
    expect(result.code).toBe('http.error');
  });

  it('surfaces a non-2xx non-429 response whose body is not JSON', async () => {
    // A 500 mid-loop whose body cannot be parsed still surfaces as a failed result with
    // the status echoed and the http.error default — never a masked success.
    mockAuthFetch.mockResolvedValueOnce(res({ status: 500, rejectJson: true }));
    const result = await hammerLogin({ email: 'a@b.co', password: 'p', tenantId: 'acme' }, 5);
    expect(result.status).toBe(500);
    expect(result.code).toBe('http.error');
    expect(result.response).toEqual({ status: 500 });
  });
});

describe('diagnostics dispatch actions', () => {
  it('forceLockout posts a tenant-scoped identifier and returns the status', async () => {
    // Force-lockout drives the store by the opaque `{ identifier }` the route requires,
    // scoped as `tenant:email`.
    mockAuthFetch.mockResolvedValueOnce(res({ status: 200, body: { locked: true } }));
    const result = await forceLockout('a@b.co', 'acme');
    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/diagnostics/force-lockout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ identifier: 'acme:a@b.co' }),
      }),
    );
    expect(result).toMatchObject({
      status: 200,
      response: { locked: true },
      request: { identifier: 'acme:a@b.co' },
    });
    // A 2xx must take the success path — no error code is attached.
    expect(result).not.toHaveProperty('code');
  });

  it('forceLockout tolerates a non-JSON response body', async () => {
    // A body that is not JSON must not crash the diagnostics card.
    mockAuthFetch.mockResolvedValueOnce(res({ status: 200, rejectJson: true }));
    const result = await forceLockout('a@b.co', 'acme');
    expect(result).toMatchObject({ status: 200, response: {} });
  });

  it('forceLockout signals failure on a non-2xx response', async () => {
    // A non-2xx diagnostics response must be flagged so the caller can react.
    mockAuthFetch.mockResolvedValueOnce(
      res({ status: 500, body: { error: { code: 'auth.internal' } } }),
    );
    const result = await forceLockout('a@b.co', 'acme');
    expect(result.status).toBe(500);
    expect(result.code).toBe('auth.internal');
  });

  it('forceLockout uses http.error when no wire code is present in a non-2xx body', async () => {
    // A non-2xx body without an auth code still signals failure.
    mockAuthFetch.mockResolvedValueOnce(res({ status: 503, body: {} }));
    const result = await forceLockout('a@b.co', 'acme');
    expect(result.status).toBe(503);
    expect(result.code).toBe('http.error');
  });

  it('dispatchVerifyEmail reports the resend status', async () => {
    // Dispatching a verification email POSTs {email, tenantId} to the resend route and
    // reports the neutral status without an error code.
    mockAuthFetch.mockResolvedValueOnce(res({ status: 202 }));
    const result = await dispatchVerifyEmail('a@b.co', 'acme');
    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/auth/resend-verification',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.co', tenantId: 'acme' }),
      }),
    );
    expect(result.request).toEqual({ email: 'a@b.co', tenantId: 'acme' });
    expect(result.status).toBe(202);
    expect(result.response).toEqual({ status: 202 });
    expect(result).not.toHaveProperty('code');
  });

  it('dispatchVerifyEmail signals failure on a non-2xx response', async () => {
    // A non-2xx resend response must be flagged so the caller can react.
    mockAuthFetch.mockResolvedValueOnce(
      res({ status: 429, body: { error: { code: 'auth.too_many_requests' } } }),
    );
    const result = await dispatchVerifyEmail('a@b.co', 'acme');
    expect(result.status).toBe(429);
    expect(result.code).toBe('auth.too_many_requests');
  });

  it('dispatchVerifyEmail uses http.error when no wire code present in a non-2xx body', async () => {
    // A non-2xx resend response without a wire code still signals failure.
    mockAuthFetch.mockResolvedValueOnce(res({ status: 503, body: {} }));
    const result = await dispatchVerifyEmail('a@b.co', 'acme');
    expect(result.status).toBe(503);
    expect(result.code).toBe('http.error');
  });

  it('dispatchVerifyEmail surfaces a non-2xx response whose body is not JSON', async () => {
    // A non-2xx resend whose body cannot be parsed still surfaces the status + http.error.
    mockAuthFetch.mockResolvedValueOnce(res({ status: 500, rejectJson: true }));
    const result = await dispatchVerifyEmail('a@b.co', 'acme');
    expect(result.status).toBe(500);
    expect(result.code).toBe('http.error');
    expect(result.response).toEqual({ status: 500 });
  });

  it('dispatchPasswordReset calls forgotPassword and reports dispatched', async () => {
    // The reset dispatch goes through the typed client.
    authClient.forgotPassword.mockResolvedValueOnce(undefined);
    const result = await dispatchPasswordReset('a@b.co', 'acme');
    expect(authClient.forgotPassword).toHaveBeenCalledWith('a@b.co', 'acme');
    expect(result.request).toEqual({ email: 'a@b.co', tenantId: 'acme' });
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
    // The wrong password is a fixed, deliberately-invalid sentinel passed straight through.
    expect(authClient.login).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: 'definitely-not-the-password',
      tenantId: 'acme',
    });
    expect(result.code).toBe('auth.invalid_credentials');
  });
});

describe('error propagation', () => {
  it('runRegister catches an AuthClientError', async () => {
    // A duplicate-email registration is reported, not thrown.
    authClient.register.mockRejectedValueOnce(
      new AuthClientError('x', 409, { code: 'auth.email_already_exists', message: 'x' }),
    );
    const result = await runRegister({
      email: 'a@b.co',
      password: 'p',
      name: 'A',
      tenantId: 'acme',
    });
    expect(result.code).toBe('auth.email_already_exists');
  });

  it('dispatchVerifyEmail reports a code-less error with its status only', async () => {
    // An error carrying no wire code still surfaces the HTTP status.
    mockAuthFetch.mockRejectedValueOnce(new AuthClientError('x', 500));
    const result = await dispatchVerifyEmail('a@b.co', 'acme');
    // A code-less error must omit the `code` key entirely, not carry an undefined one.
    expect(result).not.toHaveProperty('code');
    expect(result.status).toBe(500);
  });

  it('dispatchPasswordReset catches a thrown error', async () => {
    // A reset-dispatch failure is reported through the result shape.
    authClient.forgotPassword.mockRejectedValueOnce(
      new AuthClientError('x', 500, { code: 'auth.internal', message: 'x' }),
    );
    const result = await dispatchPasswordReset('a@b.co', 'acme');
    expect(result.code).toBe('auth.internal');
  });
});
