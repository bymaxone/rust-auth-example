/**
 * @fileoverview Tests for the Audit Explorer page.
 *
 * Covers: it loads a page + tails live into the table, toggles Live, clears
 * facets, and shows a load error with retry.
 *
 * @module app/(dashboard)/dashboard/audit/page.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const pivot = vi.hoisted(() => ({
  actor: null as string | null,
  event: null as string | null,
  pivotTo: vi.fn(),
}));
const tail = vi.hoisted(() => ({
  rows: [] as unknown[],
  following: true,
  pendingCount: 0,
  setFollowing: vi.fn(),
}));
const fetchAuditPage = vi.hoisted(() => vi.fn());

vi.mock('@/lib/audit-pivot', () => ({ useAuditPivot: () => pivot }));
vi.mock('@/hooks/use-audit-tail', () => ({ useAuditTail: () => tail }));
vi.mock('@/lib/audit-api', () => ({ fetchAuditPage }));
vi.mock('@/components/audit/AuditTable', () => ({
  AuditTable: ({ rows }: { rows: readonly { id: string }[] }) => (
    <div>table-rows:{rows.length}</div>
  ),
}));

import AuditPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  pivot.actor = null;
  pivot.event = null;
});

describe('AuditPage', () => {
  it('loads a keyset page into the table', async () => {
    // The initial page seeds the table before the tail streams more.
    fetchAuditPage.mockResolvedValueOnce({ data: [{ id: '1' }], nextCursor: null, hasMore: false });
    render(<AuditPage />);
    await waitFor(() => expect(screen.getByText('table-rows:1')).toBeInTheDocument());
  });

  it('toggles the Live control', async () => {
    // The Live toggle flips the streaming state label.
    fetchAuditPage.mockResolvedValueOnce({ data: [], nextCursor: null, hasMore: false });
    render(<AuditPage />);
    await waitFor(() => expect(fetchAuditPage).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Live' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(screen.getByRole('button', { name: 'Paused' })).toBeInTheDocument();
  });

  it('shows active facets and clears them', async () => {
    // Facets from the pivot are shown and can be cleared.
    pivot.actor = 'user-9';
    fetchAuditPage.mockResolvedValueOnce({ data: [], nextCursor: null, hasMore: false });
    render(<AuditPage />);
    await waitFor(() => expect(fetchAuditPage).toHaveBeenCalled());
    expect(screen.getByText(/actor: user-9/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Clear filters/i }));
    expect(pivot.pivotTo).toHaveBeenCalledWith({});
  });

  it('shows a load error with a working retry', async () => {
    // A failed page load offers a retry.
    fetchAuditPage
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce({ data: [], nextCursor: null, hasMore: false });
    render(<AuditPage />);
    await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    await waitFor(() => expect(screen.queryByText(/could not be loaded/i)).not.toBeInTheDocument());
  });
});
