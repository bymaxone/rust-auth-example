/**
 * @fileoverview Register page — name, email, and password form with tenant scoping.
 *
 * Submits via `useAuth().register`; on success the session is live (the engine
 * issues an access token even before email verification) and the visitor is routed
 * to `/auth/verify-email`. The active tenant from the topbar URL state is forwarded
 * as `tenantId`. Auth errors are localized through `<AuthError>`.
 *
 * @module app/(public)/auth/register/page
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

/**
 * Register page. Collects name, email, and password; registers under the active
 * tenant; and routes to verify-email on success.
 */
export default function RegisterPage(): React.ReactElement {
  const { register } = useAuth();
  const router = useRouter();
  const [rawTenantId] = useQueryState('tenant', { defaultValue: 'acme' });
  const tenantId = /^[a-z0-9][a-z0-9-]{0,62}$/.test(rawTenantId) ? rawTenantId : 'acme';
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setErrorCode(null);
    setIsSubmitting(true);
    try {
      await register({ email, password, name, tenantId });
      router.push('/auth/verify-email');
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
      <p className="text-center text-sm text-muted-foreground">Create your account</p>

      <AuthError code={errorCode} />

      <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-name">Full name</Label>
          <Input
            id="register-name"
            type="text"
            autoComplete="name"
            placeholder="Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-email">Email</Label>
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-password">Password</Label>
          <Input
            id="register-password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <Button type="submit" disabled={isSubmitting} size="lg" className="mt-1 w-full">
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/auth/login" className="text-primary transition-opacity hover:opacity-80">
          Sign in
        </Link>
      </p>
    </div>
  );
}
