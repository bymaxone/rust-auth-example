/**
 * @fileoverview Tests for the OAuth panel page.
 *
 * Covers: the enabled Continue-with-Google button + initiate URL, the disabled
 * explainer, the callback decision trace, and the localized callback error.
 *
 * @module app/(dashboard)/dashboard/oauth/page.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const query = vi.hoisted<{ values: Record<string, string | null> }>(() => ({ values: {} }));
vi.mock('nuqs', () => ({
  useQueryState: (key: string, opts?: { defaultValue?: string }) => [
    query.values[key] ?? opts?.defaultValue ?? null,
    vi.fn(),
  ],
}));

import OAuthPanelPage from './page';

const ORIGINAL = {
  enabled: process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED,
  api: process.env.NEXT_PUBLIC_API_URL,
};

beforeEach(() => {
  query.values = {};
  process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8080';
});

afterEach(() => {
  process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED = ORIGINAL.enabled;
  process.env.NEXT_PUBLIC_API_URL = ORIGINAL.api;
});

describe('OAuthPanelPage', () => {
  it('shows Continue with Google navigating to the initiate route when enabled', () => {
    // The button links a full navigation to the API's initiate route.
    process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED = 'true';
    render(<OAuthPanelPage />);
    const link = screen.getByRole('link', { name: /Continue with Google/i });
    expect(link).toHaveAttribute('href', 'http://localhost:8080/auth/oauth/google?tenantId=acme');
  });

  it('shows the not-configured explainer when disabled', () => {
    // A disabled environment must explain OAuth is unavailable.
    process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED = 'false';
    render(<OAuthPanelPage />);
    expect(screen.getByText('Google OAuth not configured')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Continue with Google/i })).not.toBeInTheDocument();
  });

  it('renders the decision trace after a successful callback', () => {
    // The callback decision + branch are surfaced from the URL.
    process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED = 'true';
    query.values = { decision: 'linked', branch: 'mfa_challenge' };
    render(<OAuthPanelPage />);
    expect(screen.getByText('Linked to an existing user')).toBeInTheDocument();
    expect(screen.getByText('MFA challenge')).toBeInTheDocument();
  });

  it('renders the localized error on a callback failure', () => {
    // A callback error must localize the wire code, not show it raw.
    process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED = 'true';
    query.values = { error: 'auth.oauth_failed' };
    render(<OAuthPanelPage />);
    expect(
      screen.getByText('Sign-in with the provider failed. Please try again.'),
    ).toBeInTheDocument();
  });
});
