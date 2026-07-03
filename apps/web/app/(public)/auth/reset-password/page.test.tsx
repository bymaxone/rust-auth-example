/**
 * @fileoverview Tests for the reset-password page (screen 3 of the wizard).
 *
 * Covers: no-token "start over" state, success routes to /auth/login,
 * verifiedToken forwarded, AuthClientError banner, and generic banner for unexpected errors.
 *
 * @module app/(public)/auth/reset-password/page.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthClientError } from '@bymax-one/rust-auth/shared';

/* ── Hoisted mocks ────────────────────────────────────────────────────── */

const mockPush = vi.hoisted(() => vi.fn());
const mockResetPassword = vi.hoisted(() => vi.fn());
const mockConsumeToken = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('nuqs', () => ({
  useQueryState: (_key: string, opts: { defaultValue: string }) => [opts.defaultValue, vi.fn()],
}));

vi.mock('@bymax-one/rust-auth/react', () => ({
  useAuth: () => ({ resetPassword: mockResetPassword }),
}));

vi.mock('@/lib/reset-flow-store', () => ({
  consumeResetVerifiedToken: mockConsumeToken,
}));

/* ── Import subject after mocks ──────────────────────────────────────── */
import ResetPasswordPage from './page';

/* ── Helpers ─────────────────────────────────────────────────────────── */

function fillAndSubmit(email = 'user@example.com', password = 'newSecret') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /set new password/i }));
}

/* ── Tests ───────────────────────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ResetPasswordPage — no token', () => {
  it('renders the "start over" state when no verified token is pending', () => {
    /* Without a valid in-memory token, the visitor must restart the flow. */
    mockConsumeToken.mockReturnValueOnce(null);
    render(<ResetPasswordPage />);
    expect(screen.getByText(/reset session expired/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Request a new reset link/i })).toBeInTheDocument();
  });
});

describe('ResetPasswordPage — with token', () => {
  beforeEach(() => {
    mockConsumeToken.mockReturnValue('vt_valid');
  });

  it('routes to /auth/login on successful reset', async () => {
    /* A successful reset must land the visitor on the login page. */
    mockResetPassword.mockResolvedValueOnce(undefined);
    render(<ResetPasswordPage />);
    fillAndSubmit();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth/login'));
  });

  it('forwards verifiedToken to resetPassword', async () => {
    /* The consumed token must be forwarded as proof to the API. */
    mockResetPassword.mockResolvedValueOnce(undefined);
    render(<ResetPasswordPage />);
    fillAndSubmit('u@e.com', 'newPass');
    await waitFor(() =>
      expect(mockResetPassword).toHaveBeenCalledWith(
        expect.objectContaining({ verifiedToken: 'vt_valid' }),
      ),
    );
  });

  it('renders a localized error banner on AuthClientError', async () => {
    /* Auth errors during reset must be localized through <AuthError>. */
    mockResetPassword.mockRejectedValueOnce(
      new AuthClientError('weak', 422, {
        code: 'auth.password_too_weak',
        message: 'weak',
      }),
    );
    render(<ResetPasswordPage />);
    fillAndSubmit();
    await waitFor(() =>
      expect(screen.getByText('Choose a stronger password.')).toBeInTheDocument(),
    );
  });

  it('shows a generic error banner for unexpected (non-AuthClientError) errors', async () => {
    /* Unexpected errors show the generic "auth.internal" banner so the page stays usable. */
    mockResetPassword.mockRejectedValueOnce(new Error('network'));
    render(<ResetPasswordPage />);
    fillAndSubmit();
    await waitFor(() =>
      expect(
        screen.getByText('Something went wrong on our side. Please try again.'),
      ).toBeInTheDocument(),
    );
  });
});
