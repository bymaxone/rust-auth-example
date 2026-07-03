/**
 * @fileoverview Tests for the platform admin login page.
 *
 * Covers: successful login redirect, MFA branch (inline OTP step),
 * `?reason=wrong-domain` banner, AuthClientError banner, and generic
 * error fallback.
 *
 * @module __tests__/platform/login.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthClientError } from '@bymax-one/rust-auth/shared';

/* ── Hoisted mocks ─────────────────────────────────────────────────────── */

const mockPush = vi.hoisted(() => vi.fn());
const mockPlatformLogin = vi.hoisted(() => vi.fn());
const mockPlatformMfaChallenge = vi.hoisted(() => vi.fn());

const mockGetParam = vi.hoisted(() => vi.fn((_k: string) => null as string | null));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: mockGetParam }),
}));

vi.mock('@/lib/platform-client', () => ({
  platformClient: {
    login: mockPlatformLogin,
    mfaChallenge: mockPlatformMfaChallenge,
  },
}));

// AuthError and OtpInput render shims for jsdom.
vi.mock('@/components/auth/auth-error', () => ({
  AuthError: ({ code }: { code: string | null }) =>
    code !== null ? (
      <div data-testid="auth-error" data-error-code={code}>
        {code}
      </div>
    ) : null,
}));

vi.mock('@/components/auth/otp-input', () => ({
  OtpInput: ({ onComplete }: { onComplete: (code: string) => void }) => (
    <input
      data-testid="otp-input"
      placeholder="OTP"
      onChange={(e) => {
        if (e.target.value.length === 6) onComplete(e.target.value);
      }}
    />
  ),
}));

