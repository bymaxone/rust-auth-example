/**
 * @fileoverview In-memory, single-read holder for the short-lived MFA temp token.
 * @see {@link lib/reset-flow-store} for the analogous holder used by the password-reset wizard.
 *
 * The login page stores the `mfaTempToken` returned by an MFA-required login here
 * before routing to the MFA-challenge page. The challenge page consumes (reads and
 * clears) it exactly once. The token never touches `localStorage`, `sessionStorage`,
 * cookies, or the URL — only the module-scoped variable below.
 *
 * @module lib/mfa-challenge-store
 */

'use client';

/** Module-scoped slot for the pending MFA temp token (never persisted). */
let pendingMfaTempToken: string | null = null;

/**
 * Stores the short-lived MFA temp token after a login returns an MFA challenge.
 * Any previously held token is replaced.
 *
 * @param tempToken - The signed MFA temp JWT returned by the login endpoint.
 */
export function setPendingMfaChallenge(tempToken: string): void {
  pendingMfaTempToken = tempToken;
}

/**
 * Returns the pending MFA temp token and immediately clears the slot (single use).
 * Returns `null` when no challenge is pending.
 *
 * @returns The stored temp token, or `null` if none is pending.
 */
export function consumePendingMfaChallenge(): string | null {
  const token = pendingMfaTempToken;
  pendingMfaTempToken = null;
  return token;
}
