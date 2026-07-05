/**
 * @fileoverview Shared response handling for the console's example-owned API calls.
 *
 * The library's `authClient` methods already throw a typed `AuthClientError` on a
 * non-2xx response, but the raw `authFetch` used for the endpoints `authClient`
 * does not cover — sessions, MFA, audit, diagnostics, invitations — returns the
 * `Response` unconditionally (it only transparently retries a single 401). These
 * helpers restore the throw-on-failure contract so every console module surfaces
 * errors the same way: a caught `AuthClientError` carrying the wire `auth.*` code.
 * A 4xx/5xx is therefore never mistaken for success.
 *
 * @module lib/api
 */

import { AuthClientError, type AuthErrorResponse } from '@bymax-one/rust-auth/shared';
import { authFetch } from './auth-client';

/** The nested error envelope the API returns: `{ error: { code, message } }`. */
interface WireErrorEnvelope {
  readonly error?: { readonly code?: unknown; readonly message?: unknown };
}

/**
 * Perform an authenticated request through the shared `authFetch`, throwing an
 * {@link AuthClientError} (with the wire `auth.*` code, when present) on any
 * non-2xx response.
 *
 * @param input - The request path, forwarded to the shared `authFetch`.
 * @param init - Optional fetch init.
 * @returns The successful `Response`.
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await authFetch(input, init);
  if (res.ok) return res;
  throw await toAuthClientError(res);
}

/**
 * Perform an authenticated request and parse its JSON body as `T`. Throws
 * {@link AuthClientError} on a non-2xx response.
 *
 * @param input - The request path.
 * @param init - Optional fetch init.
 * @returns The parsed JSON body typed as `T`.
 */
export async function apiJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(input, init);
  return (await res.json()) as T;
}

/** Build an {@link AuthClientError} from a failed response, mirroring the client. */
async function toAuthClientError(res: Response): Promise<AuthClientError> {
  const body = await readErrorBody(res);
  const message = body?.message ?? (res.statusText || 'Request failed');
  return new AuthClientError(message, res.status, body);
}

/** Parse the `{ error: { code, message } }` envelope, if present and well-formed. */
async function readErrorBody(res: Response): Promise<AuthErrorResponse | undefined> {
  // Scope the try to the parse alone: a non-JSON / empty body has no structured error, so it
  // falls back to undefined. Inspecting the parsed envelope outside the try keeps every branch
  // observable (an absent `error` object or a non-string field yields undefined, never a caught
  // throw), so the guard is exact rather than swallowed.
  let parsed: WireErrorEnvelope;
  try {
    parsed = (await res.json()) as WireErrorEnvelope;
  } catch {
    return undefined;
  }
  const err = parsed.error;
  if (err !== undefined && typeof err.code === 'string' && typeof err.message === 'string') {
    return { code: err.code, message: err.message } as AuthErrorResponse;
  }
  return undefined;
}
