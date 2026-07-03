/**
 * @fileoverview Layout for the authenticated tenant console.
 *
 * Wraps the Overview (`/`) and every `/dashboard/*` surface in the shared
 * `AppShell` (64px topbar + 250px sidebar). The whole shell sits inside one
 * `<Suspense>` boundary because the topbar controls themselves read URL state
 * through `nuqs` (`useQueryState` / `useSearchParams`), which would otherwise force
 * a static-prerender bailout; until those params resolve a skeleton renders in
 * place of the shell. The `/dashboard/*` tree is edge-gated by `proxy.ts`; the
 * Overview at `/` gates itself with `useSession`.
 *
 * @module app/(dashboard)/layout
 */

import { Suspense, type ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';

/** Skeleton shown while a suspended dashboard page resolves its URL state. */
function DashboardSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" aria-hidden="true" />
      <div className="h-40 w-full animate-pulse rounded-2xl bg-muted" aria-hidden="true" />
    </div>
  );
}

/**
 * The authenticated console shell wrapping the Overview and dashboard pages. The
 * Suspense boundary wraps the whole shell so the topbar's URL-state controls
 * (`nuqs` `useSearchParams`) resolve without a static-prerender bailout.
 */
export default function DashboardLayout({ children }: { readonly children: ReactNode }) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
