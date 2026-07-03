/**
 * @fileoverview Tests for the platform security/MFA page.
 *
 * Covers: loading state, off/enrolling/on modes, AuthClientError handling
 * for `auth.mfa_not_enabled` (fail-closed), and recovery-code regeneration.
 *
 * @module __tests__/platform/security.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AuthClientError } from '@bymax-one/rust-auth/shared';

/* ── Hoisted mocks ──────────────────────────────────────────────────────── */

const mockGetMe = vi.hoisted(() => vi.fn());
const mockMfaSetup = vi.hoisted(() => vi.fn());
const mockVerifyEnable = vi.hoisted(() => vi.fn());
const mockMfaDisable = vi.hoisted(() => vi.fn());
const mockRegenerate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/platform-client', () => ({
  platformClient: { getMe: mockGetMe },
  platformMfa: {
    setup: mockMfaSetup,
    verifyEnable: mockVerifyEnable,
    disable: mockMfaDisable,
    regenerate: mockRegenerate,
  },
}));

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

vi.mock('@/components/mfa/QrEnrollmentCard', () => ({
  QrEnrollmentCard: () => <div data-testid="qr-card" />,
}));

vi.mock('@/components/mfa/RecoveryCodeGrid', () => ({
  RecoveryCodeGrid: ({ codes }: { codes: readonly string[] }) => (
    <div data-testid="recovery-grid">{codes.join(',')}</div>
  ),
}));

/* ── Import after mocks ─────────────────────────────────────────────────── */
import PlatformSecurityPage from '@/app/platform/(protected)/security/page';

/* ── Tests ────────────────────────────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PlatformSecurityPage', () => {
  it('shows a loading skeleton while fetching the admin profile', () => {
    // Verifies the loading state is shown before getMe resolves.
    mockGetMe.mockReturnValue(new Promise(() => undefined));
    render(<PlatformSecurityPage />);
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('shows "2FA not enabled" when mfaEnabled is false', async () => {
    // Verifies the off-state card is rendered for an admin without MFA.
    mockGetMe.mockResolvedValueOnce({ mfaEnabled: false });
    render(<PlatformSecurityPage />);
    await waitFor(() => expect(screen.getByText(/2FA not enabled/i)).toBeInTheDocument());
  });

  it('shows "2FA enabled" when mfaEnabled is true', async () => {
    // Verifies the on-state card is rendered for an admin with MFA active.
    mockGetMe.mockResolvedValueOnce({ mfaEnabled: true });
    render(<PlatformSecurityPage />);
    await waitFor(() => expect(screen.getByText(/2FA enabled/i)).toBeInTheDocument());
  });

  it('shows the QR enrollment card after beginEnroll succeeds', async () => {
    // Verifies the enrolling state transitions correctly.
    mockGetMe.mockResolvedValueOnce({ mfaEnabled: false });
    mockMfaSetup.mockResolvedValueOnce({ secret: 'S', qrCodeUri: 'otpauth://', recoveryCodes: [] });
    render(<PlatformSecurityPage />);
    await waitFor(() => screen.getByText(/Enable 2FA/i));
    fireEvent.click(screen.getByText(/Enable 2FA/i));
    await waitFor(() => expect(screen.getByTestId('qr-card')).toBeInTheDocument());
  });

  it('surfaces auth.mfa_not_enabled honestly (fail-closed)', async () => {
    // Verifies the page never fakes MFA enrollment: the error is surfaced.
    mockGetMe.mockResolvedValueOnce({ mfaEnabled: false });
    mockMfaSetup.mockRejectedValueOnce(
      new AuthClientError('MFA not enabled', 403, {
        code: 'auth.mfa_not_enabled',
        message: 'MFA not enabled on this account.',
      }),
    );
    render(<PlatformSecurityPage />);
    await waitFor(() => screen.getByText(/Enable 2FA/i));
    fireEvent.click(screen.getByText(/Enable 2FA/i));
    await waitFor(() => {
      const err = screen.getByTestId('auth-error');
      expect(err).toHaveAttribute('data-error-code', 'auth.mfa_not_enabled');
    });
  });

  it('shows new recovery codes after a successful regeneration', async () => {
    // Verifies the recovery-code grid appears when regenerate resolves.
    mockGetMe.mockResolvedValueOnce({ mfaEnabled: true });
    mockRegenerate.mockResolvedValueOnce(['code1', 'code2']);
    render(<PlatformSecurityPage />);
    await waitFor(() => screen.getByText(/Regenerate recovery codes/i));
    fireEvent.click(screen.getByText(/Regenerate recovery codes/i));
    await waitFor(() => screen.getByTestId('otp-input'));
    fireEvent.change(screen.getByTestId('otp-input'), { target: { value: '111111' } });
    await waitFor(() => expect(screen.getByTestId('recovery-grid')).toBeInTheDocument());
  });
});
