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

/** A device session as returned by `GET /auth/sessions`. */
export interface SessionInfo {
  /** The opaque session id. */
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

/** List the caller's active sessions. */
export async function listSessions(): Promise<SessionInfo[]> {
  return apiJson<SessionInfo[]>(AUTH_ROUTES.SESSIONS_LIST);
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
