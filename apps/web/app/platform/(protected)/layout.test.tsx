/**
 * @fileoverview Tests for the platform protected layout's auth guard.
 *
 * Verifies that the redirect reason distinguishes missing/invalid/expired
 * tokens (`reason=session-expired`) from valid tokens of the wrong domain
 * (`reason=wrong-domain`), and that a valid platform token renders the shell.
 *
 * Next.js `redirect` is a throwing function at runtime; the mock replicates
 * that behaviour so early-return semantics are preserved across multiple
 * redirect guards in the same async server component.
 *
 * @module app/platform/(protected)/layout.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ── Hoisted mocks ─────────────────────────────────────────────────────── */

// Sentinel error class so test catches can be scoped to redirect throws only.
class RedirectError extends Error {
  constructor(public readonly url: string) {
    super(`REDIRECT:${url}`);
    this.name = 'RedirectError';
  }
}

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new RedirectError(url);
  }),
);
const mockCookies = vi.hoisted(() => vi.fn());
const mockDecodeJwtToken = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('@bymax-one/rust-auth/nextjs', () => ({ decodeJwtToken: mockDecodeJwtToken }));
vi.mock('@bymax-one/rust-auth/shared', () => ({
  AUTH_ACCESS_COOKIE_NAME: 'access_token',
}));
vi.mock('@/components/platform/PlatformShell', () => ({
  PlatformShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="platform-shell">{children}</div>
  ),
}));

/* ── Import after mocks ─────────────────────────────────────────────────── */
import PlatformProtectedLayout from './layout';
import { render } from '@testing-library/react';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function makeCookieJar(token: string | undefined): {
  get: (name: string) => { value: string } | undefined;
} {
  return {
    get: (_name: string) => (token !== undefined ? { value: token } : undefined),
  };
}

/**
 * Call the layout and capture the URL passed to redirect.
 * The mock throws RedirectError to stop execution just as the real redirect does.
 */
async function captureRedirect(children: React.ReactNode): Promise<string> {
  try {
    await PlatformProtectedLayout({ children });
    throw new Error('Expected a redirect but the layout rendered normally');
  } catch (err) {
    if (err instanceof RedirectError) return err.url;
    throw err;
  }
}

/* ── Tests ────────────────────────────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks();
  // Restore throwing behaviour after clearAllMocks resets the implementation.
  mockRedirect.mockImplementation((url: string) => {
    throw new RedirectError(url);
  });
});

describe('PlatformProtectedLayout auth guard', () => {
  it('redirects with reason=session-expired when the cookie is absent', async () => {
    // No cookie present — the admin has no session at all.
    mockCookies.mockResolvedValueOnce(makeCookieJar(undefined));

    const url = await captureRedirect(<span />);

    expect(url).toBe('/platform/login?reason=session-expired');
    expect(mockDecodeJwtToken).not.toHaveBeenCalled();
  });

  it('redirects with reason=session-expired when the token is invalid', async () => {
    // A cookie is present but the token is malformed / expired / undecodable.
    mockCookies.mockResolvedValueOnce(makeCookieJar('bad.token.here'));
    // `decodeJwtToken` is synchronous — it returns the decoded value directly.
    mockDecodeJwtToken.mockReturnValueOnce({ isValid: false });

    const url = await captureRedirect(<span />);

    expect(url).toBe('/platform/login?reason=session-expired');
  });

  it('redirects with reason=session-expired when decodeJwtToken rejects', async () => {
    // decodeJwtToken may throw (not just return isValid:false) for a structurally
    // invalid token (e.g. not a parseable JWT string). The layout must catch the
    // rejection and treat it identically to an invalid session.
    mockCookies.mockResolvedValueOnce(makeCookieJar('not-a-jwt-at-all'));
    // `decodeJwtToken` is synchronous, so it throws synchronously.
    mockDecodeJwtToken.mockImplementationOnce(() => {
      throw new Error('invalid token structure');
    });

    const url = await captureRedirect(<span />);

    expect(url).toBe('/platform/login?reason=session-expired');
  });

  it('redirects with reason=wrong-domain when a valid dashboard token is presented', async () => {
    // A structurally valid token exists but its type is "dashboard", not "platform".
    mockCookies.mockResolvedValueOnce(makeCookieJar('valid.dashboard.token'));
    mockDecodeJwtToken.mockReturnValueOnce({
      isValid: true,
      payload: { type: 'dashboard', sub: 'u1' },
    });

    const url = await captureRedirect(<span />);

    expect(url).toBe('/platform/login?reason=wrong-domain');
  });

  it('renders the shell when a valid platform token is present', async () => {
    // A valid platform token — the layout must render PlatformShell without redirecting.
    mockCookies.mockResolvedValueOnce(makeCookieJar('valid.platform.token'));
    mockDecodeJwtToken.mockReturnValueOnce({
      isValid: true,
      payload: { type: 'platform', sub: 'admin1' },
    });

    const { getByTestId } = render(
      await PlatformProtectedLayout({ children: <span data-testid="child" /> }),
    );

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(getByTestId('platform-shell')).toBeInTheDocument();
  });
});
