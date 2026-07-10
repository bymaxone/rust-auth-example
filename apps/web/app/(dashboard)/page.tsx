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

/** Per-tile accent colours for the KPI grid, one per column. */
const ACCENT_ORANGE = '#ff6224';
const ACCENT_BLUE = '#06b6d4';
const ACCENT_GREEN = '#10b981';
const ACCENT_PURPLE = '#8b5cf6';

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
        <div
          key={i}
          className="h-28 animate-pulse rounded-xl bg-[rgba(255,255,255,0.05)]"
          aria-hidden="true"
        />
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
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="font-mono text-2xl font-bold text-white">Overview</h1>
          <p className="mt-1 text-sm text-[rgba(255,255,255,0.5)]">
            Auth health at a glance — success rates, sessions, and configured providers.
          </p>
        </div>
        <SkeletonGrid />
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="font-mono text-2xl font-bold text-white">Overview</h1>
          <p className="mt-1 text-sm text-[rgba(255,255,255,0.5)]">
            Auth health at a glance — success rates, sessions, and configured providers.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6">
          <p className="text-sm text-[rgba(255,255,255,0.5)]">
            The auth-health aggregate could not be loaded.
          </p>
          <Button variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const a = state.data;
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-mono text-2xl font-bold text-white">Overview</h1>
        <p className="mt-1 text-sm text-[rgba(255,255,255,0.5)]">
          Auth health at a glance — success rates, sessions, and configured providers.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HealthCard
          label="Login success"
          value={pct(a.loginSuccessRate)}
          icon={CheckCircle2}
          accent={ACCENT_ORANGE}
        />
        <HealthCard
          label="Verify success"
          value={pct(a.verifySuccessRate)}
          icon={ShieldCheck}
          accent={ACCENT_BLUE}
        />
        <HealthCard
          label="Active sessions"
          value={String(a.activeSessions)}
          icon={MonitorSmartphone}
          accent={ACCENT_GREEN}
        />
        <HealthCard
          label="MFA enrolled"
          value={pct(a.mfaEnrolledShare)}
          icon={KeyRound}
          accent={ACCENT_PURPLE}
        />
      </div>

      <ProviderChips emailProvider={a.emailProvider} oauthGoogleEnabled={a.oauthGoogleEnabled} />

      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-[rgba(255,255,255,0.5)]">
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            Recent auth events stream live in the Audit Explorer.
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/audit">Open the audit tail</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
