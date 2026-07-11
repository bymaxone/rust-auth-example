/**
 * @fileoverview MFA-challenge page — segmented 6-digit TOTP entry.
 *
 * Reads the short-lived MFA temp token from the in-memory holder (set by the
 * login page). If no token is pending, shows a "session expired" state. Otherwise
 * renders the segmented `<OtpInput>` and submits the TOTP code via
 * `authClient.mfaChallenge(tempToken, code)`. On success the session is issued;
 * the page then calls `useSession().refresh()` so the `AuthProvider` re-fetches
 * `GET /auth/me` before navigating — without it the dashboard shell would render
 * from the stale (signed-out) provider state until a manual reload. An
 * `<ExpiryPill>` reflects the ~300 s temp-token lifetime and disables submission
 * when expired.
 *
 * @module app/(public)/auth/mfa-challenge/page
 */

'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthClientError } from '@bymax-one/rust-auth/shared';
import { useSession } from '@bymax-one/rust-auth/react';
import { authClient } from '@/lib/auth-client';
import { consumePendingMfaChallenge } from '@/lib/mfa-challenge-store';
import { AuthError } from '@/components/auth/auth-error';
import { OtpInput } from '@/components/auth/otp-input';
import { ExpiryPill } from '@/components/auth/expiry-pill';

/** The MFA temp token lifetime in seconds (mirrors the server claim). */
const MFA_TEMP_LIFETIME_SECONDS = 300;

/**
 * MFA challenge page. Reads the pending temp token, renders the TOTP input,
 * and routes to /dashboard on success.
 */
export default function MfaChallengePage(): React.ReactElement {
  const router = useRouter();
  /* The provider's revalidation hook — called after a successful challenge so the
     dashboard shell reads the fresh, authenticated session rather than the stale one. */
  const { refresh } = useSession();
  /* Consume the token exactly once on mount; null means no pending challenge. */
  const [tempToken] = useState<string | null>(() => consumePendingMfaChallenge());
  const [expiresAt] = useState<Date>(
    () => new Date(Date.now() + MFA_TEMP_LIFETIME_SECONDS * 1_000),
  );
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  /* Ref guard prevents concurrent OTP submissions from burning server rate limits. */
  const isSubmittingRef = useRef(false);

  if (tempToken === null) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-sm text-[rgba(255,255,255,0.5)]">
          Your sign-in session expired — please sign in again.
        </p>
        <Link
          href="/auth/login"
          className="text-sm text-[rgba(255,98,36,0.8)] transition-colors hover:text-[#ff6224]"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  async function submit(totp: string): Promise<void> {
    /* Narrow tempToken (TypeScript cannot see the early-return guard above). */
    if (isExpired || tempToken === null || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setErrorCode(null);
    try {
      await authClient.mfaChallenge(tempToken, totp);
      /* Revalidate the provider before navigating so the shell renders authenticated
         immediately; `replace` keeps the spent challenge out of the history stack. */
      await refresh();
      router.replace('/dashboard');
    } catch (err) {
      setErrorCode(
        err instanceof AuthClientError ? (err.code ?? 'auth.internal') : 'auth.internal',
      );
    } finally {
      isSubmittingRef.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <p className="text-sm text-[rgba(255,255,255,0.5)]">
          Enter the 6-digit code from your authenticator app.
        </p>
      </div>

      <div className="flex justify-center">
        <ExpiryPill expiresAt={expiresAt} onExpired={() => setIsExpired(true)} />
      </div>

      <AuthError code={errorCode} />

      <OtpInput onComplete={(totp) => void submit(totp)} digitLabel="Authenticator digit" />

      {isExpired && (
        <p className="text-center text-sm text-[rgba(255,255,255,0.5)]">
          Your code expired.{' '}
          <Link
            href="/auth/login"
            className="text-[rgba(255,98,36,0.8)] transition-colors hover:text-[#ff6224]"
          >
            Sign in again
          </Link>
        </p>
      )}
    </div>
  );
}
