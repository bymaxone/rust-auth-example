/**
 * @fileoverview The edge background silent-refresh target.
 *
 * The proxy redirects an expired-but-refreshable session here; the library
 * handler proxies a backend refresh, relays the rotated HttpOnly cookies, and
 * redirects to the open-redirect-guarded destination (or the login on failure).
 *
 * @module app/api/auth/silent-refresh/route
 */

import { createSilentRefreshHandler } from '@bymax-one/rust-auth/nextjs';
import { authHandlerConfig } from '../_config';

/** GET `/api/auth/silent-refresh` — cookie-to-cookie refresh, then redirect. */
export const GET = createSilentRefreshHandler(authHandlerConfig);
