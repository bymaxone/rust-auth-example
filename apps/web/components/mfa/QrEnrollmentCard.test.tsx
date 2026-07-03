/**
 * @fileoverview Tests for the QR enrollment card.
 *
 * Covers: the QR renders from the otpauth URI, the base32 secret is shown +
 * copyable, the recovery grid appears, and a QR-render failure degrades to the
 * skeleton (never crashing).
 *
 * @module components/mfa/QrEnrollmentCard.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const toDataURL = vi.hoisted(() => vi.fn());
vi.mock('qrcode', () => ({ default: { toDataURL } }));

const writeText = vi.hoisted(() => vi.fn(() => Promise.resolve()));

import { QrEnrollmentCard } from './QrEnrollmentCard';
import type { MfaSetupResult } from '@/lib/mfa-api';

const SETUP: MfaSetupResult = {
  secret: 'JBSWY3DPEHPK3PXP',
  qrCodeUri: 'otpauth://totp/acme:demo?secret=JBSWY3DPEHPK3PXP',
  recoveryCodes: ['code-1', 'code-2'],
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText } });
});

describe('QrEnrollmentCard', () => {
  it('renders the QR image, the secret, and the recovery codes', async () => {
    // The card must present all three enrollment affordances.
    toDataURL.mockResolvedValueOnce('data:image/png;base64,AAAA');
    render(<QrEnrollmentCard setup={SETUP} />);
    await waitFor(() =>
      expect(screen.getByAltText('TOTP enrollment QR code')).toHaveAttribute(
        'src',
        'data:image/png;base64,AAAA',
      ),
    );
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    expect(screen.getByText('code-1')).toBeInTheDocument();
    expect(toDataURL).toHaveBeenCalledWith(SETUP.qrCodeUri);
  });

  it('copies the base32 secret to the clipboard', async () => {
    // Manual entry requires the secret to be copyable; the label then reverts.
    vi.useFakeTimers();
    try {
      toDataURL.mockResolvedValueOnce('data:image/png;base64,AAAA');
      render(<QrEnrollmentCard setup={SETUP} />);
      fireEvent.click(screen.getByRole('button', { name: /Copy secret/i }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(writeText).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP');
      expect(screen.getByRole('button', { name: /Secret copied/i })).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(screen.getByRole('button', { name: /Copy secret/i })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to a skeleton when the QR cannot be rendered', async () => {
    // A QR-render failure must not crash enrollment; the skeleton remains.
    toDataURL.mockRejectedValueOnce(new Error('no canvas'));
    render(<QrEnrollmentCard setup={SETUP} />);
    await waitFor(() =>
      expect(screen.getByRole('status', { name: /Rendering QR code/i })).toBeInTheDocument(),
    );
  });
});
