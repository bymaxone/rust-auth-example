/**
 * @fileoverview Client for the example-owned auth-health aggregate.
 *
 * `GET /audit/aggregate` rolls the audit trail into a handful of headline
 * counters — success rates, the active-session count, the MFA-enrolled share,
 * and the configured providers — that the Overview page renders as health cards.
 * Fetched through the shared `authFetch` (via {@link apiJson}); never a
 * hand-rolled `fetch`.
 *
 * @module lib/audit-aggregate
 */

import { apiJson } from './api';

/** Auth-health counters served by the example-owned `GET /audit/aggregate`. */
export interface AuditAggregate {
  /** Login success rate over the window, `0..1`. */
  readonly loginSuccessRate: number;
  /** Email-verification success rate over the window, `0..1`. */
  readonly verifySuccessRate: number;
  /** Count of currently active sessions. */
  readonly activeSessions: number;
  /** Share of users with MFA enrolled, `0..1`. */
  readonly mfaEnrolledPct: number;
  /** The configured outbound email provider. */
  readonly emailProvider: 'mailpit' | 'resend';
  /** Whether Google OAuth is configured in this environment. */
  readonly oauthGoogleEnabled: boolean;
}

/**
 * Fetch the auth-health aggregate. Throws `AuthClientError` on a non-2xx response.
 *
 * @returns The typed {@link AuditAggregate}.
 */
export async function fetchAuditAggregate(): Promise<AuditAggregate> {
  return apiJson<AuditAggregate>('/audit/aggregate');
}
