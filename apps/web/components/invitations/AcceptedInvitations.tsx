/**
 * @fileoverview The accepted-invitations list, sourced from the dev audit trail.
 *
 * Invitation *creation* is not audited, so this lists the invitations that have been
 * **accepted** — read from `GET /audit/logs` (`after_invitation_accepted`) — with a
 * link to the Mailpit inbox where the invitation email landed. Shows a skeleton while
 * loading, an action-oriented empty state, and re-fetches whenever `refreshKey`
 * changes (e.g. after a new invite is sent).
 *
 * @module components/invitations/AcceptedInvitations
 */

'use client';

import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listAcceptedInvitations, type AcceptedInvitation } from '@/lib/invitations-api';

/** Where invitation emails land locally. */
const MAILPIT_URL = 'http://localhost:8025';

/** The load lifecycle for the accepted list. */
type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly rows: readonly AcceptedInvitation[] };

/** Props for {@link AcceptedInvitations}. */
export interface AcceptedInvitationsProps {
  /** Bumping this value re-fetches the list. */
  readonly refreshKey: number;
}

/** The accepted-invitations list. */
export function AcceptedInvitations({ refreshKey }: AcceptedInvitationsProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    setState({ kind: 'loading' });
    listAcceptedInvitations()
      .then((rows) => setState({ kind: 'ready', rows }))
      .catch(() => setState({ kind: 'error' }));
  }, [refreshKey]);

  if (state.kind === 'loading') {
    return (
      <div
        className="h-24 w-full animate-pulse rounded-xl bg-[rgba(255,255,255,0.03)]"
        role="status"
        aria-label="Loading"
      />
    );
  }

  if (state.kind === 'error') {
    return (
      <p className="text-sm text-[rgba(255,255,255,0.5)]">
        Accepted invitations could not be loaded.
      </p>
    );
  }

  if (state.rows.length === 0) {
    return (
      <p className="text-sm text-[rgba(255,255,255,0.5)]">
        No accepted invitations yet — invite a teammate above, then accept it to see it here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" aria-label="Accepted invitations">
      {state.rows.map((invite) => (
        <li
          key={`${invite.email}-${invite.acceptedAt}`}
          className="flex items-center justify-between gap-3 rounded-lg border border-[rgba(255,255,255,0.08)] px-4 py-2"
        >
          <div className="flex flex-col">
            <span className="font-mono text-sm text-white">{invite.email}</span>
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
