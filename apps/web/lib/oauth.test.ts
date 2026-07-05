/**
 * @fileoverview Tests for the Google OAuth helpers.
 *
 * Covers: the enabled gate, the initiate URL (with + without an origin), and the
 * decision-trace validation of good and bad callback values.
 *
 * @module lib/oauth.test
 */

import { describe, it, expect, afterEach } from 'vitest';
import { isGoogleOAuthEnabled, googleInitiateUrl, parseCallbackTrace } from './oauth';

const ORIGINAL = {
  enabled: process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED,
  api: process.env.NEXT_PUBLIC_API_URL,
};

afterEach(() => {
  process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED = ORIGINAL.enabled;
  process.env.NEXT_PUBLIC_API_URL = ORIGINAL.api;
});

describe('isGoogleOAuthEnabled', () => {
  it('is true only when the flag is exactly "true"', () => {
    // The gate must be strict so a stray value never enables OAuth.
    process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED = 'true';
    expect(isGoogleOAuthEnabled()).toBe(true);
    process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED = 'yes';
    expect(isGoogleOAuthEnabled()).toBe(false);
  });
});

describe('googleInitiateUrl', () => {
  it('builds the initiate URL against the API origin with an encoded tenant', () => {
    // The button navigates to the 302 initiate route on the API.
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8080';
    expect(googleInitiateUrl('ac me')).toBe(
      'http://localhost:8080/auth/oauth/google?tenantId=ac%20me',
    );
  });

  it('falls back to a relative URL when the origin is unset', () => {
    // Without a configured origin the URL is relative to the host.
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(googleInitiateUrl('acme')).toBe('/auth/oauth/google?tenantId=acme');
  });
});

describe('parseCallbackTrace', () => {
  it('accepts a valid decision + branch', () => {
    // A well-formed callback yields a typed trace.
    expect(parseCallbackTrace('created', 'authenticated')).toEqual({
      decision: 'created',
      branch: 'authenticated',
    });
  });

  it('rejects a missing decision or branch', () => {
    // Absent facets mean there is nothing to render.
    expect(parseCallbackTrace(null, 'authenticated')).toBeNull();
    expect(parseCallbackTrace('created', null)).toBeNull();
    expect(parseCallbackTrace(null, null)).toBeNull();
  });

  it('rejects unknown decision or branch values', () => {
    // Crafted query values must not be trusted.
    expect(parseCallbackTrace('hacked', 'authenticated')).toBeNull();
    expect(parseCallbackTrace('linked', 'sideways')).toBeNull();
  });
});
