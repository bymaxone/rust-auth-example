/**
 * @fileoverview Thin browser client for the tenant-less platform admin domain.
 *
 * Wraps the platform auth routes (`/auth/platform/*`) with a single-flight
 * fetch instance that targets the configured API origin and retries a 401 via
 * the same-origin platform refresh route (`/api/platform/client-refresh`).
 * No `tenantId` is ever sent — the platform domain is tenant-less by design.
 * Platform tokens live in HttpOnly cookies only; the MFA temp token is held
 * in caller memory, never in storage.
 *
 * @module lib/platform-client
 */

import { createAuthFetch } from '@bymax-one/rust-auth/client';
import { AuthClientError, type AuthErrorResponse } from '@bymax-one/rust-auth/shared';
import type {
  PlatformLoginResult,
  PlatformAuthResult,
  AuthPlatformUserClient,
} from '@bymax-one/rust-auth/shared';

const baseUrl = process.env.NEXT_PUBLIC_API_URL;
if (baseUrl === undefined || baseUrl === '') {
  throw new Error('NEXT_PUBLIC_API_URL is required to construct the platform client');
}

/** Tenant-less platform endpoint paths (mirror `constants::routes::PLATFORM_*`). */
const PLATFORM = {
  login: '/auth/platform/login',
  mfaChallenge: '/auth/platform/mfa/challenge',
  me: '/auth/platform/me',
  logout: '/auth/platform/logout',
  mfaSetup: '/auth/platform/mfa/setup',
  mfaVerifyEnable: '/auth/platform/mfa/verify-enable',
  mfaDisable: '/auth/platform/mfa/disable',
  mfaRecoveryCodes: '/auth/platform/mfa/recovery-codes',
  sessions: '/auth/platform/sessions',
} as const;

/**
 * Single-flight fetch for the platform domain. A 401 triggers exactly one
 * `POST /api/platform/client-refresh`; concurrent 401s await the same refresh.
 */
const platformFetch = createAuthFetch({
  baseUrl,
  credentials: 'include',
  refreshEndpoint: '/api/platform/client-refresh',
});

/** The nested error envelope the API returns: `{ error: { code, message } }`. */
interface WireErrorEnvelope {
  readonly error?: { readonly code?: unknown; readonly message?: unknown };
}

