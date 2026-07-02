/**
 * @fileoverview The `/client` single-flight refresh target.
 *
 * The browser fetch wrapper POSTs here on a 401; the library handler proxies a
 * backend refresh, relays the rotated HttpOnly cookies, and returns the JSON
 * body so the original request can replay. No auth logic is hand-rolled.
 *
 * @module app/api/auth/client-refresh/route
 */

import { createClientRefreshHandler } from '@bymax-one/rust-auth/nextjs';
import { authHandlerConfig } from '../_config';

/** POST `/api/auth/client-refresh` — one 401 → refresh → replay. */
export const POST = createClientRefreshHandler(authHandlerConfig);
