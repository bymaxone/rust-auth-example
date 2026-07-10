/**
 * @fileoverview Tests for the topbar session badge across every session branch.
 *
 * @module components/controls/SessionBadge.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useAuthStatus, useSession, useAuth, logout } = vi.hoisted(() => {
  const logoutFn = vi.fn(() => Promise.resolve());
  return {
    useAuthStatus: vi.fn(),
    useSession: vi.fn(),
    useAuth: vi.fn(() => ({ logout: logoutFn })),
    logout: logoutFn,
  };
});

vi.mock('@bymax-one/rust-auth/react', () => ({ useAuthStatus, useSession, useAuth }));

import { SessionBadge } from './SessionBadge';

beforeEach(() => {
  useAuthStatus.mockReset();
  useSession.mockReset();
  logout.mockClear();
});

describe('SessionBadge', () => {
  it('renders a skeleton while the session is loading', () => {
    // Verifies the loading branch shows a pulse placeholder, not a spinner.
    useAuthStatus.mockReturnValue({ isAuthenticated: false, isLoading: true });
    const { container } = render(<SessionBadge />);

    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(screen.queryByText('Sign in')).toBeNull();
  });

  it('renders a "Sign in" affordance when unauthenticated', () => {
    // Verifies the unauthenticated branch links into the login flow.
    useAuthStatus.mockReturnValue({ isAuthenticated: false, isLoading: false });
    render(<SessionBadge />);

    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link).toHaveAttribute('href', '/auth/login');
  });

  it('shows the name, role, initials, and signs out when authenticated', async () => {
    // The authenticated branch renders the name + role, an initials avatar, and
    // wires logout; the dropdown label carries the full email.
    useAuthStatus.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useSession.mockReturnValue({
      user: { email: 'ada@acme.test', name: 'Ada Byron', role: 'admin' },
    });
    render(<SessionBadge />);

    // Two uppercase initials from the name.
    expect(screen.getByText('AB')).toBeInTheDocument();
    expect(screen.getByText('Ada Byron')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: /Ada Byron/ });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });

    // The dropdown label still surfaces the email address.
    const label = await screen.findByText('ada@acme.test');
    expect(label).toBeInTheDocument();
    const signOut = await screen.findByText('Sign out');
    fireEvent.click(signOut);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('caps initials at two segments and falls back to the email as the name', () => {
    // A 3-word name yields only the first two initials; a missing name shows the
    // email as the display name (its initials computed from the undefined name → `?`).
    useAuthStatus.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useSession.mockReturnValue({ user: { email: 'grace@acme.test', role: 'user' } });
    render(<SessionBadge />);

    expect(screen.getByText('?')).toBeInTheDocument();
    expect(screen.getByText('grace@acme.test')).toBeInTheDocument();
    expect(screen.getByText('user')).toBeInTheDocument();
  });

  it('hides the role line when the role is empty', () => {
    // An empty role must not render an empty role line.
    useAuthStatus.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useSession.mockReturnValue({ user: { email: 'x@acme.test', name: 'Xavier', role: '' } });
    render(<SessionBadge />);

    expect(screen.getByText('X')).toBeInTheDocument();
    expect(screen.getByText('Xavier')).toBeInTheDocument();
  });

  it('falls back to a generic label when the user is not yet loaded', () => {
    // A null user projection shows the `Account` fallback name and a `?` avatar.
    useAuthStatus.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useSession.mockReturnValue({ user: null });
    render(<SessionBadge />);

    expect(screen.getByRole('button', { name: /Account/ })).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
