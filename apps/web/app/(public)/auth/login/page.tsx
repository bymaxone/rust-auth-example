/**
 * @fileoverview Login page — email + password form with MFA hand-off.
 *
 * Authenticates via `useAuth().login`. On a plain success the visitor is routed to
 * `/dashboard`. When the result carries `mfaTempToken` (MFA challenge) the token is
 * stored in the in-memory holder and the visitor is routed to `/auth/mfa-challenge`.
 * All errors — including unexpected ones — are localized through `<AuthError>` so the
 * page stays usable rather than crashing with an unhandled rejection.
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

/**
 * Login page. Submits email + password, branches on the MFA result, and routes
 * the visitor to the appropriate next step.
 */
export default function LoginPage(): React.ReactElement {
  const { login } = useAuth();
  const router = useRouter();
  const [rawTenantId] = useQueryState('tenant', { defaultValue: 'acme' });
  const tenantId = /^[a-z0-9][a-z0-9-]{0,62}$/.test(rawTenantId) ? rawTenantId : 'acme';
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      <p className="text-center text-sm text-muted-foreground">Sign in to your account</p>

      <AuthError code={errorCode} />

      <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Password</Label>
            <Link
              href="/auth/forgot-password"
              className="text-xs text-primary transition-opacity hover:opacity-80"
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
            required
          />
        </div>

        <Button type="submit" disabled={isSubmitting} size="lg" className="mt-1 w-full">
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link href="/auth/register" className="text-primary transition-opacity hover:opacity-80">
          Create an account
        </Link>
      </p>
    </div>
  );
}
