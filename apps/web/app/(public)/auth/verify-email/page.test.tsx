/**
 * @fileoverview Tests for the verify-email page.
 *
 * Covers: OTP submission routes to /dashboard, resend shows neutral confirmation
 * (anti-enumeration), AuthClientError renders <AuthError>, unauthenticated prompts
 * sign-in, and generic banner for unexpected errors.
 *
 * @module app/(public)/auth/verify-email/page.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AuthClientError } from '@bymax-one/rust-auth/shared';

/* ── Hoisted mocks ────────────────────────────────────────────────────── */

const mockPush = vi.hoisted(() => vi.fn());
const mockUseSession = vi.hoisted(() => vi.fn());
const mockAuthFetch = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('nuqs', () => ({
  useQueryState: (_key: string, opts: { defaultValue: string }) => [opts.defaultValue, vi.fn()],
}));

/** Session shape returned by the mock so TypeScript does not widen to `any`. */
type MockSession = { user: { email: string; id: string } | null; status: string };

vi.mock('@bymax-one/rust-auth/react', () => ({
  useSession: () => mockUseSession() as MockSession,
}));

vi.mock('@/lib/auth-client', () => ({
  authFetch: mockAuthFetch,
}));

vi.mock('@/components/auth/otp-input', () => ({
  OtpInput: ({ onComplete }: { onComplete: (c: string) => void }) => (
    <button onClick={() => onComplete('654321')}>Enter code</button>
  ),
}));

/* ── Import subject after mocks ──────────────────────────────────────── */
import VerifyEmailPage from './page';

/* ── Tests ───────────────────────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VerifyEmailPage — unauthenticated', () => {
  it('prompts to sign in when the session is unauthenticated', () => {
    /* Unauthenticated visitors cannot verify their email; show the sign-in link. */
    mockUseSession.mockReturnValue({ user: null, status: 'unauthenticated' });
    render(<VerifyEmailPage />);
    expect(screen.getByText(/Please sign in to verify/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Go to sign in/i })).toBeInTheDocument();
  });

  it('shows a loading indicator while the session is being resolved', () => {
    /* The form must not render while the session status is loading (user is null). */
    mockUseSession.mockReturnValue({ user: null, status: 'loading' });
    render(<VerifyEmailPage />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enter code/i })).not.toBeInTheDocument();
  });
});

describe('VerifyEmailPage — authenticated', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      user: { email: 'user@example.com', id: '1' },
      status: 'authenticated',
    });
  });

  it('routes to /dashboard on a successful OTP submission', async () => {
    /* Successful verification must route to the dashboard. */
    mockAuthFetch.mockResolvedValueOnce({ ok: true });
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole('button', { name: /Enter code/i }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  });

  it('renders a localized error banner on AuthClientError', async () => {
    /* Invalid OTP must surface through <AuthError>. */
    mockAuthFetch.mockRejectedValueOnce(
      new AuthClientError('bad', 422, { code: 'auth.otp_invalid', message: 'bad' }),
    );
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole('button', { name: /Enter code/i }));
    await waitFor(() => expect(screen.getByText('That code is not valid.')).toBeInTheDocument());
  });

  it('shows the same neutral resend confirmation regardless of API outcome', async () => {
    /* Anti-enumeration: resend always shows the neutral message. */
    mockAuthFetch.mockResolvedValueOnce({ ok: true });
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole('button', { name: /Resend code/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/If your email is unverified, a new code is on its way/i),
      ).toBeInTheDocument(),
    );
  });

  it('shows the neutral resend confirmation even when the resend API fails', async () => {
    /* Anti-enumeration: even an API error must not reveal account status. */
    mockAuthFetch.mockRejectedValueOnce(new Error('network'));
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole('button', { name: /Resend code/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/If your email is unverified, a new code is on its way/i),
      ).toBeInTheDocument(),
    );
  });

  it('shows a generic error banner for unexpected (non-AuthClientError) errors', async () => {
    /* Unexpected errors during verify surface as the generic banner, not a crash. */
    mockAuthFetch.mockRejectedValueOnce(new Error('unexpected'));
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole('button', { name: /Enter code/i }));
    await waitFor(() =>
      expect(
        screen.getByText('Something went wrong on our side. Please try again.'),
      ).toBeInTheDocument(),
    );
  });
});

describe('VerifyEmailPage — authenticated without an email', () => {
  beforeEach(() => {
    /* Defensive edge: authenticated status but a nullish user (no email). */
    mockUseSession.mockReturnValue({ user: null, status: 'authenticated' });
  });

  it('does not post an undefined email on verify and shows a generic error', async () => {
    /* Verify must not issue a request with an undefined email; surface an error. */
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole('button', { name: /Enter code/i }));
    await waitFor(() =>
      expect(
        screen.getByText('Something went wrong on our side. Please try again.'),
      ).toBeInTheDocument(),
    );
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  it('does not post an undefined email on resend but keeps the neutral message', async () => {
    /* Resend must not issue a request with an undefined email; keep anti-enumeration. */
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole('button', { name: /Resend code/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/If your email is unverified, a new code is on its way/i),
      ).toBeInTheDocument(),
    );
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });
});

describe('VerifyEmailPage — resend cooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseSession.mockReturnValue({
      user: { email: 'user@example.com', id: '1' },
      status: 'authenticated',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prevents a second resend during the cooldown and allows it once the cooldown elapses', async () => {
    /* After a successful resend the button must be debounced for 30 s; after that
       window expires a subsequent resend must reach the API again. */
    mockAuthFetch.mockResolvedValue({ ok: true });
    render(<VerifyEmailPage />);

    /* First resend — should reach the API. */
    fireEvent.click(screen.getByRole('button', { name: /Resend code/i }));
    /* Flush the resolved promise so the finally block runs. */
    await act(async () => {});
    expect(mockAuthFetch).toHaveBeenCalledTimes(1);

    /* Immediate second click — cooldown is active; call count must not increase. */
    fireEvent.click(screen.getByRole('button', { name: /Resend code/i }));
    await act(async () => {});
    expect(mockAuthFetch).toHaveBeenCalledTimes(1);

    /* Advance past the 30-second cooldown window. */
    act(() => {
      vi.advanceTimersByTime(30_001);
    });

    /* Resend is now re-enabled — the next click must reach the API. */
    fireEvent.click(screen.getByRole('button', { name: /Resend code/i }));
    await act(async () => {});
    expect(mockAuthFetch).toHaveBeenCalledTimes(2);
  });
});
