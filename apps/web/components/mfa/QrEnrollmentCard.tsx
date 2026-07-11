/**
 * @fileoverview The TOTP enrollment card: QR + base32 secret + recovery grid.
 *
 * Renders the `otpauth://` URI as a QR image generated entirely in the browser
 * (so the secret never leaves the client), the copyable base32 `secret` in mono,
 * and the one-time {@link RecoveryCodeGrid}. Rendered as a dark-glass panel.
 * Nothing here is persisted — the secret and codes live only in the render.
 *
 * @module components/mfa/QrEnrollmentCard
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, X } from 'lucide-react';
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
  const [copyFailed, setCopyFailed] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(setup.qrCodeUri)
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [setup.qrCodeUri]);

  // Clear any pending "Copied" / "Copy failed" reset when the component unmounts so the
  // timer never fires against an unmounted tree.
  useEffect(
    () => () => {
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    },
    [],
  );

  // Schedule the label reset, cancelling any timer still in flight so rapid re-copies never
  // stack multiple pending resets.
  function scheduleReset(): void {
    if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setCopied(false);
      setCopyFailed(false);
      resetTimer.current = null;
    }, COPIED_RESET_MS);
  }

  async function copySecret(): Promise<void> {
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopyFailed(false);
      setCopied(true);
      scheduleReset();
    } catch {
      // Clipboard write may be denied (permission or non-secure context).
      setCopyFailed(true);
      scheduleReset();
    }
  }

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6">
      <div className="mb-4">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-widest text-[rgba(255,255,255,0.4)]">
          Scan to enroll
        </h2>
        <p className="mt-1 text-xs text-[rgba(255,255,255,0.35)]">
          Scan the QR with your authenticator, or enter the secret manually.
        </p>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex justify-center">
          {qrDataUrl !== null ? (
            <img
              src={qrDataUrl}
              alt="TOTP enrollment QR code"
              className="h-44 w-44 rounded-lg bg-white p-2"
            />
          ) : (
            <div
              className="h-44 w-44 animate-pulse rounded-lg bg-[rgba(255,255,255,0.05)]"
              role="status"
              aria-label="Rendering QR code"
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-[rgba(255,255,255,0.4)]">
            Manual entry secret
          </span>
          <div className="flex items-center gap-2">
            <code className="bg-(--glass-bg) flex-1 truncate rounded-md px-3 py-2 font-mono text-sm text-[rgba(255,255,255,0.85)]">
              {setup.secret}
            </code>
            <Button
              type="button"
              variant={copyFailed ? 'destructive' : 'outline'}
              size="sm"
              aria-label={copied ? 'Secret copied' : copyFailed ? 'Copy failed' : 'Copy secret'}
              onClick={() => void copySecret()}
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : copyFailed ? (
                <X className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? 'Copied' : copyFailed ? 'Copy failed' : 'Copy'}
            </Button>
          </div>
        </div>

        <RecoveryCodeGrid codes={setup.recoveryCodes} />
      </div>
    </div>
  );
}
