/**
 * @fileoverview Tests for the audit read-API client.
 *
 * Covers: the query is serialized (undefined facets skipped) into the keyset URL
 * and the typed page is returned.
 *
 * @module lib/audit-api.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApiJson = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ apiJson: mockApiJson }));

import { fetchAuditPage, type AuditPage, type AuditQuery } from './audit-api';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchAuditPage', () => {
  it('serializes only the defined facets into the keyset URL', async () => {
    // Undefined facets must be omitted so the keyset query stays clean.
    const page = { data: [], nextCursor: null, hasMore: false };
    mockApiJson.mockResolvedValueOnce(page);
    const query: AuditQuery = { actor: 'u1', event: 'on_login', limit: 50 };
    await expect(fetchAuditPage(query)).resolves.toBe(page);
    const url = mockApiJson.mock.calls[0]?.[0] as string;
    expect(url).toContain('/audit/logs?');
    expect(url).toContain('actor=u1');
    expect(url).toContain('event=on_login');
    expect(url).toContain('limit=50');
    expect(url).not.toContain('cursor');
  });

  it('serializes a numeric keyset cursor into the URL', async () => {
    // The cursor is a numeric row id on the wire, stringified into the query.
    mockApiJson.mockResolvedValueOnce({ data: [], nextCursor: null, hasMore: false });
    await fetchAuditPage({ cursor: 4_096, limit: 50 });
    const url = mockApiJson.mock.calls[0]?.[0] as string;
    expect(url).toContain('cursor=4096');
  });

  it('returns the typed keyset page with a numeric id and cursor and a nullable ip', async () => {
    // The wire shape matches the Rust `AuditRow`/`AuditPage`: numeric ids/cursor, `ip` may
    // be null.
    const page: AuditPage = {
      data: [
        {
          id: 1_024,
          actor: 'user@acme.test',
          event: 'after_login',
          tenantId: 'acme',
          ip: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          details: {},
        },
      ],
      nextCursor: 1_024,
      hasMore: true,
    };
    mockApiJson.mockResolvedValueOnce(page);
    const result = await fetchAuditPage({ limit: 50 });
    expect(result.data[0]?.id).toBe(1_024);
    expect(result.data[0]?.ip).toBeNull();
    expect(result.nextCursor).toBe(1_024);
  });
});
