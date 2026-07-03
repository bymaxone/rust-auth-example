/**
 * @fileoverview Tests for the edge gate: decision branches, config, secret guard.
 *
 * @module proxy.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { verifyJwtToken, proxyFn, createAuthProxy } = vi.hoisted(() => {
  process.env.AUTH_JWT_SECRET_FOR_PROXY = 'edge-secret-edge-secret-edge-secret-01';
  const proxyMock = vi.fn();
  return {
    verifyJwtToken: vi.fn(),
    proxyFn: proxyMock,
    createAuthProxy: vi.fn(() => ({ proxy: proxyMock, config: {} })),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@bymax-one/rust-auth/nextjs', () => ({ verifyJwtToken, createAuthProxy }));
vi.mock('@bymax-one/rust-auth/shared', () => ({ AUTH_ACCESS_COOKIE_NAME: 'access_token' }));

import { NextRequest, NextResponse } from 'next/server';
import { proxy, config } from './proxy';

function request(pathname: string, cookie?: string): NextRequest {
  const init = cookie !== undefined ? { headers: { cookie } } : undefined;
  return new NextRequest(`http://localhost${pathname}`, init);
}

describe('proxy gate', () => {
  beforeEach(() => {
    verifyJwtToken.mockReset();
    proxyFn.mockReset();
  });

  it('hands /api/auth/* traffic to the proxy instance', async () => {
    // Verifies auth traffic is delegated to the proxy, not the page gate.
    const sentinel = NextResponse.next();
    proxyFn.mockResolvedValue(sentinel);
    const req = request('/api/auth/client-refresh');

    const result = await proxy(req);

    expect(proxyFn).toHaveBeenCalledWith(req);
    expect(result).toBe(sentinel);
    expect(verifyJwtToken).not.toHaveBeenCalled();
  });

  it('passes through an unprotected path without verifying', async () => {
    // Verifies non-matched paths short-circuit to next().
    const result = await proxy(request('/'));

    expect(result.headers.get('x-middleware-next')).toBe('1');
    expect(verifyJwtToken).not.toHaveBeenCalled();
  });

  it('leaves /platform/login public (negative lookahead)', async () => {
    // Verifies the platform login page is not gated.
    const result = await proxy(request('/platform/login'));

    expect(result.headers.get('x-middleware-next')).toBe('1');
    expect(verifyJwtToken).not.toHaveBeenCalled();
  });

  it('redirects an uncookied dashboard request to /auth/login', async () => {
    // Verifies a missing cookie fails closed without calling the verifier.
    const result = await proxy(request('/dashboard/audit'));

    expect(result.status).toBe(307);
    expect(result.headers.get('location')).toContain('/auth/login');
    expect(verifyJwtToken).not.toHaveBeenCalled();
  });

  it('redirects when the cookie fails verification', async () => {
    // Verifies an unverifiable token is treated as unauthenticated (fail-closed).
    verifyJwtToken.mockResolvedValue({ isValid: false });
    const result = await proxy(request('/dashboard', 'access_token=bad'));

    expect(verifyJwtToken).toHaveBeenCalledWith('bad', 'edge-secret-edge-secret-edge-secret-01');
    expect(result.status).toBe(307);
    expect(result.headers.get('location')).toContain('/auth/login');
  });

  it('admits a dashboard request with a verified dashboard-domain cookie', async () => {
    // Verifies an authoritatively valid dashboard token passes through — no backend call.
    verifyJwtToken.mockResolvedValue({ isValid: true, payload: { type: 'dashboard' } });
    const result = await proxy(request('/dashboard/sessions', 'access_token=good'));

    expect(result.headers.get('x-middleware-next')).toBe('1');
  });

  it('redirects a dashboard request carrying a platform-domain token to /auth/login?reason=wrong-domain', async () => {
    // Domain isolation: a platform token must not be admitted to the dashboard tree.
    verifyJwtToken.mockResolvedValue({ isValid: true, payload: { type: 'platform' } });
    const result = await proxy(request('/dashboard/sessions', 'access_token=platform-tok'));

    expect(result.status).toBe(307);
    expect(result.headers.get('location')).toContain('/auth/login');
    expect(result.headers.get('location')).toContain('reason=wrong-domain');
  });

  it('redirects an uncookied protected platform request to /platform/login', async () => {
    // Verifies the platform tree redirects to its own login.
    const result = await proxy(request('/platform/users'));

    expect(result.status).toBe(307);
    expect(result.headers.get('location')).toContain('/platform/login');
  });

  it('admits a platform request with a verified platform-domain cookie', async () => {
    // Verifies an authoritatively valid platform token passes through.
    verifyJwtToken.mockResolvedValue({ isValid: true, payload: { type: 'platform' } });
    const result = await proxy(request('/platform/users', 'access_token=platform-tok'));

    expect(result.headers.get('x-middleware-next')).toBe('1');
  });

  it('redirects a platform request carrying a dashboard-domain token to /platform/login?reason=wrong-domain', async () => {
    // Domain isolation: a dashboard token must not be admitted to the platform tree.
    verifyJwtToken.mockResolvedValue({ isValid: true, payload: { type: 'dashboard' } });
    const result = await proxy(request('/platform/users', 'access_token=dashboard-tok'));

    expect(result.status).toBe(307);
    expect(result.headers.get('location')).toContain('/platform/login');
    expect(result.headers.get('location')).toContain('reason=wrong-domain');
  });
});

describe('proxy configuration', () => {
  it('builds the proxy with the documented config and matcher', () => {
    // Verifies the AuthProxyConfig + matcher are wired as documented.
    expect(createAuthProxy).toHaveBeenCalledWith({
      loginPath: '/auth/login',
      accessTokenSecret: 'edge-secret-edge-secret-edge-secret-01',
      routePrefix: 'auth',
    });
    expect(config.matcher).toEqual(['/dashboard/:path*', '/platform/:path*', '/api/auth/:path*']);
  });
});

describe('proxy secret guard', () => {
  const ORIGINAL_SECRET = process.env.AUTH_JWT_SECRET_FOR_PROXY;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.AUTH_JWT_SECRET_FOR_PROXY;
    } else {
      process.env.AUTH_JWT_SECRET_FOR_PROXY = ORIGINAL_SECRET;
    }
  });

  it('throws when the secret is undefined', async () => {
    // Verifies the module refuses to load without a secret (fail-closed).
    delete process.env.AUTH_JWT_SECRET_FOR_PROXY;
    await expect(import('./proxy')).rejects.toThrow('AUTH_JWT_SECRET_FOR_PROXY is required');
  });

  it('throws when the secret is empty', async () => {
    // Verifies the empty-string branch of the guard is also rejected.
    process.env.AUTH_JWT_SECRET_FOR_PROXY = '';
    await expect(import('./proxy')).rejects.toThrow('AUTH_JWT_SECRET_FOR_PROXY is required');
  });
});
