/**
 * @fileoverview The sessions device-manager table.
 *
 * Renders device / IP / last-activity / an `isCurrent` pill / a revoke action.
 * The current session is pinned to the top with an orange glow border and cannot
 * be revoked from here. Composes the design-system `Table`/`Button`.
 *
 * @module components/sessions/SessionsTable
 */

'use client';

import { Monitor, Trash2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SessionInfo } from '@/lib/sessions-api';

/** Props for {@link SessionsTable}. */
export interface SessionsTableProps {
  /** The sessions to render. */
  readonly sessions: readonly SessionInfo[];
  /** Revoke a session by id. */
  readonly onRevoke: (id: string) => void;
  /** The id currently being revoked (its button is disabled), or `null`. */
  readonly revokingId: string | null;
}

/** Format an ISO timestamp as a stable UTC `YYYY-MM-DD HH:MM`. */
function formatActivity(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

/** The device-manager table, current session pinned first. */
export function SessionsTable({ sessions, onRevoke, revokingId }: SessionsTableProps) {
  const ordered = [...sessions].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Device</TableHead>
          <TableHead>IP</TableHead>
          <TableHead>Last activity</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordered.map((session) => (
          <TableRow
            key={session.id}
            className={cn(
              session.isCurrent && 'border border-[rgba(255,98,36,0.3)] bg-[rgba(255,98,36,0.06)]',
            )}
          >
            <TableCell>
              <div className="flex items-center gap-2 text-foreground">
                <Monitor className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {session.device}
                {session.isCurrent && (
                  <span className="inline-flex items-center rounded-full border border-[rgba(255,98,36,0.25)] bg-[rgba(255,98,36,0.12)] px-2 py-0.5">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[#ff6224]">
                      current
                    </span>
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell className="font-mono">{session.ip}</TableCell>
            <TableCell className="font-mono text-xs">
              {formatActivity(session.lastActivity)}
            </TableCell>
            <TableCell className="text-right">
              {session.isCurrent ? (
                <span className="text-xs text-muted-foreground">This device</span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Revoke session ${session.id}`}
                  disabled={revokingId === session.id}
                  onClick={() => onRevoke(session.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  Revoke
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
