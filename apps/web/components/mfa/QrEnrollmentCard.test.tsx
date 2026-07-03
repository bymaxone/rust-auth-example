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

  it('does not update state after unmount when the QR promise resolves late', async () => {
    // A QR promise that resolves after the component unmounts must not cause errors.
    let resolveQr!: (url: string) => void;
    toDataURL.mockReturnValueOnce(
      new Promise<string>((r) => {
        resolveQr = r;
      }),
    );
    const { unmount } = render(<QrEnrollmentCard setup={SETUP} />);
    unmount();
    // Resolving on an unmounted component must be harmlessly swallowed.
    await act(async () => {
      resolveQr('data:image/png;base64,LATE');
      await Promise.resolve();
    });
  });

  it('does not update state after unmount when the QR promise rejects late', async () => {
    // A QR promise that rejects after the component unmounts must be harmlessly swallowed,
    // never attempting a post-unmount state update.
    let rejectQr!: (error: Error) => void;
    toDataURL.mockReturnValueOnce(
      new Promise<string>((_resolve, reject) => {
        rejectQr = reject;
      }),
    );
    const { unmount } = render(<QrEnrollmentCard setup={SETUP} />);
    unmount();
    await act(async () => {
      rejectQr(new Error('late failure'));
      await Promise.resolve();
    });
  });

  it('shows a "Copy failed" state when the clipboard write is denied', async () => {
    // A rejected clipboard write must surface a graceful error state, not crash.
    vi.useFakeTimers();
    try {
      toDataURL.mockResolvedValueOnce('data:image/png;base64,AAAA');
      const writeText = vi.fn(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
      Object.assign(navigator, { clipboard: { writeText } });
      render(<QrEnrollmentCard setup={SETUP} />);
      fireEvent.click(screen.getByRole('button', { name: /Copy secret/i }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByRole('button', { name: /Copy failed/i })).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(screen.getByRole('button', { name: /Copy secret/i })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reschedules the revert so a repeat copy does not flip the label early', async () => {
    // A second copy cancels the first pending revert; the label only flips after the newest
    // timer elapses, never at the original deadline.
    vi.useFakeTimers();
    try {
      toDataURL.mockResolvedValueOnce('data:image/png;base64,AAAA');
      render(<QrEnrollmentCard setup={SETUP} />);
      fireEvent.click(screen.getByRole('button', { name: /Copy secret/i }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByRole('button', { name: /Secret copied/i })).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(1_999);
      });
      fireEvent.click(screen.getByRole('button', { name: /Secret copied/i }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      // One tick past the ORIGINAL deadline: still copied because that timer was cancelled.
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByRole('button', { name: /Secret copied/i })).toBeInTheDocument();
      // The rescheduled timer eventually reverts.
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(screen.getByRole('button', { name: /Copy secret/i })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears a pending revert timer on unmount', async () => {
    // Unmounting while a copy confirmation is still pending must clear its timer so it never
    // fires against an unmounted tree.
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      toDataURL.mockResolvedValueOnce('data:image/png;base64,AAAA');
      const { unmount } = render(<QrEnrollmentCard setup={SETUP} />);
      fireEvent.click(screen.getByRole('button', { name: /Copy secret/i }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByRole('button', { name: /Secret copied/i })).toBeInTheDocument();
      unmount();
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
