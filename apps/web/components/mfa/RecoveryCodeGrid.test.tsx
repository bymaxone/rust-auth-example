/**
 * @fileoverview Tests for the recovery-code grid.
 *
 * Covers: the codes render with the shown-once warning, Copy writes to the
 * clipboard and flips the label, and Download builds a local text file.
 *
 * @module components/mfa/RecoveryCodeGrid.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('copies the codes to the clipboard and confirms', async () => {
    // Copy must place the newline-joined codes on the clipboard.
    render(<RecoveryCodeGrid codes={['aaa', 'bbb']} />);
    fireEvent.click(screen.getByRole('button', { name: /Copy/i }));
    await waitFor(() => expect(screen.getByText('Copied')).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith('aaa\nbbb');
  });

  it('downloads the codes as a text file', () => {
    // Download must build a local blob URL for the codes.
    render(<RecoveryCodeGrid codes={['aaa', 'bbb']} />);
    fireEvent.click(screen.getByRole('button', { name: /Download/i }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:codes');
  });
});
