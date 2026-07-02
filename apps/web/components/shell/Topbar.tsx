/**
 * @fileoverview The fixed 64px topbar with the brand + global controls.
 *
 * Left→right: brand + repo link, tenant selector, delivery-mode chip, live
 * toggle, and the session badge. Overlays (menus, toasts) render above it.
 *
 * @module components/shell/Topbar
 */

'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { TenantSelector } from '@/components/controls/TenantSelector';
import { DeliveryModeChip } from '@/components/controls/DeliveryModeChip';
import { LiveToggle } from '@/components/controls/LiveToggle';
import { SessionBadge } from '@/components/controls/SessionBadge';

/** The repository the console demonstrates. */
const REPO_URL = 'https://github.com/bymaxone/rust-auth-example';

/** The fixed topbar: brand on the left, global controls on the right. */
export function Topbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-(--glass-border) bg-background/80 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <Link href="/" className="font-mono text-sm font-semibold text-foreground">
          rust-auth-example
        </Link>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Open the repository on GitHub"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
      <div className="flex items-center gap-2">
        <TenantSelector />
        <DeliveryModeChip />
        <LiveToggle />
        <SessionBadge />
      </div>
    </header>
  );
}
