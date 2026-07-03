/**
 * @fileoverview `/dashboard/trigger` — the Trigger Center Playground.
 *
 * A card per feature: register, login, force-MFA, rotate token, hammer login to a
 * 429, force lockout, dispatch verify-email / password-reset, and provoke an
 * error. Each card calls the library directly and, on firing, pivots the Audit
 * Explorer to the resulting actor/event through the shared `nuqs` state. The
 * credentials entered here are sent to the API only — the password is never
 * displayed, and every raw response is secret-redacted upstream.
 *
 * @module app/(dashboard)/dashboard/trigger/page
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TriggerCard } from '@/components/trigger/TriggerCard';
import { useAuditPivot } from '@/lib/audit-pivot';
import {
  runRegister,
  runLogin,
  rotateToken,
  hammerLogin,
  forceLockout,
  dispatchVerifyEmail,
  dispatchPasswordReset,
  provokeInvalidCredentials,
  type TriggerResult,
} from '@/lib/trigger-actions';

/** The Trigger Center Playground page. */
export default function TriggerCenterPage(): React.ReactElement {
  const { pivotTo } = useAuditPivot();
  const [email, setEmail] = useState('demo@acme.test');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('acme');

  /** Fire an action, then pivot the Audit table to the resulting actor/event. */
  function withPivot(
    run: () => Promise<TriggerResult>,
    event: string,
  ): () => Promise<TriggerResult> {
    return async () => {
      const result = await run();
      pivotTo({ actor: email, event });
      return result;
    };
  }

  const name = email.split('@')[0] ?? 'demo';

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-mono text-2xl font-bold">Trigger Center</h1>
        <p className="text-sm text-muted-foreground">
          Fire every feature and watch it land — each card shows the raw request and response and
          pivots the Audit Explorer to the resulting row.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Playground credentials</CardTitle>
          <CardDescription>Sent to the API only; the password is never displayed.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trigger-email">Email</Label>
            <Input
              id="trigger-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trigger-password">Password</Label>
            <Input
              id="trigger-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trigger-tenant">Tenant</Label>
            <Input
              id="trigger-tenant"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <TriggerCard
          title="Register"
          description="Create a new tenant user via authClient.register."
          actionLabel="Register"
          onFire={withPivot(() => runRegister({ email, password, name, tenantId }), 'on_register')}
        />
        <TriggerCard
          title="Login"
          description="Sign in via authClient.login."
          actionLabel="Login"
          onFire={withPivot(() => runLogin({ email, password, tenantId }), 'on_login_success')}
        />
        <TriggerCard
          title="Force MFA"
          description="Login as an MFA-enabled user to surface the mfa_required branch."
          actionLabel="Challenge"
          onFire={withPivot(() => runLogin({ email, password, tenantId }), 'on_mfa_required')}
        />
        <TriggerCard
          title="Rotate token"
          description="Rotate the access/refresh pair via authClient.refresh."
          actionLabel="Rotate"
          onFire={withPivot(() => rotateToken(), 'on_token_rotated')}
        />
        <TriggerCard
          title="Hammer login → 429"
          description="Fire logins back-to-back to trip the login rate limit."
          actionLabel="Hammer"
          onFire={withPivot(() => hammerLogin({ email, password, tenantId }), 'on_rate_limited')}
        />
        <TriggerCard
          title="Force lockout"
          description="Drive the account toward lockout via the diagnostics route."
          actionLabel="Lock out"
          onFire={withPivot(() => forceLockout(email, tenantId), 'on_account_locked')}
        />
        <TriggerCard
          title="Dispatch verify-email"
          description="Resend the verification email (anti-enumeration)."
          actionLabel="Dispatch"
          onFire={withPivot(() => dispatchVerifyEmail(email, tenantId), 'on_verification_sent')}
        />
        <TriggerCard
          title="Dispatch password reset"
          description="Send a password-reset email via authClient.forgotPassword."
          actionLabel="Dispatch"
          onFire={withPivot(
            () => dispatchPasswordReset(email, tenantId),
            'on_password_reset_requested',
          )}
        />
        <TriggerCard
          title="Provoke error"
          description="Sign in with a wrong password to elicit auth.invalid_credentials."
          actionLabel="Provoke"
          onFire={withPivot(() => provokeInvalidCredentials(email, tenantId), 'on_login_failed')}
        />
      </div>
    </section>
  );
}
