/**
 * @fileoverview The Diagnostics matrix — the example-owned server-only primitives.
 *
 * Exercises the dev diagnostics API via the shared `apiJson` helper: password
 * hash-strength (+ needs-rehash), a brute-force lockout (+ countdown), and the
 * recent hook-event count. The token inspector posts a pasted JWT to the
 * server-only `/api/diagnostics/inspect-token` route (a same-origin Next handler
 * that alone imports the `/nextjs` decode/verify) with a direct `fetch`, and
 * shows a forged `alg:none` being rejected. A chip surfaces the configured
 * token-delivery mode.
 *
 * @module components/account/DiagnosticsMatrix
 */

'use client';

import { useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DeliveryModeChip } from '@/components/controls/DeliveryModeChip';
import { apiJson } from '@/lib/api';

/** Shared glass-panel chrome for a diagnostics tile. */
const PANEL_CLASS =
  'rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6';

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
    <div className={PANEL_CLASS}>
      <h3 className="font-mono text-sm font-semibold text-white">{props.title}</h3>
      <p className="mt-1 text-xs text-[rgba(255,255,255,0.4)]">{props.description}</p>
      <div className="mt-4 flex flex-col gap-3">
        <Button size="sm" disabled={state.k === 'busy'} onClick={() => void fire()}>
          {state.k === 'busy' ? 'Running…' : props.actionLabel}
        </Button>
        {state.k === 'error' && <p className="text-sm text-destructive">Request failed.</p>}
        {state.k === 'ok' && props.renderResult(state.data)}
      </div>
    </div>
  );
}

/** Wire shape of `POST /diagnostics/hash-strength`. */
interface HashStrengthResult {
  readonly needsRehash?: boolean;
}
/** Wire shape of `POST /diagnostics/force-lockout`. */
interface LockoutResult {
  readonly locked?: boolean;
  readonly remainingLockoutSecs?: number;
}
interface InspectResult {
  readonly decoded?: { readonly header?: { readonly alg?: string }; readonly isValid?: boolean };
  readonly verified?: boolean;
}

/**
 * A representative legacy `scrypt:` hash the server evaluates against its current password
 * parameters. It is deliberately stale, so the rehash-on-verify detection is demonstrated;
 * it is a sample only — no real credential is ever involved.
 */
const SAMPLE_LEGACY_PHC = 'scrypt:00112233:44556677';

/**
 * A throwaway identifier used to drive the brute-force store to its lockout threshold for the
 * demo. It is not a real account key — the diagnostics route keys the store by this opaque
 * string directly.
 */
const LOCKOUT_DEMO_IDENTIFIER = 'lockout-demo@example.test';

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
      // A same-origin Next route (never the Rust API), so call it directly rather than
      // through `authFetch`, whose `baseUrl` would rebase this onto the backend.
      const res = await fetch('/api/diagnostics/inspect-token', {
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
    <div className={`${PANEL_CLASS} lg:col-span-2`}>
      <h3 className="font-mono text-sm font-semibold text-white">Token inspector</h3>
      <p className="mt-1 text-xs text-[rgba(255,255,255,0.4)]">
        Decoded server-side; a forged `alg:none` token verifies as rejected.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <textarea
          aria-label="JWT to inspect"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          rows={3}
          className="border-(--glass-border) bg-(--glass-bg) ring-offset-background w-full rounded-xl border p-3 font-mono text-xs text-white transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
            <p className="font-mono text-xs text-[rgba(255,255,255,0.4)]">
              alg: {result.decoded?.header?.alg ?? 'unknown'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** The Diagnostics matrix. */
export function DiagnosticsMatrix() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <DiagnosticAction<HashStrengthResult>
        title="Password hash strength"
        description="Check a sample legacy hash against the current password parameters."
        actionLabel="Measure"
        run={() =>
          apiJson<HashStrengthResult>('/diagnostics/hash-strength', {
            method: 'POST',
            body: JSON.stringify({ phc: SAMPLE_LEGACY_PHC }),
          })
        }
        renderResult={(data) => (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono text-[rgba(255,255,255,0.4)]">legacy sample</span>
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
        description="Drive an identifier to the lockout threshold."
        actionLabel="Force lockout"
        run={() =>
          apiJson<LockoutResult>('/diagnostics/force-lockout', {
            method: 'POST',
            body: JSON.stringify({ identifier: LOCKOUT_DEMO_IDENTIFIER }),
          })
        }
        renderResult={(data) =>
          typeof data.remainingLockoutSecs === 'number' && data.remainingLockoutSecs > 0 ? (
            <Badge variant="destructive" className="w-fit font-mono">
              locked · retry in {data.remainingLockoutSecs}s
            </Badge>
          ) : (
            <Badge variant="outline" className="w-fit font-mono">
              {data.locked === true ? 'locked' : 'lockout triggered'}
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
          <p className="text-sm text-[rgba(255,255,255,0.5)]">
            <span className="font-mono text-white">{hookCount(data)}</span> recent events
          </p>
        )}
      />

      <div className={PANEL_CLASS}>
        <h3 className="font-mono text-sm font-semibold text-white">Token delivery</h3>
        <p className="mt-1 text-xs text-[rgba(255,255,255,0.4)]">
          How the backend delivers session tokens.
        </p>
        <div className="mt-4">
          <DeliveryModeChip mode="Cookie" />
        </div>
      </div>

      <TokenInspectorCard />
    </div>
  );
}
