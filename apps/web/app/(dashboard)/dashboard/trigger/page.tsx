/**
 * @fileoverview `/dashboard/trigger` — the Trigger Center Playground.
 *
 * A card per feature: register, login, force-MFA, rotate token, hammer login to a
 * 429, force lockout, dispatch verify-email / password-reset, and provoke an
 * error. Each card calls the library directly and, on firing, pivots the Audit
 * Explorer through the shared `nuqs` state. Only the two audited journeys
 * (register → `after_register`, login → `after_login`) pivot to a real event
 * facet; every other feature emits no audit event, so those cards pivot by actor
 * only and say so — no invented event name is ever written. The credentials
 * entered here are sent to the API only — the password is never displayed, and
 * every raw response is secret-redacted upstream.
 *
 * @module app/(dashboard)/dashboard/trigger/page
 */

'use client';

import { useState } from 'react';
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

  /**
   * Fire an action, then pivot the Audit table by actor — and by `event` only when the
   * feature actually emits that audit event. Passing no `event` (a non-audited feature)
   * pivots by actor alone rather than fabricating a facet that would match zero rows.
   */
  function withPivot(
    run: () => Promise<TriggerResult>,
    event?: string,
  ): () => Promise<TriggerResult> {
    return async () => {
      const result = await run();
      pivotTo(event !== undefined ? { actor: email, event } : { actor: email });
      return result;
    };
  }

  const name = email.split('@')[0] ?? 'demo';

  return (
    <section className="flex flex-col gap-8">
      <div>
        <h1 className="font-mono text-2xl font-bold text-white">Trigger Center</h1>
        <p className="mt-1 text-sm text-[rgba(255,255,255,0.5)]">
          Fire every feature and watch it land — each card shows the raw request and response and
          pivots the Audit Explorer to the resulting row.
        </p>
      </div>

      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6">
        <h2 className="mb-1 font-mono text-sm font-semibold uppercase tracking-widest text-[rgba(255,255,255,0.4)]">
          Playground credentials
        </h2>
        <p className="mb-4 text-xs text-[rgba(255,255,255,0.35)]">
          Sent to the API only; the password is never displayed.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <TriggerCard
          title="Register"
          description="Create a new tenant user via authClient.register. Audited as after_register."
          actionLabel="Register"
          onFire={withPivot(
            () => runRegister({ email, password, name, tenantId }),
            'after_register',
          )}
        />
        <TriggerCard
          title="Login"
          description="Sign in via authClient.login. Audited as after_login."
          actionLabel="Login"
          onFire={withPivot(() => runLogin({ email, password, tenantId }), 'after_login')}
        />
        <TriggerCard
          title="Force MFA"
          description="Login as an MFA-enabled user to surface the mfa_required branch. No audit event — actor pivot only."
          actionLabel="Challenge"
          onFire={withPivot(() => runLogin({ email, password, tenantId }))}
        />
        <TriggerCard
          title="Rotate token"
          description="Rotate the access/refresh pair via authClient.refresh. No audit event — actor pivot only."
          actionLabel="Rotate"
          onFire={withPivot(() => rotateToken())}
        />
        <TriggerCard
          title="Hammer login → 429"
          description="Fire logins back-to-back to trip the login rate limit. No audit event — actor pivot only."
          actionLabel="Hammer"
          onFire={withPivot(() => hammerLogin({ email, password, tenantId }))}
        />
        <TriggerCard
          title="Force lockout"
          description="Drive the account toward lockout via the diagnostics route. No audit event — actor pivot only."
          actionLabel="Lock out"
          onFire={withPivot(() => forceLockout(email, tenantId))}
        />
        <TriggerCard
          title="Dispatch verify-email"
          description="Resend the verification email (anti-enumeration). No audit event — actor pivot only."
          actionLabel="Dispatch"
          onFire={withPivot(() => dispatchVerifyEmail(email, tenantId))}
        />
        <TriggerCard
          title="Dispatch password reset"
          description="Send a password-reset email via authClient.forgotPassword. No audit event — actor pivot only."
          actionLabel="Dispatch"
          onFire={withPivot(() => dispatchPasswordReset(email, tenantId))}
        />
        <TriggerCard
          title="Provoke error"
          description="Sign in with a wrong password to elicit auth.invalid_credentials. No audit event — actor pivot only."
          actionLabel="Provoke"
          onFire={withPivot(() => provokeInvalidCredentials(email, tenantId))}
        />
      </div>
    </section>
  );
}
