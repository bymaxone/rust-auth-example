/**
 * @fileoverview Tests for the ExpiryPill countdown component.
 *
 * Covers: initial render and base classes, MM:SS format, the 30 s warning
 * threshold (below / exactly at / just above) with its destructive vs muted
 * styling, the expired state and its aria-label, the onExpired callback (fires
 * exactly once, on already-expired mount, without a callback, only at zero, and
 * always the latest callback), and interval reset / teardown when expiresAt
 * changes.
 *
 * @module components/auth/expiry-pill.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ExpiryPill } from './expiry-pill';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ExpiryPill', () => {
  it('renders the MM:SS remaining time on mount', () => {
    /* The initial display must reflect the seconds left at render time. */
    const expiresAt = new Date(Date.now() + 90_000); /* 1 m 30 s */
    const { container } = render(<ExpiryPill expiresAt={expiresAt} />);
    expect(screen.getByText('01:30')).toBeInTheDocument();
    const pill = container.querySelector('span');
    /* The base pill classes are always present regardless of state. */
    expect(pill?.className).toContain('inline-flex');
    expect(pill?.className).toContain('rounded-full');
    expect(pill?.className).toContain('font-mono');
    /* Well above the warning threshold: muted glass styling, never destructive. */
    expect(pill?.className).toContain('text-muted-foreground');
    expect(pill?.className).toContain('border-(--glass-border)');
    expect(pill?.className).not.toContain('text-destructive');
  });

  it('counts down by one second on each tick', () => {
    /* Each interval tick reduces the displayed seconds by one. */
    const expiresAt = new Date(Date.now() + 60_000); /* 1 m */
    render(<ExpiryPill expiresAt={expiresAt} />);
    expect(screen.getByText('01:00')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText('00:59')).toBeInTheDocument();
  });

  it('applies destructive styling when fewer than 30 s remain', () => {
    /* The warning threshold triggers red styling before expiry. */
    const expiresAt = new Date(Date.now() + 25_000); /* 25 s */
    const { container } = render(<ExpiryPill expiresAt={expiresAt} />);
    const pill = container.querySelector('span');
    expect(pill?.className).toContain('text-destructive');
  });

  it('shows "Expired" text and destructive styling at zero', () => {
    /* At expiry the label switches to "Expired" with red styling. */
    const expiresAt = new Date(Date.now() + 1_000);
    const { container } = render(<ExpiryPill expiresAt={expiresAt} />);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByText('Expired')).toBeInTheDocument();
    const pill = container.querySelector('span');
    /* The expired state uses destructive styling and its own aria-label. */
    expect(pill?.className).toContain('text-destructive');
    expect(pill?.className).not.toContain('text-muted-foreground');
    expect(pill?.getAttribute('aria-label')).toBe('Code expired');
  });

  it('calls onExpired exactly once when the countdown reaches zero', () => {
    /* onExpired must fire exactly once — not on each re-render after expiry. */
    const onExpired = vi.fn();
    const expiresAt = new Date(Date.now() + 1_000);
    render(<ExpiryPill expiresAt={expiresAt} onExpired={onExpired} />);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('calls onExpired immediately when mounted with an already-expired timestamp', () => {
    /* An already-expired timestamp must trigger onExpired on the first effect run. */
    const onExpired = vi.fn();
    const expiresAt = new Date(Date.now() - 1_000); /* already expired */
    render(<ExpiryPill expiresAt={expiresAt} onExpired={onExpired} />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('carries aria-live="polite" and a descriptive aria-label', () => {
    /* Screen readers must be notified of time changes without interruption. */
    const expiresAt = new Date(Date.now() + 60_000);
    const { container } = render(<ExpiryPill expiresAt={expiresAt} />);
    const el = container.querySelector('[aria-live="polite"]');
    expect(el).toBeTruthy();
    expect(el?.getAttribute('aria-label')).toMatch(/Code expires in/);
  });

  it('applies destructive styling at exactly the 30 s threshold', () => {
    /* The threshold is inclusive: exactly 30 s remaining is already a warning. */
    const expiresAt = new Date(Date.now() + 30_000); /* exactly 30 s */
    const { container } = render(<ExpiryPill expiresAt={expiresAt} />);
    expect(screen.getByText('00:30')).toBeInTheDocument();
    const pill = container.querySelector('span');
    expect(pill?.className).toContain('text-destructive');
    expect(pill?.className).not.toContain('text-muted-foreground');
  });

  it('uses muted styling one second above the warning threshold', () => {
    /* Just above the threshold (31 s) is not yet a warning: muted, not red. */
    const expiresAt = new Date(Date.now() + 31_000); /* 31 s */
    const { container } = render(<ExpiryPill expiresAt={expiresAt} />);
    expect(screen.getByText('00:31')).toBeInTheDocument();
    const pill = container.querySelector('span');
    expect(pill?.className).toContain('text-muted-foreground');
    expect(pill?.className).not.toContain('text-destructive');
  });

  it('keeps counting and does not fire onExpired before reaching zero', () => {
    /* Each tick above zero updates the display but must not clear the interval
       or fire onExpired — only reaching zero may do so. */
    const onExpired = vi.fn();
    const expiresAt = new Date(Date.now() + 5_000); /* 5 s */
    render(<ExpiryPill expiresAt={expiresAt} onExpired={onExpired} />);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText('00:04')).toBeInTheDocument();
    expect(onExpired).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText('00:03')).toBeInTheDocument();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('renders the expired state without an onExpired callback', () => {
    /* An already-expired mount with no callback must not throw. */
    const expiresAt = new Date(Date.now() - 1_000); /* already expired */
    render(<ExpiryPill expiresAt={expiresAt} />);
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('invokes the most recent onExpired after the callback prop changes', () => {
    /* The latest callback wins even when only onExpired changes (same expiresAt,
       so the interval is never torn down). */
    const first = vi.fn();
    const second = vi.fn();
    const expiresAt = new Date(Date.now() + 2_000);
    const { rerender } = render(<ExpiryPill expiresAt={expiresAt} onExpired={first} />);
    rerender(<ExpiryPill expiresAt={expiresAt} onExpired={second} />);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('resets the displayed time when expiresAt changes', () => {
    /* A new expiresAt must restart the countdown from its own remaining time. */
    const { rerender } = render(<ExpiryPill expiresAt={new Date(Date.now() + 90_000)} />);
    expect(screen.getByText('01:30')).toBeInTheDocument();
    rerender(<ExpiryPill expiresAt={new Date(Date.now() + 30_000)} />);
    expect(screen.getByText('00:30')).toBeInTheDocument();
  });

  it('stops the previous interval when expiresAt changes', () => {
    /* Changing expiresAt tears down the old interval, so onExpired fires only
       once — for the current timestamp, not the replaced one. */
    const onExpired = vi.fn();
    const { rerender } = render(
      <ExpiryPill expiresAt={new Date(Date.now() + 2_000)} onExpired={onExpired} />,
    );
    rerender(<ExpiryPill expiresAt={new Date(Date.now() + 3_000)} onExpired={onExpired} />);
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(onExpired).toHaveBeenCalledTimes(1);
  });
});
