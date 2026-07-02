/**
 * @fileoverview Tests for the providers tree — the session spine hydrates.
 *
 * @module app/providers.test
 */

import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useAuthStatus } from '@bymax-one/rust-auth/react';

vi.mock('nuqs/adapters/next/app', () => ({
  NuqsAdapter: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/lib/auth-client', () => ({
  authClient: { getMe: vi.fn().mockRejectedValue(new Error('no session')) },
}));

import { Providers } from './providers';

function Probe() {
  const { isAuthenticated, isLoading } = useAuthStatus();
  const label = isLoading ? 'loading' : isAuthenticated ? 'authed' : 'anon';
  return <div data-testid="probe">{label}</div>;
}

describe('Providers', () => {
  it('mounts the session spine so useAuthStatus resolves', async () => {
    // Verifies the AuthProvider context is available and settles to a status.
    render(
      <Providers>
        <Probe />
      </Providers>,
    );

    expect(screen.getByTestId('probe')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('anon'));
  });
});
