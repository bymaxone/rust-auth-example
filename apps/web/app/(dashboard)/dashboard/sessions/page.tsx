/**
 * @fileoverview `/dashboard/sessions` — the device manager.
 *
 * Lists the caller's active sessions, pins the current device, revokes a session
 * optimistically (rolling back on failure), and logs out every other device
 * behind a destructive confirm. A ticketed WebSocket surfaces a live toast when a
 * new session appears on the account, then refetches the list.
 *
 * @module app/(dashboard)/dashboard/sessions/page
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { SessionsTable } from '@/components/sessions/SessionsTable';
import { useNewSessionAlerts } from '@/hooks/use-new-session-alerts';
import {
  listSessions,
  revokeSession,
  revokeAllOtherSessions,
  type SessionInfo,
} from '@/lib/sessions-api';

/** The load lifecycle for the sessions list. */
type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly sessions: readonly SessionInfo[] };

/** The Sessions device-manager page. */
export default function SessionsPage(): React.ReactElement {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [signingOutOthers, setSigningOutOthers] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', sessions: await listSessions() });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onNewSession = useCallback(
    (ip: string): void => {
      toast.info(`New sign-in detected from ${ip}.`);
      void load();
    },
    [load],
  );
  useNewSessionAlerts(onNewSession);

  async function handleRevoke(id: string): Promise<void> {
    if (state.kind !== 'ready') return;
    const previous = state.sessions;
    setRevokingId(id);
    setState({ kind: 'ready', sessions: previous.filter((s) => s.id !== id) });
    try {
      await revokeSession(id);
      toast.success('Session revoked.');
    } catch {
      setState({ kind: 'ready', sessions: previous });
      toast.error('Could not revoke that session.');
    } finally {
      setRevokingId(null);
    }
  }

  async function handleSignOutOthers(): Promise<void> {
    setSigningOutOthers(true);
    try {
      await revokeAllOtherSessions();
      toast.success('Signed out of all other devices.');
      await load();
    } catch {
      toast.error('Could not sign out other devices.');
    } finally {
      setSigningOutOthers(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-mono text-2xl font-bold">Sessions</h1>
          <p className="text-sm text-muted-foreground">Active devices signed in to this account.</p>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={signingOutOthers || state.kind !== 'ready'}
            >
              Log out everywhere else
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Log out of all other devices?</AlertDialogTitle>
              <AlertDialogDescription>
                Every session except this device will be revoked immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleSignOutOthers()}>
                Log out others
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {state.kind === 'loading' && (
        <div
          className="h-40 w-full animate-pulse rounded-2xl bg-muted"
          role="status"
          aria-label="Loading"
        />
      )}

      {state.kind === 'error' && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-muted-foreground">Your sessions could not be loaded.</p>
            <Button variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {state.kind === 'ready' &&
        (state.sessions.length <= 1 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Only this device</CardTitle>
              <CardDescription>
                No other sessions yet — sign in from another device to see one here.
              </CardDescription>
            </CardHeader>
            {state.sessions.length === 1 && (
              <CardContent>
                <SessionsTable
                  sessions={state.sessions}
                  onRevoke={(id) => void handleRevoke(id)}
                  revokingId={revokingId}
                />
              </CardContent>
            )}
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <SessionsTable
                sessions={state.sessions}
                onRevoke={(id) => void handleRevoke(id)}
                revokingId={revokingId}
              />
            </CardContent>
          </Card>
        ))}
    </section>
  );
}
