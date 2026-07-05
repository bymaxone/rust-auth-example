/**
 * @fileoverview Isolated env-guard test for `lib/platform-client`.
 *
 * Deliberately does NOT set `NEXT_PUBLIC_API_URL` before import so the
 * module-level fail-fast check fires. Lives in its own file so the env state
 * is independent of the main `platform-client.test.ts` suite.
 *
 * @module __tests__/platform/platform-client-env-guard.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub createAuthFetch so the module can be evaluated without a real fetch implementation.
vi.mock('@bymax-one/rust-auth/client', () => ({
  createAuthFetch: vi.fn(() => vi.fn()),
}));
vi.mock('@bymax-one/rust-auth/shared', () => ({
  AuthClientError: class AuthClientError extends Error {},
}));

describe('platform-client module-level env guard', () => {
  let savedApiUrl: string | undefined;

  beforeEach(() => {
    // Save and remove the env var so the module-level guard fires on import,
    // regardless of what the runner's ambient environment has set.
    savedApiUrl = process.env.NEXT_PUBLIC_API_URL;
    // eslint is not relevant here; Vitest does not lint env deletions
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  afterEach(() => {
    // Restore the original value so other test files are not affected.
    if (savedApiUrl !== undefined) {
      process.env.NEXT_PUBLIC_API_URL = savedApiUrl;
    } else {
      delete process.env.NEXT_PUBLIC_API_URL;
    }
  });

  it('throws when NEXT_PUBLIC_API_URL is absent at module load time', async () => {
    // Verifies the fail-fast guard (line 24 of platform-client.ts) throws an
    // Error before any fetch is configured, protecting all callers from a silent
    // undefined baseUrl.
    expect(process.env.NEXT_PUBLIC_API_URL).toBeUndefined();

    // vi.resetModules clears the module cache so the module-level code re-runs
    // without the env var that the hoisted setup in platform-client.test.ts sets.
    vi.resetModules();

    await expect(import('@/lib/platform-client')).rejects.toThrow(
      'NEXT_PUBLIC_API_URL is required',
    );
  });

  it('loads without throwing when NEXT_PUBLIC_API_URL is a non-empty string', async () => {
    // Verifies the false branch of the fail-fast guard: with a valid, non-empty
    // origin the module evaluates and exports the platform client instead of
    // throwing. Without this the guard could be short-circuited to always throw
    // and no test would notice.
    process.env.NEXT_PUBLIC_API_URL = 'http://api.example.com';
    vi.resetModules();

    await expect(import('@/lib/platform-client')).resolves.toHaveProperty('platformClient');
  });

  it('throws when NEXT_PUBLIC_API_URL is the empty string at module load time', async () => {
    // Verifies the second arm of the guard: an empty-string origin is rejected
    // exactly like an absent one. A blank base URL can never build a usable
    // client, so the module must throw instead of silently accepting `''` — the
    // empty check is a real comparison against `''`, not against any other value.
    process.env.NEXT_PUBLIC_API_URL = '';
    vi.resetModules();

    await expect(import('@/lib/platform-client')).rejects.toThrow(
      'NEXT_PUBLIC_API_URL is required',
    );
  });
});
