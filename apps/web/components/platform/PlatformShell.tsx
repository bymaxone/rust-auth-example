/**
 * @fileoverview The tenant-less platform admin shell.
 *
 * Renders a minimal fixed topbar and a 250px sidebar scoped to the platform
 * navigation (Security · Sessions · Users). The `data-domain="platform"` marker
 * on the root element distinguishes the platform shell from the tenant-scoped
 * dashboard shell (`AppShell`) and allows automated cross-domain assertions in
 * the e2e suite. There is intentionally no tenant selector, no delivery-mode
 * chip, and no SSE live-toggle — those belong to the dashboard domain.
 *
 * @module components/platform/PlatformShell
 */

'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MonitorSmartphone, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
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

/** A single nav link that highlights when it matches the active route. */
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
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-primary/10 text-primary shadow-(--shadow-primary)'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

/**
 * The platform console shell: fixed topbar + 250px sidebar + main content area.
 * The `data-domain="platform"` attribute distinguishes this shell from the
 * dashboard `AppShell` in automated tests.
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
      {/* Topbar — platform brand; no tenant selector */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-(--glass-border) bg-background/80 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/platform/security"
            className="font-mono text-sm font-semibold text-foreground"
          >
            rust-auth / platform
          </Link>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Admin
          </span>
        </div>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Sign out
        </button>
      </header>

      <div className="flex pt-16">
        {/* Sidebar — platform navigation only */}
        <aside className="hidden w-[250px] shrink-0 border-r border-(--glass-border) p-4 lg:block">
          <nav aria-label="Platform navigation" className="flex flex-col gap-1">
            <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Platform
            </p>
            {PLATFORM_NAV.map((item) => (
              <PlatformNavLink key={item.href} item={item} active={pathname === item.href} />
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
