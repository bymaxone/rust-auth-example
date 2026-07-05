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
    id: i,
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

  it('detects a secret-shaped key nested inside a plain object', () => {
    // A secret buried one level deep must still be detected.
    expect(containsSecret({ meta: { token: 'x' } })).toBe(true);
  });

  it('detects a secret-shaped key inside an array element', () => {
    // A secret inside an array item must still be detected.
    expect(containsSecret({ codes: [{ recoveryCode: 'x' }] })).toBe(true);
  });

  it('passes a deeply nested clean payload', () => {
    // A payload with no secret keys at any depth must not be flagged.
    expect(containsSecret({ a: { b: { c: 'safe' } }, list: [{ d: 1 }] })).toBe(false);
  });

  it('flags a payload when only some array elements carry a secret', () => {
    // A secret in ANY array element flags the whole payload — matching one element is enough,
    // it does not require every element to carry a secret.
    expect(containsSecret({ codes: [{ recoveryCode: 'x' }, { note: 'y' }] })).toBe(true);
  });

  it('treats primitive leaf values as non-secret', () => {
    // A bare string or number leaf is never itself a secret and must not be traversed as an
    // object, which distinguishes the object guard from an always-true branch.
    expect(containsSecret({ note: 'plain-text' })).toBe(false);
    expect(containsSecret({ count: 7 })).toBe(false);
  });

  it('treats a null leaf as non-secret without dereferencing it', () => {
    // A null value must short-circuit the object guard: traversing it as an object
    // (`Object.entries(null)`) would throw, so the guard is not vacuously true.
    expect(containsSecret({ nested: null })).toBe(false);
    expect(containsSecret({ list: [null, { safe: 1 }] })).toBe(false);
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

  it('scrolls the container to the bottom when follow-mode engages', () => {
    // Follow-mode must move the actual DOM scroll container to the latest rows, not only
    // compute the window. 30 rows × 44px − 440px viewport = 880px of scroll.
    const { rerender } = render(
      <AuditTable
        rows={makeRows(30)}
        following={false}
        pendingCount={0}
        onFollowChange={vi.fn()}
      />,
    );
    const scroll = screen.getByTestId('audit-scroll');
    let assigned = 0;
    Object.defineProperty(scroll, 'scrollTop', {
      configurable: true,
      get: () => assigned,
      set: (v: number) => {
        assigned = v;
      },
    });
    rerender(
      <AuditTable rows={makeRows(30)} following={true} pendingCount={0} onFollowChange={vi.fn()} />,
    );
    expect(assigned).toBe(880);
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
    // The absolute window offsets down by start × ROW_H = 16 × 44 = 704px once scrolled.
    const spacer = scroll.firstElementChild;
    if (spacer === null) throw new Error('missing spacer element');
    const offset = spacer.firstElementChild;
    if (offset === null) throw new Error('missing offset element');
    expect(offset).toHaveStyle({ top: '704px' });
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
        id: 900,
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

  it('flags and redacts a row whose details carry a secret-shaped key', () => {
    // A leaked secret must be flagged AND its value redacted, never rendered.
    const rows: AuditLogRow[] = [
      {
        id: 101,
        actor: 'a',
        event: 'leak',
        tenantId: null,
        ip: '0',
        createdAt: '2024-01-01T00:00:00.000Z',
        details: { token: 'super-secret', reason: 'audit' },
      },
    ];
    render(<AuditTable rows={rows} following={false} pendingCount={0} onFollowChange={vi.fn()} />);
    fireEvent.click(screen.getByText('leak'));
    expect(screen.getByText(/Secret-shaped key present/i)).toBeInTheDocument();
    // The secret value is replaced; the non-secret field survives.
    expect(screen.queryByText(/super-secret/)).not.toBeInTheDocument();
    expect(screen.getByText(/<redacted>/)).toBeInTheDocument();
    expect(screen.getByText(/audit/)).toBeInTheDocument();
  });

  it('flags and redacts a row whose details carry a secret key nested inside an object', () => {
    // A secret nested under a plain key must still be detected and redacted.
    const rows: AuditLogRow[] = [
      {
        id: 202,
        actor: 'a',
        event: 'nested-leak',
        tenantId: null,
        ip: '0',
        createdAt: '2024-01-01T00:00:00.000Z',
        details: { context: { token: 'deep-secret' }, label: 'ctx' },
      },
    ];
    render(<AuditTable rows={rows} following={false} pendingCount={0} onFollowChange={vi.fn()} />);
    fireEvent.click(screen.getByText('nested-leak'));
    expect(screen.getByText(/Secret-shaped key present/i)).toBeInTheDocument();
    expect(screen.queryByText(/deep-secret/)).not.toBeInTheDocument();
  });

  it('flags and redacts a row whose details carry a secret key inside an array element', () => {
    // A secret inside an array item must still be detected and redacted.
    const rows: AuditLogRow[] = [
      {
        id: 303,
        actor: 'a',
        event: 'array-leak',
        tenantId: null,
        ip: '0',
        createdAt: '2024-01-01T00:00:00.000Z',
        details: { items: [{ recoveryCode: 'rc-xyz' }] },
      },
    ];
    render(<AuditTable rows={rows} following={false} pendingCount={0} onFollowChange={vi.fn()} />);
    fireEvent.click(screen.getByText('array-leak'));
    expect(screen.getByText(/Secret-shaped key present/i)).toBeInTheDocument();
    expect(screen.queryByText(/rc-xyz/)).not.toBeInTheDocument();
  });

  it('renders a valid timestamp as its UTC HH:MM:SS slice', () => {
    // A well-formed ISO timestamp shows as its UTC clock time, never the raw ISO string.
    const rows: AuditLogRow[] = [
      {
        id: 700,
        actor: 'a',
        event: 'timed',
        tenantId: null,
        ip: '0',
        createdAt: '2024-01-01T13:37:42.000Z',
        details: {},
      },
    ];
    render(<AuditTable rows={rows} following={false} pendingCount={0} onFollowChange={vi.fn()} />);
    expect(screen.getByText('13:37:42')).toBeInTheDocument();
    expect(screen.queryByText('2024-01-01T13:37:42.000Z')).not.toBeInTheDocument();
  });

  it('reports still-following exactly at the last-row threshold', () => {
    // Landing within one row height of the bottom (maxTop − ROW_H = 880 − 44 = 836) still
    // counts as following; a strict "greater-than" comparison would drop it here.
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
    Object.defineProperty(scroll, 'scrollTop', { value: 836, configurable: true });
    fireEvent.scroll(scroll);
    expect(onFollowChange).toHaveBeenCalledWith(true);
  });

  it('hides the jump-to-latest pill while already following', () => {
    // The pill is only for a paused tail; following the tail hides it even with buffered events.
    render(
      <AuditTable rows={makeRows(3)} following={true} pendingCount={2} onFollowChange={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /jump to latest/i })).not.toBeInTheDocument();
  });

  it('hides the jump-to-latest pill when nothing is buffered', () => {
    // A paused tail with zero buffered events shows no pill.
    render(
      <AuditTable rows={makeRows(3)} following={false} pendingCount={0} onFollowChange={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /jump to latest/i })).not.toBeInTheDocument();
  });

  it('lays out the windowing geometry with fixed pixel dimensions', () => {
    // The viewport is 440px, the spacer is filtered.length × ROW_H = 30 × 44 = 1320px and
    // position:relative, the window offset is absolutely positioned, and each row is 44px tall.
    render(
      <AuditTable
        rows={makeRows(30)}
        following={false}
        pendingCount={0}
        onFollowChange={vi.fn()}
      />,
    );
    const scroll = screen.getByTestId('audit-scroll');
    expect(scroll).toHaveStyle({ height: '440px' });
    const spacer = scroll.firstElementChild;
    if (spacer === null) throw new Error('missing spacer element');
    expect(spacer).toHaveStyle({ height: '1320px', position: 'relative' });
    const offset = spacer.firstElementChild;
    if (offset === null) throw new Error('missing offset element');
    expect(offset).toHaveStyle({ position: 'absolute' });
    const firstRow = screen.getByText('evt-0').closest('button');
    if (firstRow === null) throw new Error('missing row button');
    expect(firstRow).toHaveStyle({ height: '44px' });
  });

  it('preserves array and number shapes while redacting secret-shaped keys', () => {
    // Redaction rewrites only the secret value: a sibling array stays a JSON array and a
    // number stays a number in the rendered proof.
    const rows: AuditLogRow[] = [
      {
        id: 404,
        actor: 'a',
        event: 'mixed-leak',
        tenantId: null,
        ip: '0',
        createdAt: '2024-01-01T00:00:00.000Z',
        details: { token: 'super-secret', tags: ['one', 'two'], count: 7 },
      },
    ];
    render(<AuditTable rows={rows} following={false} pendingCount={0} onFollowChange={vi.fn()} />);
    fireEvent.click(screen.getByText('mixed-leak'));
    expect(screen.getByText(/Secret-shaped key present/i)).toBeInTheDocument();
    const pre = document.querySelector('pre');
    if (pre === null) throw new Error('missing details pre');
    const text = pre.textContent ?? '';
    expect(text).toContain('"token": "<redacted>"');
    expect(text).toContain('"tags": [');
    expect(text).toContain('"count": 7');
    expect(text).not.toContain('super-secret');
  });
});
