/**
 * @fileoverview Expiry countdown pill for time-limited OTP / temp tokens.
 *
 * Renders `MM:SS` remaining time from a `Date` expiry timestamp. Turns
 * destructive (red) when fewer than 30 seconds remain. Calls `onExpired` exactly
 * once when the countdown reaches zero.
 *
 * @module components/auth/expiry-pill
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';

/** Props for {@link ExpiryPill}. */
export interface ExpiryPillProps {
  /** The timestamp at which the token expires. */
  expiresAt: Date;
  /** Called exactly once when the countdown reaches zero. */
  onExpired?: () => void;
}

/** Seconds remaining threshold below which the pill turns destructive. */
const WARNING_THRESHOLD_SECONDS = 30;

/**
 * Renders a `MM:SS` countdown. Turns red below 30 s. Calls `onExpired` once at zero.
 *
 * @param expiresAt - The expiry timestamp to count down to.
 * @param onExpired - Optional callback fired once when the timer expires.
 * @returns A styled countdown pill.
 */
export function ExpiryPill({ expiresAt, onExpired }: ExpiryPillProps): ReactElement {
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  );
  const firedRef = useRef(false);
  /* Callback ref: always points to the latest `onExpired` without being a dep.
     This prevents a new inline arrow prop (e.g. `() => setState(true)`) from
     tearing down and restarting the interval on every parent re-render. */
  const onExpiredRef = useRef(onExpired);
  useEffect(() => {
    onExpiredRef.current = onExpired;
  });

  useEffect(() => {
    /* Reset the fired flag so a fresh expiresAt can fire onExpired again. */
    firedRef.current = false;
    /* Compute remaining time directly from expiresAt so secondsLeft is not a
       dependency — this ensures a single stable interval per expiresAt value
       instead of tearing down and recreating the interval on every tick. */
    const initial = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    /* Sync display state immediately when expiresAt changes. */
    setSecondsLeft(initial);

    if (initial <= 0) {
      firedRef.current = true;
      onExpiredRef.current?.();
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        /* Clear before calling onExpired so the callback cannot re-observe a
           live interval; firedRef prevents any double-fire on subsequent renders. */
        clearInterval(interval);
        firedRef.current = true;
        onExpiredRef.current?.();
      }
    }, 1_000);

    return () => clearInterval(interval);
    /* secondsLeft is intentionally excluded: the interval computes remaining
       time from expiresAt on each tick, so including secondsLeft would tear
       down and recreate the interval every second. */
  }, [expiresAt]);

  const isExpired = secondsLeft <= 0;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const label = isExpired
    ? 'Expired'
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isWarning = !isExpired && secondsLeft <= WARNING_THRESHOLD_SECONDS;

  return (
    <span
      aria-live="polite"
      aria-label={isExpired ? 'Code expired' : `Code expires in ${label}`}
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs font-medium',
        isExpired || isWarning
          ? 'border border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-(--glass-border) bg-(--glass-bg) text-muted-foreground',
      )}
    >
      {label}
    </span>
  );
}