/* ── Import after mocks ─────────────────────────────────────────────────── */
import PlatformLoginPage from '@/app/platform/login/page';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function fillAndSubmit(email = 'admin@example.com', password = 'secret'): void {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

/* ── Tests ────────────────────────────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks();
  mockGetParam.mockReturnValue(null);
});

describe('PlatformLoginPage', () => {
  it('routes to /platform/security on a successful login', async () => {
    // Verifies a non-MFA success routes the admin to /platform/security (the
    // default landing page) rather than the intermediate /platform redirect.
    mockPlatformLogin.mockResolvedValueOnce({ user: { id: '1' }, accessToken: 'at' });
    render(<PlatformLoginPage />);
    fillAndSubmit();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/platform/security'));
  });

  it('shows the inline MFA step on a mfaRequired result', async () => {
    // Verifies the page transitions to the inline OTP form when MFA is required.
    mockPlatformLogin.mockResolvedValueOnce({ mfaRequired: true, mfaTempToken: 'tmp-tok' });
    render(<PlatformLoginPage />);
    fillAndSubmit();
    await waitFor(() => expect(screen.getByText(/Enter the 6-digit code/i)).toBeInTheDocument());
  });

  it('calls mfaChallenge with the temp token and routes on success', async () => {
    // Verifies the MFA challenge path: temp token stays in state (not storage);
    // the user fills the OTP and clicks the Verify button to confirm.
    mockPlatformLogin.mockResolvedValueOnce({ mfaRequired: true, mfaTempToken: 'tmp-tok' });
    mockPlatformMfaChallenge.mockResolvedValueOnce({ user: { id: '1' } });
    render(<PlatformLoginPage />);
    fillAndSubmit();
    await waitFor(() => screen.getByTestId('otp-input'));
    fireEvent.change(screen.getByTestId('otp-input'), { target: { value: '123456' } });
    // The OTP mock calls onComplete, which sets pendingMfaCode enabling the button.
    // The user must then click Verify to submit.
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /verify/i });
      expect(btn).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    await waitFor(() => expect(mockPlatformMfaChallenge).toHaveBeenCalledWith('tmp-tok', '123456'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/platform/security'));
  });

  it('shows an error banner on AuthClientError from login', async () => {
    // Verifies wire errors are surfaced via the AuthError component.
    mockPlatformLogin.mockRejectedValueOnce(
      new AuthClientError('bad', 401, {
        code: 'auth.invalid_credentials',
        message: 'Incorrect email or password.',
      }),
    );
    render(<PlatformLoginPage />);
    fillAndSubmit();
    await waitFor(() => expect(screen.getByTestId('auth-error')).toBeInTheDocument());
  });

  it('falls back to auth.internal on an unexpected error', async () => {
    // Verifies non-AuthClientError errors fall back to the internal error code.
    mockPlatformLogin.mockRejectedValueOnce(new Error('network failure'));
    render(<PlatformLoginPage />);
    fillAndSubmit();
    await waitFor(() => {
      const errorEl = screen.getByTestId('auth-error');
      expect(errorEl).toHaveAttribute('data-error-code', 'auth.internal');
    });
  });

  it('falls back to auth.internal when AuthClientError has no code', async () => {
    // Verifies the `err.code ?? 'auth.internal'` nullish branch in onLogin: an
    // AuthClientError without a code property produces 'auth.internal'.
    mockPlatformLogin.mockRejectedValueOnce(new AuthClientError('no code', 401));
    render(<PlatformLoginPage />);
    fillAndSubmit();
    await waitFor(() => {
      const err = screen.getByTestId('auth-error');
      expect(err).toHaveAttribute('data-error-code', 'auth.internal');
    });
  });

  it('shows the wrong-domain reason banner when ?reason=wrong-domain is in the URL', async () => {
    // Verifies the ReasonBanner is rendered with the auth.platform_auth_required
    // message when a valid but wrong-domain token was detected by the layout guard.
    mockGetParam.mockReturnValue('wrong-domain');
    render(<PlatformLoginPage />);
    await waitFor(() =>
      expect(screen.getByText(/Platform administrator sign-in is required/i)).toBeInTheDocument(),
    );
  });

  it('shows the session-expired reason banner when ?reason=session-expired is in the URL', async () => {
    // Verifies the ReasonBanner renders the auth.session_expired message when
    // the layout guard bounces due to a missing or invalid/expired token.
    mockGetParam.mockReturnValue('session-expired');
    render(<PlatformLoginPage />);
    await waitFor(() => expect(screen.getByText(/Your session has expired/i)).toBeInTheDocument());
  });

  it('shows no reason banner when no ?reason param is present', () => {
    // Verifies the ReasonBanner returns null for an absent or unrecognized reason,
    // so a direct visit to the login page shows no pre-emptive warning.
    mockGetParam.mockReturnValue(null);
    render(<PlatformLoginPage />);
    // Neither the wrong-domain nor session-expired messages should appear.
    expect(
      screen.queryByText(/Platform administrator sign-in is required/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Your session has expired/i)).not.toBeInTheDocument();
  });

  it('shows an error banner when mfaChallenge throws', async () => {
    // Verifies the MFA submit error path: a failed challenge surfaces the error
    // code via the AuthError component (onMfaSubmit catch branch).
    mockPlatformLogin.mockResolvedValueOnce({ mfaRequired: true, mfaTempToken: 'tmp-tok' });
    mockPlatformMfaChallenge.mockRejectedValueOnce(
      new AuthClientError('bad code', 401, {
        code: 'auth.mfa_invalid_code',
        message: 'Invalid TOTP code.',
      }),
    );
    render(<PlatformLoginPage />);
    fillAndSubmit();
    await waitFor(() => screen.getByTestId('otp-input'));
    fireEvent.change(screen.getByTestId('otp-input'), { target: { value: '000000' } });
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /verify/i });
      expect(btn).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    await waitFor(() => {
      const err = screen.getByTestId('auth-error');
      expect(err).toHaveAttribute('data-error-code', 'auth.mfa_invalid_code');
    });
  });

  it('falls back to auth.internal when mfaChallenge throws AuthClientError with no code', async () => {
    // Verifies the `err.code ?? 'auth.internal'` nullish branch in onMfaSubmit:
    // an AuthClientError without a code falls back to the generic internal code.
    mockPlatformLogin.mockResolvedValueOnce({ mfaRequired: true, mfaTempToken: 'tmp-tok' });
    mockPlatformMfaChallenge.mockRejectedValueOnce(new AuthClientError('no code', 500));
    render(<PlatformLoginPage />);
    fillAndSubmit();
    await waitFor(() => screen.getByTestId('otp-input'));
    fireEvent.change(screen.getByTestId('otp-input'), { target: { value: '999999' } });
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /verify/i });
      expect(btn).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    await waitFor(() => {
      const err = screen.getByTestId('auth-error');
      expect(err).toHaveAttribute('data-error-code', 'auth.internal');
    });
  });

  it('falls back to auth.internal when mfaChallenge throws a non-AuthClientError', async () => {
    // Verifies the `else 'auth.internal'` branch on line 95: a non-AuthClientError
    // (e.g. network failure) in onMfaSubmit falls back to the generic internal code.
    mockPlatformLogin.mockResolvedValueOnce({ mfaRequired: true, mfaTempToken: 'tmp-tok' });
    mockPlatformMfaChallenge.mockRejectedValueOnce(new TypeError('network error'));
    render(<PlatformLoginPage />);
    fillAndSubmit();
    await waitFor(() => screen.getByTestId('otp-input'));
    fireEvent.change(screen.getByTestId('otp-input'), { target: { value: '654321' } });
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /verify/i });
      expect(btn).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    await waitFor(() => {
      const err = screen.getByTestId('auth-error');
      expect(err).toHaveAttribute('data-error-code', 'auth.internal');
    });
  });

  it('returns to the sign-in form when "Back to sign in" is clicked', async () => {
    // Verifies the back button resets mfaTempToken/pendingMfaCode/errorCode state
    // so the login form is shown again (lines 131-133 of login/page.tsx).
    mockPlatformLogin.mockResolvedValueOnce({ mfaRequired: true, mfaTempToken: 'tmp-tok' });
    render(<PlatformLoginPage />);
    fillAndSubmit();
    await waitFor(() => screen.getByText(/Enter the 6-digit code/i));
    fireEvent.click(screen.getByRole('button', { name: /back to sign in/i }));
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());
  });

  it('does nothing when the MFA form is submitted before the OTP completes (guard branch)', async () => {
    // Verifies the `if (mfaTempToken === null || pendingMfaCode === null) return;` guard
    // in onMfaSubmit: submitting the form before OTP is complete is a no-op.
    mockPlatformLogin.mockResolvedValueOnce({ mfaRequired: true, mfaTempToken: 'tmp-tok' });
    const { container } = render(<PlatformLoginPage />);
    fillAndSubmit();
    // Wait for MFA step to appear (mfaTempToken set, pendingMfaCode still null).
    await waitFor(() => screen.getByTestId('otp-input'));
    // Submit the form directly — button is disabled, so we hit the DOM form element.
    const forms = container.querySelectorAll('form');
    // The MFA form is the second form on the page (the first is the login form, now hidden).
    // Since we're in the MFA step, there is exactly one form visible.
    const mfaForm = forms[forms.length - 1];
    expect(mfaForm).toBeDefined();
    fireEvent.submit(mfaForm!);
    // mfaChallenge must NOT have been called — the guard returned early.
    expect(mockPlatformMfaChallenge).not.toHaveBeenCalled();
  });
});
