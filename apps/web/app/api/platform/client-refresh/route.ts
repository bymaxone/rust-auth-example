/**
 * @fileoverview Same-origin platform refresh target.
 *
 * The browser `platformFetch` wrapper POSTs here on a 401 against any platform
 * API call; the library handler proxies a `POST /auth/platform/refresh` to the
 * backend, relays the rotated HttpOnly cookies back to the browser, and returns
 * the new token JSON so the original request can replay. No auth logic is
 * hand-rolled.
 *
 * @module app/api/platform/client-refresh/route
 */

import 'server-only';
import { createClientRefreshHandler } from '@bymax-one/rust-auth/nextjs';

const backendUrl = process.env.INTERNAL_API_URL;
if (backendUrl === undefined || backendUrl === '') {
  throw new Error('INTERNAL_API_URL is required for the platform refresh handler');
}

/** POST `/api/platform/client-refresh` — one 401 → platform refresh → replay. */
export const POST = createClientRefreshHandler({
  backendUrl,
  routePrefix: 'auth/platform',
});
