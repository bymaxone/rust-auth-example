/**
 * @fileoverview Tests for the Sessions page.
 *
 * Covers: load → table, the "Only this device" empty state, optimistic revoke +
 * rollback, log-out-everywhere, the load error + retry, and the live new-session
 * toast + refetch.
 *
 * @module app/(dashboard)/dashboard/sessions/page.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeAllOtherSessions: vi.fn(),
}));
const toast = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }));
const alertHolder = vi.hoisted(() => ({ cb: null as ((ip: string) => void) | null }));

vi.mock('@/lib/sessions-api', () => api);
vi.mock('sonner', () => ({ toast }));
vi.mock('@/hooks/use-new-session-alerts', () => ({
  useNewSessionAlerts: (cb: (ip: string) => void) => {
    alertHolder.cb = cb;
  },
}));
vi.mock('@/components/sessions/SessionsTable', () => ({
  SessionsTable: ({
    sessions,
    onRevoke,
  }: {
    sessions: readonly { id: string }[];
    onRevoke: (id: string) => void;
  }) => (
    <div>
      {sessions.map((s) => (
        <button key={s.id} onClick={() => onRevoke(s.id)}>
          revoke-{s.id}
        </button>
      ))}
    </div>
  ),
}));

import SessionsPage from './page';

const TWO = [
  { id: 'me', device: 'Chrome', ip: '1.1.1.1', lastActivity: 'now', isCurrent: true },
  { id: 'other', device: 'FF', ip: '2.2.2.2', lastActivity: 'now', isCurrent: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  alertHolder.cb = null;
});

describe('SessionsPage', () => {
  it('renders the sessions table once loaded', async () => {
    // The device manager lists the loaded sessions.
    api.listSessions.mockResolvedValueOnce(TWO);
    render(<SessionsPage />);
    await waitFor(() => expect(screen.getByText('revoke-other')).toBeInTheDocument());
  });

  it('shows the "Only this device" empty state with a single session', async () => {
    // With no other sessions the action-oriented empty state appears.
    api.listSessions.mockResolvedValueOnce([TWO[0]]);
    render(<SessionsPage />);
    await waitFor(() => expect(screen.getByText('Only this device')).toBeInTheDocument());
  });

  it('optimistically revokes a session and confirms', async () => {
    // Revoke removes the row immediately and toasts success.
    api.listSessions.mockResolvedValueOnce(TWO);
    api.revokeSession.mockResolvedValueOnce(undefined);
    render(<SessionsPage />);
    await waitFor(() => expect(screen.getByText('revoke-other')).toBeInTheDocument());
    fireEvent.click(screen.getByText('revoke-other'));
    await waitFor(() => expect(screen.queryByText('revoke-other')).not.toBeInTheDocument());
    expect(api.revokeSession).toHaveBeenCalledWith('other');
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('rolls back an optimistic revoke on failure', async () => {
    // A failed revoke restores the row and toasts an error.
    api.listSessions.mockResolvedValueOnce(TWO);
    api.revokeSession.mockRejectedValueOnce(new Error('boom'));
    render(<SessionsPage />);
    await waitFor(() => expect(screen.getByText('revoke-other')).toBeInTheDocument());
    fireEvent.click(screen.getByText('revoke-other'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByText('revoke-other')).toBeInTheDocument();
  });

  it('logs out every other device behind a confirm', async () => {
    // Log-out-everywhere revokes others and refetches the list.
    api.listSessions.mockResolvedValue(TWO);
    api.revokeAllOtherSessions.mockResolvedValueOnce(undefined);
    render(<SessionsPage />);
    await waitFor(() => expect(screen.getByText('revoke-other')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Log out everywhere else/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Log out others/i }));
    await waitFor(() => expect(api.revokeAllOtherSessions).toHaveBeenCalled());
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('surfaces a load error with a working retry', async () => {
    // A failed load shows a retry that re-requests the sessions.
    api.listSessions.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(TWO);
    render(<SessionsPage />);
    await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    await waitFor(() => expect(screen.getByText('revoke-other')).toBeInTheDocument());
  });

  it('toasts and refetches when a new session is detected', async () => {
    // The live alert must inform the user and refresh the list.
    api.listSessions.mockResolvedValue(TWO);
    render(<SessionsPage />);
    await waitFor(() => expect(alertHolder.cb).not.toBeNull());
    alertHolder.cb?.('5.5.5.5');
    expect(toast.info).toHaveBeenCalledWith('New sign-in detected from 5.5.5.5.');
    await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(2));
  });
});
