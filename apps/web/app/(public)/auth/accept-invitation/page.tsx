/**
 * @fileoverview Accept-invitation page — name and password form via emailed link.
 *
 * The invitation token is read from the URL `?token=` query param. It is passed
 * directly to the accept endpoint; it is never persisted anywhere else. A missing
 * token shows a clear "open the link from your email" message. An invalid or
 * expired token surfaces through `<AuthError>`. On success the engine issues a
 * session and the visitor is routed to `/dashboard`.
 *
 * @module app/(public)/auth/accept-invitation/page
 */

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AUTH_ROUTES, AuthClientError } from '@bymax-one/rust-auth/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthError } from '@/components/auth/auth-error';
import { authFetch } from '@/lib/auth-client';

/**
 * Accept-invitation page. Reads the token from the URL, submits name + password
 * to the accept endpoint, and routes to /dashboard on the issued session.
 */
export default function AcceptInvitationPage(): React.ReactElement {
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* No token (missing, or an empty `?token=`) — the visitor must open the emailed link. */
  if (!token) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-sm text-[rgba(255,255,255,0.5)]">
          Open the invitation link from your email to continue.
        </p>
      </div>
    );
  }

  async function accept(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (token === null) return;
    setErrorCode(null);
    setIsSubmitting(true);
    try {
      await authFetch(AUTH_ROUTES.INVITATIONS_ACCEPT, {
        method: 'POST',
        body: JSON.stringify({ token, name, password }),
      });
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
      <p className="text-center text-sm text-[rgba(255,255,255,0.5)]">
        Set your name and a password to activate your account.
      </p>

      <AuthError code={errorCode} />

      <form onSubmit={(e) => void accept(e)} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inv-name" className="text-[rgba(255,255,255,0.7)]">
            Full name
          </Label>
          <Input
            id="inv-name"
            type="text"
            autoComplete="name"
            placeholder="Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] text-white placeholder:text-[rgba(255,255,255,0.3)] focus-visible:ring-[#ff6224]/50"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inv-password" className="text-[rgba(255,255,255,0.7)]">
            Password
          </Label>
          <Input
            id="inv-password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] text-white placeholder:text-[rgba(255,255,255,0.3)] focus-visible:ring-[#ff6224]/50"
            required
          />
        </div>

        <Button type="submit" disabled={isSubmitting} size="lg" className="mt-1 w-full">
          {isSubmitting ? 'Activating…' : 'Activate account'}
        </Button>
      </form>
    </div>
  );
}
