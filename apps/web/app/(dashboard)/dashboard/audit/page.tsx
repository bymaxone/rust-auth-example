/**
 * @fileoverview `/dashboard/audit` — the Audit Explorer.
 *
 * Loads a keyset page of `GET /audit/logs`, then tails `GET /audit/stream` live
 * (follow-mode). The virtualized table is faceted by the shared `actor`/`event`
 * pivot state (the Trigger Center writes to it), and the detail drawer renders the
 * never-contains-secrets proof. A Live toggle pauses/resumes the stream.
 *
 * @module app/(dashboard)/dashboard/audit/page
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AuditTable } from '@/components/audit/AuditTable';
import { useAuditTail } from '@/hooks/use-audit-tail';
import { useAuditPivot } from '@/lib/audit-pivot';
import { fetchAuditPage, type AuditLogRow } from '@/lib/audit-api';

/** The dev-only audit/diagnostics APIs are unavailable in a production build. */
const DEV_TOOLING = process.env.NODE_ENV !== 'production';

/** The Audit Explorer page. */
export default function AuditPage(): React.ReactElement {
  const { actor, event, pivotTo } = useAuditPivot();
  const [live, setLive] = useState(true);
  const [pageRows, setPageRows] = useState<readonly AuditLogRow[]>([]);
  const [loadError, setLoadError] = useState(false);
  const tail = useAuditTail(DEV_TOOLING && live);

  const load = useCallback(async (): Promise<void> => {
    setLoadError(false);
    try {
      const page = await fetchAuditPage({ limit: 50 });
      setPageRows(page.data);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (DEV_TOOLING) void load();
  }, [load]);

  if (!DEV_TOOLING) {
    return (
      <section className="flex flex-col gap-8">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-[#ff6224]" aria-hidden="true" />
          <h1 className="font-mono text-2xl font-bold text-white">Audit Explorer</h1>
        </div>
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6 text-sm text-[rgba(255,255,255,0.5)]">
          The audit read API is development-only, matching the backend. Run the stack in the
          development environment to explore the hook-event stream here.
        </div>
      </section>
    );
  }

  const rows = [...pageRows, ...tail.rows];
  const hasFacet = actor !== null || event !== null;

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-[#ff6224]" aria-hidden="true" />
            <h1 className="font-mono text-2xl font-bold text-white">Audit Explorer</h1>
          </div>
          <p className="mt-1 text-sm text-[rgba(255,255,255,0.5)]">
            Every auth lifecycle event — masked, keyset-paged, and tailed live via{' '}
            <code className="rounded bg-[rgba(255,255,255,0.05)] px-1 text-xs">/audit/stream</code>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasFacet && (
            <Button variant="ghost" size="sm" onClick={() => pivotTo({})}>
              Clear filters
            </Button>
          )}
          <Button
            variant={live ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLive((v) => !v)}
          >
            {live ? 'Live' : 'Paused'}
          </Button>
        </div>
      </div>

      {hasFacet && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-[rgba(255,255,255,0.5)]">
          Filtering
          {actor !== null && (
            <Badge variant="outline" className="font-mono">
              actor: {actor}
            </Badge>
          )}
          {event !== null && (
            <Badge variant="outline" className="font-mono">
              event: {event}
            </Badge>
          )}
        </div>
      )}

      {loadError && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6">
          <p className="text-sm text-[rgba(255,255,255,0.5)]">The audit log could not be loaded.</p>
          <Button variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]">
        <AuditTable
          rows={rows}
          following={tail.following}
          pendingCount={tail.pendingCount}
          onFollowChange={tail.setFollowing}
        />
      </div>
    </section>
  );
}
