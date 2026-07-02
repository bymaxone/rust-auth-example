/**
 * @fileoverview Tests for the accept-invitation page.
 *
 * Covers: missing-token state, valid accept routes to /dashboard, token
 * forwarded verbatim to the API, AuthClientError banner rendering, and
 * generic banner for unexpected errors.
 *
 * @module app/(public)/auth/accept-invitation/page.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthClientError } from '@bymax-one/rust-auth/shared';

/* ── Hoisted mocks ────────────────────────────────────────────────────── */

const mockPush = vi.hoisted(() => vi.fn());
const mockAuthFetch = vi.hoisted(() => vi.fn());
const mockGetToken = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: mockGetToken }),
}));

vi.mock('@/lib/auth-client', () => ({
  authFetch: mockAuthFetch,
}));

/* ── Import subject after mocks ──────────────────────────────────────── */
import AcceptInvitationPage from './page';

/* ── Helpers ─────────────────────────────────────────────────────────── */

function fillAndSubmit(name = 'Jane Doe', password = 'strongPass') {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /Activate account/i }));
}

/* ── Tests ───────────────────────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks();
  mockGetToken.mockReturnValue('inv_tok_abc');
});

describe('AcceptInvitationPage — no token', () => {
  it('shows "open the invitation link from your email" when token is absent', () => {
    /* Without a token the visitor must open the emailed link. */
    mockGetToken.mockReturnValue(null);
    render(<AcceptInvitationPage />);
    expect(screen.getByText(/Open the invitation link from your email/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Activate account/i })).not.toBeInTheDocument();
  });
});

describe('AcceptInvitationPage — with token', () => {
  it('routes to /dashboard on a successful accept', async () => {
    /* A valid invitation accept must route to the dashboard. */
    mockAuthFetch.mockResolvedValueOnce({ ok: true });
    render(<AcceptInvitationPage />);
    fillAndSubmit();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  });

  it('forwards the token from the URL to the accept endpoint', async () => {
    /* The URL token must be forwarded verbatim to the API. */
    mockAuthFetch.mockResolvedValueOnce({ ok: true });
    render(<AcceptInvitationPage />);
    fillAndSubmit('Jane', 'pass');
    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledTimes(1);
    });
    /* Narrow via `as` — mock.lastCall is `unknown`, explicit cast is intentional. */
    const [, options] = mockAuthFetch.mock.lastCall as [string, { body: string }];
    expect(options.body).toContain('"token":"inv_tok_abc"');
  });

  it('renders a localized error banner on an invalid invitation token', async () => {
    /* An invalid or expired token must surface through <AuthError>. */
    mockAuthFetch.mockRejectedValueOnce(
      new AuthClientError('invalid', 422, {
        code: 'auth.invalid_invitation_token',
        message: 'invalid',
      }),
    );
    render(<AcceptInvitationPage />);
    fillAndSubmit();
    await waitFor(() =>
      expect(
        screen.getByText('This invitation is invalid or has already been used.'),
      ).toBeInTheDocument(),
    );
  });

  it('shows a generic error banner for unexpected (non-AuthClientError) errors', async () => {
    /* Unexpected errors show the generic "auth.internal" banner so the page stays usable. */
    mockAuthFetch.mockRejectedValueOnce(new Error('network'));
    render(<AcceptInvitationPage />);
    fillAndSubmit();
    await waitFor(() =>
      expect(
        screen.getByText('Something went wrong on our side. Please try again.'),
      ).toBeInTheDocument(),
    );
  });
});
