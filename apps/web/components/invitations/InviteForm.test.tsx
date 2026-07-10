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
  it('renders an idle form with an empty email, the default role, and no messages', () => {
    // Before any interaction the form is pristine: an empty email, the 'user'
    // default role, a field flagged valid, and neither an error nor a success
    // banner, with the button enabled and showing its idle label.
    render(<InviteForm />);
    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByLabelText('Role')).toHaveValue('user');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send invitation' })).toBeEnabled();
  });

  it('blocks submission of an invalid email and flags the field', async () => {
    // A malformed email must be caught before any request is issued, and the
    // field must flip to invalid so assistive technology announces it.
    render(<InviteForm />);
    const emailField = screen.getByLabelText('Email');
    expect(emailField).toHaveAttribute('aria-invalid', 'false');
    fireEvent.change(emailField, { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: /Send invitation/i }));
    await waitFor(() =>
      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument(),
    );
    // The message is an assertive alert and the field is now flagged invalid.
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(emailField).toHaveAttribute('aria-invalid', 'true');
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

  it('submits the default user role when the role is left untouched', async () => {
    // Leaving the role select alone must post role 'user', not an empty value.
    createInvitation.mockResolvedValueOnce(undefined);
    render(<InviteForm />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'c@d.co' } });
    fireEvent.click(screen.getByRole('button', { name: /Send invitation/i }));
    await waitFor(() => expect(screen.getByText('Invitation sent to c@d.co.')).toBeInTheDocument());
    expect(createInvitation).toHaveBeenCalledWith({ email: 'c@d.co', role: 'user' });
  });

  it('shows a pending label and disables the button while the request is in flight', async () => {
    // During the request the button reports progress and is disabled; once the
    // request settles it returns to its idle label and becomes enabled again.
    let resolveRequest: () => void = () => {};
    createInvitation.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRequest = () => {
          resolve();
        };
      }),
    );
    render(<InviteForm />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: /Send invitation/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled());
    resolveRequest();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send invitation' })).toBeEnabled(),
    );
  });

  it('confirms success without an onInvited callback and shows no error', async () => {
    // A successful invite with no parent callback still confirms via the status
    // banner and must never surface an error banner.
    createInvitation.mockResolvedValueOnce(undefined);
    render(<InviteForm />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: /Send invitation/i }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Invitation sent to a@b.co.'),
    );
    expect(
      screen.queryByText('Something went wrong on our side. Please try again.'),
    ).not.toBeInTheDocument();
  });
});
