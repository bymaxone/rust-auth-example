/**
 * @fileoverview Tests for the virtualized, faceted audit table.
 *
 * Covers: the empty state, the no-secrets predicate, follow-mode pinning vs the
 * scroll-derived window, facet filtering, the follow pill, and the detail drawer
 * with the no-secrets proof (clean row vs a secret-shaped key).
 *
 * @module components/audit/AuditTable.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditTable, containsSecret } from './AuditTable';
import type { AuditLogRow } from '@/lib/audit-api';

const pivot = vi.hoisted(() => ({
  actor: null as string | null,
  event: null as string | null,
  pivotTo: vi.fn(),
}));
vi.mock('@/lib/audit-pivot', () => ({ useAuditPivot: () => pivot }));

function makeRows(n: number): AuditLogRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i),
    actor: `user-${i}`,
    event: `evt-${i}`,
    tenantId: null,
    ip: '0.0.0.0',
    createdAt: '2024-01-01T00:00:00.000Z',
    details: {},
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  pivot.actor = null;
  pivot.event = null;
});

describe('containsSecret', () => {
  it('flags secret-shaped keys and passes clean payloads', () => {
    // The proof depends on catching any token/otp/recovery/secret key.
    expect(containsSecret({ token: 'x' })).toBe(true);
    expect(containsSecret({ recoveryCode: 'x' })).toBe(true);
    expect(containsSecret({ email: 'a@b.co', event: 'login' })).toBe(false);
  });
});

describe('AuditTable', () => {
  it('renders the action-oriented empty state with no rows', () => {
    // An empty log points the user at the Trigger Center.
    render(<AuditTable rows={[]} following={true} pendingCount={0} onFollowChange={vi.fn()} />);
    expect(screen.getByText(/No events yet/i)).toBeInTheDocument();
  });

  it('pins to the latest rows when following', () => {
    // Follow-mode shows the newest rows, not the oldest.
    render(
      <AuditTable rows={makeRows(30)} following={true} pendingCount={0} onFollowChange={vi.fn()} />,
    );
    expect(screen.getByText('evt-29')).toBeInTheDocument();
    expect(screen.queryByText('evt-0')).not.toBeInTheDocument();
  });

  it('shows the top window when paused, then re-windows on scroll', () => {
    // A paused view is scroll-driven; scrolling down reveals later rows.
    const onFollowChange = vi.fn();
    render(
      <AuditTable
        rows={makeRows(30)}
        following={false}
        pendingCount={0}
        onFollowChange={onFollowChange}
      />,
    );
    expect(screen.getByText('evt-0')).toBeInTheDocument();
    expect(screen.queryByText('evt-29')).not.toBeInTheDocument();

    const scroll = screen.getByTestId('audit-scroll');
    Object.defineProperty(scroll, 'scrollTop', { value: 880, configurable: true });
    fireEvent.scroll(scroll);
    expect(onFollowChange).toHaveBeenCalledWith(true);
    expect(screen.getByText('evt-29')).toBeInTheDocument();
  });

  it('filters rows by the shared actor facet', () => {
    // The table honours the actor pivot the Trigger Center writes.
    pivot.actor = 'user-3';
    render(
      <AuditTable rows={makeRows(10)} following={true} pendingCount={0} onFollowChange={vi.fn()} />,
    );
    expect(screen.getByText('evt-3')).toBeInTheDocument();
    expect(screen.queryByText('evt-2')).not.toBeInTheDocument();
  });

  it('filters rows by the shared event facet', () => {
    // The table also honours the event pivot.
    pivot.event = 'evt-4';
    render(
      <AuditTable rows={makeRows(10)} following={true} pendingCount={0} onFollowChange={vi.fn()} />,
    );
    expect(screen.getByText('evt-4')).toBeInTheDocument();
    expect(screen.queryByText('evt-3')).not.toBeInTheDocument();
  });

  it('shows the "N new" pill while paused and resumes on click', () => {
    // A paused tail surfaces buffered events and jumps to latest on click.
    const onFollowChange = vi.fn();
    render(
      <AuditTable
        rows={makeRows(3)}
        following={false}
        pendingCount={2}
        onFollowChange={onFollowChange}
      />,
    );
    const pill = screen.getByRole('button', { name: /2 new — jump to latest/i });
    fireEvent.click(pill);
    expect(onFollowChange).toHaveBeenCalledWith(true);
  });

  it('does not re-window when a scroll stays at the top', () => {
    // Staying pinned to the top reports still-following=false.
    const onFollowChange = vi.fn();
    render(
      <AuditTable
        rows={makeRows(30)}
        following={false}
        pendingCount={0}
        onFollowChange={onFollowChange}
      />,
    );
    const scroll = screen.getByTestId('audit-scroll');
    Object.defineProperty(scroll, 'scrollTop', { value: 0, configurable: true });
    fireEvent.scroll(scroll);
    expect(onFollowChange).toHaveBeenCalledWith(false);
  });

  it('renders an invalid timestamp verbatim', () => {
    // A malformed timestamp must degrade gracefully.
    const rows: AuditLogRow[] = [
      {
        id: 'x',
        actor: 'a',
        event: 'weird-time',
        tenantId: null,
        ip: '0',
        createdAt: 'not-a-date',
        details: {},
      },
    ];
    render(<AuditTable rows={rows} following={false} pendingCount={0} onFollowChange={vi.fn()} />);
    expect(screen.getByText('not-a-date')).toBeInTheDocument();
  });

  it('opens and closes the detail drawer with the no-secrets proof', () => {
    // The drawer asserts no secrets, and closing clears the selection.
    render(
      <AuditTable rows={makeRows(3)} following={false} pendingCount={0} onFollowChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('evt-1'));
    expect(screen.getByText(/No token, code, or secret in this row/i)).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByText(/No token, code, or secret in this row/i)).not.toBeInTheDocument();
  });

  it('flags a row whose details carry a secret-shaped key', () => {
    // A leaked secret key must be surfaced, not silently rendered.
    const rows: AuditLogRow[] = [
      {
        id: 's',
        actor: 'a',
        event: 'leak',
        tenantId: null,
        ip: '0',
        createdAt: '2024-01-01T00:00:00.000Z',
        details: { token: 'oops' },
      },
    ];
    render(<AuditTable rows={rows} following={false} pendingCount={0} onFollowChange={vi.fn()} />);
    fireEvent.click(screen.getByText('leak'));
    expect(screen.getByText(/Secret-shaped key present/i)).toBeInTheDocument();
  });
});
