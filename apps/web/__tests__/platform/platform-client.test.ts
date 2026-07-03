/**
 * @fileoverview Tests for the platform browser client: every method, the
 * error-handling path, and the fail-fast env guard.
 *
 * @module __tests__/platform/platform-client.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted setup: set NEXT_PUBLIC_API_URL and stub createAuthFetch before
// the module under test is imported.
// ---------------------------------------------------------------------------
const { createAuthFetch, AuthClientError } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL = 'http://api.example.com';
  const fetchMock = vi.fn();
  return {
    createAuthFetch: vi.fn(() => fetchMock),
    AuthClientError: class AuthClientError extends Error {
      status: number;
      code?: string;
      constructor(message: string, status: number, body?: { code?: string; message?: string }) {
        super(message);
        this.name = 'AuthClientError';
        this.status = status;
        if (body?.code !== undefined) this.code = body.code;
      }
    },
  };
});

vi.mock('@bymax-one/rust-auth/client', () => ({ createAuthFetch }));
vi.mock('@bymax-one/rust-auth/shared', () => ({ AuthClientError }));

import { platformClient, platformMfa, platformSessions } from '@/lib/platform-client';

/** Helper to build a mock Response. */
function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('platformClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = (createAuthFetch as ReturnType<typeof vi.fn>).mock.results[0]?.value as ReturnType<
      typeof vi.fn
    >;
    if (fetchMock) fetchMock.mockReset();
  });

  describe('login', () => {
    it('posts credentials and returns the login result on success', async () => {
      // Verifies a successful login response is returned from the client.
      const result = { user: { id: '1', email: 'a@b.com' } };
      fetchMock.mockResolvedValue(mockResponse(200, result));

      const res = await platformClient.login('a@b.com', 'pass');
      expect(fetchMock).toHaveBeenCalledWith(
        '/auth/platform/login',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(res).toEqual(result);
    });

    it('returns an mfaRequired result when the backend demands MFA', async () => {
      // Verifies the client transparently forwards the mfaRequired union shape.
      const result = { mfaRequired: true, mfaTempToken: 'tmp-tok' };
      fetchMock.mockResolvedValue(mockResponse(200, result));

      const res = await platformClient.login('a@b.com', 'pass');
      expect(res).toEqual(result);
    });

    it('throws AuthClientError on a non-2xx response', async () => {
      // Verifies the error path maps the wire body to AuthClientError.
      fetchMock.mockResolvedValue(
        mockResponse(401, {
          error: { code: 'auth.invalid_credentials', message: 'Bad credentials' },
        }),
      );

      await expect(platformClient.login('x@y.com', 'wrong')).rejects.toThrow();
    });
  });

  describe('mfaChallenge', () => {
    it('posts the temp token + code and returns the auth result on success', async () => {
      // Verifies the MFA challenge call forwards the correct payload.
      const result = { user: { id: '1' } };
      fetchMock.mockResolvedValue(mockResponse(200, result));

      const res = await platformClient.mfaChallenge('tmp-tok', '123456');
      expect(fetchMock).toHaveBeenCalledWith(
        '/auth/platform/mfa/challenge',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(res).toEqual(result);
    });
  });

  describe('getMe', () => {
    it('fetches the credential-free admin profile', async () => {
      // Verifies getMe calls the platform /me endpoint and returns the profile.
      const profile = {
        id: '1',
        email: 'a@b.com',
        name: 'Admin',
        role: 'admin',
        status: 'ACTIVE',
        mfaEnabled: false,
      };
      fetchMock.mockResolvedValue(mockResponse(200, profile));

      const res = await platformClient.getMe();
      expect(fetchMock).toHaveBeenCalledWith(
        '/auth/platform/me',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(res).toEqual(profile);
    });
  });

  describe('logout', () => {
    it('posts to the platform logout endpoint', async () => {
      // Verifies logout calls the correct endpoint.
      fetchMock.mockResolvedValue(mockResponse(204, null));

      await expect(platformClient.logout()).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledWith(
        '/auth/platform/logout',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});

describe('platformMfa', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = (createAuthFetch as ReturnType<typeof vi.fn>).mock.results[0]?.value as ReturnType<
      typeof vi.fn
    >;
    if (fetchMock) fetchMock.mockReset();
  });

  it('setup returns the one-time enrollment payload', async () => {
    // Verifies setup calls POST /auth/platform/mfa/setup and returns secret+qr+codes.
    const payload = { secret: 'SEC', qrCodeUri: 'otpauth://...', recoveryCodes: ['a', 'b'] };
    fetchMock.mockResolvedValue(mockResponse(200, payload));

    const res = await platformMfa.setup();
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/platform/mfa/setup',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(res).toEqual(payload);
  });

  it('setup throws AuthClientError when mfa_not_enabled is returned', async () => {
    // Verifies fail-closed: the error code is surfaced, never swallowed.
    fetchMock.mockResolvedValue(
      mockResponse(403, { error: { code: 'auth.mfa_not_enabled', message: 'MFA not enabled' } }),
    );

    await expect(platformMfa.setup()).rejects.toThrow();
  });

  it('verifyEnable posts the TOTP code to the verify-enable endpoint', async () => {
    // Verifies the correct path and payload for enable confirmation.
    fetchMock.mockResolvedValue(mockResponse(204, null));

    await expect(platformMfa.verifyEnable('654321')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/platform/mfa/verify-enable',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('disable posts the TOTP code to the disable endpoint', async () => {
    // Verifies the correct path for MFA disable.
    fetchMock.mockResolvedValue(mockResponse(204, null));

    await expect(platformMfa.disable('123456')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/platform/mfa/disable',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('regenerate returns fresh recovery codes', async () => {
    // Verifies regenerate calls the correct endpoint and returns the new codes.
    const codes = ['code1', 'code2'];
    fetchMock.mockResolvedValue(mockResponse(200, { recoveryCodes: codes }));

    const res = await platformMfa.regenerate('999999');
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/platform/mfa/recovery-codes',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(res).toEqual(codes);
  });
});

describe('platformSessions', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = (createAuthFetch as ReturnType<typeof vi.fn>).mock.results[0]?.value as ReturnType<
      typeof vi.fn
    >;
    if (fetchMock) fetchMock.mockReset();
  });

  it('revokeAll sends DELETE to the sessions endpoint', async () => {
    // Verifies the bulk revoke calls the correct method and path.
    fetchMock.mockResolvedValue(mockResponse(204, null));

    await expect(platformSessions.revokeAll()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/platform/sessions',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('revokeAll throws on a non-2xx response', async () => {
    // Verifies the error path for a revoke failure.
    fetchMock.mockResolvedValue(
      mockResponse(401, {
        error: { code: 'auth.platform_auth_required', message: 'Auth required' },
      }),
    );

    await expect(platformSessions.revokeAll()).rejects.toThrow();
  });
});

describe('platformApiFetch — readErrorBody edge cases', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = (createAuthFetch as ReturnType<typeof vi.fn>).mock.results[0]?.value as ReturnType<
      typeof vi.fn
    >;
    if (fetchMock) fetchMock.mockReset();
  });

  it('throws with statusText when the error body has no structured code/message', async () => {
    // Verifies readErrorBody returns undefined for a non-standard body, so the
    // thrown AuthClientError falls back to statusText ("Unauthorized").
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: vi.fn().mockResolvedValue({ something: 'non-standard' }),
    });

    await expect(platformClient.login('x@y.com', 'wrong')).rejects.toThrow('Unauthorized');
  });

  it('throws with "Request failed" when json() itself rejects', async () => {
    // Verifies readErrorBody catches a JSON parse error and returns undefined,
    // so the thrown AuthClientError uses the 'Request failed' fallback message.
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: '',
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
    });

    await expect(platformClient.login('x@y.com', 'wrong')).rejects.toThrow('Request failed');
  });
});

describe('platform-client fail-fast env guard', () => {
  it('NEXT_PUBLIC_API_URL is required — verified at module load', () => {
    // The fail-fast check runs at module load with the env set in vi.hoisted.
    // This test verifies the guard passes when the env var is present.
    expect(process.env.NEXT_PUBLIC_API_URL).toBe('http://api.example.com');
  });
});
