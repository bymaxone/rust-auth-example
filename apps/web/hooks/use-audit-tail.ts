/**
 * @fileoverview The live SSE audit tail with follow-mode.
 *
 * Tails `GET /audit/stream` (Server-Sent Events) over the cookie session — the
 * access JWT is never placed in the URL. In follow-mode new rows pin to the
 * bottom; pausing (scrolling up) buffers a "pending" count instead. Each event id
 * is the keyset cursor, so a dropped connection resumes via the browser's native
 * `Last-Event-ID` with no extra code.
 *
 * @module hooks/use-audit-tail
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import type { AuditLogRow } from '@/lib/audit-api';

/** The live tail state + follow controls. */
export interface UseAuditTail {
  /** Every row received on the stream, in arrival order. */
  readonly rows: readonly AuditLogRow[];
  /** Whether the view is pinned to the latest rows. */
  readonly following: boolean;
  /** Rows received while paused (the "N new" count). */
  readonly pendingCount: number;
  /** Pin to / unpin from the latest rows; pinning clears the pending count. */
  readonly setFollowing: (following: boolean) => void;
}

/**
 * Subscribe to the live audit tail.
 *
 * @param enabled - When false the stream is not opened (e.g. the Live toggle).
 * @returns The received rows plus the follow controls.
 */
export function useAuditTail(enabled: boolean): UseAuditTail {
  const [rows, setRows] = useState<readonly AuditLogRow[]>([]);
  const [following, setFollowingState] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const followingRef = useRef(true);

  function setFollowing(next: boolean): void {
    followingRef.current = next;
    setFollowingState(next);
    if (next) setPendingCount(0);
  }

  useEffect(() => {
    if (!enabled) return;
    const url = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/audit/stream`;
    const source = new EventSource(url, { withCredentials: true });
    const handler = (event: MessageEvent<string>): void => {
      try {
        const row = JSON.parse(event.data) as AuditLogRow;
        setRows((prev) => [...prev, row]);
        if (!followingRef.current) setPendingCount((n) => n + 1);
      } catch {
        /* Ignore malformed frames rather than breaking the tail. */
      }
    };
    source.addEventListener('message', handler);
    return () => source.close();
  }, [enabled]);

  return { rows, following, pendingCount, setFollowing };
}
