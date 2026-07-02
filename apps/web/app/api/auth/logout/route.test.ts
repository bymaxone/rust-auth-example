/**
 * @fileoverview Tests for the logout route binding.
 *
 * @module app/api/auth/logout/route.test
 */

import { describe, it, expect, vi } from 'vitest';

const { createLogoutHandler } = vi.hoisted(() => {
  process.env.INTERNAL_API_URL = 'http://backend.internal';
  return { createLogoutHandler: vi.fn(() => 'logout-handler') };
});

vi.mock('server-only', () => ({}));
vi.mock('@bymax-one/rust-auth/nextjs', () => ({ createLogoutHandler }));

import { POST } from './route';

describe('logout route', () => {
  it('binds POST to the factory result built with the shared config', () => {
    // Verifies the route delegates to the library factory without hand-rolled logic.
    expect(createLogoutHandler).toHaveBeenCalledWith({
      backendUrl: 'http://backend.internal',
      routePrefix: 'auth',
      loginPath: '/auth/login',
    });
    expect(POST).toBe('logout-handler');
  });
});
