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
    // The idle copy affordance is labelled "Copy secret", reads "Copy", and uses the outline
    // variant (never the destructive one) until an actual copy result arrives.
    const idleButton = screen.getByRole('button', { name: 'Copy secret' });
    expect(idleButton).toHaveAttribute('aria-label', 'Copy secret');
    expect(idleButton).toHaveTextContent(/^Copy$/);
    expect(idleButton.className).toContain('border-(--glass-border)');
    expect(idleButton.className).not.toContain('bg-destructive');
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
      // A successful copy reads "Copied", keeps the outline variant, and never flips to the
      // destructive (failure) styling.
      const copiedButton = screen.getByRole('button', { name: 'Secret copied' });
      expect(copiedButton).toHaveAttribute('aria-label', 'Secret copied');
      expect(copiedButton).toHaveTextContent(/^Copied$/);
      expect(copiedButton.className).toContain('border-(--glass-border)');
      expect(copiedButton.className).not.toContain('bg-destructive');
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
      // A denied write surfaces the exact "Copy failed" label + text and switches to the
      // destructive variant, dropping the outline styling.
      const failedButton = screen.getByRole('button', { name: 'Copy failed' });
      expect(failedButton).toHaveAttribute('aria-label', 'Copy failed');
      expect(failedButton).toHaveTextContent(/^Copy failed$/);
      expect(failedButton.className).toContain('bg-destructive');
      expect(failedButton.className).not.toContain('border-(--glass-border)');
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

  it('re-renders the QR from scratch when the setup URI changes', async () => {
    // Changing the enrollment URI must re-run the render effect and swap the image, proving the
    // effect keys on `setup.qrCodeUri` rather than running once for the component's lifetime.
    const setupA: MfaSetupResult = { ...SETUP, qrCodeUri: 'otpauth://totp/acme:demo?secret=AAA' };
    const setupB: MfaSetupResult = { ...SETUP, qrCodeUri: 'otpauth://totp/acme:demo?secret=BBB' };
    toDataURL.mockResolvedValueOnce('data:image/png;base64,AAAA');
    const { rerender } = render(<QrEnrollmentCard setup={setupA} />);
    await waitFor(() =>
      expect(screen.getByAltText('TOTP enrollment QR code')).toHaveAttribute(
        'src',
        'data:image/png;base64,AAAA',
      ),
    );
    toDataURL.mockResolvedValueOnce('data:image/png;base64,BBBB');
    rerender(<QrEnrollmentCard setup={setupB} />);
    await waitFor(() =>
      expect(screen.getByAltText('TOTP enrollment QR code')).toHaveAttribute(
        'src',
        'data:image/png;base64,BBBB',
      ),
    );
    expect(toDataURL).toHaveBeenNthCalledWith(1, setupA.qrCodeUri);
    expect(toDataURL).toHaveBeenNthCalledWith(2, setupB.qrCodeUri);
    expect(toDataURL).toHaveBeenCalledTimes(2);
  });

  it('ignores a stale QR resolve that lands after the setup URI changed', async () => {
    // When the first URI's render resolves after the component has already moved to a newer URI,
    // the stale image must be discarded so it never clobbers the current QR.
    let resolveA!: (url: string) => void;
    let resolveB!: (url: string) => void;
    const pendingA = new Promise<string>((resolve) => {
      resolveA = resolve;
    });
    const pendingB = new Promise<string>((resolve) => {
      resolveB = resolve;
    });
    toDataURL.mockReturnValueOnce(pendingA).mockReturnValueOnce(pendingB);
    const setupA: MfaSetupResult = { ...SETUP, qrCodeUri: 'otpauth://totp/acme:demo?secret=AAA' };
    const setupB: MfaSetupResult = { ...SETUP, qrCodeUri: 'otpauth://totp/acme:demo?secret=BBB' };
    const { rerender } = render(<QrEnrollmentCard setup={setupA} />);
    rerender(<QrEnrollmentCard setup={setupB} />);
    await act(async () => {
      resolveB('data:image/png;base64,BBBB');
      await Promise.resolve();
    });
    expect(screen.getByAltText('TOTP enrollment QR code')).toHaveAttribute(
      'src',
      'data:image/png;base64,BBBB',
    );
    await act(async () => {
      resolveA('data:image/png;base64,AAAA');
      await Promise.resolve();
    });
    // The superseded first URI must not overwrite the current image.
    expect(screen.getByAltText('TOTP enrollment QR code')).toHaveAttribute(
      'src',
      'data:image/png;base64,BBBB',
    );
  });

  it('ignores a stale QR reject that lands after the setup URI changed', async () => {
    // A failure from the superseded first URI must not blank the current, freshly-rendered QR.
    let rejectA!: (error: Error) => void;
    let resolveB!: (url: string) => void;
    const pendingA = new Promise<string>((_resolve, reject) => {
      rejectA = reject;
    });
    const pendingB = new Promise<string>((resolve) => {
      resolveB = resolve;
    });
    toDataURL.mockReturnValueOnce(pendingA).mockReturnValueOnce(pendingB);
    const setupA: MfaSetupResult = { ...SETUP, qrCodeUri: 'otpauth://totp/acme:demo?secret=AAA' };
    const setupB: MfaSetupResult = { ...SETUP, qrCodeUri: 'otpauth://totp/acme:demo?secret=BBB' };
    const { rerender } = render(<QrEnrollmentCard setup={setupA} />);
    rerender(<QrEnrollmentCard setup={setupB} />);
    await act(async () => {
      resolveB('data:image/png;base64,BBBB');
      await Promise.resolve();
    });
    expect(screen.getByAltText('TOTP enrollment QR code')).toHaveAttribute(
      'src',
      'data:image/png;base64,BBBB',
    );
    await act(async () => {
      rejectA(new Error('stale failure'));
      await Promise.resolve();
    });
    // The superseded rejection must leave the current image intact, never falling to a skeleton.
    expect(screen.getByAltText('TOTP enrollment QR code')).toHaveAttribute(
      'src',
      'data:image/png;base64,BBBB',
    );
    expect(screen.queryByRole('status', { name: /Rendering QR code/i })).toBeNull();
  });

  it('falls back to the skeleton when a re-render fails to produce a QR', async () => {
    // A render that succeeds and is then replaced by a failing URI must clear the stale image and
    // return to the loading skeleton rather than leaving the previous QR on screen.
    const setupA: MfaSetupResult = { ...SETUP, qrCodeUri: 'otpauth://totp/acme:demo?secret=AAA' };
    const setupB: MfaSetupResult = { ...SETUP, qrCodeUri: 'otpauth://totp/acme:demo?secret=BBB' };
    toDataURL.mockResolvedValueOnce('data:image/png;base64,AAAA');
    const { rerender } = render(<QrEnrollmentCard setup={setupA} />);
    await waitFor(() =>
      expect(screen.getByAltText('TOTP enrollment QR code')).toHaveAttribute(
        'src',
        'data:image/png;base64,AAAA',
      ),
    );
    toDataURL.mockRejectedValueOnce(new Error('no canvas'));
    rerender(<QrEnrollmentCard setup={setupB} />);
    await waitFor(() =>
      expect(screen.getByRole('status', { name: /Rendering QR code/i })).toBeInTheDocument(),
    );
    expect(screen.queryByAltText('TOTP enrollment QR code')).toBeNull();
  });

  it('does not clear a timer on unmount when no copy is pending', async () => {
    // With no copy confirmation in flight, unmounting must skip clearTimeout entirely — it must
    // never be invoked with the null timer handle.
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      toDataURL.mockResolvedValueOnce('data:image/png;base64,AAAA');
      const { unmount } = render(<QrEnrollmentCard setup={SETUP} />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      unmount();
      expect(clearSpy).not.toHaveBeenCalledWith(null);
    } finally {
      clearSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('does not clear a timer on the first copy when none is pending', async () => {
    // The first copy has no prior revert timer, so scheduling its reset must not call clearTimeout
    // with the null handle.
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      toDataURL.mockResolvedValueOnce('data:image/png;base64,AAAA');
      render(<QrEnrollmentCard setup={SETUP} />);
      fireEvent.click(screen.getByRole('button', { name: /Copy secret/i }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByRole('button', { name: /Secret copied/i })).toBeInTheDocument();
      expect(clearSpy).not.toHaveBeenCalledWith(null);
    } finally {
      clearSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
