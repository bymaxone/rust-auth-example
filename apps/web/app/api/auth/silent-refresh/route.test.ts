/**
 * @fileoverview Tests for the silent-refresh route binding.
 *
 * @module app/api/auth/silent-refresh/route.test
 */

import { describe, it, expect, vi } from 'vitest';

const { createSilentRefreshHandler } = vi.hoisted(() => {
  process.env.INTERNAL_API_URL = 'http://backend.internal';
  return { createSilentRefreshHandler: vi.fn(() => 'silent-refresh-handler') };
});

vi.mock('server-only', () => ({}));
vi.mock('@bymax-one/rust-auth/nextjs', () => ({ createSilentRefreshHandler }));

import { GET } from './route';

describe('silent-refresh route', () => {
  it('binds GET to the factory result built with the shared config', () => {
    // Verifies the route delegates to the library factory without hand-rolled logic.
    expect(createSilentRefreshHandler).toHaveBeenCalledWith({
      backendUrl: 'http://backend.internal',
      routePrefix: 'auth',
      loginPath: '/auth/login',
    });
    expect(GET).toBe('silent-refresh-handler');
  });
});
