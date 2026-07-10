/**
 * @fileoverview Tests for the login page.
 *
 * Covers: success route, MFA-branch token-store + redirect, AuthClientError
 * banner rendering, generic banner for unexpected errors, the workspace picker
 * bound to the `?tenant=` URL state, the `?reason=`/`?verified=`/`?reset=`
 * status banners, and the conditional Google OAuth button.
 *
 * @module app/(public)/auth/login/page.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthClientError } from '@bymax-one/rust-auth/shared';

/* ── Hoisted mocks (must be top-level so vi.mock factories can reference them) ── */

const mockPush = vi.hoisted(() => vi.fn());
const mockLogin = vi.hoisted(() => vi.fn());
const mockSetPending = vi.hoisted(() => vi.fn());
const mockSetTenant = vi.hoisted(() => vi.fn());
/* Per-test store of the values returned by `useQueryState` for each param. */
const queryState = vi.hoisted<Record<string, string>>(() => ({
  tenant: 'acme',
  reason: '',
  verified: '',
  reset: '',
}));
/* Controls whether the Google OAuth affordance is rendered. */
const oauthState = vi.hoisted(() => ({ enabled: false }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('nuqs', () => ({
  useQueryState: (key: string, opts: { defaultValue: string }) => {
    const value = key in queryState ? queryState[key] : opts.defaultValue;
    return [value, key === 'tenant' ? mockSetTenant : vi.fn()];
  },
}));

vi.mock('@bymax-one/rust-auth/react', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

vi.mock('@/lib/mfa-challenge-store', () => ({
  setPendingMfaChallenge: mockSetPending,
}));

vi.mock('@/lib/oauth', () => ({
  isGoogleOAuthEnabled: () => oauthState.enabled,
  googleInitiateUrl: (tenantId: string) => `/api/oauth/google?tenantId=${tenantId}`,
}));

/* ── Import subject after mocks ──────────────────────────────────────── */
import LoginPage from './page';

/* ── Helpers ─────────────────────────────────────────────────────────── */

function fillAndSubmit(email = 'user@example.com', password = 'secret') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

/* ── Tests ───────────────────────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks();
  queryState.tenant = 'acme';
  queryState.reason = '';
  queryState.verified = '';
  queryState.reset = '';
  oauthState.enabled = false;
});

describe('LoginPage', () => {
  it('routes to /dashboard on a plain success result', async () => {
    /* A non-MFA AuthResult must route the visitor straight to /dashboard. */
    mockLogin.mockResolvedValueOnce({ user: { id: '1' }, accessToken: 'a', refreshToken: 'r' });
    render(<LoginPage />);
    fillAndSubmit();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
    expect(mockSetPending).not.toHaveBeenCalled();
  });

  it('stores the temp token and routes to /auth/mfa-challenge on an MFA result', async () => {
    /* MFA branch: token stored in-memory, router to mfa-challenge. */
    mockLogin.mockResolvedValueOnce({ mfaRequired: true, mfaTempToken: 'tmp.tok' });
    render(<LoginPage />);
    fillAndSubmit();
    await waitFor(() => expect(mockSetPending).toHaveBeenCalledWith('tmp.tok'));
    expect(mockPush).toHaveBeenCalledWith('/auth/mfa-challenge');
  });

  it('renders the localized error banner on AuthClientError', async () => {
    /* Auth errors must surface only the localized English message; the raw code
       is stored in data-error-code and must not appear as visible text. */
    mockLogin.mockRejectedValueOnce(
      new AuthClientError('bad', 401, {
        code: 'auth.invalid_credentials',
        message: 'Incorrect email or password.',
      }),
    );
    const { container } = render(<LoginPage />);
    fillAndSubmit();
    await waitFor(() =>
      expect(screen.getByText('Incorrect email or password.')).toBeInTheDocument(),
    );
    expect(
      container.querySelector('[data-error-code="auth.invalid_credentials"]'),
    ).toBeInTheDocument();
    expect(screen.queryByText('auth.invalid_credentials')).not.toBeInTheDocument();
  });

  it('uses auth.internal as fallback when AuthClientError carries no code', async () => {
    /* An AuthClientError with undefined code falls back to the internal code. */
    mockLogin.mockRejectedValueOnce(new AuthClientError('oops', 500));
    render(<LoginPage />);
    fillAndSubmit();
    await waitFor(() =>
      expect(
        screen.getByText('Something went wrong on our side. Please try again.'),
      ).toBeInTheDocument(),
    );
  });

  it('shows a generic error banner for unexpected (non-AuthClientError) errors', async () => {
    /* Unexpected errors (e.g. network failure) must surface as the generic
       "auth.internal" banner so the page stays usable rather than crashing. */
    mockLogin.mockRejectedValueOnce(new Error('network down'));
    render(<LoginPage />);
    fillAndSubmit();
    await waitFor(() =>
      expect(
        screen.getByText('Something went wrong on our side. Please try again.'),
      ).toBeInTheDocument(),
    );
  });

  it('logs in under the tenant selected in the workspace picker', async () => {
    /* Changing the picker pushes the slug into the `?tenant=` URL state; the
       reflected value is then used as the login tenantId. */
    queryState.tenant = 'globex';
    mockLogin.mockResolvedValueOnce({ user: { id: '1' }, accessToken: 'a', refreshToken: 'r' });
    render(<LoginPage />);
    const picker = screen.getByLabelText('Workspace');
    expect((picker as HTMLSelectElement).value).toBe('globex');
    fillAndSubmit();
    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'secret', {
        tenantId: 'globex',
      }),
    );
  });

  it('syncs the picker selection into the ?tenant= URL state', () => {
    /* onChange must write the chosen slug back through the nuqs setter so the
       URL and the picker never drift apart. */
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Workspace'), { target: { value: 'globex' } });
    expect(mockSetTenant).toHaveBeenCalledWith('globex');
  });

  it('clamps a valid-but-unknown ?tenant= slug to the default workspace', async () => {
    /* A slug the picker cannot represent (not one of the seeded options) must fall back to
       acme, so the select value always matches an option and the login is never scoped to a
       workspace the UI cannot show. */
    queryState.tenant = 'unknown-corp';
    mockLogin.mockResolvedValueOnce({ user: { id: '1' }, accessToken: 'a', refreshToken: 'r' });
    render(<LoginPage />);
    // The picker reflects the clamped value, not the crafted slug.
    const picker = screen.getByLabelText('Workspace');
    expect((picker as HTMLSelectElement).value).toBe('acme');
    fillAndSubmit();
    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'secret', { tenantId: 'acme' }),
    );
  });

  it('shows the session-expired banner when ?reason=session_expired', () => {
    /* A redirect from an expired session surfaces the red banner. */
    queryState.reason = 'session_expired';
    render(<LoginPage />);
    expect(screen.getByText('Your session expired. Please sign in again.')).toBeInTheDocument();
  });

  it('shows the just-verified banner when ?verified=1', () => {
    /* Arriving from the verification flow surfaces the green banner. */
    queryState.verified = '1';
    render(<LoginPage />);
    expect(screen.getByText('Email verified — you can now sign in.')).toBeInTheDocument();
  });

  it('shows the just-reset banner when ?reset=1', () => {
    /* Arriving from the reset flow surfaces the green password-reset banner. */
    queryState.reset = '1';
    render(<LoginPage />);
    expect(
      screen.getByText('Password reset — please sign in with your new password.'),
    ).toBeInTheDocument();
  });

  it('hides all status banners by default', () => {
    /* With no relevant query params, none of the banners render. */
    render(<LoginPage />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('omits the Google button when OAuth is disabled', () => {
    /* The affordance is gated on NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED. */
    render(<LoginPage />);
    expect(screen.queryByRole('link', { name: /continue with google/i })).not.toBeInTheDocument();
  });

  it('renders the Google button pointing at the initiate URL when enabled', () => {
    /* When enabled, the button is a full-page link to the 302 initiate route,
       scoped to the selected tenant. */
    oauthState.enabled = true;
    queryState.tenant = 'globex';
    render(<LoginPage />);
    const link = screen.getByRole('link', { name: /continue with google/i });
    expect(link).toHaveAttribute('href', '/api/oauth/google?tenantId=globex');
  });
});
