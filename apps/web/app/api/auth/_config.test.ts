/**
 * @fileoverview Tests for the shared auth-handler config: wiring + fail-fast env.
 *
 * @module app/api/auth/_config.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

const ORIGINAL_URL = process.env.INTERNAL_API_URL;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) {
    delete process.env.INTERNAL_API_URL;
  } else {
    process.env.INTERNAL_API_URL = ORIGINAL_URL;
  }
});

describe('authHandlerConfig', () => {
  it('builds the shared config from INTERNAL_API_URL', async () => {
    // Verifies the backend origin + prefix + login path are wired.
    process.env.INTERNAL_API_URL = 'http://backend.internal';
    const { authHandlerConfig } = await import('./_config');

    expect(authHandlerConfig).toEqual({
      backendUrl: 'http://backend.internal',
      routePrefix: 'auth',
      loginPath: '/auth/login',
    });
  });

  it('throws when INTERNAL_API_URL is undefined', async () => {
    // Verifies the fail-fast guard on a missing backend origin.
    delete process.env.INTERNAL_API_URL;
    await expect(import('./_config')).rejects.toThrow('INTERNAL_API_URL is required');
  });

  it('throws when INTERNAL_API_URL is empty', async () => {
    // Verifies the empty-string branch of the guard is also rejected.
    process.env.INTERNAL_API_URL = '';
    await expect(import('./_config')).rejects.toThrow('INTERNAL_API_URL is required');
  });
});
