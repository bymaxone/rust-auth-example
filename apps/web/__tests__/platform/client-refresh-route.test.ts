/**
 * @fileoverview Tests for the platform client-refresh route binding.
 *
 * @module __tests__/platform/client-refresh-route.test
 */

import { describe, it, expect, vi } from 'vitest';

const { createClientRefreshHandler } = vi.hoisted(() => {
  process.env.INTERNAL_API_URL = 'http://backend.internal';
  return { createClientRefreshHandler: vi.fn(() => 'platform-refresh-handler') };
});

vi.mock('server-only', () => ({}));
vi.mock('@bymax-one/rust-auth/nextjs', () => ({ createClientRefreshHandler }));

import { POST } from '@/app/api/platform/client-refresh/route';

describe('platform client-refresh route', () => {
  it('binds POST to a handler built with the platform refresh config', () => {
    // Verifies the route delegates to the library factory with the platform prefix.
    expect(createClientRefreshHandler).toHaveBeenCalledWith({
      backendUrl: 'http://backend.internal',
      routePrefix: 'auth/platform',
    });
    expect(POST).toBe('platform-refresh-handler');
  });
});

describe('platform client-refresh route env guard', () => {
  it('throws when INTERNAL_API_URL is missing', async () => {
    // Verifies the route refuses to load without the backend origin.
    const saved = process.env.INTERNAL_API_URL;
    delete process.env.INTERNAL_API_URL;
    vi.resetModules();
    await expect(import('@/app/api/platform/client-refresh/route')).rejects.toThrow(
      'INTERNAL_API_URL is required',
    );
    process.env.INTERNAL_API_URL = saved;
  });
});
