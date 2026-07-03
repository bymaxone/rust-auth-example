/**
 * @fileoverview Tests for the live audit tail hook.
 *
 * Covers: the SSE stream opens over the cookie session (no JWT), appends rows,
 * buffers a pending count while paused, resets on resume, ignores malformed
 * frames, does not open when disabled, and closes on unmount.
 *
 * @module hooks/use-audit-tail.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/** A minimal EventSource double. */
class MockEventSource {
  static instances: MockEventSource[] = [];
  readonly url: string;
  readonly init: EventSourceInit | undefined;
  closed = false;
  private readonly listeners = new Map<string, ((ev: MessageEvent<string>) => void)[]>();
  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.init = init;
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: (ev: MessageEvent<string>) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(cb);
    this.listeners.set(type, list);
  }
  close(): void {
    this.closed = true;
  }
  emit(data: string): void {
    for (const cb of this.listeners.get('message') ?? []) cb({ data } as MessageEvent<string>);
  }
}

import { useAuditTail } from './use-audit-tail';

function row(id: string): string {
  return JSON.stringify({
    id,
    actor: 'a',
    event: 'e',
    tenantId: null,
    ip: '0',
    createdAt: 't',
    details: {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
});

describe('useAuditTail', () => {
  it('opens the stream over the cookie session and appends rows', () => {
    // The tail opens with credentials — never a JWT in the URL — and collects rows.
    const { result } = renderHook(() => useAuditTail(true));
    const source = MockEventSource.instances[0];
    expect(source?.url).toContain('/audit/stream');
    expect(source?.init).toEqual({ withCredentials: true });
    expect(source?.url).not.toContain('token');

    act(() => source?.emit(row('1')));
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.pendingCount).toBe(0);
  });

  it('buffers a pending count while paused and clears it on resume', () => {
    // Scrolling up pauses follow; new rows increment the "N new" count.
    const { result } = renderHook(() => useAuditTail(true));
    const source = MockEventSource.instances[0];
    act(() => result.current.setFollowing(false));
    act(() => source?.emit(row('1')));
    act(() => source?.emit(row('2')));
    expect(result.current.pendingCount).toBe(2);
    act(() => result.current.setFollowing(true));
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.following).toBe(true);
  });

  it('ignores malformed frames', () => {
    // A malformed frame must not break the tail.
    const { result } = renderHook(() => useAuditTail(true));
    const source = MockEventSource.instances[0];
    act(() => source?.emit('not-json'));
    expect(result.current.rows).toHaveLength(0);
  });

  it('does not open the stream when disabled', () => {
    // The Live toggle can suppress the stream entirely.
    renderHook(() => useAuditTail(false));
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('closes the stream on unmount', () => {
    // The socket must be released when the page unmounts.
    const { unmount } = renderHook(() => useAuditTail(true));
    const source = MockEventSource.instances[0];
    unmount();
    expect(source?.closed).toBe(true);
  });
});
