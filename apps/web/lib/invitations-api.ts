/**
 * @fileoverview Client for the invitations admin surface.
 *
 * `createInvitation` posts to `POST /auth/invitations` — note the body carries
 * **no `tenantId`**: the route derives the tenant from the caller's claims. The
 * pending list reads invitation events from the example-owned `GET /audit/logs`
 * keyset API. All calls go through the shared `authFetch`.
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

/** The audit event name emitted when an invitation is created. */
const INVITATION_EVENT = 'after_invitation_created';

/** A pending invitation surfaced from the audit trail. */
export interface PendingInvitation {
  /** The invitee's email address. */
  readonly email: string;
  /** The invited role, when recorded. */
  readonly role?: string;
  /** ISO-8601 timestamp the invitation was sent. */
  readonly sentAt: string;
}

/** One audit row as returned by the keyset read API (fields we consume). */
interface AuditRow {
  readonly createdAt: string;
  readonly details?: Record<string, unknown>;
}

/** List recent invitation-created events from the dev audit API. */
export async function listPendingInvitations(): Promise<PendingInvitation[]> {
  const page = await apiJson<{ data?: readonly AuditRow[] }>(
    `/audit/logs?event=${encodeURIComponent(INVITATION_EVENT)}&limit=50`,
  );
  return (page.data ?? []).map((row) => {
    const email = row.details?.['email'];
    const role = row.details?.['role'];
    return {
      email: typeof email === 'string' ? email : 'unknown',
      sentAt: row.createdAt,
      ...(typeof role === 'string' ? { role } : {}),
    };
  });
}
