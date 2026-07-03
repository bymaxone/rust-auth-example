/**
 * @fileoverview Tests for the Trigger Center page.
 *
 * Covers: the credential inputs render, and firing a card runs its action and
 * pivots the Audit table to the resulting actor/event.
 *
 * @module app/(dashboard)/dashboard/trigger/page.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const pivotTo = vi.hoisted(() => vi.fn());
const runLogin = vi.hoisted(() => vi.fn());

vi.mock('@/lib/audit-pivot', () => ({ useAuditPivot: () => ({ pivotTo }) }));
vi.mock('@/lib/trigger-actions', () => ({
  runRegister: vi.fn(),
  runLogin,
  rotateToken: vi.fn(),
  hammerLogin: vi.fn(),
  forceLockout: vi.fn(),
  dispatchVerifyEmail: vi.fn(),
  dispatchPasswordReset: vi.fn(),
  provokeInvalidCredentials: vi.fn(),
}));

import TriggerCenterPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TriggerCenterPage', () => {
  it('renders the credential inputs and the feature cards', () => {
    // The Playground exposes the credentials and a card per feature.
    render(<TriggerCenterPage />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hammer' })).toBeInTheDocument();
  });

  it('pivots the Audit table to the real event after firing an audited card', async () => {
    // Firing an audited journey writes the actor + the real event name into the pivot.
    runLogin.mockResolvedValueOnce({ request: {}, response: {}, status: 200 });
    render(<TriggerCenterPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    await waitFor(() =>
      expect(pivotTo).toHaveBeenCalledWith({ actor: 'demo@acme.test', event: 'after_login' }),
    );
  });

  it('pivots by actor only for a non-audited card', async () => {
    // A feature that emits no audit event pivots by actor alone — never a fake event facet.
    runLogin.mockResolvedValueOnce({ request: {}, response: {}, status: 200 });
    render(<TriggerCenterPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Challenge' }));
    await waitFor(() => expect(pivotTo).toHaveBeenCalledWith({ actor: 'demo@acme.test' }));
  });
});
