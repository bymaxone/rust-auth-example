/**
 * @fileoverview Tests for the PlatformShell component.
 *
 * Covers: `data-domain="platform"` marker, platform nav links, no tenant
 * selector, and children rendering.
 *
 * @module __tests__/platform/shell.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockPathname = vi.hoisted(() => vi.fn(() => '/platform/security'));
const mockPush = vi.hoisted(() => vi.fn());
const mockLogout = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: mockPathname,
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/lib/platform-client', () => ({
  platformClient: { logout: mockLogout },
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { PlatformShell } from '@/components/platform/PlatformShell';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PlatformShell', () => {
  it('renders the data-domain="platform" attribute', () => {
    // Verifies the domain marker distinguishes the platform shell from the dashboard.
    const { container } = render(
      <PlatformShell>
        <div>content</div>
      </PlatformShell>,
    );
    expect(container.querySelector('[data-domain="platform"]')).toBeInTheDocument();
  });

  it('renders the platform navigation links', () => {
    // Verifies the sidebar contains Security, Sessions, and Users.
    render(
      <PlatformShell>
        <div />
      </PlatformShell>,
    );
    expect(screen.getByRole('link', { name: /security/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sessions/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /users/i })).toBeInTheDocument();
  });

  it('does not render a tenant selector', () => {
    // Verifies the platform shell has no tenant selector — it is tenant-less.
    render(
      <PlatformShell>
        <div />
      </PlatformShell>,
    );
    expect(screen.queryByText(/tenant/i)).not.toBeInTheDocument();
  });

  it('renders children inside the main content area', () => {
    // Verifies slotted content appears in the page body.
    render(
      <PlatformShell>
        <p data-testid="child">Hello</p>
      </PlatformShell>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('marks the active nav link with aria-current="page"', () => {
    // Verifies the active route gets aria-current for accessibility.
    mockPathname.mockReturnValue('/platform/security');
    render(
      <PlatformShell>
        <div />
      </PlatformShell>,
    );
    const securityLink = screen.getByRole('link', { name: /security/i });
    expect(securityLink).toHaveAttribute('aria-current', 'page');
    const usersLink = screen.getByRole('link', { name: /users/i });
    expect(usersLink).not.toHaveAttribute('aria-current', 'page');
  });

  it('applies active-glow tokens to the current nav link and muted tokens to the rest', () => {
    // Pins the exact class strings on both branches: the active platform link
    // carries the primary glow, inactive links stay muted, and every link keeps
    // the shared layout tokens. Dropping any of the three class literals diverges
    // the rendered className.
    mockPathname.mockReturnValue('/platform/security');
    render(
      <PlatformShell>
        <div />
      </PlatformShell>,
    );

    const active = screen.getByRole('link', { name: /security/i });
    const inactive = screen.getByRole('link', { name: /users/i });

    // Shared base tokens (present regardless of active state).
    expect(active).toHaveClass('rounded-md');
    expect(active).toHaveClass('transition-colors');
    expect(inactive).toHaveClass('rounded-md');
    expect(inactive).toHaveClass('transition-colors');

    // Active branch tokens.
    expect(active).toHaveClass('bg-primary/10');
    expect(active).toHaveClass('text-primary');
    expect(active).not.toHaveClass('text-muted-foreground');

    // Inactive branch tokens.
    expect(inactive).toHaveClass('text-muted-foreground');
    expect(inactive).not.toHaveClass('bg-primary/10');
  });

  it('calls platformClient.logout and routes to /platform/login when Sign out is clicked', async () => {
    // Verifies the sign-out button terminates the server-side session (clears the
    // HttpOnly cookie) before navigating to the login page. The server-side logout
    // is critical: a plain navigation without calling logout leaves the session
    // cookie alive and re-admits the admin on the next request.
    mockLogout.mockResolvedValueOnce(undefined);
    render(
      <PlatformShell>
        <div />
      </PlatformShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    await waitFor(() => expect(mockLogout).toHaveBeenCalledOnce());
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/platform/login'));
  });

  it('still routes to /platform/login when logout throws (fail-safe)', async () => {
    // Verifies the finally block routes the admin to login even when the server-side
    // logout fails — the admin is always signed out from the browser's perspective.
    mockLogout.mockRejectedValueOnce(new Error('network error'));
    render(
      <PlatformShell>
        <div />
      </PlatformShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/platform/login'));
  });
});
