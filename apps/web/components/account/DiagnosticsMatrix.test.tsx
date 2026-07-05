/**
 * @fileoverview Tests for the Diagnostics matrix.
 *
 * Covers: hash-strength (needs-rehash + up-to-date + error + busy), lockout (with
 * + without a countdown), the hook count (array / object / other), the delivery
 * chip, and the token inspector (empty guard, verified, rejected, non-ok, throw).
 *
 * @module components/account/DiagnosticsMatrix.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const apiJson = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ apiJson }));

import { DiagnosticsMatrix } from './DiagnosticsMatrix';

/** A minimal Response stub for the inspect route. */
function res(ok: boolean, body?: unknown): Response {
  return { ok, json: () => Promise.resolve(body ?? {}) } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  // The token inspector calls the same-origin `/api/diagnostics/inspect-token` route with a
  // direct `fetch` (not `authFetch`, which would rebase it onto the backend). Stub `fetch` per
  // test and restore it after, so the global stays clean for other suites sharing the worker.
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DiagnosticsMatrix — hash strength', () => {
  it('posts a PHC body and flags a stale hash for rehashing', async () => {
    // The endpoint requires a `{ phc }` body; a legacy hash comes back needing a rehash.
    apiJson.mockResolvedValueOnce({ needsRehash: true });
    render(<DiagnosticsMatrix />);
    fireEvent.click(screen.getByRole('button', { name: 'Measure' }));
    await waitFor(() => expect(screen.getByText('needs rehash')).toBeInTheDocument());
    expect(screen.getByText('legacy sample')).toBeInTheDocument();
    expect(apiJson).toHaveBeenCalledWith(
      '/diagnostics/hash-strength',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ phc: 'scrypt:00112233:44556677' }),
      }),
    );
  });

  it('shows an up-to-date badge when no rehash is needed', async () => {
    // A current hash is marked up to date.
    apiJson.mockResolvedValueOnce({ needsRehash: false });
    render(<DiagnosticsMatrix />);
    fireEvent.click(screen.getByRole('button', { name: 'Measure' }));
    await waitFor(() => expect(screen.getByText('up to date')).toBeInTheDocument());
  });

  it('shows a failure message when the request errors', async () => {
    // A diagnostics failure degrades to a readable message.
    apiJson.mockRejectedValueOnce(new Error('boom'));
    render(<DiagnosticsMatrix />);
    fireEvent.click(screen.getByRole('button', { name: 'Measure' }));
    await waitFor(() => expect(screen.getByText('Request failed.')).toBeInTheDocument());
  });

  it('shows a running label while in flight', async () => {
    // The button reflects the in-flight state.
    let resolve: (v: unknown) => void = () => undefined;
    apiJson.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<DiagnosticsMatrix />);
    fireEvent.click(screen.getByRole('button', { name: 'Measure' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Running…' })).toBeDisabled());
    await act(async () => {
      resolve({ needsRehash: false });
      await Promise.resolve();
    });
  });
});

describe('DiagnosticsMatrix — lockout', () => {
  it('posts an identifier body and renders the retry countdown when locked', async () => {
    // The endpoint requires an `{ identifier }` body; a positive countdown is surfaced.
    apiJson.mockResolvedValueOnce({ locked: true, remainingLockoutSecs: 30 });
    render(<DiagnosticsMatrix />);
    fireEvent.click(screen.getByRole('button', { name: 'Force lockout' }));
    await waitFor(() => expect(screen.getByText(/locked · retry in 30s/i)).toBeInTheDocument());
    expect(apiJson).toHaveBeenCalledWith(
      '/diagnostics/force-lockout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ identifier: 'lockout-demo@example.test' }),
      }),
    );
  });

  it('renders a locked badge when the countdown has elapsed', async () => {
    // A locked identifier with a zero countdown still reads as locked.
    apiJson.mockResolvedValueOnce({ locked: true, remainingLockoutSecs: 0 });
    render(<DiagnosticsMatrix />);
    fireEvent.click(screen.getByRole('button', { name: 'Force lockout' }));
    await waitFor(() => expect(screen.getByText('locked')).toBeInTheDocument());
    // A zero countdown is not surfaced as a retry timer.
    expect(screen.queryByText(/retry in/i)).not.toBeInTheDocument();
  });

  it('renders a triggered badge when no lock is reported', async () => {
    // A response without a lock still confirms the run fired.
    apiJson.mockResolvedValueOnce({});
    render(<DiagnosticsMatrix />);
    fireEvent.click(screen.getByRole('button', { name: 'Force lockout' }));
    await waitFor(() => expect(screen.getByText('lockout triggered')).toBeInTheDocument());
  });
});

describe('DiagnosticsMatrix — hook log', () => {
  it('counts an array payload from the hooks endpoint', async () => {
    // An array of events counts by length, fetched from the diagnostics hooks route.
    apiJson.mockResolvedValueOnce([1, 2, 3]);
    render(<DiagnosticsMatrix />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
    expect(apiJson).toHaveBeenCalledWith('/diagnostics/hooks');
  });

  it('counts an object payload with a count field', async () => {
    // A `{ count }` payload counts by that field.
    apiJson.mockResolvedValueOnce({ count: 5 });
    render(<DiagnosticsMatrix />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
  });

  it('falls back to zero for an unexpected payload', async () => {
    // An unexpected shape counts as zero rather than crashing.
    apiJson.mockResolvedValueOnce('weird');
    render(<DiagnosticsMatrix />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByText('0')).toBeInTheDocument());
  });

  it('counts an object without a numeric count as zero', async () => {
    // An object that lacks a numeric `count` is not entered as a match; it reads zero.
    apiJson.mockResolvedValueOnce({});
    render(<DiagnosticsMatrix />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByText('0')).toBeInTheDocument());
  });

  it('counts a null payload as zero without dereferencing it', async () => {
    // A null payload short-circuits the object guard rather than reading a property off null.
    apiJson.mockResolvedValueOnce(null);
    render(<DiagnosticsMatrix />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByText('0')).toBeInTheDocument());
  });

  it('counts a non-object payload carrying a numeric count as zero', async () => {
    // Only genuine objects are inspected for a count; a function exposing one stays zero.
    const payload = Object.assign(() => undefined, { count: 7 });
    apiJson.mockResolvedValueOnce(payload);
    render(<DiagnosticsMatrix />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByText('0')).toBeInTheDocument());
  });
});

