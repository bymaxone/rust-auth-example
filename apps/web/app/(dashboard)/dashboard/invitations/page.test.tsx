/**
 * @fileoverview Tests for the Invitations page.
 *
 * Covers: the form + list compose together, and sending an invite bumps the
 * refresh key the accepted list reads.
 *
 * @module app/(dashboard)/dashboard/invitations/page.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/invitations/InviteForm', () => ({
  InviteForm: ({ onInvited }: { onInvited?: () => void }) => (
    <button onClick={() => onInvited?.()}>fire-invite</button>
  ),
}));
vi.mock('@/components/invitations/AcceptedInvitations', () => ({
  AcceptedInvitations: ({ refreshKey }: { refreshKey: number }) => <div>accepted:{refreshKey}</div>,
}));

import InvitationsPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InvitationsPage', () => {
  it('composes the invite form and accepted list', () => {
    // Both admin surfaces render together.
    render(<InvitationsPage />);
    expect(screen.getByText('fire-invite')).toBeInTheDocument();
    expect(screen.getByText('accepted:0')).toBeInTheDocument();
  });

  it('bumps the refresh key after an invite is sent', () => {
    // A successful invite re-fetches the accepted list via the key.
    render(<InvitationsPage />);
    fireEvent.click(screen.getByText('fire-invite'));
    expect(screen.getByText('accepted:1')).toBeInTheDocument();
  });
});
