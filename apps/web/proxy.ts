/**
 * @fileoverview The edge gate — Next 16's proxy entrypoint.
 *
 * Next 16 discovers this root `proxy.ts` (the successor to `middleware.ts`) and
 * wires the exported `proxy` function + `config.matcher` into the edge runtime.
 * `/api/auth/*` is handed to the `createAuthProxy` instance (an edge auth-gating
 * middleware that inspects the session cookie and grants or redirects — not a
 * reverse proxy). `/dashboard/*` and the protected `/platform/*` pages are gated
 * by the authoritative WASM `verifyJwtToken`: a missing or unverifiable cookie
 * redirects to the matching login, with no backend round-trip. The verifier
 * never throws (any failure resolves `{ isValid: false }`), so an error can only
 * ever deny access — the gate is fail-closed. The HS256 secret is validated once
 * (the module refuses to load without it, so the gate can never silently fall
 * back to a non-authoritative decode-only check), is never logged, and is never
 * placed in a URL. This subpath is `server-only`.
 *
 * @module proxy
 */

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAuthProxy, verifyJwtToken } from '@bymax-one/rust-auth/nextjs';
import { AUTH_ACCESS_COOKIE_NAME } from '@bymax-one/rust-auth/shared';

const secret = process.env.AUTH_JWT_SECRET_FOR_PROXY;
if (secret === undefined || secret === '') {
  throw new Error('AUTH_JWT_SECRET_FOR_PROXY is required for the edge auth gate');
}
const accessTokenSecret: string = secret;

/** Edge auth-gating middleware for `/api/auth/*`: inspects the cookie and grants or redirects. */
const authProxy = createAuthProxy({
  loginPath: '/auth/login',
  accessTokenSecret,
  routePrefix: 'auth',
});

/** Pages that require a verified session. Only `/platform/login` (and its subpaths) is
 * excluded — the negative lookahead is anchored so `/platform/login-anything` is still
 * gated rather than mistaken for the login page. */
const PROTECTED = [/^\/dashboard(?:\/|$)/, /^\/platform\/(?!login(?:\/|$))/];

/**
 * Gate every matched request. Auth traffic is delegated to the proxy; protected
 * pages are admitted only on an authoritatively verified session cookie.
 *
 * @param request - The incoming edge request.
 * @returns A pass-through, proxy, or redirect response.
 */
export async function proxy(request: NextRequest): Promise<Response> {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/auth/')) {
    return authProxy.proxy(request);
  }

  if (!PROTECTED.some((pattern) => pattern.test(pathname))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_ACCESS_COOKIE_NAME)?.value;
  const decoded = token !== undefined ? await verifyJwtToken(token, accessTokenSecret) : null;
  if (decoded?.isValid === true) {
    return NextResponse.next();
  }

  const loginPath = pathname.startsWith('/platform') ? '/platform/login' : '/auth/login';
  return NextResponse.redirect(new URL(loginPath, request.url));
}

/** Only run the gate for auth traffic and the protected page trees. */
export const config = {
  matcher: ['/dashboard/:path*', '/platform/:path*', '/api/auth/:path*'],
};
