/**
 * @fileoverview Client for the session device-manager routes.
 *
 * Wraps `GET /auth/sessions`, `DELETE /auth/sessions/{id}`, and
 * `DELETE /auth/sessions/all` over the shared `authFetch` (via the throw-on-
 * failure helpers). No hand-rolled `fetch`.
 *
 * @module lib/sessions-api
 */

import { AUTH_ROUTES } from '@bymax-one/rust-auth/shared';
import { apiFetch, apiJson } from './api';

/** A device session, normalized for the console from the `GET /auth/sessions` payload. */
export interface SessionInfo {
  /** The full session hash — the identifier `revokeSession` deletes by. */
  readonly id: string;
  /** A human-readable device / user-agent summary. */
  readonly device: string;
  /** The client IP the session was last seen from. */
  readonly ip: string;
  /** ISO-8601 timestamp of the session's last activity. */
  readonly lastActivity: string;
  /** Whether this is the session making the request. */
  readonly isCurrent: boolean;
}

/**
 * The wire shape of one session inside the `{ sessions: [...] }` envelope: the API
 * returns the full `sessionHash` (the revoke identifier) and epoch-millisecond
 * activity timestamps, which the console normalizes to {@link SessionInfo}.
 */
interface WireSession {
  readonly sessionHash: string;
  readonly device: string;
  readonly ip: string;
  readonly lastActivityAt: number;
  readonly isCurrent: boolean;
}

/** List the caller's active sessions, normalizing the wire payload to {@link SessionInfo}. */
export async function listSessions(): Promise<SessionInfo[]> {
  const { sessions } = await apiJson<{ sessions: readonly WireSession[] }>(
    AUTH_ROUTES.SESSIONS_LIST,
  );
  return sessions.map((session) => ({
    id: session.sessionHash,
    device: session.device,
    ip: session.ip,
    lastActivity: new Date(session.lastActivityAt).toISOString(),
    isCurrent: session.isCurrent,
  }));
}

/** Revoke a single session by id. Resolves on success. */
export async function revokeSession(id: string): Promise<void> {
  await apiFetch(AUTH_ROUTES.SESSIONS_REVOKE_ONE.replace('{id}', encodeURIComponent(id)), {
    method: 'DELETE',
  });
}

/** Revoke every session except the current device. Resolves on success. */
export async function revokeAllOtherSessions(): Promise<void> {
  await apiFetch(AUTH_ROUTES.SESSIONS_REVOKE_ALL, { method: 'DELETE' });
}
