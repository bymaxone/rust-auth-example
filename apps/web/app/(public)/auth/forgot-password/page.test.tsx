/**
 * @fileoverview Tests for the forgot-password page (screens 1 and 2).
 *
 * Covers: anti-enumeration always advances to OTP screen (except network errors),
 * OTP submit routes to reset-password, OTP errors render <AuthError>, token stored.
 *
 * @module app/(public)/auth/forgot-password/page.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthClientError } from '@bymax-one/rust-auth/shared';

/* ── Hoisted mocks ────────────────────────────────────────────────────── */

const mockPush = vi.hoisted(() => vi.fn());
const mockForgotPassword = vi.hoisted(() => vi.fn());
const mockAuthFetch = vi.hoisted(() => vi.fn());
const mockSetResetVerifiedToken = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('nuqs', () => ({
  useQueryState: (_key: string, opts: { defaultValue: string }) => [opts.defaultValue, vi.fn()],
}));

vi.mock('@bymax-one/rust-auth/react', () => ({
  useAuth: () => ({ forgotPassword: mockForgotPassword }),
}));

vi.mock('@/lib/auth-client', () => ({
  authFetch: mockAuthFetch,
}));

vi.mock('@/lib/reset-flow-store', () => ({
  setResetVerifiedToken: mockSetResetVerifiedToken,
}));

/* Mock OtpInput so tests can drive completion without cell-by-cell interaction. */
vi.mock('@/components/auth/otp-input', () => ({
  OtpInput: ({ onComplete }: { onComplete: (c: string) => void }) => (
    <button onClick={() => onComplete('123456')}>Enter OTP</button>
  ),
}));

/* ── Import subject after mocks ──────────────────────────────────────── */
import ForgotPasswordPage from './page';

/* ── Helpers ─────────────────────────────────────────────────────────── */

async function submitEmail(email = 'user@example.com') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: /send reset instructions/i }));
  await waitFor(() => expect(screen.getByText(/Enter it below/i)).toBeInTheDocument());
}

/* ── Tests ───────────────────────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ForgotPasswordPage — screen 1 (email)', () => {
  it('always advances to the OTP screen on a successful forgotPassword call', async () => {
    /* Anti-enumeration: success must move to the OTP step. */
    mockForgotPassword.mockResolvedValueOnce(undefined);
    render(<ForgotPasswordPage />);
    await submitEmail();
    expect(screen.getByText(/Enter it below/i)).toBeInTheDocument();
  });

  it('still advances to the OTP screen when forgotPassword throws AuthClientError', async () => {
    /* Anti-enumeration: an auth error must NOT reveal account non-existence. */
    mockForgotPassword.mockRejectedValueOnce(
      new AuthClientError('nf', 404, { code: 'auth.internal', message: 'not found' }),
    );
    render(<ForgotPasswordPage />);
    await submitEmail();
    /* The OTP screen appears regardless of the error. */
    expect(screen.getByText(/Enter it below/i)).toBeInTheDocument();
  });

  it('shows a generic error banner and does not advance for non-AuthClientError', async () => {
    /* Unexpected errors (e.g. network) must show a generic banner and must NOT
       advance to the OTP screen — only auth-level outcomes are anti-enumerated. */
    mockForgotPassword.mockRejectedValueOnce(new Error('network'));
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'u@e.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset instructions/i }));
    await waitFor(() =>
      expect(
        screen.getByText('Something went wrong on our side. Please try again.'),
      ).toBeInTheDocument(),
    );
    /* The wizard must NOT have advanced to the OTP screen. */
    expect(screen.queryByText(/Enter it below/i)).not.toBeInTheDocument();
  });
});

describe('ForgotPasswordPage — screen 2 (OTP)', () => {
  it('stores verifiedToken and routes to /auth/reset-password on success', async () => {
    /* OTP success path: token stored, router fires. */
    mockForgotPassword.mockResolvedValueOnce(undefined);
    mockAuthFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ verifiedToken: 'vt_ok' }),
    });
    render(<ForgotPasswordPage />);
    await submitEmail();
    fireEvent.click(screen.getByRole('button', { name: /Enter OTP/i }));
    await waitFor(() => expect(mockSetResetVerifiedToken).toHaveBeenCalledWith('vt_ok'));
    expect(mockPush).toHaveBeenCalledWith('/auth/reset-password');
  });

  it('issues only one verify request when onComplete fires twice concurrently', async () => {
    /* OtpInput.onComplete can re-fire while a verify is pending; the in-flight
       guard must ensure a second concurrent completion does not start a request. */
    mockForgotPassword.mockResolvedValueOnce(undefined);
    let resolveFetch: (value: { json: () => Promise<unknown> }) => void = () => {};
    mockAuthFetch.mockReturnValueOnce(
      new Promise<{ json: () => Promise<unknown> }>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    render(<ForgotPasswordPage />);
    await submitEmail();

    const otpButton = screen.getByRole('button', { name: /Enter OTP/i });
    /* Two synchronous completions while the first request is still pending. */
    fireEvent.click(otpButton);
    fireEvent.click(otpButton);
    expect(mockAuthFetch).toHaveBeenCalledTimes(1);

    /* Let the single in-flight request finish so the guard clears cleanly. */
    resolveFetch({ json: () => Promise.resolve({ verifiedToken: 'vt_ok' }) });
    await waitFor(() => expect(mockSetResetVerifiedToken).toHaveBeenCalledWith('vt_ok'));
    expect(mockAuthFetch).toHaveBeenCalledTimes(1);
  });

  it('shows a localized error banner when the OTP authFetch throws AuthClientError', async () => {
    /* OTP errors must surface through <AuthError>. */
    mockForgotPassword.mockResolvedValueOnce(undefined);
    mockAuthFetch.mockRejectedValueOnce(
      new AuthClientError('bad otp', 422, { code: 'auth.otp_invalid', message: 'invalid' }),
    );
    render(<ForgotPasswordPage />);
    await submitEmail();
    fireEvent.click(screen.getByRole('button', { name: /Enter OTP/i }));
    await waitFor(() => expect(screen.getByText('That code is not valid.')).toBeInTheDocument());
  });

  it('shows a generic error banner for non-AuthClientError from OTP verification', async () => {
    /* Unexpected errors during OTP verification show a generic banner. */
    mockForgotPassword.mockResolvedValueOnce(undefined);
    mockAuthFetch.mockRejectedValueOnce(new Error('network'));
    render(<ForgotPasswordPage />);
    await submitEmail();
    fireEvent.click(screen.getByRole('button', { name: /Enter OTP/i }));
    await waitFor(() =>
      expect(
        screen.getByText('Something went wrong on our side. Please try again.'),
      ).toBeInTheDocument(),
    );
  });
});
