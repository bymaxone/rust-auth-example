/**
 * @fileoverview Tests for the ticketed new-session alerts hook.
 *
 * Covers: it mints a ticket and opens the ws(s) URL (no JWT), fires on
 * `on_new_session` (with and without an ip), ignores other/malformed frames,
 * closes the socket on unmount, degrades silently when the mint fails, and skips
 * opening a socket if unmounted before the ticket resolves.
 *
 * @module hooks/use-new-session-alerts.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mintWsTicket = vi.hoisted(() => vi.fn());
const buildWsUrl = vi.hoisted(() => vi.fn((t: string) => `ws://api/ws/example?ticket=${t}`));
vi.mock('@/lib/ws-ticket', () => ({ mintWsTicket, buildWsUrl }));

/** A minimal WebSocket double that records listeners and the close call. */
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  readonly url: string;
  closed = false;
  private readonly listeners = new Map<string, ((ev: MessageEvent<string>) => void)[]>();
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
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

import { useNewSessionAlerts } from './use-new-session-alerts';

/** Flush pending microtasks so the effect's async connect completes. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
});

describe('useNewSessionAlerts', () => {
  it('mints a ticket and routes new-session frames to the callback', async () => {
    // A ticketed socket must surface on_new_session events (with a fallback ip).
    mintWsTicket.mockResolvedValueOnce('TCK');
    const onAlert = vi.fn();
    const { unmount } = renderHook(() => useNewSessionAlerts(onAlert));
    await flush();

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();
    expect(buildWsUrl).toHaveBeenCalledWith('TCK');
    expect(socket?.url).toContain('ticket=TCK');

    socket?.emit(JSON.stringify({ event: 'on_new_session', ip: '9.9.9.9' }));
    expect(onAlert).toHaveBeenCalledWith('9.9.9.9');

    socket?.emit(JSON.stringify({ event: 'on_new_session' }));
    expect(onAlert).toHaveBeenCalledWith('unknown');

    socket?.emit(JSON.stringify({ event: 'on_logout', ip: '1.1.1.1' }));
    socket?.emit('not-json');
    expect(onAlert).toHaveBeenCalledTimes(2);

    unmount();
    expect(socket?.closed).toBe(true);
  });

  it('degrades silently when the ticket mint fails', async () => {
    // A failed mint must not open a socket or throw.
    mintWsTicket.mockRejectedValueOnce(new Error('no ticket'));
    const onAlert = vi.fn();
    const { unmount } = renderHook(() => useNewSessionAlerts(onAlert));
    await flush();
    expect(MockWebSocket.instances).toHaveLength(0);
    unmount();
    expect(onAlert).not.toHaveBeenCalled();
  });

  it('does not open a socket when unmounted before the ticket resolves', async () => {
    // Unmounting mid-mint must cancel the connection.
    let resolveTicket: (t: string) => void = () => undefined;
    mintWsTicket.mockReturnValueOnce(
      new Promise<string>((r) => {
        resolveTicket = r;
      }),
    );
    const { unmount } = renderHook(() => useNewSessionAlerts(vi.fn()));
    unmount();
    await act(async () => {
      resolveTicket('LATE');
      await Promise.resolve();
    });
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('reopens the socket when the alert callback changes', async () => {
    // The effect keys on onAlert: a new callback must close the old socket and open a fresh one.
    mintWsTicket.mockResolvedValueOnce('TCK').mockResolvedValueOnce('TCK2');
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: (ip: string) => void }) => useNewSessionAlerts(cb),
      { initialProps: { cb: first } },
    );
    await flush();
    expect(MockWebSocket.instances).toHaveLength(1);
    const firstSocket = MockWebSocket.instances[0];

    rerender({ cb: second });
    await flush();
    // The old socket is torn down and a second socket opens for the new callback.
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(firstSocket?.closed).toBe(true);

    MockWebSocket.instances[1]?.emit(JSON.stringify({ event: 'on_new_session', ip: '2.2.2.2' }));
    expect(second).toHaveBeenCalledWith('2.2.2.2');
    expect(first).not.toHaveBeenCalled();
  });
});
