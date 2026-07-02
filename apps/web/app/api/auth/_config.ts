/**
 * @fileoverview Shared configuration for the same-origin auth route handlers.
 *
 * The refresh + logout handlers all proxy to the same rust-auth backend under
 * the same mount prefix, so they share one `AuthHandlerConfig`. The backend
 * origin is read once and validated — a missing value fails fast at load. This
 * module is `server-only`; only the `route.ts` handlers import it.
 *
 * @module app/api/auth/_config
 */

import 'server-only';
import type { AuthHandlerConfig } from '@bymax-one/rust-auth/nextjs';

const backendUrl = process.env.INTERNAL_API_URL;
if (backendUrl === undefined || backendUrl === '') {
  throw new Error('INTERNAL_API_URL is required for the auth route handlers');
}

/** Shared config for the `/nextjs` refresh + logout handlers. */
export const authHandlerConfig: AuthHandlerConfig = {
  backendUrl,
  routePrefix: 'auth',
  loginPath: '/auth/login',
};
