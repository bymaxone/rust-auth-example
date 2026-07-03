/**
 * @fileoverview Tests for the sessions device-manager table.
 *
 * Covers: the current session is pinned first and non-revocable, other rows
 * expose a revoke button that fires onRevoke, the revoking row is disabled, and
 * an invalid timestamp renders verbatim.
 *
 * @module components/sessions/SessionsTable.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SessionsTable } from './SessionsTable';
import type { SessionInfo } from '@/lib/sessions-api';

const SESSIONS: SessionInfo[] = [
  {
    id: 'other',
    device: 'Firefox',
    ip: '2.2.2.2',
    lastActivity: '2024-01-02T10:30:00.000Z',
    isCurrent: false,
  },
  { id: 'me', device: 'Chrome', ip: '1.1.1.1', lastActivity: 'not-a-date', isCurrent: true },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SessionsTable', () => {
  it('pins the current session first and marks it non-revocable', () => {
    // The current device is pinned and cannot be revoked from the table.
    render(<SessionsTable sessions={SESSIONS} onRevoke={vi.fn()} revokingId={null} />);
    const rows = screen.getAllByRole('row').slice(1); // drop the header row
    expect(within(rows[0] as HTMLElement).getByText('current')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('This device')).toBeInTheDocument();
  });

  it('fires onRevoke for a non-current session', () => {
    // Revoking a device must call back with that session id.
    const onRevoke = vi.fn();
    render(<SessionsTable sessions={SESSIONS} onRevoke={onRevoke} revokingId={null} />);
    fireEvent.click(screen.getByRole('button', { name: /Revoke session other/i }));
    expect(onRevoke).toHaveBeenCalledWith('other');
  });

  it('disables the revoke button for the row being revoked', () => {
    // The in-flight row must not accept a second revoke.
    render(<SessionsTable sessions={SESSIONS} onRevoke={vi.fn()} revokingId="other" />);
    expect(screen.getByRole('button', { name: /Revoke session other/i })).toBeDisabled();
  });

  it('renders an invalid timestamp verbatim rather than NaN', () => {
    // A malformed timestamp must degrade gracefully.
    render(<SessionsTable sessions={SESSIONS} onRevoke={vi.fn()} revokingId={null} />);
    expect(screen.getByText('not-a-date')).toBeInTheDocument();
    expect(screen.getByText('2024-01-02 10:30')).toBeInTheDocument();
  });
});
