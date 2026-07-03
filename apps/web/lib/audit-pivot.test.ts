/**
 * @fileoverview Tests for the shared Audit pivot hook.
 *
 * Covers: it reflects the current actor/event facets and writes both keys (or
 * clears them) when pivoting.
 *
 * @module lib/audit-pivot.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const setActor = vi.hoisted(() => vi.fn());
const setEvent = vi.hoisted(() => vi.fn());

vi.mock('nuqs', () => ({
  useQueryState: (key: string) =>
    key === 'actor' ? ['actor-val', setActor] : ['event-val', setEvent],
}));

import { useAuditPivot } from './audit-pivot';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAuditPivot', () => {
  it('exposes the current actor and event facets', () => {
    // The hook reflects the URL-backed facets so a reload reproduces the view.
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
    expect(setActor).toHaveBeenCalledWith('user-9');
    expect(setEvent).toHaveBeenCalledWith('on_login');
  });

  it('clears a facet that is omitted from the target', () => {
    // Omitting a facet resets it to null so stale filters do not linger.
    const { result } = renderHook(() => useAuditPivot());
    act(() => {
      result.current.pivotTo({ event: 'on_logout' });
    });
    expect(setActor).toHaveBeenCalledWith(null);
    expect(setEvent).toHaveBeenCalledWith('on_logout');
  });

  it('clears the event facet when only an actor is given', () => {
    // Pivoting on actor alone must reset the event filter to null.
    const { result } = renderHook(() => useAuditPivot());
    act(() => {
      result.current.pivotTo({ actor: 'user-1' });
    });
    expect(setActor).toHaveBeenCalledWith('user-1');
    expect(setEvent).toHaveBeenCalledWith(null);
  });
});
