/**
 * @fileoverview Defense-in-depth guard + shell for the authenticated platform console.
 *
 * This server layout is the **second** auth gate (the first is the edge proxy in
 * `proxy.ts`). It non-authoritatively decodes the access cookie and checks the
 * `type === "platform"` discriminator. The redirect reason distinguishes two cases:
 *
 * - `reason=session-expired` — the cookie is absent, structurally invalid, or
 *   carries an expired/malformed token. The admin simply needs to sign in again.
 * - `reason=wrong-domain` — a structurally valid token is present but its `type`
 *   field is not `"platform"` (e.g. a dashboard token was sent to the platform
 *   tree). This is an explicit domain mismatch, not a stale session.
 *
 * The token is decoded without secret verification — the edge proxy already
 * performed the authoritative WASM check — so this layer guards against edge
 * misconfigurations and SSR data leaks, not against forged tokens.
 *
 * The shell renders a distinct platform navigation (Security · Sessions · Users)
 * with a `data-domain="platform"` marker; there is no tenant selector.
 *
 * @module app/platform/(protected)/layout
 */

import 'server-only';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { decodeJwtToken } from '@bymax-one/rust-auth/nextjs';
import { AUTH_ACCESS_COOKIE_NAME } from '@bymax-one/rust-auth/shared';
import { PlatformShell } from '@/components/platform/PlatformShell';

/**
 * Verify the platform session server-side and render the platform shell.
 *
 * The access cookie is decoded (no secret — non-authoritative), and the
 * `type === "platform"` discriminator is checked. Missing or invalid tokens
 * redirect with `reason=session-expired`; a valid but wrong-domain token
 * redirects with `reason=wrong-domain`.
 *
 * @param children - The routed platform page content.
 */
export default async function PlatformProtectedLayout({
  children,
}: {
  readonly children: ReactNode;
}): Promise<React.ReactElement> {
  const jar = await cookies();
  const token = jar.get(AUTH_ACCESS_COOKIE_NAME)?.value;

  if (token === undefined) {
    redirect('/platform/login?reason=session-expired');
  }

  // Non-authoritative decode — signature is NOT re-verified here; the edge proxy
  // is the authoritative gate. decodeJwtToken reads the payload without checking
  // the signature and is async in the Next.js package build.
  //
  // decodeJwtToken may reject (throw) when the token is structurally invalid
  // (e.g. not a valid JWT string). Treat a thrown rejection the same as an
  // isValid:false result — the admin's session is gone, redirect to sign-in.
  let decoded: Awaited<ReturnType<typeof decodeJwtToken>>;
  try {
    // Wrap in Promise.resolve so this works whether the library types decodeJwtToken
    // as synchronous or Promise-returning; awaiting a resolved value is a no-op.
    decoded = await Promise.resolve(decodeJwtToken(token));
  } catch {
    redirect('/platform/login?reason=session-expired');
  }

  if (decoded.isValid !== true) {
    // Malformed or expired token — the admin's session is gone, but there is no
    // evidence of a cross-domain token, so use the neutral session-expired reason.
    redirect('/platform/login?reason=session-expired');
  }

  if (decoded.payload?.type !== 'platform') {
    // A structurally valid token is present but it belongs to a different domain
    // (e.g. a dashboard token). This is an explicit domain mismatch.
    redirect('/platform/login?reason=wrong-domain');
  }

  return <PlatformShell>{children}</PlatformShell>;
}
