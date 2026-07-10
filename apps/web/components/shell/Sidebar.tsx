/**
 * @fileoverview The 250px navigation sidebar, split into Dashboard + Platform.
 *
 * The active route is marked with a 2px orange left border + orange tint (the
 * shared design-system treatment). Admin-only items (Invitations, Audit) are
 * hidden for non-admin roles. A user footer shows the tenant, name, and an
 * orange role pill. Collapses below `lg` into a fixed overlay toggled from the
 * topbar. Styling uses the shared design-system palette expressed as explicit
 * brand values (the `#ff6224` orange and the rgba glass surfaces); it never
 * re-styles a shared `ui/*` primitive.
 *
 * @module components/shell/Sidebar
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  KeyRound,
  LayoutDashboard,
  Mail,
  MonitorSmartphone,
  ScrollText,
  ShieldCheck,
  User,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from '@bymax-one/rust-auth/react';
import { cn } from '@/lib/utils';

/** One entry in a navigation section. */
interface NavItem {
  /** The destination path. */
  readonly href: string;
  /** The visible label. */
  readonly label: string;
  /** The leading icon. */
  readonly icon: LucideIcon;
  /** When true, only an exact path match marks the item active (for `/`). */
  readonly exact?: boolean;
  /** When true, only an `admin` role sees this item. */
  readonly adminOnly?: boolean;
}

const DASHBOARD_NAV: readonly NavItem[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/trigger', label: 'Trigger Center', icon: Zap },
  { href: '/dashboard/security', label: 'Security', icon: ShieldCheck },
  { href: '/dashboard/sessions', label: 'Sessions', icon: MonitorSmartphone },
  { href: '/dashboard/oauth', label: 'OAuth', icon: KeyRound },
  { href: '/dashboard/invitations', label: 'Invitations', icon: Mail, adminOnly: true },
  { href: '/dashboard/audit', label: 'Audit log', icon: ScrollText, adminOnly: true },
  { href: '/dashboard/account', label: 'Account', icon: User },
];

const PLATFORM_NAV: readonly NavItem[] = [
  { href: '/platform/tenants', label: 'Tenants', icon: Building2 },
  { href: '/platform/users', label: 'Users', icon: Users },
];

/** Dashboard roles that may view admin-only nav items. */
const ADMIN_ROLES = new Set(['admin']);

/** Base + state classes for a nav link (orange left-border active treatment). */
const NAV_ITEM_BASE_CLASS =
  'flex items-center gap-3 rounded-lg border-l-2 px-3 py-[10px] text-sm transition-all duration-150';
const NAV_ITEM_ACTIVE_CLASS =
  'border-l-[#ff6224] bg-[rgba(255,98,36,0.1)] font-semibold text-[#ff6224]';
const NAV_ITEM_INACTIVE_CLASS =
  'border-l-transparent font-normal text-[rgba(255,255,255,0.55)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.8)]';
const ICON_BASE_CLASS = 'h-4 w-4 shrink-0';
const ICON_ACTIVE_CLASS = 'text-[#ff6224]';
const ICON_INACTIVE_CLASS = 'text-[rgba(255,255,255,0.4)]';

/** A single nav link with the orange active treatment. */
function NavLink({
  item,
  active,
  onNavClick,
}: {
  readonly item: NavItem;
  readonly active: boolean;
  readonly onNavClick?: () => void;
}) {
  const Icon = item.icon;
  const linkExtras = onNavClick !== undefined ? { onClick: onNavClick } : {};
  return (
    <Link
      href={item.href}
      {...linkExtras}
      aria-current={active ? 'page' : undefined}
      className={cn(NAV_ITEM_BASE_CLASS, active ? NAV_ITEM_ACTIVE_CLASS : NAV_ITEM_INACTIVE_CLASS)}
    >
      <Icon className={cn(ICON_BASE_CLASS, active ? ICON_ACTIVE_CLASS : ICON_INACTIVE_CLASS)} />
      {item.label}
    </Link>
  );
}

/** Whether `pathname` marks `item` active (exact for `/`, prefix otherwise). */
function isItemActive(item: NavItem, pathname: string): boolean {
  return item.exact === true ? pathname === item.href : pathname.startsWith(item.href);
}

/** A titled group of nav links. */
function NavSection({
  title,
  items,
  pathname,
  onNavClick,
}: {
  readonly title: string;
  readonly items: readonly NavItem[];
  readonly pathname: string;
  readonly onNavClick?: () => void;
}) {
  const childExtras = onNavClick !== undefined ? { onNavClick } : {};
  return (
    <div className="flex flex-col gap-1">
      <p className="px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-[rgba(255,255,255,0.35)]">
        {title}
      </p>
      {items.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          active={isItemActive(item, pathname)}
          {...childExtras}
        />
      ))}
    </div>
  );
}

/** Props for {@link Sidebar}. */
export interface SidebarProps {
  /** Whether the mobile overlay is open (controlled by the shell). */
  readonly isOpen: boolean;
  /** Called when a nav link is clicked, so the shell can dismiss the overlay. */
  readonly onNavClick?: () => void;
}

/** The 250px sidebar: a fixed overlay below `lg`, a sticky column at `lg+`. */
export function Sidebar({ isOpen, onNavClick }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useSession();
  const isAdmin = user !== null && ADMIN_ROLES.has(user.role);
  const dashboardItems = DASHBOARD_NAV.filter((item) => item.adminOnly !== true || isAdmin);
  const childExtras = onNavClick !== undefined ? { onNavClick } : {};

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'z-40 fixed left-0 top-16 h-[calc(100vh-64px)] w-[250px] shrink-0 flex-col overflow-y-auto border-r border-[rgba(255,255,255,0.08)] bg-[rgba(12,12,12,0.98)] lg:sticky lg:top-16 lg:h-[calc(100vh-64px)] lg:flex',
        isOpen ? 'flex' : 'hidden',
      )}
    >
      <div className="flex h-full flex-col gap-6 px-4 py-6">
        <div className="flex flex-1 flex-col gap-6">
          <NavSection
            title="Dashboard"
            items={dashboardItems}
            pathname={pathname}
            {...childExtras}
          />
          <NavSection title="Platform" items={PLATFORM_NAV} pathname={pathname} {...childExtras} />
        </div>

        {user && (
          <div className="mt-4 border-t border-[rgba(255,255,255,0.08)] pt-4">
            <div className="flex flex-col gap-0.5 px-2">
              <span className="truncate font-mono text-xs text-[rgba(255,255,255,0.4)]">
                {user.tenantId}
              </span>
              <span className="truncate text-sm font-medium text-[rgba(255,255,255,0.8)]">
                {user.name}
              </span>
              <span className="mt-1 inline-flex w-fit items-center rounded-full border border-[rgba(255,98,36,0.25)] bg-[rgba(255,98,36,0.12)] px-2 py-0.5">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[#ff6224]">
                  {user.role}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
