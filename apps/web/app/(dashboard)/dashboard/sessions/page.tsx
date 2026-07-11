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
import { LogOut } from 'lucide-react';
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
    <section className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl font-bold text-white">Sessions</h1>
          <p className="mt-1 text-sm text-[rgba(255,255,255,0.5)]">
            Active devices signed in to this account.
          </p>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={signingOutOthers || state.kind !== 'ready'}
              className="border-red-500/30 text-red-400 hover:border-red-500/60 hover:bg-red-500/10 hover:text-red-300"
            >
              <LogOut className="h-3.5 w-3.5" />
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
          className="h-40 w-full animate-pulse rounded-xl bg-[rgba(255,255,255,0.03)]"
          role="status"
          aria-label="Loading"
        />
      )}

      {state.kind === 'error' && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6">
          <p className="text-sm text-[rgba(255,255,255,0.5)]">Your sessions could not be loaded.</p>
          <Button variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {state.kind === 'ready' &&
        (state.sessions.length <= 1 ? (
          <div className="flex flex-col gap-4 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6">
            <div>
              <h2 className="font-mono text-sm font-semibold uppercase tracking-widest text-[rgba(255,255,255,0.4)]">
                Only this device
              </h2>
              <p className="mt-1 text-sm text-[rgba(255,255,255,0.5)]">
                No other sessions yet — sign in from another device to see one here.
              </p>
            </div>
            {state.sessions.length === 1 && (
              <SessionsTable
                sessions={state.sessions}
                onRevoke={(id) => void handleRevoke(id)}
                revokingId={revokingId}
              />
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6">
            <SessionsTable
              sessions={state.sessions}
              onRevoke={(id) => void handleRevoke(id)}
              revokingId={revokingId}
            />
          </div>
        ))}
    </section>
  );
}