describe('DiagnosticsMatrix — delivery + token inspector', () => {
  it('shows the delivery mode chip', () => {
    // The configured token delivery is surfaced read-only.
    render(<DiagnosticsMatrix />);
    expect(screen.getByText('Cookie')).toBeInTheDocument();
  });

  it('renders every action idle and enabled before any run', () => {
    // Each diagnostic action starts idle: its own action label, enabled, with no result yet.
    render(<DiagnosticsMatrix />);
    expect(screen.getByRole('button', { name: 'Measure' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Force lockout' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(screen.queryByText('Running…')).not.toBeInTheDocument();
    expect(screen.queryByText('Request failed.')).not.toBeInTheDocument();
  });

  it('guards against an empty token', async () => {
    // Inspecting requires a pasted token.
    render(<DiagnosticsMatrix />);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    await waitFor(() => expect(screen.getByText('Paste a JWT to inspect.')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a valid signature + algorithm for a verified token', async () => {
    // A verified token reports its algorithm and a valid signature.
    fetchMock.mockResolvedValueOnce(
      res(true, { decoded: { header: { alg: 'HS256' } }, verified: true }),
    );
    const { container } = render(<DiagnosticsMatrix />);
    fireEvent.change(screen.getByLabelText('JWT to inspect'), { target: { value: 'a.b.c' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    await waitFor(() => expect(screen.getByText('Signature valid')).toBeInTheDocument());
    expect(screen.getByText('alg: HS256')).toBeInTheDocument();
    // The pasted token is POSTed verbatim to the same-origin server-only route.
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/diagnostics/inspect-token',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ token: 'a.b.c' }) }),
    );
    // A completed inspection clears the in-flight state and renders no error line.
    expect(screen.getByRole('button', { name: 'Inspect' })).toBeEnabled();
    expect(container.querySelector('p.text-destructive')).toBeNull();
  });

  it('shows rejected for a forged token and an unknown algorithm', async () => {
    // A forged alg:none token is rejected; a missing alg reads "unknown".
    fetchMock.mockResolvedValueOnce(res(true, { verified: false }));
    render(<DiagnosticsMatrix />);
    fireEvent.change(screen.getByLabelText('JWT to inspect'), { target: { value: 'forged' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    await waitFor(() => expect(screen.getByText(/Rejected/i)).toBeInTheDocument());
    expect(screen.getByText('alg: unknown')).toBeInTheDocument();
    // An unverified token never surfaces the valid-signature badge.
    expect(screen.queryByText('Signature valid')).not.toBeInTheDocument();
  });

  it('shows an error when the inspect route responds non-ok', async () => {
    // A non-2xx inspect response surfaces an error.
    fetchMock.mockResolvedValueOnce(res(false));
    render(<DiagnosticsMatrix />);
    fireEvent.change(screen.getByLabelText('JWT to inspect'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    await waitFor(() =>
      expect(screen.getByText('Could not inspect the token.')).toBeInTheDocument(),
    );
  });

  it('shows an error when the inspect request throws', async () => {
    // A network failure is caught, not surfaced as a crash.
    fetchMock.mockRejectedValueOnce(new Error('network'));
    render(<DiagnosticsMatrix />);
    fireEvent.change(screen.getByLabelText('JWT to inspect'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    await waitFor(() =>
      expect(screen.getByText('Could not inspect the token.')).toBeInTheDocument(),
    );
  });

  it('treats a whitespace-only token as empty and never calls the route', async () => {
    // Trimming a blank paste yields the same guard as an empty field; no request is made.
    render(<DiagnosticsMatrix />);
    fireEvent.change(screen.getByLabelText('JWT to inspect'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    await waitFor(() => expect(screen.getByText('Paste a JWT to inspect.')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables the button and shows an inspecting label while in flight', async () => {
    // The button reflects the in-flight state until the inspect route resolves.
    let resolveFetch: (value: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((r) => {
        resolveFetch = r;
      }),
    );
    render(<DiagnosticsMatrix />);
    fireEvent.change(screen.getByLabelText('JWT to inspect'), { target: { value: 'a.b.c' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Inspecting…' })).toBeDisabled());
    resolveFetch(res(true, { decoded: { header: { alg: 'HS256' } }, verified: true }));
    await waitFor(() => expect(screen.getByText('Signature valid')).toBeInTheDocument());
  });

  it('reads an unknown algorithm when a decoded token omits its header', async () => {
    // With a decoded payload but no header present, the algorithm safely reads "unknown".
    fetchMock.mockResolvedValueOnce(res(true, { verified: true, decoded: {} }));
    render(<DiagnosticsMatrix />);
    fireEvent.change(screen.getByLabelText('JWT to inspect'), { target: { value: 'a.b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    await waitFor(() => expect(screen.getByText('alg: unknown')).toBeInTheDocument());
    expect(screen.getByText('Signature valid')).toBeInTheDocument();
  });
});
