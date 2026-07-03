/**
 * @fileoverview Tests for the Security / MFA page.
 *
 * Covers: the loading skeleton, the disabled empty state → enroll → verify-enable,
 * the enabled view with disable + regenerate, and a setup error banner.
 *
 * @module app/(dashboard)/dashboard/security/page.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthClientError } from '@bymax-one/rust-auth/shared';

const mockUseSession = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const api = vi.hoisted(() => ({
  mfaSetup: vi.fn(),
  mfaVerifyEnable: vi.fn(),
  mfaDisable: vi.fn(),
  mfaRegenerateRecoveryCodes: vi.fn(),
}));

vi.mock('@bymax-one/rust-auth/react', () => ({
  useSession: () =>
    mockUseSession() as { user: unknown; status: string; refresh: () => Promise<void> },
}));
vi.mock('@/lib/mfa-api', () => api);
vi.mock('@/components/mfa/QrEnrollmentCard', () => ({
  QrEnrollmentCard: () => <div>qr-enrollment</div>,
}));
vi.mock('@/components/mfa/RecoveryCodeGrid', () => ({
  RecoveryCodeGrid: ({ codes }: { codes: readonly string[] }) => (
    <div>recovery:{codes.join(',')}</div>
  ),
}));
vi.mock('@/components/auth/otp-input', () => ({
  OtpInput: ({ onComplete }: { onComplete: (c: string) => void }) => (
    <button onClick={() => onComplete('123456')}>enter-otp</button>
  ),
}));

import SecurityPage from './page';

function sessionOff() {
  return { user: { mfaEnabled: false }, status: 'authenticated', refresh };
}
function sessionOn() {
  return { user: { mfaEnabled: true }, status: 'authenticated', refresh };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SecurityPage', () => {
  it('shows a skeleton while the session loads', () => {
    // No MFA state can render until the session resolves.
    mockUseSession.mockReturnValue({ user: null, status: 'loading', refresh });
    render(<SecurityPage />);
    expect(screen.getByRole('status', { name: /Loading/i })).toBeInTheDocument();
  });

  it('enrolls from the disabled state through verify-enable', async () => {
    // Enabling walks setup → QR → confirm code → enabled.
    mockUseSession.mockReturnValue(sessionOff());
    api.mfaSetup.mockResolvedValueOnce({ secret: 's', qrCodeUri: 'o', recoveryCodes: [] });
    api.mfaVerifyEnable.mockResolvedValueOnce(undefined);
    render(<SecurityPage />);
    expect(screen.getByText('2FA not enabled')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Enable 2FA/i }));
    await waitFor(() => expect(screen.getByText('qr-enrollment')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'enter-otp' }));
    await waitFor(() => expect(screen.getByText('2FA enabled')).toBeInTheDocument());
    expect(api.mfaVerifyEnable).toHaveBeenCalledWith('123456');
  });

  it('regenerates recovery codes from the enabled state', async () => {
    // Regenerate reveals a code prompt and shows the fresh codes.
    mockUseSession.mockReturnValue(sessionOn());
    api.mfaRegenerateRecoveryCodes.mockResolvedValueOnce(['n1', 'n2']);
    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /Regenerate recovery codes/i }));
    fireEvent.click(screen.getByRole('button', { name: 'enter-otp' }));
    await waitFor(() => expect(screen.getByText('recovery:n1,n2')).toBeInTheDocument());
  });

  it('disables 2FA behind a destructive confirm', async () => {
    // Disable requires a fresh code and returns to the disabled state.
    mockUseSession.mockReturnValue(sessionOn());
    api.mfaDisable.mockResolvedValueOnce(undefined);
    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /Disable 2FA/i }));
    await waitFor(() =>
      expect(screen.getByText(/Disable two-factor authentication\?/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'enter-otp' }));
    await waitFor(() => expect(screen.getByText('2FA not enabled')).toBeInTheDocument());
    expect(api.mfaDisable).toHaveBeenCalledWith('123456');
  });

  it('surfaces a localized error when setup fails', async () => {
    // A failed setup must show the error banner, not crash.
    mockUseSession.mockReturnValue(sessionOff());
    api.mfaSetup.mockRejectedValueOnce(
      new AuthClientError('x', 400, { code: 'auth.mfa_already_enabled', message: 'x' }),
    );
    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /Enable 2FA/i }));
    await waitFor(() =>
      expect(screen.getByText('Two-factor authentication is already enabled.')).toBeInTheDocument(),
    );
  });

  it('always shows the AEAD-sealed-secret explainer', () => {
    // The explainer documents how the secret is protected at rest.
    mockUseSession.mockReturnValue(sessionOff());
    render(<SecurityPage />);
    expect(screen.getByText(/authenticated encryption \(AEAD\)/i)).toBeInTheDocument();
  });
});
