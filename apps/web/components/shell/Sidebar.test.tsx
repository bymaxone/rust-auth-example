/**
 * @fileoverview Tests for the navigation sidebar: active-route highlighting, the
 * admin-gated items, and the user footer.
 *
 * @module components/shell/Sidebar.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname }));

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock('@bymax-one/rust-auth/react', () => ({ useSession }));

import { Sidebar } from './Sidebar';

/** A minimal session user with the given role. */
function userWithRole(role: string) {
  return { user: { name: 'Acme Admin', role, tenantId: 'acme', email: 'a@acme.test' } };
}

describe('Sidebar', () => {
  beforeEach(() => {
    useSession.mockReturnValue(userWithRole('admin'));
  });

  it('renders both nav sections and marks the active route', () => {
    // The active link carries aria-current while the others do not.
    usePathname.mockReturnValue('/dashboard/audit');
    render(<Sidebar isOpen={false} />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Audit log/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Overview/ })).not.toHaveAttribute('aria-current');
  });

  it('lists every dashboard console surface for an admin', () => {
    // Every authenticated surface must be reachable from the primary nav.
    usePathname.mockReturnValue('/');
    render(<Sidebar isOpen={false} />);

    for (const label of [
      'Overview',
      'Trigger Center',
      'Security',
      'Sessions',
      'OAuth',
      'Invitations',
      'Audit log',
      'Account',
    ]) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    }
    // The Overview link points at the console root, not `/dashboard`.
    expect(screen.getByRole('link', { name: /Overview/ })).toHaveAttribute('href', '/');
  });

  it('hides the admin-only items (Invitations, Audit log) for a non-admin', () => {
    // A plain `user` sees the same console with the admin-gated items removed.
    usePathname.mockReturnValue('/');
    useSession.mockReturnValue(userWithRole('user'));
    render(<Sidebar isOpen={false} />);

    expect(screen.queryByRole('link', { name: /Invitations/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Audit log/ })).not.toBeInTheDocument();
    // Non-gated items remain.
    expect(screen.getByRole('link', { name: /Overview/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Security/ })).toBeInTheDocument();
  });

  it('marks the exact-match Overview active only on the root path', () => {
    // The `exact` flag means `/` is active on `/` but not on a deeper dashboard route.
    usePathname.mockReturnValue('/');
    render(<Sidebar isOpen={false} />);
    expect(screen.getByRole('link', { name: /Overview/ })).toHaveAttribute('aria-current', 'page');
  });

  it('does not mark Overview active on a nested dashboard route', () => {
    // Guards against a prefix mutation: `/` must NOT match `/dashboard/security`.
    usePathname.mockReturnValue('/dashboard/security');
    render(<Sidebar isOpen={false} />);
    expect(screen.getByRole('link', { name: /Overview/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /Security/ })).toHaveAttribute('aria-current', 'page');
  });

  it('marks a prefix-match item active on its nested route', () => {
    // A non-exact item highlights on a deeper path via `startsWith`.
    usePathname.mockReturnValue('/dashboard/security/reauth');
    render(<Sidebar isOpen={false} />);
    expect(screen.getByRole('link', { name: /Security/ })).toHaveAttribute('aria-current', 'page');
  });

  it('applies the orange left-border active treatment and muted inactive tokens', () => {
    // Pins the exact class strings on both branches: the active link carries the
    // orange border/tint/text, inactive links stay muted, and every link keeps the
    // shared layout tokens. Dropping any literal diverges the output.
    usePathname.mockReturnValue('/dashboard/audit');
    render(<Sidebar isOpen={false} />);

    const active = screen.getByRole('link', { name: /Audit log/ });
    const inactive = screen.getByRole('link', { name: /Overview/ });

    // Shared base tokens (present regardless of active state).
    expect(active).toHaveClass('rounded-lg');
    expect(active).toHaveClass('border-l-2');
    expect(inactive).toHaveClass('rounded-lg');
    expect(inactive).toHaveClass('border-l-2');

    // Active branch tokens (brand orange).
    expect(active).toHaveClass('border-l-[#ff6224]');
    expect(active).toHaveClass('bg-[rgba(255,98,36,0.1)]');
    expect(active).toHaveClass('text-[#ff6224]');

    // Inactive branch tokens.
    expect(inactive).toHaveClass('border-l-transparent');
    expect(inactive).toHaveClass('text-[rgba(255,255,255,0.55)]');
    expect(inactive).not.toHaveClass('text-[#ff6224]');
  });

  it('renders the user footer with the name and an orange role pill', () => {
    // The footer surfaces the tenant, name, and role from the session.
    usePathname.mockReturnValue('/');
    render(<Sidebar isOpen={false} />);
    expect(screen.getByText('Acme Admin')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('acme')).toBeInTheDocument();
  });

  it('omits the user footer when there is no session', () => {
    // A null user (loading/anonymous) renders the nav without a footer identity.
    usePathname.mockReturnValue('/');
    useSession.mockReturnValue({ user: null });
    render(<Sidebar isOpen={false} />);
    expect(screen.queryByText('Acme Admin')).not.toBeInTheDocument();
    // The nav itself still renders.
    expect(screen.getByRole('link', { name: /Overview/ })).toBeInTheDocument();
  });

  it('invokes onNavClick when a nav link is clicked', () => {
    // With an onNavClick handler wired, clicking a link fires it (so the shell can
    // dismiss the mobile overlay); this also exercises the handler-present branches.
    usePathname.mockReturnValue('/');
    const onNavClick = vi.fn();
    render(<Sidebar isOpen onNavClick={onNavClick} />);

    fireEvent.click(screen.getByRole('link', { name: /Security/ }));
    expect(onNavClick).toHaveBeenCalledTimes(1);
  });

  it('shows the open overlay with flex and hides it when closed', () => {
    // The `isOpen` flag toggles the mobile overlay visibility class.
    usePathname.mockReturnValue('/');
    const { rerender } = render(<Sidebar isOpen />);
    expect(screen.getByRole('navigation')).toHaveClass('flex');

    rerender(<Sidebar isOpen={false} />);
    expect(screen.getByRole('navigation')).toHaveClass('hidden');
  });
});
