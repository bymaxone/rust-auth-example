/**
 * @fileoverview Tests for the /platform root redirect page.
 *
 * The page is a pure server component; the only observable behaviour is that
 * `redirect('/platform/security')` is called. The mock does not throw so the
 * function completes normally — the `never` return type is a static annotation
 * for the real `redirect`; at runtime the mock resolves without throwing.
 *
 * @module app/platform/page.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedirect = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect: mockRedirect }));

import PlatformRootPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PlatformRootPage', () => {
  it('redirects to /platform/security', () => {
    // The page has no content — its only job is forwarding to the default landing.
    PlatformRootPage();
    expect(mockRedirect).toHaveBeenCalledOnce();
    expect(mockRedirect).toHaveBeenCalledWith('/platform/security');
  });
});
