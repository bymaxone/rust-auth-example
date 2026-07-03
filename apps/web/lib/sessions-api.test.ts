/**
 * @fileoverview Tests for the sessions device-manager client.
 *
 * Covers: list returns the typed array, revoke encodes the id into the path, and
 * revoke-all targets the all-sessions route — all through the shared helper.
 *
 * @module lib/sessions-api.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AUTH_ROUTES } from '@bymax-one/rust-auth/shared';

const mockApiFetch = vi.hoisted(() => vi.fn());
const mockApiJson = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ apiFetch: mockApiFetch, apiJson: mockApiJson }));

import { listSessions, revokeSession, revokeAllOtherSessions } from './sessions-api';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listSessions', () => {
  it('returns the typed session list from GET /auth/sessions', async () => {
    // The device manager renders whatever the sessions route returns.
    const rows = [{ id: '1', device: 'Mac', ip: '1.1.1.1', lastActivity: 'now', isCurrent: true }];
    mockApiJson.mockResolvedValueOnce(rows);
    await expect(listSessions()).resolves.toEqual(rows);
    expect(mockApiJson).toHaveBeenCalledWith(AUTH_ROUTES.SESSIONS_LIST);
  });
});

describe('revokeSession', () => {
  it('DELETEs the id encoded into the path', async () => {
    // The id must be URL-encoded into the single-session route.
    mockApiFetch.mockResolvedValueOnce({});
    await revokeSession('a b/c');
    expect(mockApiFetch).toHaveBeenCalledWith('/auth/sessions/a%20b%2Fc', { method: 'DELETE' });
  });
});

describe('revokeAllOtherSessions', () => {
  it('DELETEs the all-sessions route', async () => {
    // Logging out everywhere else targets the all-sessions route.
    mockApiFetch.mockResolvedValueOnce({});
    await revokeAllOtherSessions();
    expect(mockApiFetch).toHaveBeenCalledWith(AUTH_ROUTES.SESSIONS_REVOKE_ALL, {
      method: 'DELETE',
    });
  });
});
