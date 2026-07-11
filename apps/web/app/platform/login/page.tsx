/**
 * @fileoverview Platform admin login page.
 *
 * Authenticates a platform administrator via `platformClient.login`. When the
 * backend demands MFA the temp token is held in React state (never in storage)
 * and an inline OTP step is shown. On a successful login the admin is routed to
 * `/platform/security` (the default landing page). The page is public; the edge
 * proxy (`proxy.ts`) excludes
 * `/platform/login` from the session gate.
 *
 * @module app/platform/login/page
 */

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AuthClientError } from '@bymax-one/rust-auth/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { AuthError } from '@/components/auth/auth-error';
import { OtpInput } from '@/components/auth/otp-input';
import { messageForCode } from '@/lib/error-messages';
import { platformClient } from '@/lib/platform-client';

/**
 * Render a localized banner for `?reason=` redirects from the protected layout.
 *
 * - `"wrong-domain"` — a valid token of a different domain was presented; the admin
 *   must sign in with platform credentials.
 * - `"session-expired"` — the cookie was absent, invalid, or expired; the admin's
 *   session simply needs to be refreshed.
 *
 * @param reason - The `?reason` query param value.
 * @returns A warning alert or `null`.
 */
function ReasonBanner({ reason }: { readonly reason: string | null }): React.ReactElement | null {
  if (reason === 'wrong-domain') {
    return (
      <Alert variant="destructive" data-reason={reason}>
        <AlertTitle>{messageForCode('auth.platform_auth_required')}</AlertTitle>
      </Alert>
    );
  }
  if (reason === 'session-expired') {
    return (
      <Alert variant="default" data-reason={reason}>
        <AlertTitle>{messageForCode('auth.session_expired')}</AlertTitle>
      </Alert>
    );
  }
  return null;
}

/** The inner form — uses `useSearchParams`, so it must sit inside a `<Suspense>`. */
function PlatformLoginForm(): React.ReactElement {
  const router = useRouter();
  const params = useSearchParams();
  const reason = params.get('reason');

  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // MFA step: temp token held in React state only — never stored.
  const [mfaTempToken, setMfaTempToken] = useState<string | null>(null);
  // `pendingMfaCode` holds the complete code from OtpInput.onComplete while
  // the submit button is used to confirm. A null means no complete code yet.
  const [pendingMfaCode, setPendingMfaCode] = useState<string | null>(null);
  const [isMfaSubmitting, setIsMfaSubmitting] = useState(false);

  async function onLogin(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setErrorCode(null);
    setIsSubmitting(true);
    try {
      const result = await platformClient.login(email, password);
      if ('mfaRequired' in result && result.mfaRequired) {
        // Branch into the inline MFA step; keep the temp token in React state only.
        setMfaTempToken(result.mfaTempToken);
        return;
      }
      router.push('/platform/security');
    } catch (err) {
      setErrorCode(
        err instanceof AuthClientError ? (err.code ?? 'auth.internal') : 'auth.internal',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onMfaSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (mfaTempToken === null || pendingMfaCode === null) return;
    setErrorCode(null);
    setIsMfaSubmitting(true);
    try {
      await platformClient.mfaChallenge(mfaTempToken, pendingMfaCode);
      router.push('/platform/security');
    } catch (err) {
      setErrorCode(
        err instanceof AuthClientError ? (err.code ?? 'auth.internal') : 'auth.internal',
      );
    } finally {
      setIsMfaSubmitting(false);
    }
  }

  if (mfaTempToken !== null) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-center text-sm text-muted-foreground">
          Enter the 6-digit code from your authenticator app
        </p>

        <AuthError code={errorCode} />

        <form onSubmit={(e) => void onMfaSubmit(e)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1.5">
            <Label className="sr-only">Authenticator code</Label>
            <OtpInput onComplete={(code) => setPendingMfaCode(code)} />
          </div>

          <Button
            type="submit"
            disabled={isMfaSubmitting || pendingMfaCode === null}
            size="lg"
            className="mt-1 w-full"
          >
            {isMfaSubmitting ? 'Verifying…' : 'Verify'}
          </Button>
        </form>

        <button
          type="button"
          className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => {
            setMfaTempToken(null);
            setPendingMfaCode(null);
            setErrorCode(null);
          }}
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ReasonBanner reason={reason} />

      <p className="text-center text-sm text-muted-foreground">
        Sign in with your platform admin credentials
      </p>

      <AuthError code={errorCode} />

      <form onSubmit={(e) => void onLogin(e)} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="platform-email">Email</Label>
          <Input
            id="platform-email"
            type="email"
            autoComplete="email"
            placeholder="admin@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="platform-password">Password</Label>
          <Input
            id="platform-password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <Button type="submit" disabled={isSubmitting} size="lg" className="mt-1 w-full">
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}

/**
 * Platform admin login page — deep-red glass card, no tenant selector.
 *
 * The red-tinted card and `PLATFORM ADMIN` label make this page visually distinct
 * from the tenant dashboard login so an operator instantly recognises the platform
 * admin context.
 */
export default function PlatformLoginPage(): React.ReactElement {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0d0505]">
      {/* ── Ambient glow — deep red tint ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full bg-red-900 opacity-20 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-20 h-[400px] w-[400px] rounded-full bg-red-800 opacity-10 blur-[100px]"
      />

      {/* ── Centered card ── */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8">
        <div className="w-full max-w-[420px]">
          {/* Red-tinted glass card */}
          <div className="relative overflow-hidden rounded-[24px] border border-[rgba(239,68,68,0.2)] bg-[rgba(30,0,0,0.6)] backdrop-blur-lg">
            {/* Top accent gradient line — red */}
            <div
              aria-hidden="true"
              className="bg-linear-to-r absolute left-0 right-0 top-0 h-px from-transparent via-[rgba(239,68,68,0.6)] to-transparent"
            />

            {/* ── Brand header — platform admin identity ── */}
            <div className="flex flex-col items-center gap-1 px-8 pb-4 pt-8">
              {/* Red icon badge */}
              <div
                aria-hidden="true"
                className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl border border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.15)]"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2L2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* PLATFORM ADMIN label */}
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-red-400">
                PLATFORM ADMIN
              </p>
              <p className="bg-linear-to-r from-red-300 to-red-100 bg-clip-text font-mono text-xl font-bold text-transparent">
                rust-auth-example
              </p>
            </div>

            {/* ── Page content ── */}
            <div className="px-8 pb-8">
              {/* Suspense required: useSearchParams is used inside PlatformLoginForm. */}
              <Suspense fallback={null}>
                <PlatformLoginForm />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
