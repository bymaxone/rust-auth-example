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

import { fetchAuditPage, type AuditQuery } from './audit-api';

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
});
