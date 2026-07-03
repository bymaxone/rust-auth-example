/**
 * @fileoverview `/` — the auth-health Overview.
 *
 * Auth health at a glance: login/verify success rates, the active-session count,
 * the MFA-enrolled share, and the configured providers, sourced from the
 * example-owned `GET /audit/aggregate`. Gated by `useSession`: unauthenticated
 * visitors see a sign-in prompt, the load shows skeleton cards, and a failed
 * fetch renders a retry affordance. Every value carries colour + icon + label.
 *
 * @module app/(dashboard)/page
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@bymax-one/rust-auth/react';
import { CheckCircle2, KeyRound, MonitorSmartphone, ScrollText, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HealthCard } from '@/components/overview/HealthCard';
import { ProviderChips } from '@/components/overview/ProviderChips';
import { fetchAuditAggregate, type AuditAggregate } from '@/lib/audit-aggregate';

/** The aggregate load lifecycle. */
type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly data: AuditAggregate };

/** Format a `0..1` rate as a whole-number percentage. */
function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** A pulsing skeleton grid shown while the aggregate loads. */
function SkeletonGrid(): React.ReactElement {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" aria-hidden="true" />
      ))}
    </div>
  );
}

/** The auth-health Overview page. */
export default function OverviewPage(): React.ReactElement {
  const { status } = useSession();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' });
    try {
      const data = await fetchAuditAggregate();
      setState({ kind: 'ready', data });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') void load();
  }, [status, load]);

  if (status === 'unauthenticated') {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader accent>
          <CardTitle>Overview</CardTitle>
          <CardDescription>Sign in to populate the auth-health dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/auth/login">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (status === 'loading' || state.kind === 'loading') {
    return (
      <section className="flex flex-col gap-6">
        <h1 className="font-mono text-2xl font-bold">Overview</h1>
        <SkeletonGrid />
      </section>
    );
  }

  if (state.kind === 'error') {
    return (
      <section className="flex flex-col gap-6">
        <h1 className="font-mono text-2xl font-bold">Overview</h1>
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-muted-foreground">
              The auth-health aggregate could not be loaded.
            </p>
            <Button variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const a = state.data;
  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-mono text-2xl font-bold">Overview</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HealthCard
          label="Login success"
          value={pct(a.loginSuccessRate)}
          icon={CheckCircle2}
          tone={a.loginSuccessRate >= 0.9 ? 'positive' : 'warning'}
        />
        <HealthCard
          label="Verify success"
          value={pct(a.verifySuccessRate)}
          icon={ShieldCheck}
          tone={a.verifySuccessRate >= 0.9 ? 'positive' : 'warning'}
        />
        <HealthCard
          label="Active sessions"
          value={String(a.activeSessions)}
          icon={MonitorSmartphone}
          tone="info"
        />
        <HealthCard
          label="MFA enrolled"
          value={pct(a.mfaEnrolledShare)}
          icon={KeyRound}
          tone={a.mfaEnrolledShare >= 0.5 ? 'positive' : 'neutral'}
        />
      </div>

      <ProviderChips emailProvider={a.emailProvider} oauthGoogleEnabled={a.oauthGoogleEnabled} />

      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            Recent auth events stream live in the Audit Explorer.
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/audit">Open the audit tail</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
