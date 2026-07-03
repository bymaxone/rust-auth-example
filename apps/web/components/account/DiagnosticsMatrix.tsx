/**
 * @fileoverview The Diagnostics matrix — the example-owned server-only primitives.
 *
 * Exercises the dev diagnostics API via the shared `authFetch`: password
 * hash-strength (+ needs-rehash), a brute-force lockout (+ countdown), and the
 * recent hook-event count. The token inspector posts a pasted JWT to the
 * server-only `/api/diagnostics/inspect-token` route (which alone imports the
 * `/nextjs` decode/verify) and shows a forged `alg:none` being rejected. A chip
 * surfaces the configured token-delivery mode.
 *
 * @module components/account/DiagnosticsMatrix
 */

'use client';

import { useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DeliveryModeChip } from '@/components/controls/DeliveryModeChip';
import { apiJson } from '@/lib/api';
import { authFetch } from '@/lib/auth-client';

/** The lifecycle for a one-shot diagnostic action. */
type ActionState<T> =
  | { readonly k: 'idle' }
  | { readonly k: 'busy' }
  | { readonly k: 'error' }
  | { readonly k: 'ok'; readonly data: T };

/** A fire-once diagnostic card wrapping a run + a result renderer. */
function DiagnosticAction<T>(props: {
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly run: () => Promise<T>;
  readonly renderResult: (data: T) => React.ReactNode;
}) {
  const [state, setState] = useState<ActionState<T>>({ k: 'idle' });
  async function fire(): Promise<void> {
    setState({ k: 'busy' });
    try {
      setState({ k: 'ok', data: await props.run() });
    } catch {
      setState({ k: 'error' });
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button size="sm" disabled={state.k === 'busy'} onClick={() => void fire()}>
          {state.k === 'busy' ? 'Running…' : props.actionLabel}
        </Button>
        {state.k === 'error' && <p className="text-sm text-destructive">Request failed.</p>}
        {state.k === 'ok' && props.renderResult(state.data)}
      </CardContent>
    </Card>
  );
}

interface HashStrengthResult {
  readonly algorithm?: string;
  readonly needsRehash?: boolean;
}
interface LockoutResult {
  readonly retryAfterSeconds?: number;
}
interface InspectResult {
  readonly decoded?: { readonly header?: { readonly alg?: string }; readonly isValid?: boolean };
  readonly verified?: boolean;
}

/** Derive the recent hook-event count from the diagnostics payload. */
function hookCount(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (
    data !== null &&
    typeof data === 'object' &&
    typeof (data as { count?: unknown }).count === 'number'
  ) {
    return (data as { count: number }).count;
  }
  return 0;
}

/** The pasted-JWT inspector, backed by the server-only route. */
function TokenInspectorCard() {
  const [token, setToken] = useState('');
  const [result, setResult] = useState<InspectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function inspect(): Promise<void> {
    setError(null);
    setResult(null);
    if (token.trim() === '') {
      setError('Paste a JWT to inspect.');
      return;
    }
    setBusy(true);
    try {
      const res = await authFetch('/api/diagnostics/inspect-token', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        setError('Could not inspect the token.');
        return;
      }
      setResult((await res.json()) as InspectResult);
    } catch {
      setError('Could not inspect the token.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Token inspector</CardTitle>
        <CardDescription>
          Decoded server-side; a forged `alg:none` token verifies as rejected.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <textarea
          aria-label="JWT to inspect"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          rows={3}
          className="border-(--glass-border) bg-(--glass-bg) ring-offset-background w-full rounded-xl border p-3 font-mono text-xs text-foreground transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Button size="sm" disabled={busy} onClick={() => void inspect()}>
          {busy ? 'Inspecting…' : 'Inspect'}
        </Button>
        {error !== null && <p className="text-sm text-destructive">{error}</p>}
        {result !== null && (
          <div className="flex flex-col gap-2">
            {result.verified === true ? (
              <Badge variant="outline" className="w-fit gap-1 text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Signature valid
              </Badge>
            ) : (
              <Badge variant="destructive" className="w-fit gap-1">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                Rejected (e.g. forged alg:none)
              </Badge>
            )}
            <p className="font-mono text-xs text-muted-foreground">
              alg: {result.decoded?.header?.alg ?? 'unknown'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** The Diagnostics matrix. */
export function DiagnosticsMatrix() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <DiagnosticAction<HashStrengthResult>
        title="Password hash strength"
        description="Reflect the configured Argon2 parameters."
        actionLabel="Measure"
        run={() => apiJson<HashStrengthResult>('/diagnostics/hash-strength', { method: 'POST' })}
        renderResult={(data) => (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono text-foreground">{data.algorithm ?? 'argon2'}</span>
            {data.needsRehash === true ? (
              <Badge variant="destructive" className="font-mono">
                needs rehash
              </Badge>
            ) : (
              <Badge variant="outline" className="font-mono text-emerald-400">
                up to date
              </Badge>
            )}
          </div>
        )}
      />

      <DiagnosticAction<LockoutResult>
        title="Brute-force lockout"
        description="Drive an account to the lockout threshold."
        actionLabel="Force lockout"
        run={() => apiJson<LockoutResult>('/diagnostics/force-lockout', { method: 'POST' })}
        renderResult={(data) =>
          data.retryAfterSeconds !== undefined ? (
            <Badge variant="destructive" className="w-fit font-mono">
              locked · retry in {data.retryAfterSeconds}s
            </Badge>
          ) : (
            <Badge variant="outline" className="w-fit font-mono">
              lockout triggered
            </Badge>
          )
        }
      />

      <DiagnosticAction<unknown>
        title="Hook event log"
        description="Count recent lifecycle hook events."
        actionLabel="Refresh"
        run={() => apiJson<unknown>('/diagnostics/hooks')}
        renderResult={(data) => (
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-foreground">{hookCount(data)}</span> recent events
          </p>
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Token delivery</CardTitle>
          <CardDescription>How the backend delivers session tokens.</CardDescription>
        </CardHeader>
        <CardContent>
          <DeliveryModeChip mode="Cookie" />
        </CardContent>
      </Card>

      <TokenInspectorCard />
    </div>
  );
}
