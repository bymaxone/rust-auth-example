/**
 * @fileoverview Shared layout for all public auth pages.
 *
 * Centers a glass card on a dark background with the brand mark at the top.
 * All `(public)/auth/*` routes render their content inside the card body.
 * A `<Suspense>` boundary is provided around `children` so that pages using
 * `useQueryState` (nuqs) or `useSearchParams` satisfy Next.js 16's requirement.
 * No `AppShell` or sidebar here — the public surface is intentionally minimal.
 *
 * @module app/(public)/auth/layout
 */

import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

/**
 * Design-system skeleton shown while a suspended auth page resolves its
 * search params, so the card body never flashes empty. Mirrors the pulsing
 * `bg-muted` placeholder used elsewhere in the console.
 */
function AuthCardSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading">
      <div className="h-4 w-2/3 animate-pulse rounded-md bg-muted" aria-hidden="true" />
      <div className="h-10 w-full animate-pulse rounded-md bg-muted" aria-hidden="true" />
      <div className="h-10 w-full animate-pulse rounded-md bg-muted" aria-hidden="true" />
    </div>
  );
}

/**
 * Full-page centered auth card for unauthenticated visitors.
 *
 * @param children - The page-level form or content.
 */
export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand mark */}
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="font-mono text-xl font-bold text-[#ff6224] transition-opacity hover:opacity-80"
          >
            rust-auth
          </Link>
        </div>

        <Card>
          <CardHeader accent>
            <CardTitle className="text-center text-2xl">Auth Console</CardTitle>
            <CardDescription className="text-center">
              Secure, multi-tenant authentication
            </CardDescription>
          </CardHeader>
          {/* Suspense is required because pages use useSearchParams (via nuqs);
              the skeleton fallback avoids an empty-card flash while they resolve. */}
          <CardContent>
            <Suspense fallback={<AuthCardSkeleton />}>{children}</Suspense>
          </CardContent>
        </Card>

        {/* Footer links */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link
            href="/auth/login"
            className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Sign in
          </Link>
          {' · '}
          <Link
            href="/auth/register"
            className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Register
          </Link>
          {' · '}
          <Link
            href="/auth/forgot-password"
            className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Forgot password?
          </Link>
        </p>
      </div>
    </div>
  );
}
