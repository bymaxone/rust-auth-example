/**
 * @fileoverview `/dashboard` — redirects to the Overview root.
 *
 * The public auth flows route to `/dashboard` after a successful sign-in, while
 * the auth-health Overview lives at the console root (`/`). This thin route keeps
 * both destinations coherent by forwarding `/dashboard` to `/`.
 *
 * @module app/(dashboard)/dashboard/page
 */

import { redirect } from 'next/navigation';

/** Forward `/dashboard` to the Overview root. */
export default function DashboardIndexPage(): never {
  redirect('/');
}
