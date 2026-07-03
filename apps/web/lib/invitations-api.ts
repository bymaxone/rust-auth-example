/**
 * @fileoverview Client for the invitations admin surface.
 *
 * `createInvitation` posts to `POST /auth/invitations` — note the body carries
 * **no `tenantId`**: the route derives the tenant from the caller's claims.
 * Invitation *creation* is not audited, so the companion list surfaces the
 * invitations that have been **accepted** — the one invitation lifecycle event the
 * API records (`after_invitation_accepted`) — from the example-owned `GET
 * /audit/logs` keyset API. All calls go through the shared `authFetch`.
 *
 * @module lib/invitations-api
 */

import { AUTH_ROUTES } from '@bymax-one/rust-auth/shared';
import { apiFetch, apiJson } from './api';

/** Mirrors `CreateInvitationDto` — there is deliberately NO `tenantId`. */
export interface CreateInvitationInput {
  /** The invitee's email address. */
  readonly email: string;
  /** The role to grant on acceptance. */
  readonly role: string;
  /** Optional display name for a newly provisioned tenant. */
  readonly tenantName?: string;
}

/** Send a team invitation. Resolves on success. */
export async function createInvitation(input: CreateInvitationInput): Promise<void> {
  await apiFetch(AUTH_ROUTES.INVITATIONS_CREATE, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * The audit event recorded for an invitation — acceptance only. Creation emits no
 * audit event, so a true "pending" list is not derivable from the trail; the
 * accepted list is.
 */
const INVITATION_EVENT = 'after_invitation_accepted';

/** An accepted invitation surfaced from the audit trail. */
export interface AcceptedInvitation {
  /** The invitee's email address (the actor who accepted). */
  readonly email: string;
  /** ISO-8601 timestamp the invitation was accepted. */
  readonly acceptedAt: string;
}

/** One audit row as returned by the keyset read API (fields we consume). */
interface AuditRow {
  /** The masked display actor — the invitee's email for an acceptance row. */
  readonly actor?: string;
  /** The RFC 3339 timestamp the row was recorded. */
  readonly createdAt: string;
}

/** List recently accepted invitations from the dev audit API. */
export async function listAcceptedInvitations(): Promise<AcceptedInvitation[]> {
  const page = await apiJson<{ data?: readonly AuditRow[] }>(
    `/audit/logs?event=${encodeURIComponent(INVITATION_EVENT)}&limit=50`,
  );
  return (page.data ?? []).map((row) => ({
    email: typeof row.actor === 'string' ? row.actor : 'unknown',
    acceptedAt: row.createdAt,
  }));
}
