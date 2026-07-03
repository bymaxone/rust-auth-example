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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-mono text-2xl font-bold">OAuth</h1>
        <p className="text-sm text-muted-foreground">
          Google sign-in and the Create-vs-Link decision trace.
        </p>
      </div>

      {errorCode !== null && <AuthError code={errorCode} />}

      {enabled ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Continue with Google</CardTitle>
            <CardDescription>
              PKCE + state are minted server-side; the callback returns the decision below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href={googleInitiateUrl(tenantId)}>
                <KeyRound className="h-4 w-4" />
                Continue with Google
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Google OAuth not configured</CardTitle>
            <CardDescription>
              Set `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=true` and configure the provider to enable this
              sign-in.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {trace !== null && <DecisionTrace trace={trace} />}
    </section>
  );
}
