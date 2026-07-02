/**
 * @fileoverview Tests for the login page.
 *
 * Covers: success route, MFA-branch token-store + redirect, AuthClientError
 * banner rendering, and generic banner for unexpected errors.
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('nuqs', () => ({
  useQueryState: (_key: string, opts: { defaultValue: string }) => [opts.defaultValue, vi.fn()],
}));

vi.mock('@bymax-one/rust-auth/react', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

vi.mock('@/lib/mfa-challenge-store', () => ({
  setPendingMfaChallenge: mockSetPending,
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
});
