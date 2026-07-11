/**
 * @fileoverview The tenant-less platform admin shell.
 *
 * Renders a red-tinted fixed topbar and a 250px sidebar scoped to the platform
 * navigation (Security · Sessions · Users). The deep-red colour scheme makes the
 * platform admin area visually impossible to confuse with the tenant dashboard.
 * The `data-domain="platform"` marker on the root element distinguishes the
 * platform shell from the tenant-scoped dashboard shell (`AppShell`) and allows
 * automated cross-domain assertions in the e2e suite. There is intentionally no
 * tenant selector, no delivery-mode chip, and no SSE live-toggle — those belong
 * to the dashboard domain.
 *
 * @module components/platform/PlatformShell
 */

'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, MonitorSmartphone, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { platformClient } from '@/lib/platform-client';

/** One entry in the platform navigation sidebar. */
interface PlatformNavItem {
  /** The destination path. */
  readonly href: string;
  /** The visible label. */
  readonly label: string;
  /** The leading icon. */
  readonly icon: LucideIcon;
}

/** The platform-scoped navigation links. */
const PLATFORM_NAV: readonly PlatformNavItem[] = [
  { href: '/platform/security', label: 'Security', icon: ShieldCheck },
  { href: '/platform/sessions', label: 'Sessions', icon: MonitorSmartphone },
  { href: '/platform/users', label: 'Users', icon: Users },
];

/**
 * A single nav link that highlights when it matches the active route.
 *
 * The active link carries a left-border indicator and a red fill; inactive links
 * stay muted red until hovered. Both branches keep the shared layout tokens.
 */
function PlatformNavLink({
  item,
  active,
}: {
  readonly item: PlatformNavItem;
  readonly active: boolean;
}): React.ReactElement {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg border-l-2 px-3 py-[10px] text-sm transition-all duration-150',
        active
          ? 'border-l-red-500 bg-[rgba(239,68,68,0.15)] font-semibold text-red-300'
          : 'border-l-transparent font-normal text-[rgba(255,200,200,0.55)] hover:bg-[rgba(239,68,68,0.08)] hover:text-red-200',
      )}
    >
      <Icon
        className={cn('h-4 w-4 shrink-0', active ? 'text-red-400' : 'text-[rgba(255,200,200,0.4)]')}
      />
      {item.label}
    </Link>
  );
}

/**
 * The platform console shell: red-tinted fixed topbar + 250px sidebar + main
 * content area. The `data-domain="platform"` attribute distinguishes this shell
 * from the dashboard `AppShell` in automated tests.
 *
 * @param children - The active platform page content.
 */
export function PlatformShell({ children }: { readonly children: ReactNode }): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut(): Promise<void> {
    try {
      await platformClient.logout();
    } catch {
      // Best-effort sign-out: platformClient.logout() calls the BFF to clear the
      // httpOnly access cookie. If that call fails the cookie is NOT cleared here and
      // the server session persists until its natural expiry — navigation still routes
      // to login for a clean UX, but a production console should surface or retry the
      // failure rather than assume an effective sign-out.
    } finally {
      router.push('/platform/login');
    }
  }

  return (
    <div className="min-h-screen bg-background" data-domain="platform">
      {/* Topbar — deep-red platform brand; no tenant selector */}
      <header
        className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-[rgba(239,68,68,0.3)] bg-red-950 px-4 text-red-50 lg:px-6"
        role="banner"
      >
        {/* ── Left: PLATFORM ADMIN brand ── */}
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(239,68,68,0.5)] bg-[rgba(239,68,68,0.25)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="#fca5a5"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <Link href="/platform/security" className="flex flex-col">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-red-400">
              PLATFORM ADMIN
            </span>
            <span className="font-mono text-sm font-semibold text-red-100">rust-auth-example</span>
          </Link>
        </div>

        {/* ── Right: admin identity + sign out ── */}
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 lg:flex">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-[rgba(239,68,68,0.25)] text-[10px] font-semibold text-red-300">
                PA
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-mono text-xs font-medium text-red-100">Platform Admin</span>
              <span className="font-mono text-[10px] text-red-400">Administrator</span>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="text-red-300 hover:bg-[rgba(239,68,68,0.15)] hover:text-red-100"
            onClick={() => void handleSignOut()}
          >
            <LogOut className="mr-1 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <div className="flex pt-16">
        {/* Sidebar — platform navigation only, deep-red scheme */}
        <nav
          aria-label="Platform navigation"
          className="sticky top-16 hidden h-[calc(100vh-64px)] w-[250px] shrink-0 flex-col overflow-y-auto border-r border-[rgba(239,68,68,0.2)] bg-[rgba(10,0,0,0.98)] lg:flex"
        >
          <div className="flex h-full flex-col px-4 py-6">
            <div className="flex flex-1 flex-col gap-1">
              {PLATFORM_NAV.map((item) => (
                <PlatformNavLink key={item.href} item={item} active={pathname === item.href} />
              ))}
            </div>

            {/* Bottom label — reinforces the platform context */}
            <div className="mt-4 border-t border-[rgba(239,68,68,0.15)] pt-4">
              <p className="px-2 font-mono text-[10px] uppercase tracking-widest text-red-800">
                Platform Admin Area
              </p>
            </div>
          </div>
        </nav>

        <main className="min-w-0 flex-1 px-6 py-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
