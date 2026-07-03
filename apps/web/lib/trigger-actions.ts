/**
 * @fileoverview The Trigger Center action wrappers.
 *
 * One async wrapper per Playground action: each calls the library directly
 * (`authClient` for the journeys it exposes, the shared `authFetch` for the
 * example-owned diagnostics), catches an `AuthClientError` into a plain
 * {@link TriggerResult} instead of throwing to the render boundary, and returns
 * the raw request + response for display. **Secrets are never surfaced:**
 * passwords are stripped from the request and any token/secret key in a response
 * is redacted before it can reach the UI.
 *
 * @module lib/trigger-actions
 */

import { AuthClientError } from '@bymax-one/rust-auth/shared';
import type { LoginInput, RegisterInput } from '@bymax-one/rust-auth/client';
import { authClient, authFetch } from './auth-client';

/** The outcome of firing a Trigger Center action. */
export interface TriggerResult {
  /** The (secret-stripped) request that was sent. */
  readonly request: unknown;
  /** The (secret-redacted) response body or error envelope. */
  readonly response: unknown;
  /** The wire `auth.*` code when the action failed. */
  readonly code?: string;
  /** The HTTP status when known. */
  readonly status?: number;
  /** The `Retry-After` window (seconds) on a 429. */
  readonly retryAfterSeconds?: number;
}

/** Keys whose values are secrets and must never appear in the Playground. */
const SECRET_KEYS: ReadonlySet<string> = new Set([
  'accessToken',
  'refreshToken',
  'mfaTempToken',
  'password',
  'secret',
  'recoveryCodes',
  'otp',
  'token',
  'ticket',
]);

/** Placeholder shown in place of any redacted secret. */
const REDACTED = '<redacted>';

/**
 * Deep-copy a value, replacing any secret-keyed field with a redaction marker so
 * a token, password, or recovery code can never be rendered in the Playground.
 *
 * @param value - The value to sanitize.
 * @returns A structurally identical value with secrets redacted.
 */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = SECRET_KEYS.has(key) ? REDACTED : redactSecrets(entry);
    }
    return out;
  }
  return value;
}

/** Build a failure {@link TriggerResult} from a caught error, redacting secrets. */
function fromError(request: unknown, err: unknown): TriggerResult {
  if (err instanceof AuthClientError) {
    return {
      request,
      response: redactSecrets(err.toJSON()),
      ...(err.code !== undefined ? { code: err.code } : {}),
      status: err.status,
    };
  }
  return { request, response: { error: 'unexpected client error' } };
}

/** Register a new user. Passwords are stripped from the displayed request. */
export async function runRegister(input: RegisterInput): Promise<TriggerResult> {
  const request = { email: input.email, name: input.name, tenantId: input.tenantId };
  try {
    const response = await authClient.register(input);
    return { request, response: redactSecrets(response), status: 200 };
  } catch (err) {
    return fromError(request, err);
  }
}

/** Sign in; surfaces the MFA-challenge branch when the account requires it. */
export async function runLogin(input: LoginInput): Promise<TriggerResult> {
  const request = { email: input.email, tenantId: input.tenantId };
  try {
    const response = await authClient.login(input);
    return { request, response: redactSecrets(response), status: 200 };
  } catch (err) {
    return fromError(request, err);
  }
}

/** Rotate the access/refresh tokens via `authClient.refresh` (values redacted). */
export async function rotateToken(): Promise<TriggerResult> {
  const request = { action: 'refresh' };
  try {
    const response = await authClient.refresh();
    return { request, response: redactSecrets(response), status: 200 };
  } catch (err) {
    return fromError(request, err);
  }
}

/**
 * Fire `attempts` logins back-to-back to trip `RateLimitConfig.login` (5/60),
 * returning the resulting `429 auth.too_many_requests` with its `Retry-After`.
 *
 * @param input - The credentials to hammer (password stripped from the display).
 * @param attempts - How many logins to attempt before giving up (default 7).
 */
export async function hammerLogin(input: LoginInput, attempts = 7): Promise<TriggerResult> {
  const request = { email: input.email, tenantId: input.tenantId, attempts };
  for (let i = 0; i < attempts; i += 1) {
    const res = await authFetch('/auth/login', { method: 'POST', body: JSON.stringify(input) });
    if (res.status === 429) {
      const body = (await res.json().catch(() => undefined)) as
        { error?: { code?: string; details?: { retryAfterSeconds?: number } } } | undefined;
      const header = res.headers.get('Retry-After');
      const seconds = header !== null ? Number(header) : body?.error?.details?.retryAfterSeconds;
      return {
        request,
        response: redactSecrets(body ?? { status: 429 }),
        code: body?.error?.code ?? 'auth.too_many_requests',
        status: 429,
        ...(seconds !== undefined && Number.isFinite(seconds)
          ? { retryAfterSeconds: seconds }
          : {}),
      };
    }
  }
  return { request, response: { note: 'no 429 within attempts' }, status: 200 };
}

/** Drive an account toward lockout via the example-owned diagnostics route. */
export async function forceLockout(email: string, tenantId: string): Promise<TriggerResult> {
  const request = { email, tenantId };
  try {
    const res = await authFetch('/diagnostics/force-lockout', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    const response = (await res.json().catch(() => ({}))) as unknown;
    return { request, response: redactSecrets(response), status: res.status };
  } catch (err) {
    return fromError(request, err);
  }
}

/** Dispatch a verification email through the anti-enumeration resend route. */
export async function dispatchVerifyEmail(email: string, tenantId: string): Promise<TriggerResult> {
  const request = { email, tenantId };
  try {
    const res = await authFetch('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return { request, response: { status: res.status }, status: res.status };
  } catch (err) {
    return fromError(request, err);
  }
}

/** Dispatch a password-reset email via `authClient.forgotPassword`. */
export async function dispatchPasswordReset(
  email: string,
  tenantId: string,
): Promise<TriggerResult> {
  const request = { email, tenantId };
  try {
    await authClient.forgotPassword(email, tenantId);
    return { request, response: { dispatched: true }, status: 200 };
  } catch (err) {
    return fromError(request, err);
  }
}

/** Provoke an `auth.invalid_credentials` error by signing in with a bad password. */
export async function provokeInvalidCredentials(
  email: string,
  tenantId: string,
): Promise<TriggerResult> {
  return runLogin({ email, password: 'definitely-not-the-password', tenantId });
}
