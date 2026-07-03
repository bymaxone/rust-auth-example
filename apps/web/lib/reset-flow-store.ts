/**
 * @fileoverview In-memory, single-read holder for the password-reset verified token.
 *
 * The forgot-password OTP verification step stores the `verifiedToken` returned by
 * the `POST /auth/password/verify-otp` endpoint here before routing to the
 * reset-password page. The reset page consumes (reads and clears) it exactly once.
 * The token never touches `localStorage`, `sessionStorage`, cookies, or the URL.
 *
 * @module lib/reset-flow-store
 */

'use client';

/** Module-scoped slot for the pending reset verified token (never persisted). */
let pendingVerifiedToken: string | null = null;

/**
 * Stores the `verifiedToken` returned by the OTP verification step.
 * Any previously held token is replaced.
 *
 * @param token - The verified-token proof from the verify-otp endpoint.
 */
export function setResetVerifiedToken(token: string): void {
  pendingVerifiedToken = token;
}

/**
 * Returns the pending verified token and immediately clears the slot (single use).
 * Returns `null` when no token is pending.
 *
 * @returns The stored verified token, or `null` if none is pending.
 */
export function consumeResetVerifiedToken(): string | null {
  const token = pendingVerifiedToken;
  pendingVerifiedToken = null;
  return token;
}
