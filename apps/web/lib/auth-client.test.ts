/**
 * @fileoverview Tests for the auth client setup: config wiring + fail-fast env.
 *
 * @module lib/auth-client.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { createAuthClient, createAuthFetch } = vi.hoisted(() => ({
  createAuthClient: vi.fn(() => ({ tag: 'client' })),
  createAuthFetch: vi.fn(() => ({ tag: 'fetch' })),
}));

vi.mock('@bymax-one/rust-auth/client', () => ({ createAuthClient, createAuthFetch }));

const ORIGINAL_URL = process.env.NEXT_PUBLIC_API_URL;

beforeEach(() => {
  vi.resetModules();
  createAuthClient.mockClear();
  createAuthFetch.mockClear();
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
  } else {
    process.env.NEXT_PUBLIC_API_URL = ORIGINAL_URL;
  }
});

describe('auth-client', () => {
  it('builds the fetch wrapper and client from NEXT_PUBLIC_API_URL', async () => {
    // Verifies both factories receive the documented config when the base URL is present.
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    const mod = await import('./auth-client');

    expect(createAuthFetch).toHaveBeenCalledWith({
      baseUrl: 'https://api.example.com',
      routePrefix: 'auth',
    });
    expect(createAuthClient).toHaveBeenCalledWith({
      baseUrl: 'https://api.example.com',
      credentials: 'include',
      routePrefix: 'auth',
    });
    expect(mod.authFetch).toEqual({ tag: 'fetch' });
    expect(mod.authClient).toEqual({ tag: 'client' });
  });

  it('throws when NEXT_PUBLIC_API_URL is undefined', async () => {
    // Verifies the fail-fast guard on a missing base URL.
    delete process.env.NEXT_PUBLIC_API_URL;
    await expect(import('./auth-client')).rejects.toThrow('NEXT_PUBLIC_API_URL is required');
  });

  it('throws when NEXT_PUBLIC_API_URL is empty', async () => {
    // Verifies the empty-string branch of the guard is also rejected.
    process.env.NEXT_PUBLIC_API_URL = '';
    await expect(import('./auth-client')).rejects.toThrow('NEXT_PUBLIC_API_URL is required');
  });
});
