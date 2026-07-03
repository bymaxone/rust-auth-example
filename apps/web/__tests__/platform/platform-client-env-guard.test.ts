/**
 * @fileoverview Isolated env-guard test for `lib/platform-client`.
 *
 * Deliberately does NOT set `NEXT_PUBLIC_API_URL` before import so the
 * module-level fail-fast check fires. Lives in its own file so the env state
 * is independent of the main `platform-client.test.ts` suite.
 *
 * @module __tests__/platform/platform-client-env-guard.test
 */

import { describe, it, expect, vi } from 'vitest';

// Stub createAuthFetch so the module can be evaluated without a real fetch implementation.
vi.mock('@bymax-one/rust-auth/client', () => ({
  createAuthFetch: vi.fn(() => vi.fn()),
}));
vi.mock('@bymax-one/rust-auth/shared', () => ({
  AuthClientError: class AuthClientError extends Error {},
}));

describe('platform-client module-level env guard', () => {
  it('throws when NEXT_PUBLIC_API_URL is absent at module load time', async () => {
    // Verifies the fail-fast guard (line 24 of platform-client.ts) throws an
    // Error before any fetch is configured, protecting all callers from a silent
    // undefined baseUrl. NEXT_PUBLIC_API_URL is intentionally absent in this file.
    expect(process.env.NEXT_PUBLIC_API_URL).toBeUndefined();

    // vi.resetModules clears the module cache so the module-level code re-runs
    // without the env var that the hoisted setup in platform-client.test.ts sets.
    vi.resetModules();

    await expect(import('@/lib/platform-client')).rejects.toThrow(
      'NEXT_PUBLIC_API_URL is required',
    );
  });
});
