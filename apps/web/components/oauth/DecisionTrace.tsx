/**
 * @fileoverview The `on_oauth_login` Create/Link decision trace.
 *
 * Renders whether the callback created a new user or linked an existing one, and
 * which branch fired afterwards (authenticated session / redirect / MFA
 * challenge). Renders inside an orange-tinted glass panel; status is conveyed by
 * label + icon, never colour alone.
 *
 * @module components/oauth/DecisionTrace
 */

import { GitMerge, UserPlus, type LucideIcon } from 'lucide-react';
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
    <section className="rounded-xl border border-[rgba(255,98,36,0.15)] bg-[rgba(255,98,36,0.04)] p-6">
      <h2 className="mb-1 font-mono text-sm font-semibold uppercase tracking-widest text-[rgba(255,255,255,0.4)]">
        on_oauth_login decision
      </h2>
      <p className="mb-4 text-xs text-[rgba(255,255,255,0.35)]">
        What the policy decided for this Google sign-in.
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-white">
          <Icon className="h-4 w-4 text-[#ff6224]" aria-hidden="true" />
          {meta.label}
        </div>
        <div className="flex items-center gap-2 text-sm text-[rgba(255,255,255,0.5)]">
          Branch
          <span className="inline-flex items-center rounded-full border border-[rgba(255,98,36,0.25)] bg-[rgba(255,98,36,0.12)] px-2 py-0.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[#ff6224]">
              {BRANCH_LABEL[trace.branch]}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
