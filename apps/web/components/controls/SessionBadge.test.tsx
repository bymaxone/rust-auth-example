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

  it('shows the email and signs out when authenticated', async () => {
    // Verifies the authenticated branch renders the email and wires logout.
    useAuthStatus.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useSession.mockReturnValue({ user: { email: 'ada@acme.test' } });
    render(<SessionBadge />);

    const trigger = screen.getByRole('button', { name: /ada@acme\.test/ });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });

    const signOut = await screen.findByText('Sign out');
    fireEvent.click(signOut);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic label when the user is not yet loaded', () => {
    // Verifies the authenticated branch tolerates a null user projection.
    useAuthStatus.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useSession.mockReturnValue({ user: null });
    render(<SessionBadge />);

    expect(screen.getByRole('button', { name: /Account/ })).toBeInTheDocument();
  });
});
