/**
 * @fileoverview The logout target.
 *
 * The library handler best-effort proxies a backend logout, clears the local
 * session cookies, and resolves. No auth logic is hand-rolled.
 *
 * @module app/api/auth/logout/route
 */

import { createLogoutHandler } from '@bymax-one/rust-auth/nextjs';
import { authHandlerConfig } from '../_config';

/** POST `/api/auth/logout` — proxy a backend logout, then clear the session cookies. */
export const POST = createLogoutHandler(authHandlerConfig);
