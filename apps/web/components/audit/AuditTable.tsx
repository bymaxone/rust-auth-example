/**
 * @fileoverview The virtualized, faceted audit table with a no-secrets drawer.
 *
 * Only the visible window of rows renders (fixed-height windowing), so a fast
 * live tail never janks. Rows are faceted by the shared `actor`/`event` pivot
 * state. Follow-mode pins to the bottom; scrolling up pauses and surfaces an
 * "N new — jump to latest" pill. The detail drawer renders the load-bearing
 * no-secrets proof: it asserts the row carries no token, OTP, recovery code, or
 * secret.
 *
 * @module components/audit/AuditTable
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuditPivot } from '@/lib/audit-pivot';
import type { AuditLogRow } from '@/lib/audit-api';

/** Fixed row height, viewport height, and overscan for the windowing. */
const ROW_H = 44;
const VIEWPORT = 440;
const OVERSCAN = 4;

/** Keys that would indicate a leaked secret in an audit row. */
const SECRET_KEY_RE = /token|secret|password|otp|recovery|ticket|\bcode\b/i;

/** Recursively inspect a value for any secret-shaped key at any depth. */
function valueContainsSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(valueContainsSecret);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([k, v]) => SECRET_KEY_RE.test(k) || valueContainsSecret(v),
    );
  }
  return false;
}

/**
 * True when the row's detail payload contains any secret-shaped key at ANY
 * depth (top-level, nested object, or inside an array element).
 */
export function containsSecret(details: Record<string, unknown>): boolean {
  return valueContainsSecret(details);
}

/** Recursively redact all secret-keyed fields in a value. */
function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_RE.test(key) ? '<redacted>' : redactValue(v);
    }
    return out;
  }
  return value;
}

/**
 * Defense-in-depth redaction: the backend already masks audit rows, but if a
 * secret-shaped key ever slips through at any nesting depth, its value is
 * replaced before display so the drawer never renders a real secret.
 */
function redactDetails(details: Record<string, unknown>): Record<string, unknown> {
  return redactValue(details) as Record<string, unknown>;
}

/** Props for {@link AuditTable}. */
export interface AuditTableProps {
  /** All rows to render (page + live tail), in order. */
  readonly rows: readonly AuditLogRow[];
  /** Whether the tail is pinned to the latest rows. */
  readonly following: boolean;
  /** Rows buffered while paused. */
  readonly pendingCount: number;
  /** Change the follow state (scroll / pill). */
  readonly onFollowChange: (following: boolean) => void;
}

/** Format an ISO timestamp as a stable UTC `HH:MM:SS`. */
function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(11, 19);
}

/** The row detail drawer body with the no-secrets proof. */
function RowDetail({ row }: { readonly row: AuditLogRow }) {
  const leaked = containsSecret(row.details);
  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-mono">{row.event}</DialogTitle>
        <DialogDescription>
          {row.actor} · {row.ip}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        {leaked ? (
          <Badge variant="destructive" className="w-fit gap-1">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Secret-shaped key present
          </Badge>
        ) : (
          <Badge variant="outline" className="w-fit gap-1 text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            No token, code, or secret in this row
          </Badge>
        )}
        <pre className="bg-(--glass-bg) max-h-64 overflow-auto rounded-md p-3 font-mono text-xs text-foreground">
          {JSON.stringify(leaked ? redactDetails(row.details) : row.details, null, 2)}
        </pre>
      </div>
    </>
  );
}

/** The virtualized, faceted audit table. */
export function AuditTable({ rows, following, pendingCount, onFollowChange }: AuditTableProps) {
  const { actor, event } = useAuditPivot();
  const [scrollTop, setScrollTop] = useState(0);
  const [selected, setSelected] = useState<AuditLogRow | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = rows.filter(
    (row) => (actor === null || row.actor === actor) && (event === null || row.event === event),
  );

  const maxTop = Math.max(0, filtered.length * ROW_H - VIEWPORT);

  // Follow-mode pins the view to the newest rows: scroll the actual container to the bottom
  // (the windowing math alone does not move the DOM) and keep `scrollTop` in sync so a later
  // unfollow resumes from the right place. New rows grow `maxTop`, re-pinning to the latest.
  useEffect(() => {
    if (!following) return;
    const el = scrollRef.current;
    if (el === null) return;
    el.scrollTop = maxTop;
    setScrollTop(maxTop);
  }, [following, maxTop]);

  if (filtered.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No events yet — fire something in the Trigger Center.
      </p>
    );
  }

  const effectiveTop = following ? maxTop : scrollTop;
  const start = Math.max(0, Math.floor(effectiveTop / ROW_H) - OVERSCAN);
  const windowCount = Math.ceil(VIEWPORT / ROW_H) + OVERSCAN * 2;
  const end = Math.min(filtered.length, start + windowCount);
  const windowRows = filtered.slice(start, end);

  function handleScroll(event_: React.UIEvent<HTMLDivElement>): void {
    const top = event_.currentTarget.scrollTop;
    setScrollTop(top);
    onFollowChange(top >= maxTop - ROW_H);
  }

  return (
    <div className="relative">
      {!following && pendingCount > 0 && (
        <Button
          size="sm"
          className="absolute left-1/2 top-2 z-10 -translate-x-1/2"
          onClick={() => onFollowChange(true)}
        >
          {pendingCount} new — jump to latest
        </Button>
      )}

      <div className="grid grid-cols-[88px_1fr_1fr_120px] gap-2 border-b border-(--glass-border) px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>Time</span>
        <span>Event</span>
        <span>Actor</span>
        <span>IP</span>
      </div>

      <div
        ref={scrollRef}
        className="overflow-auto"
        style={{ height: VIEWPORT }}
        onScroll={handleScroll}
        data-testid="audit-scroll"
      >
        <div style={{ height: filtered.length * ROW_H, position: 'relative' }}>
          <div style={{ position: 'absolute', top: start * ROW_H, left: 0, right: 0 }}>
            {windowRows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelected(row)}
                style={{ height: ROW_H }}
                className="grid w-full grid-cols-[88px_1fr_1fr_120px] items-center gap-2 border-b border-(--glass-border) px-4 text-left text-sm transition-colors hover:bg-(--glass-bg)"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {formatTime(row.createdAt)}
                </span>
                <span className="truncate font-mono">{row.event}</span>
                <span className="truncate text-muted-foreground">{row.actor}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{row.ip}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={selected !== null} onOpenChange={() => setSelected(null)}>
        <DialogContent>{selected !== null && <RowDetail row={selected} />}</DialogContent>
      </Dialog>
    </div>
  );
}
