/**
 * @fileoverview Tests for the Trigger Center card.
 *
 * Covers: firing shows the raw request/response + status, the pending label, the
 * error-code badge, and the live Retry-After countdown ticking down.
 *
 * @module components/trigger/TriggerCard.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { TriggerCard } from './TriggerCard';
import type { TriggerResult } from '@/lib/trigger-actions';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TriggerCard', () => {
  it('renders the raw request, response, and status after firing', async () => {
    // Firing must surface the raw I/O so a reviewer can inspect the call.
    const result: TriggerResult = {
      request: { email: 'a@b.co' },
      response: { ok: true },
      status: 200,
    };
    render(
      <TriggerCard title="Login" description="Sign in" onFire={() => Promise.resolve(result)} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
    await waitFor(() => expect(screen.getByText('status 200')).toBeInTheDocument());
    expect(screen.getByText(/"email": "a@b.co"/)).toBeInTheDocument();
    expect(screen.getByText(/"ok": true/)).toBeInTheDocument();
  });

  it('shows a pending label while the action is in flight', async () => {
    // The button must reflect the in-flight state and disable itself.
    let resolve: (r: TriggerResult) => void = () => undefined;
    const pending = new Promise<TriggerResult>((r) => {
      resolve = r;
    });
    render(<TriggerCard title="Slow" description="…" onFire={() => pending} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Firing…' })).toBeDisabled());
    resolve({ request: {}, response: {}, status: 200 });
    await act(async () => {
      await pending;
    });
  });

  it('renders the error code badge and a ticking Retry-After countdown', async () => {
    // A 429 result must show the wire code and a live countdown.
    vi.useFakeTimers();
    try {
      const result: TriggerResult = {
        request: {},
        response: {},
        code: 'auth.too_many_requests',
        status: 429,
        retryAfterSeconds: 3,
      };
      render(<TriggerCard title="Hammer" description="…" onFire={() => Promise.resolve(result)} />);
      fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByText('auth.too_many_requests')).toBeInTheDocument();
      expect(screen.getByText(/Retry-After 3s/)).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText(/Retry-After 2s/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
