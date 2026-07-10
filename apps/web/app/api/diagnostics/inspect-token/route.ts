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
  let token: unknown;
  try {
    const body = (await request.json()) as { token?: unknown };
    token = body.token;
  } catch {
    return Response.json({ error: 'invalid json body' }, { status: 400 });
  }
  if (typeof token !== 'string' || token === '') {
    return Response.json({ error: 'a token string is required' }, { status: 400 });
  }
  let decoded: unknown;
  try {
    // `decodeJwtToken` is synchronous (header/payload parse only) — no await.
    decoded = decodeJwtToken(token);
  } catch {
    // A structurally invalid token decodes to nothing and verifies as rejected.
    return Response.json({ decoded: null, verified: false });
  }
  const secret = process.env.AUTH_JWT_SECRET_FOR_PROXY ?? null;
  const verified = await verifyJwtToken(token, secret)
    .then((result) => result.isValid)
    .catch(() => false);
  return Response.json({ decoded, verified });
}
