/**
 * @fileoverview Login page — email + password form with tenant picker, Google
 * OAuth, status banners, and MFA hand-off.
 *
 * Authenticates via `useAuth().login`. On a plain success the visitor is routed to
 * `/dashboard`. When the result carries `mfaTempToken` (MFA challenge) the token is
 * stored in the in-memory holder and the visitor is routed to `/auth/mfa-challenge`.
 * All errors — including unexpected ones — are localized through `<AuthError>` so the
 * page stays usable rather than crashing with an unhandled rejection.
 *
 * The workspace `<select>` is bound to the same `?tenant=` URL state (via nuqs
 * `useQueryState`) that scopes the login, so a deep-link such as
 * `/auth/login?tenant=globex` pre-selects globex and manual changes stay in sync
 * with the URL. Status banners read the `?reason=`, `?verified=`, and `?reset=`
 * query params so redirects from other flows surface a contextual message.
 *
 * The "Continue with Google" button is rendered only when
 * `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=true`; it uses a full-page navigation so the
 * browser follows the library's 302 redirect (a client `fetch` would not).
 *
 * @module app/(public)/auth/login/page
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryState } from 'nuqs';
import { useAuth } from '@bymax-one/rust-auth/react';
import { AuthClientError } from '@bymax-one/rust-auth/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthError } from '@/components/auth/auth-error';
import { setPendingMfaChallenge } from '@/lib/mfa-challenge-store';
import { isGoogleOAuthEnabled, googleInitiateUrl } from '@/lib/oauth';

/** Regex guarding tenant slugs coming in via crafted `?tenant=` URLs. */
const TENANT_ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Seeded workspaces (mirrors `apps/api/src/bin/seed.rs → DEMO_TENANTS`). The
 * picker lets a developer exercise multi-tenant flows without editing the URL;
 * the selected slug scopes the login through the `?tenant=` query state.
 */
const TENANT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'acme', label: 'Acme Inc.' },
  { value: 'globex', label: 'Globex Corp.' },
];

/**
 * Login page. Submits email + password, branches on the MFA result, and routes
 * the visitor to the appropriate next step.
 */
export default function LoginPage(): React.ReactElement {
  const { login } = useAuth();
  const router = useRouter();
  const [rawTenantId, setTenantId] = useQueryState('tenant', { defaultValue: 'acme' });
  const tenantId = TENANT_ID_RE.test(rawTenantId) ? rawTenantId : 'acme';
  const [reason] = useQueryState('reason', { defaultValue: '' });
  const [verified] = useQueryState('verified', { defaultValue: '' });
  const [reset] = useQueryState('reset', { defaultValue: '' });
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const googleEnabled = isGoogleOAuthEnabled();
  const sessionExpired = reason === 'session_expired';
  const justVerified = verified === '1';
  const justReset = reset === '1';

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setErrorCode(null);
    setIsSubmitting(true);
    try {
      const result = await login(email, password, { tenantId });
      if ('mfaTempToken' in result && result.mfaRequired) {
        setPendingMfaChallenge(result.mfaTempToken);
        router.push('/auth/mfa-challenge');
        return;
      }
      router.push('/dashboard');
    } catch (err) {
      setErrorCode(
        err instanceof AuthClientError ? (err.code ?? 'auth.internal') : 'auth.internal',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-center text-sm text-[rgba(255,255,255,0.5)]">Sign in to your account</p>

      {/* ── Status banners ── */}
      {sessionExpired && (
        <div
          role="alert"
          className="rounded-lg border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.1)] px-4 py-3"
        >
          <p className="text-sm text-red-400">Your session expired. Please sign in again.</p>
        </div>
      )}
      {justVerified && (
        <div
          role="alert"
          className="rounded-lg border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.1)] px-4 py-3"
        >
          <p className="text-sm text-green-400">Email verified — you can now sign in.</p>
        </div>
      )}
      {justReset && (
        <div
          role="alert"
          className="rounded-lg border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.1)] px-4 py-3"
        >
          <p className="text-sm text-green-400">
            Password reset — please sign in with your new password.
          </p>
        </div>
      )}

      <AuthError code={errorCode} />

      <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
        {/* Workspace — bound to the shared `?tenant=` URL state so the picker and
            the deep-link default stay in sync. Kept outside the credential form
            because the slug travels as the login `tenantId`, not a field. */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-tenant" className="text-[rgba(255,255,255,0.7)]">
            Workspace
          </Label>
          <select
            id="login-tenant"
            value={tenantId}
            onChange={(e) => void setTenantId(e.target.value)}
            className="flex h-12 w-full appearance-none rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] px-5 py-2 text-sm text-white transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6224]/50"
          >
            {TENANT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[#1a1a1a] text-white">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-email" className="text-[rgba(255,255,255,0.7)]">
            Email
          </Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] text-white placeholder:text-[rgba(255,255,255,0.3)] focus-visible:ring-[#ff6224]/50"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password" className="text-[rgba(255,255,255,0.7)]">
              Password
            </Label>
            <Link
              href="/auth/forgot-password"
              className="text-xs text-[rgba(255,98,36,0.8)] transition-colors hover:text-[#ff6224]"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] text-white placeholder:text-[rgba(255,255,255,0.3)] focus-visible:ring-[#ff6224]/50"
            required
          />
        </div>

        <Button type="submit" disabled={isSubmitting} size="lg" className="mt-1 w-full">
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {/* ── Google OAuth (conditional) ── */}
      {googleEnabled && (
        <>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[rgba(255,255,255,0.08)]" />
            <span className="text-xs text-[rgba(255,255,255,0.3)]">or</span>
            <div className="h-px flex-1 bg-[rgba(255,255,255,0.08)]" />
          </div>
          {/* Full-page navigation to the 302 initiate route — the browser must
              follow the library's redirect, so a client-side fetch would not
              work. The selected tenant scopes the OAuth login. */}
          <a
            href={googleInitiateUrl(tenantId)}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-6 py-3 text-sm font-medium text-[rgba(255,255,255,0.7)] transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="rgba(255,255,255,0.5)"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="rgba(255,255,255,0.4)"
              />
              <path
                d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"
                fill="rgba(255,255,255,0.3)"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83c.87-2.6 3.3-4.52 6.16-4.52z"
                fill="rgba(255,255,255,0.5)"
              />
            </svg>
            Continue with Google
          </a>
        </>
      )}

      <p className="text-center text-sm text-[rgba(255,255,255,0.4)]">
        New here?{' '}
        <Link
          href="/auth/register"
          className="text-[rgba(255,98,36,0.8)] transition-colors hover:text-[#ff6224]"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
