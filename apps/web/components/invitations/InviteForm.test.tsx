/**
 * @fileoverview Tests for the invite form.
 *
 * Covers: email validation blocks submit, a valid submit posts {email, role}
 * (no tenantId), success clears the field + notifies the parent, and the error
 * paths localize the code.
 *
 * @module components/invitations/InviteForm.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthClientError } from '@bymax-one/rust-auth/shared';

const createInvitation = vi.hoisted(() => vi.fn());
vi.mock('@/lib/invitations-api', () => ({ createInvitation }));

import { InviteForm } from './InviteForm';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InviteForm', () => {
  it('blocks submission of an invalid email', async () => {
    // A malformed email must be caught before any request is issued.
    render(<InviteForm />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: /Send invitation/i }));
    await waitFor(() =>
      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument(),
    );
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it('sends {email, role} with no tenantId and confirms', async () => {
    // A valid invite posts the role and clears the field, notifying the parent.
    const onInvited = vi.fn();
    createInvitation.mockResolvedValueOnce(undefined);
    render(<InviteForm onInvited={onInvited} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByRole('button', { name: /Send invitation/i }));
    await waitFor(() => expect(screen.getByText('Invitation sent to a@b.co.')).toBeInTheDocument());
    expect(createInvitation).toHaveBeenCalledWith({ email: 'a@b.co', role: 'admin' });
    expect(onInvited).toHaveBeenCalled();
    expect(screen.getByLabelText('Email')).toHaveValue('');
  });

  it('localizes an AuthClientError code', async () => {
    // A server error surfaces through the shared localization.
    createInvitation.mockRejectedValueOnce(
      new AuthClientError('x', 400, { code: 'auth.validation', message: 'x' }),
    );
    render(<InviteForm />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: /Send invitation/i }));
    await waitFor(() =>
      expect(
        screen.getByText('Please check the highlighted fields and try again.'),
      ).toBeInTheDocument(),
    );
  });

  it('falls back to a generic code when the AuthClientError carries none', async () => {
    // A library error without a wire code still localizes to the generic message.
    createInvitation.mockRejectedValueOnce(new AuthClientError('x', 500));
    render(<InviteForm />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: /Send invitation/i }));
    await waitFor(() =>
      expect(
        screen.getByText('Something went wrong on our side. Please try again.'),
      ).toBeInTheDocument(),
    );
  });

  it('falls back to a generic error for a non-library failure', async () => {
    // An unexpected error still shows a localized generic message.
    createInvitation.mockRejectedValueOnce(new Error('network'));
    render(<InviteForm />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: /Send invitation/i }));
    await waitFor(() =>
      expect(
        screen.getByText('Something went wrong on our side. Please try again.'),
      ).toBeInTheDocument(),
    );
  });
});
