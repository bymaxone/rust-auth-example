/**
 * @fileoverview Segmented numeric OTP input — one cell per digit.
 *
 * Each cell accepts exactly one digit. Typing auto-advances focus to the next
 * cell. Pasting a string of digits distributes them across cells starting at
 * cell 0. Backspace on an empty cell clears the previous cell and moves focus
 * back. When all cells contain a digit `onComplete` fires with the concatenated
 * code string.
 *
 * Accessibility:
 *   - `autocomplete="one-time-code"` on the first cell for browser autofill.
 *   - `inputmode="numeric"` on every cell for the numeric keyboard on mobile.
 *   - `pattern="[0-9]*"` to restrict input to digits.
 *   - Each cell labeled `${digitLabel} N of length` for screen readers.
 *   - `role="group"` on the container with a descriptive `aria-label`.
 *
 * @module components/auth/otp-input
 */

'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';

/** Props for {@link OtpInput}. */
export interface OtpInputProps {
  /** Number of segmented cells. Defaults to `6`. */
  length?: number;
  /** Fires with the full concatenated string once every cell is filled. */
  onComplete: (code: string) => void;
  /** ARIA label prefix for individual boxes. Defaults to `'Digit'`. */
  digitLabel?: string;
}

/**
 * Accessible segmented OTP input with auto-advance, paste distribution, and
 * backspace navigation. Calls `onComplete` when all cells are filled.
 *
 * @param length - Number of digit cells (default 6).
 * @param onComplete - Called with the full OTP string when all cells are filled.
 * @param digitLabel - Prefix for individual cell ARIA labels.
 */
export function OtpInput({
  length = 6,
  onComplete,
  digitLabel = 'Digit',
}: OtpInputProps): React.ReactElement {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  /** Mutable value slots; not state because we don't need renders on each keystroke. */
  const valuesRef = useRef<string[]>(Array.from({ length }, () => ''));

  /** Move focus to the cell at `index` if it exists. */
  function focus(index: number): void {
    inputRefs.current[index]?.focus();
  }

  /** Notify `onComplete` if every slot is non-empty. */
  function maybeComplete(): void {
    if (valuesRef.current.every((v) => v.length > 0)) {
      onComplete(valuesRef.current.join(''));
    }
  }

  function handleChange(index: number, rawValue: string): void {
    /* Keep only the last digit typed (handles Android composing-text quirks). */
    const digit = rawValue.replace(/\D/g, '').slice(-1);
    valuesRef.current[index] = digit;
    /* Reflect into the DOM so the visual state matches.
       Defensive: the ref is always populated while an event handler fires,
       but TypeScript requires the guard due to `noUncheckedIndexedAccess`. */
    const input = inputRefs.current[index];
    /* v8 ignore next -- defensive null guard; ref is always set while mounted */
    if (input !== null && input !== undefined) input.value = digit;
    if (digit.length > 0 && index < length - 1) {
      focus(index + 1);
    }
    maybeComplete();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Backspace') {
      /* valuesRef is initialized with `length` empty strings and only written with
         valid indices, so [index] is always a string — the ?? fallback is defensive. */
      /* v8 ignore next -- ?? fallback is unreachable: index is always in-bounds */
      const cellVal: string = valuesRef.current[index] ?? '';
      if (cellVal.length === 0 && index > 0) {
        /* Cell is empty — clear the previous cell and move focus there. */
        valuesRef.current[index - 1] = '';
        const prev = inputRefs.current[index - 1];
        /* v8 ignore next -- defensive null guard; ref is always set while mounted */
        if (prev !== null && prev !== undefined) prev.value = '';
        focus(index - 1);
      } else {
        /* Cell has content (or it is the first cell) — clear it in place. */
        valuesRef.current[index] = '';
        const inp = inputRefs.current[index];
        /* v8 ignore next -- defensive null guard; ref is always set while mounted */
        if (inp !== null && inp !== undefined) inp.value = '';
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      focus(index - 1);
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      focus(index + 1);
    }
  }

  /** Distribute pasted digits across cells starting at index 0. */
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>): void {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    digits.split('').forEach((d, i) => {
      valuesRef.current[i] = d;
      const inp = inputRefs.current[i];
      /* v8 ignore next -- defensive null guard; ref is always set while mounted */
      if (inp !== null && inp !== undefined) inp.value = d;
    });
    /* Focus the cell after the last pasted digit, or the last cell. */
    focus(Math.min(digits.length, length - 1));
    maybeComplete();
  }

  return (
    <div className="flex justify-center gap-2" role="group" aria-label="One-time code input">
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={1}
          defaultValue=""
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
          aria-label={`${digitLabel} ${i + 1} of ${length}`}
          className={cn(
            'h-12 w-10 rounded-xl border text-center font-mono text-lg font-medium',
            'bg-(--glass-bg) text-foreground',
            'transition-shadow duration-200',
            'focus:outline-none focus:ring-2 focus:ring-ring/50',
            'border-(--glass-border)',
          )}
        />
      ))}
    </div>
  );
}
