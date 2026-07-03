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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { InviteForm } from '@/components/invitations/InviteForm';
import { AcceptedInvitations } from '@/components/invitations/AcceptedInvitations';

/** The Invitations admin page. */
export default function InvitationsPage(): React.ReactElement {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-mono text-2xl font-bold">Invitations</h1>
        <p className="text-sm text-muted-foreground">Invite a teammate to this tenant.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite a teammate</CardTitle>
            <CardDescription>
              The tenant is taken from your session — no tenant id is sent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm onInvited={() => setRefreshKey((k) => k + 1)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accepted invitations</CardTitle>
            <CardDescription>
              Creation is not audited; each accepted invite links the Mailpit inbox.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AcceptedInvitations refreshKey={refreshKey} />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
