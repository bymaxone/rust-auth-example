/**
 * @fileoverview The browser-facing auth client setup.
 *
 * `authFetch` is the single-flight `fetch` wrapper: one 401 triggers exactly one
 * `POST /api/auth/client-refresh`, then the original request replays; concurrent
 * 401s await the same refresh. `authClient` is the typed client the console calls
 * directly. Both are plain, JSX-free modules so they import cleanly from server
 * and client code. A missing `NEXT_PUBLIC_API_URL` fails fast at module load.
 *
 * @module lib/auth-client
 */

import { createAuthClient, createAuthFetch } from '@bymax-one/rust-auth/client';
import type { AuthClient, AuthFetch } from '@bymax-one/rust-auth/client';

const baseUrl = process.env.NEXT_PUBLIC_API_URL;
if (baseUrl === undefined || baseUrl === '') {
  throw new Error('NEXT_PUBLIC_API_URL is required to construct the auth client');
}

/** Single-flight fetch: one 401 → `/api/auth/client-refresh` → replay; concurrent 401s share it. */
export const authFetch: AuthFetch = createAuthFetch({ routePrefix: 'auth' });

/** The framework-agnostic typed client the console calls directly. */
export const authClient: AuthClient = createAuthClient({
  baseUrl,
  credentials: 'include',
  routePrefix: 'auth',
});
