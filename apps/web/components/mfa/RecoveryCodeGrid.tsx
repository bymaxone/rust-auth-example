/**
 * @fileoverview A one-time recovery-code grid with copy + download affordances.
 *
 * Renders the codes as a 2-column mono grid, warns they are shown only once, and
 * offers "Copy" (clipboard) and "Download" (a local text file) so the user can
 * save them. The codes live only in the caller's in-memory state — this component
 * never persists them.
 *
 * @module components/mfa/RecoveryCodeGrid
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** How long the "Copied" confirmation stays before reverting. */
const COPIED_RESET_MS = 2_000;

/** Props for {@link RecoveryCodeGrid}. */
export interface RecoveryCodeGridProps {
  /** The one-time recovery codes to display. */
  readonly codes: readonly string[];
}

/** Render the recovery codes with a shown-once warning and save affordances. */
export function RecoveryCodeGrid({ codes }: RecoveryCodeGridProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const text = codes.join('\n');

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

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFailed(false);
      setCopied(true);
      scheduleReset();
    } catch {
      // Clipboard write may be denied (permission or non-secure context).
      setCopyFailed(true);
      scheduleReset();
    }
  }

  function download(): void {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'recovery-codes.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-xs text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        Save these now — they are shown only once.
      </p>
      <ul className="grid grid-cols-2 gap-2" aria-label="Recovery codes">
        {codes.map((code) => (
          <li
            key={code}
            className="bg-(--glass-bg) rounded-md px-3 py-2 text-center font-mono text-sm tracking-widest text-[rgba(255,255,255,0.85)]"
          >
            {code}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          type="button"
          variant={copyFailed ? 'destructive' : 'outline'}
          size="sm"
          aria-label={
            copied ? 'Recovery codes copied' : copyFailed ? 'Copy failed' : 'Copy recovery codes'
          }
          onClick={() => void copy()}
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
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Download className="h-4 w-4" />
          Download
        </Button>
      </div>
    </div>
  );
}
