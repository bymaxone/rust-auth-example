/**
 * @fileoverview Tests for the sessions device-manager client.
 *
 * Covers: list normalizes the `{ sessions }` envelope (hash → id, epoch-ms → ISO),
 * revoke encodes the id into the path, and revoke-all targets the all-sessions route
 * — all through the shared helper.
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
  it('normalizes the { sessions } envelope from GET /auth/sessions', async () => {
    // The API wraps the list in `{ sessions }` and carries the full hash plus an
    // epoch-millisecond activity time; the client unwraps it, keeps the hash as the
    // revoke `id`, and renders the timestamp as ISO.
    const hash = 'abcd1234'.repeat(8);
    mockApiJson.mockResolvedValueOnce({
      sessions: [
        {
          id: 'abcd1234',
          sessionHash: hash,
          device: 'Mac',
          ip: '1.1.1.1',
          lastActivityAt: 0,
          isCurrent: true,
        },
      ],
    });
    await expect(listSessions()).resolves.toEqual([
      {
        id: hash,
        device: 'Mac',
        ip: '1.1.1.1',
        lastActivity: '1970-01-01T00:00:00.000Z',
        isCurrent: true,
      },
    ]);
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
