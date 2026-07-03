/**
 * @fileoverview Tests for the MFA-challenge page.
 *
 * Covers: no-token "expired" state, success routes to /dashboard, invalid-code
 * renders <AuthError>, expiry disables submission, and generic banner for unexpected errors.
 *
 * @module app/(public)/auth/mfa-challenge/page.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthClientError } from '@bymax-one/rust-auth/shared';

/* ── Hoisted mocks ────────────────────────────────────────────────────── */

const mockPush = vi.hoisted(() => vi.fn());
const mockConsume = vi.hoisted(() => vi.fn());
const mockMfaChallenge = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/lib/mfa-challenge-store', () => ({
  consumePendingMfaChallenge: mockConsume,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { mfaChallenge: mockMfaChallenge },
}));

vi.mock('@/components/auth/otp-input', () => ({
  OtpInput: ({ onComplete }: { onComplete: (c: string) => void }) => (
    <button onClick={() => onComplete('123456')}>Submit TOTP</button>
  ),
}));

vi.mock('@/components/auth/expiry-pill', () => ({
  ExpiryPill: ({ onExpired }: { onExpired?: () => void }) => (
    <button onClick={() => onExpired?.()}>Expire now</button>
  ),
}));

/* ── Import subject after mocks ──────────────────────────────────────── */
import MfaChallengePage from './page';

/* ── Tests ───────────────────────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MfaChallengePage — no pending token', () => {
  it('shows the "session expired" state when no token is pending', () => {
    /* With no temp token the visitor must be prompted to sign in again. */
    mockConsume.mockReturnValueOnce(null);
    render(<MfaChallengePage />);
    expect(screen.getByText(/sign-in session expired/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to sign in/i })).toBeInTheDocument();
  });
});

describe('MfaChallengePage — with pending token', () => {
  beforeEach(() => {
    mockConsume.mockReturnValue('tmp.tok.abc');
  });

  it('routes to /dashboard on successful mfaChallenge', async () => {
    /* A valid TOTP code must complete the challenge and route to the dashboard. */
    mockMfaChallenge.mockResolvedValueOnce({
      user: { id: '1' },
      accessToken: 'a',
      refreshToken: 'r',
    });
    render(<MfaChallengePage />);
    fireEvent.click(screen.getByRole('button', { name: /Submit TOTP/i }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  });

  it('passes the consumed temp token to mfaChallenge', async () => {
    /* The token from the store must be forwarded to the API. */
    mockMfaChallenge.mockResolvedValueOnce({ user: {}, accessToken: '', refreshToken: '' });
    render(<MfaChallengePage />);
    fireEvent.click(screen.getByRole('button', { name: /Submit TOTP/i }));
    await waitFor(() => expect(mockMfaChallenge).toHaveBeenCalledWith('tmp.tok.abc', '123456'));
  });

  it('renders a localized error banner on AuthClientError', async () => {
    /* An invalid TOTP code must surface through <AuthError>. */
    mockMfaChallenge.mockRejectedValueOnce(
      new AuthClientError('bad', 422, { code: 'auth.mfa_invalid_code', message: 'bad' }),
    );
    render(<MfaChallengePage />);
    fireEvent.click(screen.getByRole('button', { name: /Submit TOTP/i }));
    await waitFor(() =>
      expect(
        screen.getByText('That authenticator code is not valid. Please try again.'),
      ).toBeInTheDocument(),
    );
  });

  it('shows a generic error banner for unexpected (non-AuthClientError) errors', async () => {
    /* Unexpected errors during MFA challenge show the generic banner, not a crash. */
    mockMfaChallenge.mockRejectedValueOnce(new Error('network'));
    render(<MfaChallengePage />);
    fireEvent.click(screen.getByRole('button', { name: /Submit TOTP/i }));
    await waitFor(() =>
      expect(
        screen.getByText('Something went wrong on our side. Please try again.'),
      ).toBeInTheDocument(),
    );
  });

  it('shows the expiry message when the ExpiryPill fires onExpired', async () => {
    /* When the temp token expires, a message appears linking to sign-in. */
    render(<MfaChallengePage />);
    fireEvent.click(screen.getByRole('button', { name: /Expire now/i }));
    await waitFor(() => expect(screen.getByText(/Your code expired/i)).toBeInTheDocument());
  });

  it('does not call mfaChallenge when the token is expired', async () => {
    /* Submission must be a no-op when the token has expired. */
    render(<MfaChallengePage />);
    /* Expire first. */
    fireEvent.click(screen.getByRole('button', { name: /Expire now/i }));
    await waitFor(() => expect(screen.getByText(/Your code expired/i)).toBeInTheDocument());
    /* Then try to submit. */
    fireEvent.click(screen.getByRole('button', { name: /Submit TOTP/i }));
    expect(mockMfaChallenge).not.toHaveBeenCalled();
  });
});
