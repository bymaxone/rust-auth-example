/**
 * @fileoverview Client for the TOTP MFA lifecycle routes.
 *
 * Wraps `POST /auth/mfa/{setup,verify-enable,disable,recovery-codes}` over the
 * shared `authFetch` (via the throw-on-failure helpers). The setup secret and
 * recovery codes it returns are shown once and are never persisted client-side —
 * callers must keep them in memory only.
 *
 * @module lib/mfa-api
 */

import { AUTH_ROUTES } from '@bymax-one/rust-auth/shared';
import { apiFetch, apiJson } from './api';

/** Wire shape (camelCase) of the `POST /auth/mfa/setup` response. */
export interface MfaSetupResult {
  /** The base32 TOTP secret — shown once, never stored. */
  readonly secret: string;
  /** The `otpauth://` URI used to render the enrollment QR. */
  readonly qrCodeUri: string;
  /** One-time recovery codes — shown once, never stored. */
  readonly recoveryCodes: readonly string[];
}

/** Begin enrollment: mint a fresh secret + QR URI + recovery codes. */
export async function mfaSetup(): Promise<MfaSetupResult> {
  return apiJson<MfaSetupResult>(AUTH_ROUTES.MFA_SETUP, { method: 'POST' });
}

/** Activate MFA with the first valid TOTP code. Resolves on success. */
export async function mfaVerifyEnable(code: string): Promise<void> {
  await apiFetch(AUTH_ROUTES.MFA_VERIFY_ENABLE, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

/** Disable MFA, gated by a fresh TOTP code. Resolves on success. */
export async function mfaDisable(code: string): Promise<void> {
  await apiFetch(AUTH_ROUTES.MFA_DISABLE, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

/** Regenerate the one-time recovery codes, gated by a fresh TOTP code. */
export async function mfaRegenerateRecoveryCodes(code: string): Promise<readonly string[]> {
  const body = await apiJson<{ recoveryCodes: readonly string[] }>(AUTH_ROUTES.MFA_RECOVERY_CODES, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  return body.recoveryCodes;
}
