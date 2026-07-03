/**
 * @fileoverview Tests for the auth-health aggregate client.
 *
 * Covers: the happy path (typed body returned) and that failures propagate as
 * `AuthClientError` (no hand-rolled fetch — it delegates to the shared helper).
 *
 * @module lib/audit-aggregate.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthClientError } from '@bymax-one/rust-auth/shared';

const mockApiJson = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ apiJson: mockApiJson }));

import { fetchAuditAggregate, type AuditAggregate } from './audit-aggregate';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchAuditAggregate', () => {
  it('requests /audit/aggregate through the shared helper and returns the typed body', async () => {
    // The Overview data must come from the example-owned aggregate endpoint.
    const aggregate: AuditAggregate = {
      loginSuccessRate: 0.98,
      verifySuccessRate: 0.91,
      activeSessions: 12,
      mfaEnrolledShare: 0.4,
      emailProvider: 'mailpit',
      oauthGoogleEnabled: true,
    };
    mockApiJson.mockResolvedValueOnce(aggregate);
    await expect(fetchAuditAggregate()).resolves.toEqual(aggregate);
    expect(mockApiJson).toHaveBeenCalledWith('/audit/aggregate');
  });

  it('propagates an AuthClientError from a failed request', async () => {
    // A non-2xx aggregate response must reach the caller as a typed error.
    mockApiJson.mockRejectedValueOnce(new AuthClientError('nope', 500));
    await expect(fetchAuditAggregate()).rejects.toBeInstanceOf(AuthClientError);
  });
});
