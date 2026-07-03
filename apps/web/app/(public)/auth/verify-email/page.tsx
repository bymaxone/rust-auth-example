/**
 * @fileoverview Verify-email page — OTP entry and anti-enumeration resend.
 *
 * The visitor's email address is read from the current pre-verification session
 * via `useSession()`. Unauthenticated visitors are prompted to sign in instead.
 * The `<OtpInput>` submits the 6-digit code to `POST /auth/verify-email`; a 204
 * response routes to `/dashboard`. The Resend control always shows the same
 * neutral confirmation (anti-enumeration) — it never reveals whether the address
 * is registered or whether the resend actually sent an email.
 *
 * @module app/(public)/auth/verify-email/page
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryState } from 'nuqs';
import { useSession } from '@bymax-one/rust-auth/react';
import { AUTH_ROUTES, AuthClientError } from '@bymax-one/rust-auth/shared';
import { Button } from '@/components/ui/button';
import { AuthError } from '@/components/auth/auth-error';
import { OtpInput } from '@/components/auth/otp-input';
import { authFetch } from '@/lib/auth-client';

/** Validates that a tenant identifier is a safe lowercase slug. */
const TENANT_ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Milliseconds the resend button remains disabled after a successful attempt. */
const RESEND_COOLDOWN_MS = 30_000;

/**
 * Verify-email page. Submits the emailed OTP code and routes to the dashboard
 * on success. Resend always returns a neutral confirmation (anti-enumeration).
 */
export default function VerifyEmailPage(): React.ReactElement {
  const { user, status } = useSession();
  const router = useRouter();
  const [rawTenantId] = useQueryState('tenant', { defaultValue: 'acme' });
  /* Guard against malformed tenant slugs coming in via crafted URLs. */
  const tenantId = TENANT_ID_RE.test(rawTenantId) ? rawTenantId : 'acme';
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  /* Ref guards: prevent concurrent OTP submissions and rapid resend bursts. */
  const isVerifyingRef = useRef(false);
  const resendDisabledRef = useRef(false);
  /** Timer handle for the resend cooldown; cleared on unmount to avoid stale mutations. */
  const resendCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resendCooldownRef.current !== null) {
        clearTimeout(resendCooldownRef.current);
      }
    };
  }, []);

  /* Unauthenticated visitors cannot verify — point them to login. */
  if (status === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-sm text-muted-foreground">
          Please sign in to verify your email address.
        </p>
        <Link href="/auth/login" className="text-primary transition-opacity hover:opacity-80">
          Go to sign in
        </Link>
      </div>
    );
  }

  /* While the session is loading, user is null — do not render the form yet. */
  if (status === 'loading') {
    return <p className="text-center text-sm text-muted-foreground">Loading…</p>;
  }

  async function verify(otp: string): Promise<void> {
    if (isVerifyingRef.current) return;
    const email = user?.email;
    if (email === undefined) {
      /* No authenticated email — do not post an undefined address; surface a
         generic error instead of issuing a malformed request. */
      setErrorCode('auth.internal');
      return;
    }
    isVerifyingRef.current = true;
    setErrorCode(null);
    try {
      await authFetch(AUTH_ROUTES.VERIFY_EMAIL, {
        method: 'POST',
        body: JSON.stringify({ email, otp, tenantId }),
      });
      router.push('/dashboard');
    } catch (err) {
      setErrorCode(
        err instanceof AuthClientError ? (err.code ?? 'auth.internal') : 'auth.internal',
      );
    } finally {
      isVerifyingRef.current = false;
    }
  }

  async function resend(): Promise<void> {
    /* Cooldown guard: ignore clicks until the previous cooldown window elapses. */
    if (resendDisabledRef.current) return;
    const email = user?.email;
    if (email === undefined) {
      /* No authenticated email — skip the request but keep the neutral
         confirmation so account status is never revealed (anti-enumeration). */
      setResendMessage('If your email is unverified, a new code is on its way.');
      return;
    }
    resendDisabledRef.current = true;
    try {
      await authFetch(AUTH_ROUTES.RESEND_VERIFICATION, {
        method: 'POST',
        body: JSON.stringify({ email, tenantId }),
      });
    } catch {
      /* Swallow errors — the anti-enumeration requirement means we always show
         the same neutral confirmation regardless of the outcome. */
    } finally {
      /* Always show the same neutral confirmation (anti-enumeration). */
      setResendMessage('If your email is unverified, a new code is on its way.');
      /* Re-enable resend after the cooldown window so the user can try again. */
      resendCooldownRef.current = setTimeout(() => {
        resendDisabledRef.current = false;
      }, RESEND_COOLDOWN_MS);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code sent to{' '}
          <span className="font-mono text-foreground">{user?.email ?? 'your email'}</span>.
        </p>
      </div>

      <AuthError code={errorCode} />

      {resendMessage !== null && (
        <p className="text-center text-sm text-muted-foreground" role="status">
          {resendMessage}
        </p>
      )}

      <OtpInput onComplete={(otp) => void verify(otp)} />

      <div className="flex justify-center">
        <Button type="button" variant="ghost" size="sm" onClick={() => void resend()}>
          Resend code
        </Button>
      </div>
    </div>
  );
}
