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

  it('keeps only the last digit when several digits arrive in one change', () => {
    /* A multi-character change (e.g. Android composing text) keeps just the final
       digit, not the whole run. */
    renderOtp();
    fireEvent.change(getCell(1), { target: { value: '123' } });
    expect(getCell(1).value).toBe('3');
  });

  it('strips a trailing non-digit from a change value', () => {
    /* Non-digits are removed before the last-character is taken, so a value ending
       in a letter yields the preceding digit — never the stripped-out text. */
    renderOtp();
    fireEvent.change(getCell(1), { target: { value: '7x' } });
    expect(getCell(1).value).toBe('7');
  });

  it('does not keep a lone non-digit character', () => {
    /* Typing only a non-digit leaves the cell empty rather than substituting text
       for the stripped character. */
    renderOtp();
    fireEvent.change(getCell(1), { target: { value: 'a' } });
    expect(getCell(1).value).toBe('');
  });

  it('advances focus to the next cell when a digit is entered mid-run', () => {
    /* Entering a digit in a non-last cell moves focus forward exactly one cell. */
    renderOtp();
    fireEvent.change(getCell(2), { target: { value: '5' } });
    expect(getCell(2).value).toBe('5');
    expect(document.activeElement).toBe(getCell(3));
  });

  it('does not advance focus when a cell is cleared to empty', () => {
    /* Clearing a cell (empty digit) must leave focus on that same cell. */
    renderOtp();
    fireEvent.change(getCell(1), { target: { value: '1' } });
    getCell(1).focus();
    fireEvent.change(getCell(1), { target: { value: '' } });
    expect(getCell(1).value).toBe('');
    expect(document.activeElement).toBe(getCell(1));
  });

  it('does not advance focus for a digit typed in the last cell', () => {
    /* A digit in the final cell fills it but never moves focus past the boundary. */
    renderOtp();
    getCell(6).focus();
    fireEvent.change(getCell(6), { target: { value: '9' } });
    expect(getCell(6).value).toBe('9');
    expect(document.activeElement).toBe(getCell(6));
  });

  it('clears the previous cell and preserves later cells on Backspace from empty', () => {
    /* Backspace on an empty cell clears only the immediately-previous cell, moves
       focus back to it, and leaves every other cell's digit intact. */
    renderOtp();
    fireEvent.change(getCell(1), { target: { value: '1' } });
    fireEvent.change(getCell(2), { target: { value: '2' } });
    fireEvent.change(getCell(3), { target: { value: '3' } });
    /* Empty cell 2, then Backspace from it. */
    fireEvent.change(getCell(2), { target: { value: '' } });
    getCell(2).focus();
    fireEvent.keyDown(getCell(2), { key: 'Backspace' });
    /* Cell 1 (the previous cell) is cleared; cell 3 keeps its digit. */
    expect(getCell(1).value).toBe('');
    expect(getCell(3).value).toBe('3');
    expect(document.activeElement).toBe(getCell(1));
  });

  it('clears a filled cell in place on Backspace and keeps the other cells', () => {
    /* Backspace on a cell that holds a digit clears that cell only; neighbouring
       digits are untouched and focus does not jump backwards. */
    renderOtp();
    fireEvent.change(getCell(1), { target: { value: '1' } });
    fireEvent.change(getCell(2), { target: { value: '2' } });
    fireEvent.keyDown(getCell(1), { key: 'Backspace' });
    expect(getCell(1).value).toBe('');
    expect(getCell(2).value).toBe('2');
  });

  it('clears the current filled cell, not the previous one, on Backspace', () => {
    /* Backspace on a non-empty non-first cell clears that cell in place; the earlier
       cell keeps its digit and focus does not move backwards. */
    renderOtp();
    fireEvent.change(getCell(1), { target: { value: '1' } });
    fireEvent.change(getCell(2), { target: { value: '2' } });
    fireEvent.keyDown(getCell(2), { key: 'Backspace' });
    expect(getCell(1).value).toBe('1');
    expect(getCell(2).value).toBe('');
  });

  it('reads the pasted clipboard text under the "text" mime type', () => {
    /* Paste distribution reads the clipboard's plain-text payload; the digits land
       across the cells and onComplete fires with them. */
    const onComplete = renderOtp();
    fireEvent.paste(getCell(1), {
      clipboardData: { getData: (type: string) => (type === 'text' ? '135790' : '') },
    });
    expect(getCell(1).value).toBe('1');
    expect(onComplete).toHaveBeenCalledWith('135790');
  });

  it('moves focus to the last cell after a complete paste', () => {
    /* A full-length paste fills every cell and leaves focus on the final cell. */
    renderOtp();
    fireEvent.paste(getCell(1), {
      clipboardData: { getData: () => '123456' },
    });
    expect(document.activeElement).toBe(getCell(6));
  });

  it('moves focus to the cell after the last pasted digit for a short paste', () => {
    /* A partial paste of two digits leaves focus on the third cell, ready for the
       next entry. */
    renderOtp();
    fireEvent.paste(getCell(1), {
      clipboardData: { getData: () => '12' },
    });
    expect(getCell(1).value).toBe('1');
    expect(getCell(2).value).toBe('2');
    expect(document.activeElement).toBe(getCell(3));
  });

  it('ignores a paste on a cell other than the first', () => {
    /* Only the first cell owns the paste handler; pasting elsewhere distributes
       nothing and never fires onComplete. */
    const onComplete = renderOtp();
    fireEvent.paste(getCell(2), {
      clipboardData: { getData: () => '123456' },
    });
    expect(getCell(1).value).toBe('');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('applies the segmented cell styling classes', () => {
    /* Each cell carries the full visual token set (size, shape, typography, glass
       surface, transition, focus ring, and border colour). */
    renderOtp();
    const cell = getCell(1);
    expect(cell).toHaveClass(
      'h-12',
      'w-10',
      'rounded-xl',
      'text-center',
      'font-mono',
      'text-lg',
      'font-medium',
    );
    expect(cell).toHaveClass('bg-(--glass-bg)', 'text-foreground');
    expect(cell).toHaveClass('transition-shadow', 'duration-200');
    expect(cell).toHaveClass('focus:outline-none', 'focus:ring-2', 'focus:ring-ring/50');
    expect(cell).toHaveClass('border-(--glass-border)');
  });
});
