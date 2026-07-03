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
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AuditTable } from '@/components/audit/AuditTable';
import { useAuditTail } from '@/hooks/use-audit-tail';
import { useAuditPivot } from '@/lib/audit-pivot';
import { fetchAuditPage, type AuditLogRow } from '@/lib/audit-api';

/** The Audit Explorer page. */
export default function AuditPage(): React.ReactElement {
  const { actor, event, pivotTo } = useAuditPivot();
  const [live, setLive] = useState(true);
  const [pageRows, setPageRows] = useState<readonly AuditLogRow[]>([]);
  const [loadError, setLoadError] = useState(false);
  const tail = useAuditTail(live);

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
    void load();
  }, [load]);

  const rows = [...pageRows, ...tail.rows];
  const hasFacet = actor !== null || event !== null;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-mono text-2xl font-bold">Audit Explorer</h1>
          <p className="text-sm text-muted-foreground">
            Every auth lifecycle event — masked, keyset-paged, and tailed live.
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
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
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
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-muted-foreground">The audit log could not be loaded.</p>
            <Button variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <AuditTable
            rows={rows}
            following={tail.following}
            pendingCount={tail.pendingCount}
            onFollowChange={tail.setFollowing}
          />
        </CardContent>
      </Card>
    </section>
  );
}
