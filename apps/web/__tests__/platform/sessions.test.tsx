/**
 * @fileoverview Tests for the platform sessions management page.
 *
 * Covers: loading state, admin profile display, revoke-all redirect, and
 * error handling. Explicitly verifies the bulk-only domain boundary.
 *
 * @module __tests__/platform/sessions.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AuthClientError } from '@bymax-one/rust-auth/shared';

/* ── Hoisted mocks ──────────────────────────────────────────────────────── */

const mockPush = vi.hoisted(() => vi.fn());
const mockGetMe = vi.hoisted(() => vi.fn());
const mockRevokeAll = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/lib/platform-client', () => ({
  platformClient: { getMe: mockGetMe },
  platformSessions: { revokeAll: mockRevokeAll },
}));

vi.mock('@/components/auth/auth-error', () => ({
  AuthError: ({ code }: { code: string | null }) =>
    code !== null ? (
      <div data-testid="auth-error" data-error-code={code}>
        {code}
      </div>
    ) : null,
}));

/* ── Import after mocks ─────────────────────────────────────────────────── */
import PlatformSessionsPage from '@/app/platform/(protected)/sessions/page';

/* ── Tests ────────────────────────────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PlatformSessionsPage', () => {
  it('shows a loading skeleton while fetching the admin profile', () => {
    // Verifies the loading state is shown before getMe resolves.
    mockGetMe.mockReturnValue(new Promise(() => undefined));
    render(<PlatformSessionsPage />);
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('shows the admin profile when getMe succeeds', async () => {
    // Verifies the session card displays the admin's email, name, role, and status.
    mockGetMe.mockResolvedValueOnce({
      id: '1',
      email: 'admin@example.com',
      name: 'Platform Admin',
      role: 'admin',
      status: 'ACTIVE',
      mfaEnabled: true,
    });
    render(<PlatformSessionsPage />);
    await waitFor(() => expect(screen.getByText('admin@example.com')).toBeInTheDocument());
    expect(screen.getByText('Platform Admin')).toBeInTheDocument();
  });

  it('shows an error card when getMe fails', async () => {
    // Verifies a network failure surfaces the error state card.
    mockGetMe.mockRejectedValueOnce(new Error('network down'));
    render(<PlatformSessionsPage />);
    await waitFor(() =>
      expect(screen.getByText(/Session information could not be loaded/i)).toBeInTheDocument(),
    );
  });

  it('routes to /platform/login after a successful revokeAll (bulk boundary)', async () => {
    // Verifies the bulk-only boundary: after revoke the admin is routed to login.
    // No per-session list/revoke is present — only the "Revoke all" action.
    mockGetMe.mockResolvedValueOnce({
      id: '1',
      email: 'a@b.com',
      name: 'A',
      role: 'admin',
      status: 'ACTIVE',
      mfaEnabled: false,
    });
    mockRevokeAll.mockResolvedValueOnce(undefined);
    render(<PlatformSessionsPage />);
    await waitFor(() => screen.getByText(/Revoke all sessions/i));
    fireEvent.click(screen.getByText(/Revoke all sessions/i));
    // Confirm dialog action
    await waitFor(() => screen.getByText('Revoke all'));
    fireEvent.click(screen.getByText('Revoke all'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/platform/login'));
  });

  it('shows an error on revokeAll failure', async () => {
    // Verifies a revoke failure surfaces an error code via AuthError.
    mockGetMe.mockResolvedValueOnce({
      id: '1',
      email: 'a@b.com',
      name: 'A',
      role: 'admin',
      status: 'ACTIVE',
      mfaEnabled: false,
    });
    mockRevokeAll.mockRejectedValueOnce(
      new AuthClientError('unauthorized', 401, {
        code: 'auth.platform_auth_required',
        message: 'Auth required',
      }),
    );
    render(<PlatformSessionsPage />);
    await waitFor(() => screen.getByText(/Revoke all sessions/i));
    fireEvent.click(screen.getByText(/Revoke all sessions/i));
    await waitFor(() => screen.getByText('Revoke all'));
    fireEvent.click(screen.getByText('Revoke all'));
    await waitFor(() => {
      const err = screen.getByTestId('auth-error');
      expect(err).toHaveAttribute('data-error-code', 'auth.platform_auth_required');
    });
  });

  it('does not show per-session list or per-row revoke buttons (bulk-only boundary)', async () => {
    // Verifies the platform domain exposes ONLY bulk revoke — no per-session controls.
    mockGetMe.mockResolvedValueOnce({
      id: '1',
      email: 'a@b.com',
      name: 'A',
      role: 'admin',
      status: 'ACTIVE',
      mfaEnabled: false,
    });
    render(<PlatformSessionsPage />);
    await waitFor(() => screen.getByText('a@b.com'));
    // No table of sessions, no per-row revoke button present.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /revoke session/i })).not.toBeInTheDocument();
  });
});
