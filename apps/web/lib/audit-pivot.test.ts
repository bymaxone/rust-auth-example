/**
 * @fileoverview Tests for the shared Audit pivot hook.
 *
 * Covers: it reflects the current actor/event facets, reads each facet under its
 * exact query key, writes both keys (or clears them) when pivoting, and rebuilds
 * its `pivotTo` setter when the underlying query-state setters change identity.
 *
 * @module lib/audit-pivot.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const state = vi.hoisted(() => {
  const setActor = vi.fn();
  const setEvent = vi.fn();
  // `actorSetter` / `eventSetter` are the setters the mock currently hands back;
  // a test can swap them to force a dependency change across a rerender.
  return { setActor, setEvent, actorSetter: setActor, eventSetter: setEvent };
});

vi.mock('nuqs', () => ({
  useQueryState: (key: string) => {
    if (key === 'actor') return ['actor-val', state.actorSetter];
    if (key === 'event') return ['event-val', state.eventSetter];
    return [null, () => undefined];
  },
}));

import { useAuditPivot } from './audit-pivot';

beforeEach(() => {
  vi.clearAllMocks();
  state.actorSetter = state.setActor;
  state.eventSetter = state.setEvent;
});

describe('useAuditPivot', () => {
  it('exposes the current actor and event facets read under their exact keys', () => {
    // The hook reflects the URL-backed facets so a reload reproduces the view; each
    // facet must be read under its own 'actor' / 'event' key, not a shared blank one.
    const { result } = renderHook(() => useAuditPivot());
    expect(result.current.actor).toBe('actor-val');
    expect(result.current.event).toBe('event-val');
  });

  it('writes both facets when pivoting to a target', () => {
    // Firing a Trigger card must set the actor + event the Audit table reads.
    const { result } = renderHook(() => useAuditPivot());
    act(() => {
      result.current.pivotTo({ actor: 'user-9', event: 'on_login' });
    });
    expect(state.setActor).toHaveBeenCalledWith('user-9');
    expect(state.setEvent).toHaveBeenCalledWith('on_login');
  });

  it('clears a facet that is omitted from the target', () => {
    // Omitting a facet resets it to null so stale filters do not linger.
    const { result } = renderHook(() => useAuditPivot());
    act(() => {
      result.current.pivotTo({ event: 'on_logout' });
    });
    expect(state.setActor).toHaveBeenCalledWith(null);
    expect(state.setEvent).toHaveBeenCalledWith('on_logout');
  });

  it('clears the event facet when only an actor is given', () => {
    // Pivoting on actor alone must reset the event filter to null.
    const { result } = renderHook(() => useAuditPivot());
    act(() => {
      result.current.pivotTo({ actor: 'user-1' });
    });
    expect(state.setActor).toHaveBeenCalledWith('user-1');
    expect(state.setEvent).toHaveBeenCalledWith(null);
  });

  it('rebuilds pivotTo when the query-state setters change identity', () => {
    // pivotTo memoizes on its setter dependencies: a rerender with fresh setters must
    // yield a new callback, so the setter it closes over never goes stale.
    const { result, rerender } = renderHook(() => useAuditPivot());
    const first = result.current.pivotTo;
    state.actorSetter = vi.fn();
    state.eventSetter = vi.fn();
    rerender();
    expect(result.current.pivotTo).not.toBe(first);
  });
});
