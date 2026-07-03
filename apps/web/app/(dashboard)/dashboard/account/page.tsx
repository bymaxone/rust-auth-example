/**
 * @fileoverview `/dashboard/account` — the profile + Diagnostics.
 *
 * Renders the `me` card from the session and the Diagnostics matrix (hash
 * strength, lockout, hook log, delivery mode, and the server-only token
 * inspector). Gated by `useSession`.
 *
 * @module app/(dashboard)/dashboard/account/page
 */

'use client';

import Link from 'next/link';
import { useSession } from '@bymax-one/rust-auth/react';
import { BadgeCheck, ShieldCheck, ShieldOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DiagnosticsMatrix } from '@/components/account/DiagnosticsMatrix';

/** One labelled profile field. */
function Field({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-sm text-foreground">{value}</span>
    </div>
  );
}

/** The Account + Diagnostics page. */
export default function AccountPage(): React.ReactElement {
  const { user, status } = useSession();

  if (status === 'loading') {
    return (
      <div
        className="h-40 w-full animate-pulse rounded-2xl bg-muted"
        role="status"
        aria-label="Loading"
      />
    );
  }

  if (status === 'unauthenticated' || user === null) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader accent>
          <CardTitle>Account</CardTitle>
          <CardDescription>Sign in to view your profile.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/auth/login">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-mono text-2xl font-bold">Account</h1>
        <p className="text-sm text-muted-foreground">
          Your profile and the server-only diagnostics.
        </p>
      </div>

      <Card>
        <CardHeader accent>
          <CardTitle className="text-base">{user.name}</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Role" value={user.role} />
          <Field label="Tenant" value={user.tenantId} />
          <Field label="User id" value={user.id} />
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">MFA</span>
            {user.mfaEnabled ? (
              <Badge variant="outline" className="w-fit gap-1 text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                enabled
              </Badge>
            ) : (
              <Badge variant="outline" className="w-fit gap-1 text-amber-400">
                <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                off
              </Badge>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Email</span>
            {user.emailVerified ? (
              <Badge variant="outline" className="w-fit gap-1 text-emerald-400">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                verified
              </Badge>
            ) : (
              <Badge variant="outline" className="w-fit text-amber-400">
                unverified
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="font-mono text-lg font-semibold">Diagnostics</h2>
        <DiagnosticsMatrix />
      </div>
    </section>
  );
}
