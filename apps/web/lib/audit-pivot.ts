/**
 * @fileoverview Shared `nuqs` state linking the Trigger Center to the Audit table.
 *
 * When a Trigger card fires, it pivots the Audit Explorer to the resulting row by
 * writing the `actor` / `event` facets into the URL. The Audit Explorer reads the
 * same two query keys, so a fired action, a reload, and a shared link all land on
 * the same filtered view.
 *
 * @module lib/audit-pivot
 */

'use client';

import { useCallback } from 'react';
import { useQueryState } from 'nuqs';

/** The facets a pivot targets. */
export interface AuditPivotTarget {
  /** The actor (user id / email) to filter the Audit table by. */
  readonly actor?: string;
  /** The event name to filter the Audit table by. */
  readonly event?: string;
}

/** The value returned by {@link useAuditPivot}. */
export interface UseAuditPivot {
  /** The current actor facet, or `null` when unset. */
  readonly actor: string | null;
  /** The current event facet, or `null` when unset. */
  readonly event: string | null;
  /** Point the Audit table at a given actor/event. */
  readonly pivotTo: (target: AuditPivotTarget) => void;
}

/**
 * Read and write the shared Audit `actor` / `event` facets in the URL.
 *
 * @returns The current facets plus a `pivotTo` setter.
 */
export function useAuditPivot(): UseAuditPivot {
  const [actor, setActor] = useQueryState('actor');
  const [event, setEvent] = useQueryState('event');

  const pivotTo = useCallback(
    (target: AuditPivotTarget): void => {
      void setActor(target.actor ?? null);
      void setEvent(target.event ?? null);
    },
    [setActor, setEvent],
  );

  return { actor, event, pivotTo };
}
