/**
 * @fileoverview Helpers for the Google OAuth panel.
 *
 * Gates the "Continue with Google" affordance on `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED`,
 * builds the browser entry URL to the 302 initiate route (PKCE + state are minted
 * server-side), and validates the Create-vs-Link decision trace the callback
 * reports back via the URL.
 *
 * @module lib/oauth
 */

/** True when Google OAuth is configured in this environment. */
export function isGoogleOAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED === 'true';
}

/** The browser entry point: a full navigation to the 302 initiate route. */
export function googleInitiateUrl(tenantId: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? '';
  return `${base}/auth/oauth/google?tenantId=${encodeURIComponent(tenantId)}`;
}

/** Whether `on_oauth_login` created a new user or linked an existing one. */
export type OAuthDecision = 'created' | 'linked';

/** Which post-decision branch the callback resolved to. */
export type OAuthBranch = 'authenticated' | 'redirect' | 'mfa_challenge';

/** The Create-vs-Link decision the callback reports back to the panel. */
export interface OAuthCallbackTrace {
  /** Whether a new user was created or an existing one linked. */
  readonly decision: OAuthDecision;
  /** Which branch fired after the decision. */
  readonly branch: OAuthBranch;
}

const DECISIONS: readonly string[] = ['created', 'linked'];
const BRANCHES: readonly string[] = ['authenticated', 'redirect', 'mfa_challenge'];

/**
 * Validate the callback's `decision` / `branch` query values into a typed trace.
 *
 * @param decision - The raw `decision` query value.
 * @param branch - The raw `branch` query value.
 * @returns The typed {@link OAuthCallbackTrace}, or `null` when either is invalid.
 */
export function parseCallbackTrace(
  decision: string | null,
  branch: string | null,
): OAuthCallbackTrace | null {
  // This null guard is provably equivalent under mutation: the membership check below rejects
  // null anyway (null is a member of neither DECISIONS nor BRANCHES), so every mutation of this
  // line yields the same `null` result. It exists only to narrow `string | null` to `string` for
  // `.includes` on the next line — no behaviour a test could observe depends on it.
  // Stryker disable next-line all
  if (decision === null || branch === null) return null;
  if (!DECISIONS.includes(decision) || !BRANCHES.includes(branch)) return null;
  return { decision: decision as OAuthDecision, branch: branch as OAuthBranch };
}
