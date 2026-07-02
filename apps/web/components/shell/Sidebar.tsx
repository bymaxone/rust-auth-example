/**
 * @fileoverview The 250px navigation sidebar, split into Dashboard + Platform.
 *
 * Collapses below `lg`. The active route glows `--primary`. Composes only
 * design-system tokens; never re-styles a primitive.
 *
 * @module components/shell/Sidebar
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  LayoutDashboard,
  MonitorSmartphone,
  ScrollText,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** One entry in a navigation section. */
interface NavItem {
  /** The destination path. */
  readonly href: string;
  /** The visible label. */
  readonly label: string;
  /** The leading icon. */
  readonly icon: LucideIcon;
}

const DASHBOARD_NAV: readonly NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/security', label: 'Security', icon: ShieldCheck },
  { href: '/dashboard/sessions', label: 'Sessions', icon: MonitorSmartphone },
  { href: '/dashboard/audit', label: 'Audit', icon: ScrollText },
];

const PLATFORM_NAV: readonly NavItem[] = [
  { href: '/platform/tenants', label: 'Tenants', icon: Building2 },
  { href: '/platform/users', label: 'Users', icon: Users },
];

/** A single nav link that glows `--primary` when it matches the active route. */
function NavLink({ item, active }: { readonly item: NavItem; readonly active: boolean }) {
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

/** A titled group of nav links. */
function NavSection({
  title,
  items,
  pathname,
}: {
  readonly title: string;
  readonly items: readonly NavItem[];
  readonly pathname: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {items.map((item) => (
        <NavLink key={item.href} item={item} active={pathname === item.href} />
      ))}
    </div>
  );
}

/** The fixed 250px sidebar, hidden below `lg`. */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-[250px] shrink-0 border-r border-(--glass-border) p-4 lg:block">
      <nav aria-label="Primary" className="flex flex-col gap-6">
        <NavSection title="Dashboard" items={DASHBOARD_NAV} pathname={pathname} />
        <NavSection title="Platform" items={PLATFORM_NAV} pathname={pathname} />
      </nav>
    </aside>
  );
}
