/**
 * @fileoverview Tests for the ExpiryPill countdown component.
 *
 * Covers: initial render, MM:SS format, warning state near zero, expired state,
 * and the onExpired callback (fires exactly once, and on already-expired mount).
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
    render(<ExpiryPill expiresAt={expiresAt} />);
    expect(screen.getByText('01:30')).toBeInTheDocument();
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
    render(<ExpiryPill expiresAt={expiresAt} />);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByText('Expired')).toBeInTheDocument();
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
});
