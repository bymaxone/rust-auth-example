/**
 * @fileoverview Shared layout for all public auth pages.
 *
 * Provides the complete visual shell for every route under `(public)/auth/*`:
 *   - Full-screen `#0a0a0a` background with three ambient glow layers
 *     (orange top-left, blue top-right, orange bottom-center)
 *   - A centered `max-w-[420px]` glassmorphism card with a top accent
 *     gradient line
 *   - Brand header: an orange icon badge + the `rust-auth-example` wordmark
 *     rendered as an orange-to-amber gradient in monospace
 *
 * A `<Suspense>` boundary wraps `children` so pages that read search params via
 * `useQueryState` (nuqs) or `useSearchParams` satisfy Next.js 16's static-render
 * requirement. No `AppShell` or sidebar here — the public surface is minimal.
 *
 * @module app/(public)/auth/layout
 */

import { Suspense, type ReactNode } from 'react';

/**
 * Skeleton shown while a suspended auth page resolves its search params, so the
 * card body never flashes empty. Mirrors the pulsing placeholder used elsewhere.
 */
function AuthCardSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading">
      <div
        className="h-4 w-2/3 animate-pulse rounded-md bg-[rgba(255,255,255,0.08)]"
        aria-hidden="true"
      />
      <div
        className="h-10 w-full animate-pulse rounded-md bg-[rgba(255,255,255,0.08)]"
        aria-hidden="true"
      />
      <div
        className="h-10 w-full animate-pulse rounded-md bg-[rgba(255,255,255,0.08)]"
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * Full-screen dark layout that centers a glassmorphism card with the brand
 * header above the page-specific content.
 *
 * @param children - Auth page content (sub-heading + form + footer links).
 */
export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a]">
      {/* ── Ambient glow layers (purely decorative, no interaction) ───────── */}
      {/* Layer A: orange — top-left */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full bg-[#ff6224] opacity-15 blur-[120px]"
      />
      {/* Layer B: blue — top-right */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-20 h-[400px] w-[400px] rounded-full bg-[#60a5fa] opacity-10 blur-[100px]"
      />
      {/* Layer C: accent orange — bottom-center */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-1/2 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-[#f97316] opacity-[0.05] blur-[80px]"
      />

      {/* ── Centered card ────────────────────────────────────────────────── */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8">
        <div className="w-full max-w-[420px]">
          {/* Glass card */}
          <div className="relative overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.06)] backdrop-blur-lg">
            {/* Top accent gradient line */}
            <div
              aria-hidden="true"
              className="bg-linear-to-r absolute left-0 right-0 top-0 h-px from-transparent via-[rgba(255,98,36,0.4)] to-transparent"
            />

            {/* ── Brand header ── */}
            <div className="flex flex-col items-center gap-1 px-8 pb-4 pt-8">
              {/* Orange icon badge */}
              <div
                aria-hidden="true"
                className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl border border-[rgba(255,98,36,0.3)] bg-[rgba(255,98,36,0.2)]"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2L2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5"
                    stroke="#ff6224"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Brand name — orange-to-amber gradient, monospace */}
              <p className="bg-linear-to-r from-[#ff6224] to-amber-200 bg-clip-text font-mono text-xl font-bold text-transparent">
                rust-auth-example
              </p>
            </div>

            {/* ── Page content ── */}
            {/* Suspense is required because pages read search params via nuqs /
                useSearchParams; the skeleton avoids an empty-card flash. */}
            <div className="px-8 pb-8">
              <Suspense fallback={<AuthCardSkeleton />}>{children}</Suspense>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
