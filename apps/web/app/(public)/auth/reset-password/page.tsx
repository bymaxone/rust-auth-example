/**
 * @fileoverview Reset-password page — screen 3 of the password-reset wizard.
 *
 * Reads the `verifiedToken` proof from the in-memory reset-flow holder. If no
 * token is present (the visitor landed directly without completing the OTP step)
 * a "start over" state is shown. On success the visitor is routed to
 * `/auth/login`.
 *
 * @module app/(public)/auth/reset-password/page
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
import { consumeResetVerifiedToken } from '@/lib/reset-flow-store';

/**
 * Reset-password page. Consumes the in-memory verified token, submits the new
 * password, and routes to `/auth/login` on success.
 */
export default function ResetPasswordPage(): React.ReactElement {
  const { resetPassword } = useAuth();
  const router = useRouter();
  const [rawTenantId] = useQueryState('tenant', { defaultValue: 'acme' });
  const tenantId = /^[a-z0-9][a-z0-9-]{0,62}$/.test(rawTenantId) ? rawTenantId : 'acme';
  /* The token is consumed once on mount; a null value means no valid reset flow. */
  const [verifiedToken] = useState<string | null>(() => consumeResetVerifiedToken());
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* No valid token — the visitor must restart the reset flow. */
  if (verifiedToken === null) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-sm text-[rgba(255,255,255,0.5)]">
          Your reset session expired or was already used. Please start over.
        </p>
        <Link
          href="/auth/forgot-password"
          className="text-sm text-[rgba(255,98,36,0.8)] transition-colors hover:text-[#ff6224]"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (verifiedToken === null) return;
    setErrorCode(null);
    setIsSubmitting(true);
    try {
      await resetPassword({ email, tenantId, newPassword, verifiedToken });
      router.push('/auth/login');
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
      <p className="text-center text-sm text-[rgba(255,255,255,0.5)]">
        Choose a new password for your account.
      </p>

      <AuthError code={errorCode} />

      <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rp-email" className="text-[rgba(255,255,255,0.7)]">
            Email
          </Label>
          <Input
            id="rp-email"
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
          <Label htmlFor="rp-password" className="text-[rgba(255,255,255,0.7)]">
            New password
          </Label>
          <Input
            id="rp-password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] text-white placeholder:text-[rgba(255,255,255,0.3)] focus-visible:ring-[#ff6224]/50"
            required
          />
        </div>

        <Button type="submit" disabled={isSubmitting} size="lg" className="mt-1 w-full">
          {isSubmitting ? 'Saving…' : 'Set new password'}
        </Button>
      </form>
    </div>
  );
}
