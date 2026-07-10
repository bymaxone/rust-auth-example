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

/**
 * Colour ramp by event-slug prefix. Keeps the visual taxonomy lightweight — an
 * operator glances at the live tail and immediately sees clusters of logins,
 * registrations, MFA changes, password resets, and session events.
 */
const PREFIX_STYLES: ReadonlyArray<{ readonly prefix: string; readonly className: string }> = [
  { prefix: 'after_login_failed', className: 'border-red-500/30 bg-red-500/10 text-red-300' },
  { prefix: 'after_login', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  { prefix: 'after_logout', className: 'border-sky-500/30 bg-sky-500/10 text-sky-300' },
  { prefix: 'after_register', className: 'border-violet-500/30 bg-violet-500/10 text-violet-300' },
  { prefix: 'mfa', className: 'border-orange-500/30 bg-orange-500/10 text-orange-300' },
  { prefix: 'password', className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  { prefix: 'session', className: 'border-blue-500/30 bg-blue-500/10 text-blue-300' },
  { prefix: 'invitation', className: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300' },
  { prefix: 'email', className: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' },
];

const DEFAULT_PILL_STYLE =
  'border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.6)]';

/**
 * Returns the Tailwind class string for an event-slug pill. Falls back to a
 * neutral grey when no prefix matches, so a future event slug still renders
 * cleanly without code changes.
 */
function pillStyleForEvent(event: string): string {
  const match = PREFIX_STYLES.find((entry) => event.startsWith(entry.prefix));
  return match?.className ?? DEFAULT_PILL_STYLE;
}

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
        <pre className="max-h-64 overflow-auto rounded-md bg-[rgba(0,0,0,0.4)] p-3 font-mono text-xs text-foreground">
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
      <p className="p-6 text-sm text-[rgba(255,255,255,0.5)]">
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

      <div className="grid grid-cols-[88px_1fr_1fr_120px] gap-2 border-b border-(--glass-border) px-4 py-2 text-xs font-medium uppercase tracking-wide text-[rgba(255,255,255,0.4)]">
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
                <span className="font-mono text-xs text-[rgba(255,255,255,0.5)]">
                  {formatTime(row.createdAt)}
                </span>
                <span className="flex min-w-0 items-center">
                  <span
                    className={`truncate rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${pillStyleForEvent(row.event)}`}
                  >
                    {row.event}
                  </span>
                </span>
                <span className="truncate text-[rgba(255,255,255,0.6)]">{row.actor}</span>
                <span className="truncate font-mono text-xs text-[rgba(255,255,255,0.5)]">
                  {row.ip}
                </span>
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
