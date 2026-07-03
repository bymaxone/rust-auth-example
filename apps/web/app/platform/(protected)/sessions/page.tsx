/**
 * @fileoverview `/platform/sessions` — platform admin session management.
 *
 * Shows the current admin session (email, role, session ID in mono) fetched from
 * `GET /auth/platform/me`. Behind a destructive confirm dialog, a single "Revoke
 * all platform sessions" action calls `DELETE /auth/platform/sessions` (bulk only —
 * the platform domain exposes no per-session list or per-row revoke). After a
 * successful revoke the admin is redirected to `/platform/login` because their own
 * session is gone.
 *
 * @module app/platform/(protected)/sessions/page
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthClientError } from '@bymax-one/rust-auth/shared';
import type { AuthPlatformUserClient } from '@bymax-one/rust-auth/shared';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { AuthError } from '@/components/auth/auth-error';
import { platformClient, platformSessions } from '@/lib/platform-client';

/** The load lifecycle for the admin profile. */
type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly me: AuthPlatformUserClient };

/** Resolve a wire error code from a caught error. */
function codeOf(err: unknown): string {
  return err instanceof AuthClientError ? (err.code ?? 'auth.internal') : 'auth.internal';
}

/** Platform admin Sessions page — bulk-only session management. */
export default function PlatformSessionsPage(): React.ReactElement {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    platformClient
      .getMe()
      .then((me) => setState({ kind: 'ready', me }))
      .catch(() => setState({ kind: 'error' }));
  }, []);

  async function handleRevokeAll(): Promise<void> {
    // In-flight guard: if a revoke is already in progress, ignore the second call.
    // This prevents a double submit if the confirm button is activated twice before
    // the disabled state propagates (e.g. via keyboard or accessibility tools).
    if (revoking) return;
    setRevoking(true);
    setErrorCode(null);
    try {
      await platformSessions.revokeAll();
      // The caller's own session is now gone — route to login.
      router.push('/platform/login');
    } catch (err) {
      setErrorCode(codeOf(err));
    } finally {
      setRevoking(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-mono text-2xl font-bold">Sessions</h1>
        <p className="text-sm text-muted-foreground">
          Platform admin sessions. Only bulk revoke is available — the platform domain does not
          expose a per-session list or per-row revoke endpoint.
        </p>
      </div>

      <AuthError code={errorCode} />

      {state.kind === 'loading' && (
        <div
          className="h-40 w-full animate-pulse rounded-2xl bg-muted"
          role="status"
          aria-label="Loading"
        />
      )}

      {state.kind === 'error' && (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              Session information could not be loaded.
            </p>
          </CardContent>
        </Card>
      )}

      {state.kind === 'ready' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current session</CardTitle>
              <CardDescription>Signed in as a platform administrator.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Email</dt>
                <dd>{state.me.email}</dd>
                <dt className="text-muted-foreground">Name</dt>
                <dd>{state.me.name}</dd>
                <dt className="text-muted-foreground">Role</dt>
                <dd>
                  <Badge variant="outline" className="font-mono text-xs">
                    {state.me.role}
                  </Badge>
                </dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant="outline" className="font-mono text-xs">
                    {state.me.status}
                  </Badge>
                </dd>
                <dt className="text-muted-foreground">2FA</dt>
                <dd>{state.me.mfaEnabled ? 'Enabled' : 'Disabled'}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revoke all platform sessions</CardTitle>
              <CardDescription>
                Signs out every platform admin session — including this one. You will be redirected
                to the platform login page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={revoking}>
                    {revoking ? 'Revoking…' : 'Revoke all sessions'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revoke all platform sessions?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Every platform admin session will be terminated immediately — including this
                      one. You will be redirected to the platform login page.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => void handleRevokeAll()}
                      disabled={revoking}
                      aria-disabled={revoking}
                    >
                      {revoking ? 'Revoking…' : 'Revoke all'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
