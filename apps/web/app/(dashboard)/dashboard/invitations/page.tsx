/**
 * @fileoverview `/dashboard/invitations` — the invitations admin views.
 *
 * Composes the invite form and the accepted-invitations list. Sending an invitation
 * bumps a refresh key so the list re-fetches from the audit trail.
 *
 * @module app/(dashboard)/dashboard/invitations/page
 */

'use client';

import { useState } from 'react';
import { InviteForm } from '@/components/invitations/InviteForm';
import { AcceptedInvitations } from '@/components/invitations/AcceptedInvitations';

/** The Invitations admin page. */
export default function InvitationsPage(): React.ReactElement {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <section className="flex flex-col gap-8">
      <div>
        <h1 className="font-mono text-2xl font-bold text-white">Invitations</h1>
        <p className="mt-1 text-sm text-[rgba(255,255,255,0.5)]">
          Invite a teammate to this tenant.
        </p>
      </div>

      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6">
        <h2 className="mb-1 font-mono text-sm font-semibold uppercase tracking-widest text-[rgba(255,255,255,0.4)]">
          Send invitation
        </h2>
        <p className="mb-4 text-xs text-[rgba(255,255,255,0.35)]">
          The tenant is taken from your session — no tenant id is sent.
        </p>
        <InviteForm onInvited={() => setRefreshKey((k) => k + 1)} />
      </div>

      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6">
        <h2 className="mb-1 font-mono text-sm font-semibold uppercase tracking-widest text-[rgba(255,255,255,0.4)]">
          Accepted invitations
        </h2>
        <p className="mb-4 text-xs text-[rgba(255,255,255,0.35)]">
          Creation is not audited; each accepted invite links the Mailpit inbox.
        </p>
        <AcceptedInvitations refreshKey={refreshKey} />
      </div>
    </section>
  );
}
