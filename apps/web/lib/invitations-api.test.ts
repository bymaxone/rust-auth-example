/**
 * @fileoverview Tests for the invitations admin client.
 *
 * Covers: the create body carries no tenantId, and the accepted list maps audit
 * rows (with a defensive actor fallback) into typed accepted invitations.
 *
 * @module lib/invitations-api.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AUTH_ROUTES } from '@bymax-one/rust-auth/shared';

const mockApiFetch = vi.hoisted(() => vi.fn());
const mockApiJson = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ apiFetch: mockApiFetch, apiJson: mockApiJson }));

import { createInvitation, listAcceptedInvitations } from './invitations-api';

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

describe('listAcceptedInvitations', () => {
  it('queries the accepted event and maps rows into typed invitations', async () => {
    // Each after_invitation_accepted row becomes an accepted invitation keyed by the actor.
    mockApiJson.mockResolvedValueOnce({
      data: [{ createdAt: '2024-01-01T00:00:00Z', actor: 'x@y.co' }],
    });
    await expect(listAcceptedInvitations()).resolves.toEqual([
      { email: 'x@y.co', acceptedAt: '2024-01-01T00:00:00Z' },
    ]);
    expect(mockApiJson).toHaveBeenCalledWith(
      expect.stringContaining('/audit/logs?event=after_invitation_accepted'),
    );
  });

  it('falls back to "unknown" when the actor is missing', async () => {
    // A row without a string actor must not crash the list; the email falls back.
    mockApiJson.mockResolvedValueOnce({
      data: [{ createdAt: 't' }],
    });
    await expect(listAcceptedInvitations()).resolves.toEqual([
      { email: 'unknown', acceptedAt: 't' },
    ]);
  });

  it('returns an empty list when the page has no data', async () => {
    // No events yields the empty state upstream.
    mockApiJson.mockResolvedValueOnce({});
    await expect(listAcceptedInvitations()).resolves.toEqual([]);
  });
});