/** Parse the `{ error: { code, message } }` envelope, if present and well-formed. */
async function readErrorBody(res: Response): Promise<AuthErrorResponse | undefined> {
  try {
    const parsed = (await res.json()) as WireErrorEnvelope;
    const code = parsed.error?.code;
    const message = parsed.error?.message;
    if (typeof code === 'string' && typeof message === 'string') {
      return { code, message } as AuthErrorResponse;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Perform a platform-domain request, throwing {@link AuthClientError} with the
 * wire `auth.*` code on any non-2xx response.
 *
 * @param path - The platform API path (e.g. `/auth/platform/login`).
 * @param init - Optional fetch init.
 * @returns The successful `Response`.
 * @throws {AuthClientError} On any non-2xx status.
 */
async function platformApiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await platformFetch(path, init);
  if (res.ok) return res;
  const body = await readErrorBody(res);
  const message = body?.message ?? (res.statusText || 'Request failed');
  throw new AuthClientError(message, res.status, body);
}

/**
 * Perform a platform-domain request and parse the JSON body as `T`.
 *
 * @param path - The platform API path.
 * @param init - Optional fetch init.
 * @returns The parsed JSON body typed as `T`.
 * @throws {AuthClientError} On any non-2xx status.
 */
async function platformApiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await platformApiFetch(path, init);
  return (await res.json()) as T;
}

/**
 * Browser client for the tenant-less platform domain.
 * No method accepts or sends a `tenantId` — the platform domain is tenant-less.
 */
export const platformClient = {
  /**
   * POST `/auth/platform/login` — untagged `PlatformLoginResult` (Success | MfaChallenge).
   * Branch on `'mfaRequired' in result` to detect an MFA challenge.
   *
   * @param email - The platform admin email.
   * @param password - The platform admin password.
   * @returns The login result: a full session or an MFA challenge.
   * @throws {AuthClientError} On non-2xx responses.
   */
  async login(email: string, password: string): Promise<PlatformLoginResult> {
    return platformApiJson<PlatformLoginResult>(PLATFORM.login, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  /**
   * POST `/auth/platform/mfa/challenge` — complete a login that returned `mfaRequired`.
   * The `mfaTempToken` must be held in caller memory only.
   *
   * @param mfaTempToken - The short-lived MFA temp token from the login response.
   * @param code - The 6-digit TOTP code from the authenticator.
   * @returns The authenticated admin session.
   * @throws {AuthClientError} On non-2xx responses.
   */
  async mfaChallenge(mfaTempToken: string, code: string): Promise<PlatformAuthResult> {
    return platformApiJson<PlatformAuthResult>(PLATFORM.mfaChallenge, {
      method: 'POST',
      body: JSON.stringify({ mfaTempToken, code }),
    });
  },

  /**
   * GET `/auth/platform/me` — the admin projection (no secrets, no password hash).
   *
   * @returns The credential-free admin profile.
   * @throws {AuthClientError} On non-2xx responses.
   */
  async getMe(): Promise<AuthPlatformUserClient> {
    return platformApiJson<AuthPlatformUserClient>(PLATFORM.me, { method: 'GET' });
  },

  /**
   * POST `/auth/platform/logout` — clears the platform cookies (204).
   *
   * @throws {AuthClientError} On non-2xx responses.
   */
  async logout(): Promise<void> {
    await platformApiFetch(PLATFORM.logout, { method: 'POST' });
  },
} as const;

/**
 * The one-time TOTP enrollment payload returned by `POST /auth/platform/mfa/setup`.
 * The secret and codes are shown once and must never be persisted client-side.
 */
export interface PlatformMfaSetup {
  /** The base32 TOTP secret — shown once, never stored. */
  readonly secret: string;
  /** The `otpauth://` URI used to render the enrollment QR. */
  readonly qrCodeUri: string;
  /** One-time recovery codes — shown once, never stored. */
  readonly recoveryCodes: readonly string[];
}

/** Client for the platform TOTP MFA lifecycle routes. */
export const platformMfa = {
  /**
   * POST `/auth/platform/mfa/setup` — mint a fresh secret + QR URI + recovery codes (200).
   *
   * @returns The one-time enrollment payload.
   * @throws {AuthClientError} On non-2xx responses, including `auth.mfa_not_enabled`
   *   when the platform config lacks an MFA configuration (fail-closed).
   */
  async setup(): Promise<PlatformMfaSetup> {
    return platformApiJson<PlatformMfaSetup>(PLATFORM.mfaSetup, { method: 'POST' });
  },

  /**
   * POST `/auth/platform/mfa/verify-enable` — activate MFA with the first valid TOTP (204).
   *
   * @param code - The 6-digit TOTP code to confirm enrollment.
   * @throws {AuthClientError} On non-2xx responses.
   */
  async verifyEnable(code: string): Promise<void> {
    await platformApiFetch(PLATFORM.mfaVerifyEnable, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  /**
   * POST `/auth/platform/mfa/disable` — disable MFA, gated by a fresh TOTP (204).
   *
   * @param code - The 6-digit TOTP code to confirm the destructive action.
   * @throws {AuthClientError} On non-2xx responses.
   */
  async disable(code: string): Promise<void> {
    await platformApiFetch(PLATFORM.mfaDisable, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  /**
   * POST `/auth/platform/mfa/recovery-codes` — regenerate recovery codes, gated by a fresh TOTP (200).
   *
   * @param code - The 6-digit TOTP code to confirm regeneration.
   * @returns The fresh one-time recovery codes.
   * @throws {AuthClientError} On non-2xx responses.
   */
  async regenerate(code: string): Promise<readonly string[]> {
    const body = await platformApiJson<{ recoveryCodes: readonly string[] }>(
      PLATFORM.mfaRecoveryCodes,
      { method: 'POST', body: JSON.stringify({ code }) },
    );
    return body.recoveryCodes;
  },
} as const;

/** Client for the platform session management routes (bulk revoke only). */
export const platformSessions = {
  /**
   * DELETE `/auth/platform/sessions` — revoke all platform sessions (bulk only; 204).
   *
   * The platform domain exposes only bulk revoke — there is no per-session list
   * or per-row revoke endpoint. After a successful revoke the caller's own session
   * is gone; the caller must route to `/platform/login`.
   *
   * @throws {AuthClientError} On non-2xx responses.
   */
  async revokeAll(): Promise<void> {
    await platformApiFetch(PLATFORM.sessions, { method: 'DELETE' });
  },
} as const;
