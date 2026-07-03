/**
 * @fileoverview Defense-in-depth guard + shell for the authenticated platform console.
 *
 * This server layout is the **second** auth gate (the first is the edge proxy in
 * `proxy.ts`). It non-authoritatively decodes the access cookie and checks the
 * `type === "platform"` discriminator. An absent or wrong-domain token triggers a
 * redirect to `/platform/login?reason=wrong-domain` before any protected child
 * renders. The token is decoded without secret verification — the edge proxy
 * already performed the authoritative WASM check — so this layer guards against
 * edge misconfigurations and SSR data leaks, not against forged tokens.
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
 * `type === "platform"` discriminator is checked. Any mismatch redirects to
 * `/platform/login?reason=wrong-domain` before a child component can render.
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

  // Non-authoritative decode — signature is NOT re-verified here; the edge proxy
  // is the authoritative gate. decodeJwtToken reads the payload without checking
  // the signature, which is the correct choice for a defense-in-depth server check.
  const decoded = token !== undefined ? await decodeJwtToken(token) : null;
  if (decoded?.isValid !== true || decoded.payload?.type !== 'platform') {
    redirect('/platform/login?reason=wrong-domain');
  }

  return <PlatformShell>{children}</PlatformShell>;
}
