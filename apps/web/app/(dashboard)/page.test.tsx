/**
 * @fileoverview Tests for the Overview page.
 *
 * Covers: the unauthenticated sign-in prompt, the loading skeleton, the aggregate
 * happy path (health cards + provider chips + audit link), and the error + retry.
 *
 * @module app/(dashboard)/page.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const mockUseSession = vi.hoisted(() => vi.fn());
const mockFetchAggregate = vi.hoisted(() => vi.fn());

vi.mock('@bymax-one/rust-auth/react', () => ({
  useSession: () => mockUseSession() as { status: string },
}));
vi.mock('@/lib/audit-aggregate', () => ({ fetchAuditAggregate: mockFetchAggregate }));

import OverviewPage from './page';

const AGGREGATE = {
  loginSuccessRate: 0.98,
  verifySuccessRate: 0.8,
  activeSessions: 12,
  mfaEnrolledPct: 0.4,
  emailProvider: 'mailpit' as const,
  oauthGoogleEnabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OverviewPage', () => {
  it('prompts to sign in when unauthenticated', () => {
    // Unauthenticated visitors must be pointed at the login page, not the data.
    mockUseSession.mockReturnValue({ status: 'unauthenticated' });
    render(<OverviewPage />);
    expect(screen.getByText(/Sign in to populate/i)).toBeInTheDocument();
    expect(mockFetchAggregate).not.toHaveBeenCalled();
  });

  it('shows skeleton cards while the session resolves', () => {
    // A loading session must render skeletons, never a spinner.
    mockUseSession.mockReturnValue({ status: 'loading' });
    render(<OverviewPage />);
    expect(screen.getByRole('status', { name: /Loading/i })).toBeInTheDocument();
  });

  it('renders the health cards and provider chips on success', async () => {
    // The aggregate must drive the success-rate cards, chips, and audit link.
    mockUseSession.mockReturnValue({ status: 'authenticated' });
    mockFetchAggregate.mockResolvedValueOnce(AGGREGATE);
    render(<OverviewPage />);
    await waitFor(() => expect(screen.getByText('98%')).toBeInTheDocument());
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('mailpit')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /audit tail/i })).toHaveAttribute(
      'href',
      '/dashboard/audit',
    );
  });

  it('shows an error with a working retry when the aggregate fails', async () => {
    // A failed fetch must surface a retry affordance that re-requests the data.
    mockUseSession.mockReturnValue({ status: 'authenticated' });
    mockFetchAggregate.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(AGGREGATE);
    render(<OverviewPage />);
    await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    await waitFor(() => expect(screen.getByText('98%')).toBeInTheDocument());
  });
});
