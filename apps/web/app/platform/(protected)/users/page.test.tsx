/**
 * @fileoverview Tests for the `/platform/users` server component.
 *
 * The page is a pure server component: it forwards the session cookie to the
 * internal API, renders the admin directory, and branches on the response
 * (populated table, empty state, expired-session redirect, and a hard error on
 * any other non-2xx). Rendering it under jsdom — with `next/headers`,
 * `next/navigation`, and `fetch` mocked — gives the server component a real,
 * measured coverage path instead of an exclusion.
 *
 * @module app/platform/(protected)/users/page.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ── Hoisted mocks ─────────────────────────────────────────────────────── */

// Sentinel error so a redirect throw can be caught without swallowing real errors.
class RedirectError extends Error {
  constructor(public readonly url: string) {
    super(`REDIRECT:${url}`);
    this.name = 'RedirectError';
  }
}

const { mockRedirect, mockCookies } = vi.hoisted(() => {
  process.env.INTERNAL_API_URL = 'http://backend.internal';
  return {
    mockRedirect: vi.fn((url: string) => {
      throw new RedirectError(url);
    }),
    mockCookies: vi.fn(),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('@bymax-one/rust-auth/shared', () => ({
  AUTH_ACCESS_COOKIE_NAME: 'access_token',
}));

/* ── Import after mocks ─────────────────────────────────────────────────── */
import PlatformUsersPage from './page';
import { render, screen } from '@testing-library/react';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

interface AdminRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
}

/**
 * A cookie jar returning `token` only for the access cookie the page actually reads, so a
 * lookup of the wrong cookie name yields nothing (the test fails instead of passing blindly).
 */
function jar(token: string | undefined): { get: (name: string) => { value: string } | undefined } {
  return {
    get: (name) => (name === 'access_token' && token !== undefined ? { value: token } : undefined),
  };
}

/** Install a `fetch` stub (restored in `afterEach`) returning the given status/body. */
function stubFetch(status: number, body: AdminRow[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() =>
    Promise.resolve({
      status,
      ok: status >= 200 && status < 300,
      json: () => Promise.resolve(body),
    } as Response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  // Restore any `fetch` stub so it never leaks into another suite sharing the worker.
  vi.unstubAllGlobals();
});

/* ── Tests ───────────────────────────────────────────────────────────────── */

describe('PlatformUsersPage', () => {
  it('renders every admin row and forwards the bearer token', async () => {
    // A populated response renders each account and formats the last sign-in; the request
    // carries the forwarded session cookie as a bearer token and opts out of caching.
    mockCookies.mockResolvedValue(jar('platform-token'));
    const fetchMock = stubFetch(200, [
      {
        id: '1',
        email: 'ada@platform.test',
        name: 'Ada',
        role: 'admin',
        status: 'active',
        lastLoginAt: '2026-01-02T03:04:05Z',
      },
      {
        id: '2',
        email: 'grace@platform.test',
        name: 'Grace',
        role: 'support',
        status: 'active',
        lastLoginAt: null,
      },
      {
        id: '3',
        email: 'lin@platform.test',
        name: 'Lin',
        role: 'admin',
        status: 'suspended',
        lastLoginAt: 'not-a-date',
      },
    ]);

    render(await PlatformUsersPage());

    expect(screen.getByText('ada@platform.test')).toBeInTheDocument();
    expect(screen.getByText('grace@platform.test')).toBeInTheDocument();
    expect(screen.getByText('3 admin accounts')).toBeInTheDocument();
    // The null and the unparseable dates both collapse to the em-dash placeholder.
    expect(screen.getAllByText('—').length).toBe(2);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer platform-token');
    expect(init.cache).toBe('no-store');
  });

  it('renders the singular count for a single admin', async () => {
    // The count copy is singularized for exactly one account.
    mockCookies.mockResolvedValue(jar('platform-token'));
    stubFetch(200, [
      {
        id: '1',
        email: 'solo@platform.test',
        name: 'Solo',
        role: 'admin',
        status: 'active',
        lastLoginAt: '2026-01-02T03:04:05Z',
      },
    ]);

    render(await PlatformUsersPage());
    expect(screen.getByText('1 admin account')).toBeInTheDocument();
  });

  it('renders the empty state and omits the header when no cookie is present', async () => {
    // With no session cookie the request carries no Authorization header, and an empty
    // response shows the empty-state row rather than a table body.
    mockCookies.mockResolvedValue(jar(undefined));
    const fetchMock = stubFetch(200, []);

    render(await PlatformUsersPage());

    expect(screen.getByText('No platform admin accounts found.')).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('redirects to login when the platform session has expired (401)', async () => {
    // A 401 from the server-side fetch routes back to login cleanly instead of erroring.
    mockCookies.mockResolvedValue(jar('stale-token'));
    stubFetch(401, []);

    await expect(PlatformUsersPage()).rejects.toThrow(RedirectError);
    expect(mockRedirect).toHaveBeenCalledWith('/platform/login?reason=session-expired');
  });

  it('throws on any other non-2xx so the error boundary catches it', async () => {
    // A 403 (or any non-401 failure) is a hard error surfaced to the error boundary.
    mockCookies.mockResolvedValue(jar('platform-token'));
    stubFetch(403, []);

    await expect(PlatformUsersPage()).rejects.toThrow('GET /platform/users returned 403');
  });

  it('refuses to load without a configured internal API URL', async () => {
    // The module-load guard fails fast for both an unset and an empty `INTERNAL_API_URL`,
    // so a misconfigured deployment cannot render the page against an undefined origin.
    const previous = process.env.INTERNAL_API_URL;
    for (const missing of [undefined, ''] as const) {
      vi.resetModules();
      if (missing === undefined) {
        delete process.env.INTERNAL_API_URL;
      } else {
        process.env.INTERNAL_API_URL = missing;
      }
      await expect(import('./page')).rejects.toThrow(
        'INTERNAL_API_URL is required for the platform users page',
      );
    }
    if (previous === undefined) {
      delete process.env.INTERNAL_API_URL;
    } else {
      process.env.INTERNAL_API_URL = previous;
    }
  });
});
