/**
 * @fileoverview The admin invite form (email + role).
 *
 * Validates the email and posts `{ email, role, tenantName? }` to
 * `POST /auth/invitations` — never a `tenantId` (the route derives it from the
 * caller's claims). Shows a success confirmation or the localized error, and
 * notifies the parent so the pending list can refresh. Composes the design-system
 * `Input`/`Label`/`Button`.
 *
 * @module components/invitations/InviteForm
 */

'use client';

import { useState } from 'react';
import { AuthClientError } from '@bymax-one/rust-auth/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AuthError } from '@/components/auth/auth-error';
import { createInvitation } from '@/lib/invitations-api';

/** A permissive email shape check for client-side validation. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The selectable roles. */
const ROLES: readonly string[] = ['member', 'admin'];

/** Props for {@link InviteForm}. */
export interface InviteFormProps {
  /** Called after a successful invitation so the pending list can refresh. */
  readonly onInvited?: () => void;
}

/** The admin invite form. */
export function InviteForm({ onInvited }: InviteFormProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorCode(null);
    setValidationError(null);
    setSuccess(null);
    if (!EMAIL_RE.test(email)) {
      setValidationError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      await createInvitation({ email, role });
      setSuccess(`Invitation sent to ${email}.`);
      setEmail('');
      onInvited?.();
    } catch (err) {
      setErrorCode(
        err instanceof AuthClientError ? (err.code ?? 'auth.internal') : 'auth.internal',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={(e) => void submit(e)}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={validationError !== null}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="border-(--glass-border) bg-(--glass-bg) h-12 w-full rounded-full border px-5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {validationError !== null && (
        <p className="text-sm text-destructive" role="alert">
          {validationError}
        </p>
      )}
      <AuthError code={errorCode} />
      {success !== null && (
        <p className="text-sm text-emerald-400" role="status">
          {success}
        </p>
      )}

      <Button type="submit" disabled={busy}>
        {busy ? 'Sending…' : 'Send invitation'}
      </Button>
    </form>
  );
}
