/**
 * @fileoverview The TOTP enrollment card: QR + base32 secret + recovery grid.
 *
 * Renders the `otpauth://` URI as a QR image generated entirely in the browser
 * (so the secret never leaves the client), the copyable base32 `secret` in mono,
 * and the one-time {@link RecoveryCodeGrid}. Composes the design-system `Card`.
 * Nothing here is persisted — the secret and codes live only in the render.
 *
 * @module components/mfa/QrEnrollmentCard
 */

'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RecoveryCodeGrid } from './RecoveryCodeGrid';
import type { MfaSetupResult } from '@/lib/mfa-api';

/** How long the "Copied" confirmation stays before reverting. */
const COPIED_RESET_MS = 2_000;

/** Props for {@link QrEnrollmentCard}. */
export interface QrEnrollmentCardProps {
  /** The one-time enrollment payload from `mfa/setup`. */
  readonly setup: MfaSetupResult;
}

/** Render the QR, the copyable secret, and the recovery-code grid. */
export function QrEnrollmentCard({ setup }: QrEnrollmentCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(setup.qrCodeUri)
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(null));
  }, [setup.qrCodeUri]);

  async function copySecret(): Promise<void> {
    await navigator.clipboard.writeText(setup.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }

  return (
    <Card>
      <CardHeader accent>
        <CardTitle className="text-base">Scan to enroll</CardTitle>
        <CardDescription>
          Scan the QR with your authenticator, or enter the secret manually.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex justify-center">
          {qrDataUrl !== null ? (
            <img
              src={qrDataUrl}
              alt="TOTP enrollment QR code"
              className="h-44 w-44 rounded-lg bg-white p-2"
            />
          ) : (
            <div
              className="h-44 w-44 animate-pulse rounded-lg bg-muted"
              role="status"
              aria-label="Rendering QR code"
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Manual entry secret
          </span>
          <div className="flex items-center gap-2">
            <code className="bg-(--glass-bg) flex-1 truncate rounded-md px-3 py-2 font-mono text-sm text-foreground">
              {setup.secret}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={copied ? 'Secret copied' : 'Copy secret'}
              onClick={() => void copySecret()}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        <RecoveryCodeGrid codes={setup.recoveryCodes} />
      </CardContent>
    </Card>
  );
}
