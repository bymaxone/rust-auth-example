/**
 * @fileoverview `/dashboard/security` — the TOTP enrollment lifecycle.
 *
 * Drives MFA setup → verify-enable → enabled, plus disable (destructive-confirm)
 * and recovery-code regeneration — each gated by a fresh TOTP entered through the
 * shared `<OtpInput>`. The enrollment secret and recovery codes are shown once and
 * held only in memory. An explainer notes the secret is sealed at rest with AEAD.
 *
 * @module app/(dashboard)/dashboard/security/page
 */

'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@bymax-one/rust-auth/react';
import { AuthClientError } from '@bymax-one/rust-auth/shared';
import { Lock, ShieldCheck, ShieldOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AuthError } from '@/components/auth/auth-error';
import { OtpInput } from '@/components/auth/otp-input';
import { QrEnrollmentCard } from '@/components/mfa/QrEnrollmentCard';
import { RecoveryCodeGrid } from '@/components/mfa/RecoveryCodeGrid';
import {
  mfaSetup,
  mfaVerifyEnable,
  mfaDisable,
  mfaRegenerateRecoveryCodes,
  type MfaSetupResult,
} from '@/lib/mfa-api';

/** The MFA lifecycle mode. */
type Mode = 'off' | 'enrolling' | 'on';

/** Resolve a wire error code from a caught error. */
function codeOf(err: unknown): string {
  return err instanceof AuthClientError ? (err.code ?? 'auth.internal') : 'auth.internal';
}

/** The AEAD-sealed-secret explainer, shown on every state. */
function AeadExplainer(): React.ReactElement {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          Your TOTP secret is sealed at rest with authenticated encryption (AEAD) and only ever
          decrypted to verify a code. It is shown here once, during enrollment, and never again.
        </span>
      </CardContent>
    </Card>
  );
}

/** The Security / MFA page. */
export default function SecurityPage(): React.ReactElement {
  const { user, status, refresh } = useSession();
  const [mode, setMode] = useState<Mode | null>(null);
  const [setup, setSetup] = useState<MfaSetupResult | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [newCodes, setNewCodes] = useState<readonly string[] | null>(null);

  useEffect(() => {
    if (mode === null && user !== null) setMode(user.mfaEnabled ? 'on' : 'off');
  }, [user, mode]);

  if (status === 'loading' || mode === null) {
    return (
      <div
        className="h-40 w-full animate-pulse rounded-2xl bg-muted"
        role="status"
        aria-label="Loading"
      />
    );
  }

  async function beginEnroll(): Promise<void> {
    setBusy(true);
    setErrorCode(null);
    try {
      setSetup(await mfaSetup());
      setMode('enrolling');
    } catch (err) {
      setErrorCode(codeOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnable(code: string): Promise<void> {
    setErrorCode(null);
    try {
      await mfaVerifyEnable(code);
      setSetup(null);
      setMode('on');
      await refresh();
    } catch (err) {
      setErrorCode(codeOf(err));
    }
  }

  async function disable(code: string): Promise<void> {
    setErrorCode(null);
    try {
      await mfaDisable(code);
      setDisableOpen(false);
      setNewCodes(null);
      setMode('off');
      await refresh();
    } catch (err) {
      setErrorCode(codeOf(err));
    }
  }

  async function regenerate(code: string): Promise<void> {
    setErrorCode(null);
    try {
      setNewCodes(await mfaRegenerateRecoveryCodes(code));
      setRegenerating(false);
    } catch (err) {
      setErrorCode(codeOf(err));
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-mono text-2xl font-bold">Security</h1>
        <p className="text-sm text-muted-foreground">Two-factor authentication (TOTP).</p>
      </div>

      <AuthError code={errorCode} />

      {mode === 'off' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldOff className="h-4 w-4 text-amber-400" aria-hidden="true" />
              2FA not enabled
            </CardTitle>
            <CardDescription>
              Add an authenticator app for a second factor at sign-in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled={busy} onClick={() => void beginEnroll()}>
              {busy ? 'Preparing…' : 'Enable 2FA'}
            </Button>
          </CardContent>
        </Card>
      )}

      {mode === 'enrolling' && setup !== null && (
        <div className="flex flex-col gap-4">
          <QrEnrollmentCard setup={setup} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Confirm the code</CardTitle>
              <CardDescription>Enter the current 6-digit code to activate 2FA.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <OtpInput onComplete={(code) => void verifyEnable(code)} />
              <Button variant="ghost" size="sm" onClick={() => setMode('off')}>
                Cancel
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {mode === 'on' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              2FA enabled
              <Badge variant="outline" className="font-mono">
                active
              </Badge>
            </CardTitle>
            <CardDescription>Manage your recovery codes or turn off two-factor.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewCodes(null);
                  setRegenerating((v) => !v);
                }}
              >
                Regenerate recovery codes
              </Button>

              <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    Disable 2FA
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disable two-factor authentication?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Enter a current authenticator code to confirm. This weakens your account
                      security.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <OtpInput onComplete={(code) => void disable(code)} />
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDisableOpen(false)}>
                      Cancel
                    </AlertDialogCancel>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {regenerating && (
              <div className="flex flex-col gap-3 rounded-lg border border-(--glass-border) p-4">
                <p className="text-sm text-muted-foreground">
                  Enter a current code to generate a fresh set of recovery codes.
                </p>
                <OtpInput onComplete={(code) => void regenerate(code)} />
              </div>
            )}

            {newCodes !== null && <RecoveryCodeGrid codes={newCodes} />}
          </CardContent>
        </Card>
      )}

      <AeadExplainer />
    </section>
  );
}
