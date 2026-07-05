/**
 * @fileoverview Tests for the accepted-invitations list.
 *
 * Covers: the loading skeleton, the ready list with a Mailpit link, the empty state,
 * the error state, and refetch on refreshKey.
 *
 * @module components/invitations/AcceptedInvitations.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const listAcceptedInvitations = vi.hoisted(() => vi.fn());
vi.mock('@/lib/invitations-api', () => ({ listAcceptedInvitations }));

import { AcceptedInvitations } from './AcceptedInvitations';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AcceptedInvitations', () => {
  it('shows a skeleton then the invitations with a Mailpit link', async () => {
    // Loaded invitations render with a link to the Mailpit inbox.
    listAcceptedInvitations.mockResolvedValueOnce([
      { email: 'a@b.co', acceptedAt: 't' },
      { email: 'c@d.co', acceptedAt: 'u' },
    ]);
    render(<AcceptedInvitations refreshKey={0} />);
    expect(screen.getByRole('status', { name: /Loading/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('a@b.co')).toBeInTheDocument());
    expect(screen.getByText('c@d.co')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Open in Mailpit/i })[0]).toHaveAttribute(
      'href',
      'http://localhost:8025',
    );
    // The ready list replaces the skeleton entirely.
    expect(screen.getByRole('list', { name: /Accepted invitations/i })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /Loading/i })).not.toBeInTheDocument();
  });

  it('gives each row a distinct key so React does not warn about duplicates', async () => {
    // Composing email + acceptedAt yields a unique key per row; a blank key would
    // collide across siblings and trigger React's duplicate-key warning.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listAcceptedInvitations.mockResolvedValueOnce([
      { email: 'a@b.co', acceptedAt: 't' },
      { email: 'c@d.co', acceptedAt: 'u' },
    ]);
    render(<AcceptedInvitations refreshKey={0} />);
    await waitFor(() => expect(screen.getByText('a@b.co')).toBeInTheDocument());
    const sawDuplicateKeyWarning = errorSpy.mock.calls.some((args: readonly unknown[]) =>
      args
        .map((arg) => String(arg))
        .join(' ')
        .includes('same key'),
    );
    expect(sawDuplicateKeyWarning).toBe(false);
    errorSpy.mockRestore();
  });

  it('shows the empty state when there are no invitations', async () => {
    // With nothing accepted the action-oriented empty state appears.
    listAcceptedInvitations.mockResolvedValueOnce([]);
    render(<AcceptedInvitations refreshKey={0} />);
    await waitFor(() =>
      expect(screen.getByText(/No accepted invitations yet/i)).toBeInTheDocument(),
    );
  });

  it('shows an error message when the list fails to load', async () => {
    // A failed load degrades to a readable message.
    listAcceptedInvitations.mockRejectedValueOnce(new Error('boom'));
    render(<AcceptedInvitations refreshKey={0} />);
    await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument());
  });

  it('refetches when refreshKey changes', async () => {
    // Sending a new invite bumps the key and re-queries the audit trail.
    listAcceptedInvitations.mockResolvedValue([]);
    const { rerender } = render(<AcceptedInvitations refreshKey={0} />);
    await waitFor(() => expect(listAcceptedInvitations).toHaveBeenCalledTimes(1));
    rerender(<AcceptedInvitations refreshKey={1} />);
    await waitFor(() => expect(listAcceptedInvitations).toHaveBeenCalledTimes(2));
  });
});
