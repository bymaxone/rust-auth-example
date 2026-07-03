/**
 * @fileoverview Server-only token inspector.
 *
 * The `/nextjs` subpath is server/edge-only (`import "server-only"`), so the
 * client can never decode/verify a JWT directly. This route handler imports
 * `decodeJwtToken` / `verifyJwtToken` from it, decodes the pasted token's
 * header + claims, and reports whether it verifies against the configured secret
 * — demonstrating that a forged `alg:none` token is rejected. The pasted token is
 * never logged. This is a development-only diagnostic: in a production build it
 * responds `404`, so it never becomes a signature-verification oracle.
 *
 * @module app/api/diagnostics/inspect-token/route
 */

import { decodeJwtToken, verifyJwtToken } from '@bymax-one/rust-auth/nextjs';

/**
 * Decode + verify a pasted JWT.
 *
 * @param request - The POST request carrying `{ token }`.
 * @returns `{ decoded, verified }`, `400` when no token is supplied, or `404`
 *   outside development.
 */
export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'not available' }, { status: 404 });
  }
  const body = (await request.json()) as { token?: unknown };
  const token = body.token;
  if (typeof token !== 'string' || token === '') {
    return Response.json({ error: 'a token string is required' }, { status: 400 });
  }
  const decoded = await decodeJwtToken(token);
  const secret = process.env.AUTH_JWT_SECRET_FOR_PROXY ?? null;
  const verified = await verifyJwtToken(token, secret)
    .then((result) => result.isValid)
    .catch(() => false);
  return Response.json({ decoded, verified });
}
