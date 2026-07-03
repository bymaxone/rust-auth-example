/**
 * @fileoverview The pending-invitations list, sourced from the dev audit trail.
 *
 * Reads invitation-created events from `GET /audit/logs` and lists each invitee
 * with a link to the Mailpit inbox where the invitation email lands. Shows a
 * skeleton while loading, an action-oriented empty state, and re-fetches whenever
 * `refreshKey` changes (e.g. after a new invite is sent).
 *
 * @module components/invitations/PendingList
 */

'use client';

import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listPendingInvitations, type PendingInvitation } from '@/lib/invitations-api';

/** Where invitation emails land locally. */
const MAILPIT_URL = 'http://localhost:8025';

/** The load lifecycle for the pending list. */
type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly rows: readonly PendingInvitation[] };

/** Props for {@link PendingList}. */
export interface PendingListProps {
  /** Bumping this value re-fetches the list. */
  readonly refreshKey: number;
}

/** The pending-invitations list. */
export function PendingList({ refreshKey }: PendingListProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    setState({ kind: 'loading' });
    listPendingInvitations()
      .then((rows) => setState({ kind: 'ready', rows }))
      .catch(() => setState({ kind: 'error' }));
  }, [refreshKey]);

  if (state.kind === 'loading') {
    return (
      <div
        className="h-24 w-full animate-pulse rounded-2xl bg-muted"
        role="status"
        aria-label="Loading"
      />
    );
  }

  if (state.kind === 'error') {
    return (
      <p className="text-sm text-muted-foreground">Pending invitations could not be loaded.</p>
    );
  }

  if (state.rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No pending invites — send one above to see it here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" aria-label="Pending invitations">
      {state.rows.map((invite) => (
        <li
          key={`${invite.email}-${invite.sentAt}`}
          className="border-(--glass-border) flex items-center justify-between gap-3 rounded-lg border px-4 py-2"
        >
          <div className="flex flex-col">
            <span className="font-mono text-sm text-foreground">{invite.email}</span>
            {invite.role !== undefined && (
              <span className="text-xs text-muted-foreground">{invite.role}</span>
            )}
          </div>
          <Button asChild variant="ghost" size="sm">
            <a href={MAILPIT_URL} target="_blank" rel="noreferrer">
              <Mail className="h-4 w-4" />
              Open in Mailpit
            </a>
          </Button>
        </li>
      ))}
    </ul>
  );
}
