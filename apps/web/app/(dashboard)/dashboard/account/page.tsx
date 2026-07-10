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

/** The dev-only diagnostics API is unavailable in a production build. */
const DEV_TOOLING = process.env.NODE_ENV !== 'production';

/** One labelled profile field in a definition list. */
function Field({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-xs text-[rgba(255,255,255,0.4)]">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm text-[rgba(255,255,255,0.8)]">{value}</dd>
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
    <div className="flex flex-col gap-8">
      {/* ── Page header ── */}
      <div>
        <h1 className="font-mono text-2xl font-bold text-white">Account</h1>
        <p className="mt-1 text-sm text-[rgba(255,255,255,0.5)]">
          Your profile and the server-only diagnostics.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ── Identity ── */}
        <section
          aria-labelledby="identity-heading"
          className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6"
        >
          <h2
            id="identity-heading"
            className="mb-4 font-mono text-sm font-semibold uppercase tracking-widest text-[rgba(255,255,255,0.4)]"
          >
            Identity
          </h2>

          <dl className="space-y-3">
            <div>
              <dt className="text-xs text-[rgba(255,255,255,0.4)]">Name</dt>
              <dd className="mt-0.5 text-sm text-[rgba(255,255,255,0.85)]">{user.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-[rgba(255,255,255,0.4)]">Email</dt>
              <dd className="mt-0.5 font-mono text-sm text-[rgba(255,255,255,0.8)]">
                {user.email}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[rgba(255,255,255,0.4)]">Role</dt>
              <dd className="mt-0.5">
                <span className="inline-flex items-center rounded-full border border-[rgba(255,98,36,0.25)] bg-[rgba(255,98,36,0.12)] px-2 py-0.5">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[#ff6224]">
                    {user.role}
                  </span>
                </span>
              </dd>
            </div>
            <Field label="Tenant" value={user.tenantId} />
            <Field label="User ID" value={user.id} />
          </dl>
        </section>

        {/* ── Status ── */}
        <section
          aria-labelledby="status-heading"
          className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6"
        >
          <h2
            id="status-heading"
            className="mb-4 font-mono text-sm font-semibold uppercase tracking-widest text-[rgba(255,255,255,0.4)]"
          >
            Status
          </h2>

          <dl className="space-y-3">
            <div>
              <dt className="text-xs text-[rgba(255,255,255,0.4)]">Two-factor authentication</dt>
              <dd className="mt-1">
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
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[rgba(255,255,255,0.4)]">Email</dt>
              <dd className="mt-1">
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
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-widest text-[rgba(255,255,255,0.4)]">
          Diagnostics
        </h2>
        {DEV_TOOLING ? (
          <DiagnosticsMatrix />
        ) : (
          <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6 text-sm text-[rgba(255,255,255,0.5)]">
            The diagnostics API is development-only, matching the backend.
          </div>
        )}
      </div>
    </div>
  );
}
