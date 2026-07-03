/**
 * @fileoverview Client for the example-owned audit read API.
 *
 * `GET /audit/logs` is keyset-paginated (`cursor` + facets → `{ data, nextCursor,
 * hasMore }`); each row id doubles as the SSE event id so a reconnect resumes via
 * the browser's native `Last-Event-ID`. Fetched through the shared `authFetch`.
 *
 * @module lib/audit-api
 */

import { apiJson } from './api';

/** One audit row. Its `id` is also the keyset cursor / SSE event id. */
export interface AuditLogRow {
  /** The row id (keyset cursor / SSE event id). */
  readonly id: string;
  /** The acting principal (user id / email / "system"). */
  readonly actor: string;
  /** The hook/event name. */
  readonly event: string;
  /** The tenant, or `null` for tenant-less events. */
  readonly tenantId: string | null;
  /** The client IP. */
  readonly ip: string;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
  /** The masked, secret-free detail payload. */
  readonly details: Record<string, unknown>;
}

/** One keyset page of audit rows. */
export interface AuditPage {
  /** The rows in this page. */
  readonly data: readonly AuditLogRow[];
  /** The cursor for the next page, or `null` at the end. */
  readonly nextCursor: string | null;
  /** Whether more pages remain. */
  readonly hasMore: boolean;
}

/** Facets + pagination for an audit query. */
export interface AuditQuery {
  /** The keyset cursor to page from. */
  readonly cursor?: string;
  /** Filter by actor. */
  readonly actor?: string;
  /** Filter by event name. */
  readonly event?: string;
  /** Filter by tenant. */
  readonly tenantId?: string;
  /** Page size. */
  readonly limit?: number;
}

/**
 * Fetch one keyset page of `GET /audit/logs`. Only the facets present on `query`
 * are serialized — `exactOptionalPropertyTypes` guarantees no explicit
 * `undefined` values reach the serializer.
 */
export async function fetchAuditPage(query: AuditQuery): Promise<AuditPage> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    params.set(key, String(value));
  }
  return apiJson<AuditPage>(`/audit/logs?${params.toString()}`);
}
