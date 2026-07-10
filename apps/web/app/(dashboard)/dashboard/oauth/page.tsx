/**
 * @fileoverview `/dashboard/oauth` — the Google OAuth panel.
 *
 * Offers "Continue with Google" (a full navigation to the 302 initiate route)
 * only when `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED` is set, otherwise a "not
 * configured" explainer. After the callback it renders the `on_oauth_login`
 * Create/Link decision trace, or the localized `auth.*` code on failure.
 *
 * @module app/(dashboard)/dashboard/oauth/page
 */

'use client';

import { useQueryState } from 'nuqs';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthError } from '@/components/auth/auth-error';
import { DecisionTrace } from '@/components/oauth/DecisionTrace';
import { isGoogleOAuthEnabled, googleInitiateUrl, parseCallbackTrace } from '@/lib/oauth';

/** The Google OAuth panel page. */
export default function OAuthPanelPage(): React.ReactElement {
  const [tenantId] = useQueryState('tenant', { defaultValue: 'acme' });
  const [decision] = useQueryState('decision');
  const [branch] = useQueryState('branch');
  const [errorCode] = useQueryState('error');

  const enabled = isGoogleOAuthEnabled();
  const trace = parseCallbackTrace(decision, branch);

  return (
    <section className="flex flex-col gap-8">
      <div>
        <h1 className="font-mono text-2xl font-bold text-white">OAuth</h1>
        <p className="mt-1 text-sm text-[rgba(255,255,255,0.5)]">
          Google sign-in and the Create-vs-Link decision trace.
        </p>
      </div>

      {errorCode !== null && <AuthError code={errorCode} />}

      {enabled ? (
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6">
          <h2 className="mb-1 font-mono text-sm font-semibold uppercase tracking-widest text-[rgba(255,255,255,0.4)]">
            Continue with Google
          </h2>
          <p className="mb-4 text-xs text-[rgba(255,255,255,0.35)]">
            PKCE + state are minted server-side; the callback returns the decision below.
          </p>
          <Button asChild>
            <a href={googleInitiateUrl(tenantId)}>
              <KeyRound className="h-4 w-4" />
              Continue with Google
            </a>
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6">
          <h2 className="mb-1 font-mono text-sm font-semibold uppercase tracking-widest text-[rgba(255,255,255,0.4)]">
            Google OAuth not configured
          </h2>
          <p className="text-xs text-[rgba(255,255,255,0.35)]">
            Set{' '}
            <code className="rounded bg-[rgba(255,255,255,0.05)] px-1 text-xs">
              NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=true
            </code>{' '}
            and configure the provider to enable this sign-in.
          </p>
        </div>
      )}

      {trace !== null && <DecisionTrace trace={trace} />}
    </section>
  );
}
