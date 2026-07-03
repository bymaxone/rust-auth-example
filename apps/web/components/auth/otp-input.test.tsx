/**
 * @fileoverview Tests for the OtpInput segmented numeric box.
 *
 * Covers: digit entry + auto-advance, paste distribution, backspace navigation,
 * ArrowLeft/ArrowRight navigation, onComplete fires, and ARIA attributes.
 *
 * @module components/auth/otp-input.test
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OtpInput } from './otp-input';

/* ── Helpers ─────────────────────────────────────────────────────────── */

function getCell(n: number): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>(`Digit ${n} of 6`);
}

function renderOtp(onComplete = vi.fn()) {
  render(<OtpInput length={6} onComplete={onComplete} />);
  return onComplete;
}

/* ── Tests ───────────────────────────────────────────────────────────── */

describe('OtpInput', () => {
  it('renders 6 cells with correct ARIA labels', () => {
    /* Each cell must carry a label so screen readers can identify it. */
    renderOtp();
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByLabelText(`Digit ${i} of 6`)).toBeInTheDocument();
    }
  });

  it('applies autocomplete="one-time-code" to the first cell only', () => {
    /* Browser autofill for OTP targets the first field. */
    renderOtp();
    expect(getCell(1).autocomplete).toBe('one-time-code');
    expect(getCell(2).autocomplete).toBe('off');
  });

  it('uses inputMode="numeric" and pattern="[0-9]*" on every cell', () => {
    /* Numeric IME and pattern ensure the numeric keyboard on mobile. */
    renderOtp();
    for (let i = 1; i <= 6; i++) {
      expect(getCell(i).inputMode).toBe('numeric');
      expect(getCell(i).pattern).toBe('[0-9]*');
    }
  });

  it('filters non-digit characters on change', () => {
    /* Only the last digit in a raw string is accepted. */
    renderOtp();
    fireEvent.change(getCell(1), { target: { value: 'abc5' } });
    expect(getCell(1).value).toBe('5');
  });

  it('calls onComplete with the full code when all cells are filled sequentially', () => {
    /* onComplete fires once when the last digit is entered. */
    const onComplete = renderOtp();
    ['1', '2', '3', '4', '5', '6'].forEach((d, i) => {
      fireEvent.change(screen.getByLabelText(`Digit ${i + 1} of 6`), {
        target: { value: d },
      });
    });
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('distributes pasted digits across cells and fires onComplete', () => {
    /* A paste event on the first cell must fill all 6 cells and fire onComplete. */
    const onComplete = renderOtp();
    fireEvent.paste(getCell(1), {
      clipboardData: { getData: () => '654321' },
    });
    expect(onComplete).toHaveBeenCalledWith('654321');
  });

  it('pads a short paste and does not fire onComplete', () => {
    /* Pasting fewer digits than cells fills only the leading cells (the empty
       fallback for the unpasted cells) and must not fire onComplete. */
    const onComplete = renderOtp();
    fireEvent.paste(getCell(1), {
      clipboardData: { getData: () => '12' },
    });
    expect(getCell(1).value).toBe('1');
    expect(getCell(2).value).toBe('2');
    expect(getCell(3).value).toBe('');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('strips non-digit characters from pasted text', () => {
    /* Non-digits in clipboard data are stripped before distribution. */
    renderOtp();
    fireEvent.paste(getCell(1), {
      clipboardData: { getData: () => 'ab12cd34ef56' },
    });
    expect(getCell(1).value).toBe('1');
    expect(getCell(2).value).toBe('2');
  });

  it('clears the previous cell and moves focus on Backspace from an empty cell', () => {
    /* Backspace on an empty cell must clear the previous digit and move focus back. */
    renderOtp();
    /* Fill cells 1 and 2. */
    fireEvent.change(getCell(1), { target: { value: '1' } });
    fireEvent.change(getCell(2), { target: { value: '2' } });
    /* Clear cell 2 by firing a change with an empty value. */
    fireEvent.change(getCell(2), { target: { value: '' } });
    /* Now Backspace from the empty cell 2 must move focus to cell 1. */
    fireEvent.keyDown(getCell(2), { key: 'Backspace' });
    expect(document.activeElement).toBe(getCell(1));
  });

  it('clears a cell with content on Backspace without moving focus', () => {
    /* Backspace on a cell that has a digit clears the digit in place; focus stays. */
    renderOtp();
    fireEvent.change(getCell(1), { target: { value: '5' } });
    expect(getCell(1).value).toBe('5');
    fireEvent.keyDown(getCell(1), { key: 'Backspace' });
    /* The DOM value and the internal ref must both be cleared. */
    expect(getCell(1).value).toBe('');
  });

  it('does nothing extra on Backspace when the first cell is already empty', () => {
    /* Backspace on cell 1 (index 0) when empty: no previous cell exists, so the
       cell is cleared in place (already empty) and focus stays — no navigation. */
    renderOtp();
    getCell(1).focus();
    fireEvent.keyDown(getCell(1), { key: 'Backspace' });
    /* Cell remains empty and focus does not move to a non-existent previous cell. */
    expect(getCell(1).value).toBe('');
    expect(document.activeElement).toBe(getCell(1));
  });

  it('navigates left with ArrowLeft', () => {
    /* ArrowLeft from cell 2 must move focus to cell 1. */
    renderOtp();
    fireEvent.change(getCell(1), { target: { value: '1' } });
    getCell(2).focus();
    fireEvent.keyDown(getCell(2), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(getCell(1));
  });

  it('navigates right with ArrowRight', () => {
    /* ArrowRight from cell 1 must move focus to cell 2. */
    renderOtp();
    getCell(1).focus();
    fireEvent.keyDown(getCell(1), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(getCell(2));
  });

  it('does not navigate past the left boundary (ArrowLeft on cell 1)', () => {
    /* ArrowLeft at the first cell must stay on cell 1. */
    renderOtp();
    getCell(1).focus();
    fireEvent.keyDown(getCell(1), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(getCell(1));
  });

  it('does not navigate past the right boundary (ArrowRight on cell 6)', () => {
    /* ArrowRight at the last cell must stay on cell 6. */
    renderOtp();
    getCell(6).focus();
    fireEvent.keyDown(getCell(6), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(getCell(6));
  });

  it('uses a custom digitLabel for ARIA labels', () => {
    /* digitLabel prop must replace "Digit" in cell ARIA labels. */
    render(<OtpInput length={3} onComplete={vi.fn()} digitLabel="Code digit" />);
    expect(screen.getByLabelText('Code digit 1 of 3')).toBeInTheDocument();
  });

  it('wraps cells in a group with aria-label="One-time code input"', () => {
    /* The container group label lets screen readers announce the overall control. */
    renderOtp();
    expect(screen.getByRole('group', { name: 'One-time code input' })).toBeInTheDocument();
  });

  it('does not fire onComplete when fewer than all cells are filled', () => {
    /* onComplete must not fire until every cell is non-empty. */
    const onComplete = vi.fn();
    render(<OtpInput length={6} onComplete={onComplete} />);
    fireEvent.change(getCell(1), { target: { value: '1' } });
    fireEvent.change(getCell(2), { target: { value: '2' } });
    expect(onComplete).not.toHaveBeenCalled();
  });
});
