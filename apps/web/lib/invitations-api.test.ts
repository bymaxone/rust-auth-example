/**
 * @fileoverview Tests for the invitations admin client.
 *
 * Covers: the create body carries no tenantId, and the pending list maps audit
 * rows (with defensive fallbacks) into typed invitations.
 *
 * @module lib/invitations-api.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AUTH_ROUTES } from '@bymax-one/rust-auth/shared';

const mockApiFetch = vi.hoisted(() => vi.fn());
const mockApiJson = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ apiFetch: mockApiFetch, apiJson: mockApiJson }));

import { createInvitation, listPendingInvitations } from './invitations-api';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createInvitation', () => {
  it('POSTs email + role with NO tenantId in the body', async () => {
    // The route derives the tenant from the caller's claims — never the body.
    mockApiFetch.mockResolvedValueOnce({});
    await createInvitation({ email: 'a@b.co', role: 'member' });
    const [route, init] = mockApiFetch.mock.calls[0] as [string, RequestInit];
    expect(route).toBe(AUTH_ROUTES.INVITATIONS_CREATE);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"email":"a@b.co","role":"member"}');
  });
});

describe('listPendingInvitations', () => {
  it('maps audit rows into typed pending invitations', async () => {
    // Each invitation-created event becomes a pending row.
    mockApiJson.mockResolvedValueOnce({
      data: [{ createdAt: '2024-01-01T00:00:00Z', details: { email: 'x@y.co', role: 'admin' } }],
    });
    await expect(listPendingInvitations()).resolves.toEqual([
      { email: 'x@y.co', role: 'admin', sentAt: '2024-01-01T00:00:00Z' },
    ]);
    expect(mockApiJson).toHaveBeenCalledWith(expect.stringContaining('/audit/logs?event='));
  });

  it('applies defensive fallbacks for missing/typed details', async () => {
    // A malformed row must not crash the list; email falls back and role is dropped.
    mockApiJson.mockResolvedValueOnce({
      data: [{ createdAt: 't', details: { email: 42 } }],
    });
    await expect(listPendingInvitations()).resolves.toEqual([{ email: 'unknown', sentAt: 't' }]);
  });

  it('returns an empty list when the page has no data', async () => {
    // No events yields the empty state upstream.
    mockApiJson.mockResolvedValueOnce({});
    await expect(listPendingInvitations()).resolves.toEqual([]);
  });
});
