/**
 * @fileoverview The `on_oauth_login` Create/Link decision trace.
 *
 * Renders whether the callback created a new user or linked an existing one, and
 * which branch fired afterwards (authenticated session / redirect / MFA
 * challenge). Composes the design-system `Card`/`Badge`; status is conveyed by
 * label + icon, never colour alone.
 *
 * @module components/oauth/DecisionTrace
 */

import { GitMerge, UserPlus, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { OAuthBranch, OAuthCallbackTrace, OAuthDecision } from '@/lib/oauth';

/** Copy + icon for each decision. */
const DECISION_META: Record<OAuthDecision, { label: string; icon: LucideIcon }> = {
  created: { label: 'Created a new user', icon: UserPlus },
  linked: { label: 'Linked to an existing user', icon: GitMerge },
};

/** Human labels for each resolved branch. */
const BRANCH_LABEL: Record<OAuthBranch, string> = {
  authenticated: 'Authenticated session',
  redirect: 'Redirect',
  mfa_challenge: 'MFA challenge',
};

/** Render the OAuth Create/Link decision + the branch that fired. */
export function DecisionTrace({ trace }: { readonly trace: OAuthCallbackTrace }) {
  const meta = DECISION_META[trace.decision];
  const Icon = meta.icon;
  return (
    <Card>
      <CardHeader accent>
        <CardTitle className="text-base">on_oauth_login decision</CardTitle>
        <CardDescription>What the policy decided for this Google sign-in.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {meta.label}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          Branch
          <Badge variant="outline" className="font-mono">
            {BRANCH_LABEL[trace.branch]}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
