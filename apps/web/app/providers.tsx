/**
 * @fileoverview App-wide client providers: the session spine, URL state, the
 * server-state cache, and toasts.
 *
 * This is the only `'use client'` boundary in the root tree. It mounts the
 * `/react` `AuthProvider` (driven by the typed `authClient`, revalidating every
 * five minutes) so `useSession` / `useAuthStatus` hydrate; the `nuqs` adapter so
 * view-state persists in the URL; the TanStack query cache; and the design-system
 * toaster, which renders above the topbar. The `/nextjs` subpath is never
 * imported here — it is server/edge-only.
 *
 * @module app/providers
 */

'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { AuthProvider } from '@bymax-one/rust-auth/react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { Toaster } from '@/components/ui/sonner';

/** Session + URL-state + server-state + toast providers for the whole console. */
export function Providers({ children }: { readonly children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <NuqsAdapter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider client={authClient} revalidateInterval={300_000}>
          {children}
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </NuqsAdapter>
  );
}
