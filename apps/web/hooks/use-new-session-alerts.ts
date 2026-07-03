/**
 * @fileoverview Live new-session alerts over a ticketed WebSocket.
 *
 * Mints a short-lived, single-use ticket through the BFF and opens the realtime
 * WebSocket with it — the access JWT is never placed in the URL. On an
 * `on_new_session` frame the `onAlert` callback fires (to toast + refetch). The
 * socket is closed on unmount and a failed mint degrades silently to no realtime.
 *
 * @module hooks/use-new-session-alerts
 */

'use client';

import { useEffect } from 'react';
import { mintWsTicket, buildWsUrl } from '@/lib/ws-ticket';

/** A realtime new-session frame. */
interface NewSessionFrame {
  readonly event?: string;
  readonly ip?: string;
}

/**
 * Subscribe to realtime new-session alerts.
 *
 * @param onAlert - Called with the originating IP when a new session appears.
 */
export function useNewSessionAlerts(onAlert: (ip: string) => void): void {
  useEffect(() => {
    let socket: WebSocket | null = null;
    let cancelled = false;

    const handleMessage = (event: MessageEvent<string>): void => {
      try {
        const frame = JSON.parse(event.data) as NewSessionFrame;
        if (frame.event === 'on_new_session') onAlert(frame.ip ?? 'unknown');
      } catch {
        /* Ignore malformed frames rather than crashing the tail. */
      }
    };

    const connect = async (): Promise<void> => {
      try {
        const ticket = await mintWsTicket();
        if (cancelled) return;
        socket = new WebSocket(buildWsUrl(ticket));
        socket.addEventListener('message', handleMessage);
      } catch {
        /* No ticket — no realtime. The rest of the page still works. */
      }
    };

    void connect();

    return () => {
      cancelled = true;
      socket?.close();
    };
  }, [onAlert]);
}
