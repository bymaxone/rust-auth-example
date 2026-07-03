/**
 * @fileoverview Tests for the MFA lifecycle client.
 *
 * Covers: each route/method/body is issued through the shared helper, the setup
 * result is returned typed, and regenerate unwraps the codes array.
 *
 * @module lib/mfa-api.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AUTH_ROUTES } from '@bymax-one/rust-auth/shared';

const mockApiFetch = vi.hoisted(() => vi.fn());
const mockApiJson = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ apiFetch: mockApiFetch, apiJson: mockApiJson }));

import { mfaSetup, mfaVerifyEnable, mfaDisable, mfaRegenerateRecoveryCodes } from './mfa-api';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mfaSetup', () => {
  it('POSTs to the setup route and returns the typed enrollment payload', async () => {
    // Setup mints the secret/QR/recovery codes the enrollment card renders.
    const payload = { secret: 'ABC', qrCodeUri: 'otpauth://x', recoveryCodes: ['a', 'b'] };
    mockApiJson.mockResolvedValueOnce(payload);
    await expect(mfaSetup()).resolves.toEqual(payload);
    expect(mockApiJson).toHaveBeenCalledWith(AUTH_ROUTES.MFA_SETUP, { method: 'POST' });
  });
});

describe('mfaVerifyEnable', () => {
  it('POSTs the code to the verify-enable route', async () => {
    // Verify-enable activates MFA with the first valid TOTP.
    mockApiFetch.mockResolvedValueOnce({});
    await mfaVerifyEnable('123456');
    expect(mockApiFetch).toHaveBeenCalledWith(AUTH_ROUTES.MFA_VERIFY_ENABLE, {
      method: 'POST',
      body: JSON.stringify({ code: '123456' }),
    });
  });
});

describe('mfaDisable', () => {
  it('POSTs the code to the disable route', async () => {
    // Disable is gated by a fresh TOTP code.
    mockApiFetch.mockResolvedValueOnce({});
    await mfaDisable('654321');
    expect(mockApiFetch).toHaveBeenCalledWith(AUTH_ROUTES.MFA_DISABLE, {
      method: 'POST',
      body: JSON.stringify({ code: '654321' }),
    });
  });
});

describe('mfaRegenerateRecoveryCodes', () => {
  it('POSTs the code and unwraps the new recovery codes', async () => {
    // Regenerate returns a fresh set of one-time codes.
    mockApiJson.mockResolvedValueOnce({ recoveryCodes: ['x1', 'x2', 'x3'] });
    await expect(mfaRegenerateRecoveryCodes('111222')).resolves.toEqual(['x1', 'x2', 'x3']);
    expect(mockApiJson).toHaveBeenCalledWith(AUTH_ROUTES.MFA_RECOVERY_CODES, {
      method: 'POST',
      body: JSON.stringify({ code: '111222' }),
    });
  });
});
