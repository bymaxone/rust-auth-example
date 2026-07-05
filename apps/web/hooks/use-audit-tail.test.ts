/**
 * @fileoverview Tests for the live audit tail hook.
 *
 * Covers: the SSE stream opens over the cookie session (no JWT), appends rows,
 * buffers a pending count while paused, resets on resume, ignores malformed
 * frames, does not open when disabled, and closes on unmount.
 *
 * @module hooks/use-audit-tail.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

const ORIGINAL_API_URL = process.env.NEXT_PUBLIC_API_URL;

beforeEach(() => {
  vi.clearAllMocks();
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
});

afterEach(() => {
  if (ORIGINAL_API_URL === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
  } else {
    process.env.NEXT_PUBLIC_API_URL = ORIGINAL_API_URL;
  }
});

describe('useAuditTail', () => {
  it('opens the stream over the cookie session and appends rows', () => {
    // The tail opens with credentials — never a JWT in the URL — and collects rows.
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8080';
    const { result } = renderHook(() => useAuditTail(true));
    const source = MockEventSource.instances[0];
    // The configured origin is prefixed verbatim and the exact stream path appended.
    expect(source?.url).toBe('http://localhost:8080/audit/stream');
    expect(source?.init).toEqual({ withCredentials: true });
    expect(source?.url).not.toContain('token');
    // Follow-mode is pinned to the latest rows on first render.
    expect(result.current.following).toBe(true);

    act(() => source?.emit(row('1')));
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.pendingCount).toBe(0);
  });

  it('builds a relative stream URL when the API origin is unset', () => {
    // With no configured origin the default is the empty string — the path stays relative.
    delete process.env.NEXT_PUBLIC_API_URL;
    renderHook(() => useAuditTail(true));
    const source = MockEventSource.instances[0];
    expect(source?.url).toBe('/audit/stream');
  });

  it('buffers a pending count while paused and clears it on resume', () => {
    // Scrolling up pauses follow; new rows increment the "N new" count.
    const { result } = renderHook(() => useAuditTail(true));
    const source = MockEventSource.instances[0];
    act(() => result.current.setFollowing(false));
    act(() => source?.emit(row('1')));
    act(() => source?.emit(row('2')));
    expect(result.current.pendingCount).toBe(2);
    // Staying paused (re-pausing while already paused) must not reset the buffered count.
    act(() => result.current.setFollowing(false));
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

  it('reopens the stream when re-enabled after being disabled', () => {
    // The effect keys on `enabled`: toggling Live off then on must re-run it and open a fresh stream.
    const { rerender } = renderHook(({ on }: { on: boolean }) => useAuditTail(on), {
      initialProps: { on: false },
    });
    expect(MockEventSource.instances).toHaveLength(0);
    rerender({ on: true });
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toContain('/audit/stream');
  });
});
