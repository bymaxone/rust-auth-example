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

import { useState } from 'react';
import { AlertTriangle, Check, Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Props for {@link RecoveryCodeGrid}. */
export interface RecoveryCodeGridProps {
  /** The one-time recovery codes to display. */
  readonly codes: readonly string[];
}

/** Render the recovery codes with a shown-once warning and save affordances. */
export function RecoveryCodeGrid({ codes }: RecoveryCodeGridProps) {
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(text);
    setCopied(true);
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
            className="bg-(--glass-bg) rounded-md px-3 py-2 text-center font-mono text-sm tracking-widest text-foreground"
          >
            {code}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={copied ? 'Recovery codes copied' : 'Copy recovery codes'}
          onClick={() => void copy()}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Download className="h-4 w-4" />
          Download
        </Button>
      </div>
    </div>
  );
}
