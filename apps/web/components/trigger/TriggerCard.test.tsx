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
    // The finally clause must clear the pending flag so the button re-enables after firing.
    expect(screen.getByRole('button', { name: 'Fire' })).toBeEnabled();
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
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    try {
      const result: TriggerResult = {
        request: {},
        response: {},
        code: 'auth.too_many_requests',
        status: 429,
        retryAfterSeconds: 3,
      };
      const { unmount } = render(
        <TriggerCard title="Hammer" description="…" onFire={() => Promise.resolve(result)} />,
      );
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
      // The countdown floors at zero rather than going negative.
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByText(/Retry-After 0s/)).toBeInTheDocument();
      // Unmounting must tear down the interval so it never ticks against a dead tree.
      unmount();
      expect(clearIntervalSpy).toHaveBeenCalled();
    } finally {
      clearIntervalSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('omits the status, code, and retry badges when a result carries none', async () => {
    // An unexpected error yields no status/code/retry; the badge row must stay empty of them.
    const result: TriggerResult = { request: { a: 1 }, response: { error: 'x' } };
    const { container } = render(
      <TriggerCard title="Odd" description="…" onFire={() => Promise.resolve(result)} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
    await waitFor(() => expect(screen.getByText(/"error": "x"/)).toBeInTheDocument());
    // No status badge (the guard must gate rendering on a defined status).
    expect(screen.queryByText(/^status/)).not.toBeInTheDocument();
    // No Retry-After countdown (the guard must gate on a defined retryAfterSeconds).
    expect(screen.queryByText(/Retry-After/i)).not.toBeInTheDocument();
    // No error-code badge: the only destructive-styled badges are the code and retry ones,
    // so with none present there must be zero destructive badges in the tree.
    expect(container.querySelectorAll('.bg-destructive')).toHaveLength(0);
  });

  it('resets the countdown to the new window when a re-fire returns a fresh Retry-After', async () => {
    // A second fire carrying a different Retry-After must restart the countdown at the new
    // value rather than keep ticking the previous one — the effect depends on the seconds prop.
    vi.useFakeTimers();
    try {
      const firstResult: TriggerResult = {
        request: {},
        response: {},
        status: 429,
        retryAfterSeconds: 5,
      };
      const secondResult: TriggerResult = {
        request: {},
        response: {},
        status: 429,
        retryAfterSeconds: 9,
      };
      const onFire = vi.fn(() => Promise.resolve(firstResult));
      onFire.mockResolvedValueOnce(firstResult);
      onFire.mockResolvedValueOnce(secondResult);
      render(<TriggerCard title="Hammer" description="…" onFire={onFire} />);
      fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByText(/Retry-After 5s/)).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText(/Retry-After 4s/)).toBeInTheDocument();
      // Re-fire: the countdown must jump to the new server-provided window, not stay at 4s.
      fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByText(/Retry-After 9s/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
