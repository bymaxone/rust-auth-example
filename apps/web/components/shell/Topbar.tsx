/**
 * @fileoverview The fixed 64px topbar with the brand + global controls.
 *
 * Left→right: an orange brand mark (icon badge + gradient wordmark) with a repo
 * link, then the global controls — tenant selector, delivery-mode chip, live
 * toggle, and the session badge. A mobile hamburger toggles the sidebar overlay
 * through `onMenuOpen`. The glass surface (`rgba(10,10,10,0.85)` + blur) and the
 * orange brand mirror the shared design system. Overlays render above it.
 *
 * @module components/shell/Topbar
 */

'use client';

import Link from 'next/link';
import { ExternalLink, Menu } from 'lucide-react';
import { TenantSelector } from '@/components/controls/TenantSelector';
import { DeliveryModeChip } from '@/components/controls/DeliveryModeChip';
import { LiveToggle } from '@/components/controls/LiveToggle';
import { SessionBadge } from '@/components/controls/SessionBadge';
import { Button } from '@/components/ui/button';

/** The repository the console demonstrates. */
const REPO_URL = 'https://github.com/bymaxone/rust-auth-example';

/** Props for {@link Topbar}. */
export interface TopbarProps {
  /** Opens the mobile sidebar overlay (wired to the hamburger, shown below `lg`). */
  readonly onMenuOpen: () => void;
}

/** The fixed topbar: brand on the left, global controls on the right. */
export function Topbar({ onMenuOpen }: TopbarProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-[rgba(255,255,255,0.07)] bg-[rgba(10,10,10,0.85)] px-4 backdrop-blur-md lg:px-6">
      {/* ── Left: brand ── */}
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(255,98,36,0.4)] bg-[rgba(255,98,36,0.15)]"
            aria-hidden="true"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="#ff6224"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="bg-linear-to-r select-none from-[#ff6224] to-amber-200 bg-clip-text font-mono text-sm font-bold leading-tight text-transparent">
            rust-auth-example
          </span>
        </Link>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Open the repository on GitHub"
          className="text-[rgba(255,255,255,0.4)] transition-colors hover:text-[rgba(255,255,255,0.8)]"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {/* ── Right: hamburger (mobile) + global controls ── */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation menu"
          className="flex lg:hidden"
          onClick={onMenuOpen}
        >
          <Menu className="h-4 w-4 text-[rgba(255,255,255,0.7)]" />
        </Button>
        <TenantSelector />
        <DeliveryModeChip />
        <LiveToggle />
        <SessionBadge />
      </div>
    </header>
  );
}
