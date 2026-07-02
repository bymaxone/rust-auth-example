/**
 * @fileoverview Tests for the register page.
 *
 * Covers: success route, tenant value forwarded in the register call,
 * AuthClientError banner rendering, and generic banner for unexpected errors.
 *
 * @module app/(public)/auth/register/page.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthClientError } from '@bymax-one/rust-auth/shared';

/* ── Hoisted mocks ────────────────────────────────────────────────────── */

const mockPush = vi.hoisted(() => vi.fn());
const mockRegister = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('nuqs', () => ({
  useQueryState: (_key: string, opts: { defaultValue: string }) => [opts.defaultValue, vi.fn()],
}));

vi.mock('@bymax-one/rust-auth/react', () => ({
  useAuth: () => ({ register: mockRegister }),
}));

/* ── Import subject after mocks ──────────────────────────────────────── */
import RegisterPage from './page';

/* ── Helpers ─────────────────────────────────────────────────────────── */

function fillAndSubmit(name = 'Jane', email = 'jane@example.com', password = 'secret') {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /create account/i }));
}

/* ── Tests ───────────────────────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RegisterPage', () => {
  it('routes to /auth/verify-email on success', async () => {
    /* A successful registration routes to the email-verification page. */
    mockRegister.mockResolvedValueOnce({ user: { id: '1' }, accessToken: 'a', refreshToken: 'r' });
    render(<RegisterPage />);
    fillAndSubmit();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth/verify-email'));
  });

  it('forwards the tenant from the URL state to register', async () => {
    /* The default tenant "acme" from nuqs must be forwarded as tenantId. */
    mockRegister.mockResolvedValueOnce({ user: { id: '1' }, accessToken: 'a', refreshToken: 'r' });
    render(<RegisterPage />);
    fillAndSubmit('Jane', 'jane@example.com', 'secret');
    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'acme' })),
    );
  });

  it('renders the localized error banner on AuthClientError', async () => {
    /* Auth errors must surface only the localized English message; the raw code
       is kept in data-error-code and must not appear as visible text. */
    mockRegister.mockRejectedValueOnce(
      new AuthClientError('dup', 409, {
        code: 'auth.email_already_exists',
        message: 'An account with this email already exists.',
      }),
    );
    const { container } = render(<RegisterPage />);
    fillAndSubmit();
    await waitFor(() =>
      expect(screen.getByText('An account with this email already exists.')).toBeInTheDocument(),
    );
    expect(
      container.querySelector('[data-error-code="auth.email_already_exists"]'),
    ).toBeInTheDocument();
    expect(screen.queryByText('auth.email_already_exists')).not.toBeInTheDocument();
  });

  it('shows a generic error banner for unexpected (non-AuthClientError) errors', async () => {
    /* Unexpected errors surface as the generic "auth.internal" banner rather than
       crashing the page with an unhandled promise rejection. */
    mockRegister.mockRejectedValueOnce(new Error('network'));
    render(<RegisterPage />);
    fillAndSubmit();
    await waitFor(() =>
      expect(
        screen.getByText('Something went wrong on our side. Please try again.'),
      ).toBeInTheDocument(),
    );
  });
});
