/**
 * @fileoverview Tests for the recovery-code grid.
 *
 * Covers: the codes render with the shown-once warning, Copy writes to the
 * clipboard and flips the label, and Download builds a local text file.
 *
 * @module components/mfa/RecoveryCodeGrid.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RecoveryCodeGrid } from './RecoveryCodeGrid';

const writeText = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const createObjectURL = vi.hoisted(() => vi.fn(() => 'blob:codes'));
const revokeObjectURL = vi.hoisted(() => vi.fn());

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText } });
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});

describe('RecoveryCodeGrid', () => {
  it('renders each code and the shown-once warning', () => {
    // Recovery codes must be visible with a clear one-time warning.
    render(<RecoveryCodeGrid codes={['aaa-111', 'bbb-222']} />);
    expect(screen.getByText('aaa-111')).toBeInTheDocument();
    expect(screen.getByText('bbb-222')).toBeInTheDocument();
    expect(screen.getByText(/shown only once/i)).toBeInTheDocument();
  });

  it('copies the codes to the clipboard, confirms, then reverts the label', async () => {
    // Copy places the newline-joined codes on the clipboard and the confirmation
    // reverts so a repeat copy is visibly acknowledged.
    vi.useFakeTimers();
    try {
      render(<RecoveryCodeGrid codes={['aaa', 'bbb']} />);
      fireEvent.click(screen.getByRole('button', { name: /Copy recovery codes/i }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText('Copied')).toBeInTheDocument();
      expect(writeText).toHaveBeenCalledWith('aaa\nbbb');
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(screen.getByText('Copy')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('downloads the codes as a text file', () => {
    // Download must build a local blob URL for the codes.
    render(<RecoveryCodeGrid codes={['aaa', 'bbb']} />);
    fireEvent.click(screen.getByRole('button', { name: /Download/i }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:codes');
  });

  it('shows a "Copy failed" state when the clipboard write is denied', async () => {
    // A rejected clipboard write must surface a graceful error state, not crash.
    vi.useFakeTimers();
    try {
      writeText.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
      render(<RecoveryCodeGrid codes={['aaa', 'bbb']} />);
      fireEvent.click(screen.getByRole('button', { name: /Copy recovery codes/i }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByRole('button', { name: /Copy failed/i })).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(screen.getByRole('button', { name: /Copy recovery codes/i })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reschedules the revert so a repeat copy does not flip the label early', async () => {
    // A second copy cancels the first pending revert; the label only flips after the newest
    // timer elapses, never at the original deadline.
    vi.useFakeTimers();
    try {
      render(<RecoveryCodeGrid codes={['aaa', 'bbb']} />);
      fireEvent.click(screen.getByRole('button', { name: /Copy recovery codes/i }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText('Copied')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(1_999);
      });
      fireEvent.click(screen.getByRole('button', { name: /Recovery codes copied/i }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      // One tick past the ORIGINAL deadline: still "Copied" because that timer was cancelled.
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByText('Copied')).toBeInTheDocument();
      // The rescheduled timer eventually reverts.
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(screen.getByText('Copy')).toBeInTheDocument();
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
      const { unmount } = render(<RecoveryCodeGrid codes={['aaa', 'bbb']} />);
      fireEvent.click(screen.getByRole('button', { name: /Copy recovery codes/i }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText('Copied')).toBeInTheDocument();
      unmount();
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
