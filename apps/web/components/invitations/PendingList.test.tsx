/**
 * @fileoverview Tests for the pending-invitations list.
 *
 * Covers: the loading skeleton, the ready list with a Mailpit link, the row
 * without a role, the empty state, the error state, and refetch on refreshKey.
 *
 * @module components/invitations/PendingList.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const listPendingInvitations = vi.hoisted(() => vi.fn());
vi.mock('@/lib/invitations-api', () => ({ listPendingInvitations }));

import { PendingList } from './PendingList';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PendingList', () => {
  it('shows a skeleton then the invitations with a Mailpit link', async () => {
    // Loaded invitations render with a link to the Mailpit inbox.
    listPendingInvitations.mockResolvedValueOnce([
      { email: 'a@b.co', role: 'admin', sentAt: 't' },
      { email: 'c@d.co', sentAt: 't' },
    ]);
    render(<PendingList refreshKey={0} />);
    expect(screen.getByRole('status', { name: /Loading/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('a@b.co')).toBeInTheDocument());
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Open in Mailpit/i })[0]).toHaveAttribute(
      'href',
      'http://localhost:8025',
    );
  });

  it('shows the empty state when there are no invitations', async () => {
    // With nothing pending the action-oriented empty state appears.
    listPendingInvitations.mockResolvedValueOnce([]);
    render(<PendingList refreshKey={0} />);
    await waitFor(() => expect(screen.getByText(/No pending invites/i)).toBeInTheDocument());
  });

  it('shows an error message when the list fails to load', async () => {
    // A failed load degrades to a readable message.
    listPendingInvitations.mockRejectedValueOnce(new Error('boom'));
    render(<PendingList refreshKey={0} />);
    await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument());
  });

  it('refetches when refreshKey changes', async () => {
    // Sending a new invite bumps the key and re-queries the audit trail.
    listPendingInvitations.mockResolvedValue([]);
    const { rerender } = render(<PendingList refreshKey={0} />);
    await waitFor(() => expect(listPendingInvitations).toHaveBeenCalledTimes(1));
    rerender(<PendingList refreshKey={1} />);
    await waitFor(() => expect(listPendingInvitations).toHaveBeenCalledTimes(2));
  });
});
