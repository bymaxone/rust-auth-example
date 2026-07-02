/**
 * @fileoverview Tests for the client-refresh route binding.
 *
 * @module app/api/auth/client-refresh/route.test
 */

import { describe, it, expect, vi } from 'vitest';

const { createClientRefreshHandler } = vi.hoisted(() => {
  process.env.INTERNAL_API_URL = 'http://backend.internal';
  return { createClientRefreshHandler: vi.fn(() => 'client-refresh-handler') };
});

vi.mock('server-only', () => ({}));
vi.mock('@bymax-one/rust-auth/nextjs', () => ({ createClientRefreshHandler }));

import { POST } from './route';

describe('client-refresh route', () => {
  it('binds POST to the factory result built with the shared config', () => {
    // Verifies the route delegates to the library factory without hand-rolled logic.
    expect(createClientRefreshHandler).toHaveBeenCalledWith({
      backendUrl: 'http://backend.internal',
      routePrefix: 'auth',
      loginPath: '/auth/login',
    });
    expect(POST).toBe('client-refresh-handler');
  });
});
