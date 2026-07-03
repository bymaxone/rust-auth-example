/**
 * @fileoverview `/platform` root — redirects to the default landing page.
 *
 * The platform tree's default landing is `/platform/security` (the first entry
 * in the platform navigation sidebar). Bookmarked or manually-typed `/platform`
 * URLs are forwarded here so they never 404. The edge proxy gates this path the
 * same as every other protected platform page, so the redirect only fires for
 * authenticated admins.
 *
 * @module app/platform/page
 */

import { redirect } from 'next/navigation';

/** Redirect `/platform` to the default platform landing page. */
export default function PlatformRootPage(): never {
  redirect('/platform/security');
}
