/**
 * @fileoverview Forgot-password page — screens 1 (email) and 2 (OTP verification).
 *
 * Screen 1: the visitor enters their email and clicks "Send reset instructions".
 * `forgotPassword(email, tenantId)` is called regardless of account existence.
 * Auth-level outcomes always advance to the OTP screen (anti-enumeration);
 * unexpected (non-auth) errors show a generic banner and halt the wizard.
 *
 * Screen 2: the visitor enters the 6-digit OTP from the email. The code is posted
 * to `POST /auth/password/verify-otp` via `authFetch`. On success the returned
 * `verifiedToken` is stored in the in-memory reset-flow holder and the visitor is
 * routed to `/auth/reset-password`.
 *
 * @module app/(public)/auth/forgot-password/page
 */

'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryState } from 'nuqs';
import { MailOpen } from 'lucide-react';
import { useAuth } from '@bymax-one/rust-auth/react';
import { AUTH_ROUTES, AuthClientError } from '@bymax-one/rust-auth/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthError } from '@/components/auth/auth-error';
import { OtpInput } from '@/components/auth/otp-input';
import { authFetch } from '@/lib/auth-client';
import { setResetVerifiedToken } from '@/lib/reset-flow-store';

/** The page tracks which step of the wizard is active. */
type WizardStep = 'email' | 'otp';

/**
 * Two-screen password-reset request: email entry then OTP verification.
 * Anti-enumeration: both screens show the same neutral outcome regardless
 * of whether the supplied email belongs to an existing account.
 */
export default function ForgotPasswordPage(): React.ReactElement {
  const { forgotPassword } = useAuth();
  const router = useRouter();
  const [rawTenantId] = useQueryState('tenant', { defaultValue: 'acme' });
  /* Guard against malformed tenant slugs from crafted URLs. */
  const tenantId = /^[a-z0-9][a-z0-9-]{0,62}$/.test(rawTenantId) ? rawTenantId : 'acme';
  const [step, setStep] = useState<WizardStep>('email');
  const [email, setEmail] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /* In-flight guard: OtpInput.onComplete can re-fire while a verify is pending
     (e.g. the visitor edits a digit), so a repeat must not start a second request. */
  const isVerifyingRef = useRef(false);

  async function onEmailSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setErrorCode(null);
    setIsSubmitting(true);
    try {
      await forgotPassword(email, tenantId);
    } catch (err) {
      if (!(err instanceof AuthClientError)) {
        /* Unexpected (non-auth) error — surface a generic message and halt here
           so the visitor knows something went wrong, without advancing the wizard.
           `finally` below still calls setIsSubmitting(false). */
        setErrorCode('auth.internal');
        return;
      }
      /* AuthClientErrors are swallowed for anti-enumeration — any auth-level
         outcome (including "not found") advances to the OTP screen with the
         same neutral copy so account existence is never revealed. */
    } finally {
      setIsSubmitting(false);
    }
    /* Always advance to the OTP screen for auth-level outcomes (anti-enumeration). */
    setStep('otp');
  }

  async function onOtpComplete(otp: string): Promise<void> {
    /* Ignore a repeated completion while a verification is already in flight. */
    if (isVerifyingRef.current) return;
    isVerifyingRef.current = true;
    setErrorCode(null);
    try {
      const res = await authFetch(AUTH_ROUTES.PASSWORD_VERIFY_OTP, {
        method: 'POST',
        body: JSON.stringify({ email, otp, tenantId }),
      });
      /* Validate the response shape before trusting the body. An unexpected
         shape (e.g. future API change or a non-2xx resolved by authFetch) must
         produce the generic error banner rather than storing undefined. */
      const body: unknown = await res.json();
      if (
        typeof body !== 'object' ||
        body === null ||
        typeof (body as Record<string, unknown>)['verifiedToken'] !== 'string'
      ) {
        setErrorCode('auth.internal');
        return;
      }
      setResetVerifiedToken((body as { verifiedToken: string }).verifiedToken);
      router.push('/auth/reset-password');
    } catch (err) {
      setErrorCode(
        err instanceof AuthClientError ? (err.code ?? 'auth.internal') : 'auth.internal',
      );
    } finally {
      /* Always clear the guard — including the early-return and error paths. */
      isVerifyingRef.current = false;
    }
  }

  if (step === 'otp') {
    return (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <MailOpen className="mx-auto mb-3 h-10 w-10 text-[#ff6224]" aria-hidden="true" />
          <p className="text-sm text-[rgba(255,255,255,0.5)]">
            If an account exists for{' '}
            <span className="font-mono text-[rgba(255,255,255,0.8)]">{email}</span>, we sent a
            6-digit code. Enter it below.
          </p>
        </div>

        <AuthError code={errorCode} />

        <OtpInput onComplete={(otp) => void onOtpComplete(otp)} />

        <p className="text-center text-sm text-[rgba(255,255,255,0.4)]">
          <button
            type="button"
            className="text-[rgba(255,98,36,0.8)] transition-colors hover:text-[#ff6224]"
            onClick={() => setStep('email')}
          >
            Start over
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-center text-sm text-[rgba(255,255,255,0.5)]">
        Enter your email to receive reset instructions.
      </p>

      <AuthError code={errorCode} />

      <form onSubmit={(e) => void onEmailSubmit(e)} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fp-email" className="text-[rgba(255,255,255,0.7)]">
            Email
          </Label>
          <Input
            id="fp-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] text-white placeholder:text-[rgba(255,255,255,0.3)] focus-visible:ring-[#ff6224]/50"
            required
          />
        </div>

        <Button type="submit" disabled={isSubmitting} size="lg" className="mt-1 w-full">
          {isSubmitting ? 'Sending…' : 'Send reset instructions'}
        </Button>
      </form>

      <p className="text-center text-sm text-[rgba(255,255,255,0.4)]">
        Remember your password?{' '}
        <Link
          href="/auth/login"
          className="text-[rgba(255,98,36,0.8)] transition-colors hover:text-[#ff6224]"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
