/**
 * @fileoverview Topbar identity badge driven by the `/react` session hooks.
 *
 * A cheap status view: a skeleton while the session is validating, the signed-in
 * email + avatar (with a sign-out menu) when authenticated, or a "Sign in"
 * affordance otherwise. Composes only design-system primitives.
 *
 * @module components/controls/SessionBadge
 */

'use client';

import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { useAuth, useAuthStatus, useSession } from '@bymax-one/rust-auth/react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Placeholder shown while the first session validation is in flight. */
function SessionSkeleton() {
  return <div aria-hidden className="h-8 w-32 animate-pulse rounded-full bg-muted" />;
}

/** The unauthenticated affordance: a link into the login flow. */
function SignInButton() {
  return (
    <Button asChild size="sm">
      <Link href="/auth/login">Sign in</Link>
    </Button>
  );
}

/** Up-to-two uppercase initials from a display name, or `?` when it is empty. */
function initialsOf(name: string | undefined): string {
  const parts = (name ?? '').split(' ').filter((segment) => segment.length > 0);
  if (parts.length === 0) {
    return '?';
  }
  return parts
    .slice(0, 2)
    .map((segment) => segment.charAt(0).toUpperCase())
    .join('');
}

/** The authenticated affordance: an orange avatar + name/role with a sign-out menu. */
function AuthenticatedBadge() {
  const { user } = useSession();
  const { logout } = useAuth();
  const email = user?.email ?? 'Account';
  const name = user?.name ?? email;
  const role = user?.role ?? '';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto gap-2 py-1">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-[rgba(255,98,36,0.15)] text-[10px] font-semibold text-[#ff6224]">
              {initialsOf(user?.name)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden flex-col items-start leading-tight lg:flex">
            <span className="max-w-[12rem] truncate font-mono text-xs font-medium text-[rgba(255,255,255,0.8)]">
              {name}
            </span>
            {role !== '' && (
              <span className="font-mono text-[10px] text-[rgba(255,255,255,0.4)]">{role}</span>
            )}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="max-w-[16rem] truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void logout();
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Topbar session badge: skeleton → email/avatar menu → "Sign in". */
export function SessionBadge() {
  const { isAuthenticated, isLoading } = useAuthStatus();
  if (isLoading) {
    return <SessionSkeleton />;
  }
  return isAuthenticated ? <AuthenticatedBadge /> : <SignInButton />;
}
