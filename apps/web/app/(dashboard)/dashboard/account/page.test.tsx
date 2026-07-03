/**
 * @fileoverview Tests for the Account page.
 *
 * Covers: the loading skeleton, the unauthenticated prompt, and the me card +
 * diagnostics for an authenticated user.
 *
 * @module app/(dashboard)/dashboard/account/page.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockUseSession = vi.hoisted(() => vi.fn());
vi.mock('@bymax-one/rust-auth/react', () => ({
  useSession: () => mockUseSession() as { user: unknown; status: string },
}));
vi.mock('@/components/account/DiagnosticsMatrix', () => ({
  DiagnosticsMatrix: () => <div>diagnostics</div>,
}));

import AccountPage from './page';

const USER = {
  id: 'u-1',
  email: 'dev@acme.test',
  name: 'Dev User',
  role: 'admin',
  tenantId: 'acme',
  mfaEnabled: true,
  emailVerified: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AccountPage', () => {
  it('shows a skeleton while the session loads', () => {
    // Nothing renders until the session resolves.
    mockUseSession.mockReturnValue({ user: null, status: 'loading' });
    render(<AccountPage />);
    expect(screen.getByRole('status', { name: /Loading/i })).toBeInTheDocument();
  });

  it('prompts to sign in when unauthenticated', () => {
    // An unauthenticated visitor is pointed at login.
    mockUseSession.mockReturnValue({ user: null, status: 'unauthenticated' });
    render(<AccountPage />);
    expect(screen.getByText(/Sign in to view your profile/i)).toBeInTheDocument();
  });

  it('renders the me card and diagnostics for an authenticated user', () => {
    // The profile surfaces identity + MFA/email status, plus diagnostics.
    mockUseSession.mockReturnValue({ user: USER, status: 'authenticated' });
    render(<AccountPage />);
    expect(screen.getByText('Dev User')).toBeInTheDocument();
    expect(screen.getByText('dev@acme.test')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('enabled')).toBeInTheDocument();
    expect(screen.getByText('unverified')).toBeInTheDocument();
    expect(screen.getByText('diagnostics')).toBeInTheDocument();
  });
});
