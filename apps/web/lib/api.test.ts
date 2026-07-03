/**
 * @fileoverview Tests for the shared API response helpers.
 *
 * Covers: 2xx pass-through, JSON parsing, and the throw-on-failure contract with
 * the `{ error: { code, message } }` envelope, a missing/malformed envelope, an
 * unparseable body, and the empty-statusText fallback message.
 *
 * @module lib/api.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthClientError } from '@bymax-one/rust-auth/shared';

const mockAuthFetch = vi.hoisted(() => vi.fn());
vi.mock('./auth-client', () => ({ authFetch: mockAuthFetch }));

import { apiFetch, apiJson } from './api';

/** Build a minimal Response-like stub with a controllable JSON body. */
function res(init: {
  ok: boolean;
  status?: number;
  statusText?: string;
  json?: () => Promise<unknown>;
}): Response {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 400),
    statusText: init.statusText ?? '',
    json: init.json ?? (() => Promise.resolve({})),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('apiFetch', () => {
  it('returns the response unchanged on a 2xx status', async () => {
    // A successful response must pass straight through.
    const ok = res({ ok: true, status: 200 });
    mockAuthFetch.mockResolvedValueOnce(ok);
    await expect(apiFetch('/audit/logs')).resolves.toBe(ok);
    expect(mockAuthFetch).toHaveBeenCalledWith('/audit/logs', undefined);
  });

  it('forwards the init to the shared authFetch', async () => {
    // The caller's fetch init must reach authFetch verbatim.
    mockAuthFetch.mockResolvedValueOnce(res({ ok: true }));
    const init = { method: 'POST', body: '{}' };
    await apiFetch('/auth/mfa/setup', init);
    expect(mockAuthFetch).toHaveBeenCalledWith('/auth/mfa/setup', init);
  });

  it('throws AuthClientError with the wire code on a non-2xx envelope', async () => {
    // A `{ error: { code, message } }` body must surface as a typed error.
    mockAuthFetch.mockResolvedValueOnce(
      res({
        ok: false,
        status: 429,
        json: () =>
          Promise.resolve({ error: { code: 'auth.too_many_requests', message: 'slow down' } }),
      }),
    );
    await expect(apiFetch('/auth/login')).rejects.toMatchObject({
      status: 429,
      code: 'auth.too_many_requests',
      message: 'slow down',
    });
  });

  it('throws AuthClientError without a code when the envelope is absent', async () => {
    // A body lacking the error envelope yields an error with no wire code.
    mockAuthFetch.mockResolvedValueOnce(
      res({ ok: false, status: 500, statusText: 'Server Error', json: () => Promise.resolve({}) }),
    );
    const err = await apiFetch('/audit/logs').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthClientError);
    expect((err as AuthClientError).code).toBeUndefined();
    expect((err as AuthClientError).message).toBe('Server Error');
  });

  it('ignores a malformed envelope whose code/message are not strings', async () => {
    // Non-string code/message must not be treated as a valid envelope.
    mockAuthFetch.mockResolvedValueOnce(
      res({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: { code: 1, message: null } }),
      }),
    );
    const err = (await apiFetch('/x').catch((e: unknown) => e)) as AuthClientError;
    expect(err.code).toBeUndefined();
    expect(err.message).toBe('Bad Request');
  });

  it('falls back to a generic message when the body is unparseable and statusText is empty', async () => {
    // An unparseable body with no statusText must still produce a readable message.
    mockAuthFetch.mockResolvedValueOnce(
      res({
        ok: false,
        status: 502,
        statusText: '',
        json: () => Promise.reject(new Error('not json')),
      }),
    );
    const err = (await apiFetch('/x').catch((e: unknown) => e)) as AuthClientError;
    expect(err.status).toBe(502);
    expect(err.message).toBe('Request failed');
  });
});

describe('apiJson', () => {
  it('parses and returns the JSON body typed as T on success', async () => {
    // A 2xx JSON body must be returned to the caller.
    mockAuthFetch.mockResolvedValueOnce(
      res({ ok: true, json: () => Promise.resolve({ hello: 'world' }) }),
    );
    await expect(apiJson<{ hello: string }>('/x')).resolves.toEqual({ hello: 'world' });
  });

  it('propagates the AuthClientError from a failed response', async () => {
    // apiJson must not swallow the throw-on-failure contract.
    mockAuthFetch.mockResolvedValueOnce(
      res({ ok: false, status: 401, json: () => Promise.resolve({}) }),
    );
    await expect(apiJson('/x')).rejects.toBeInstanceOf(AuthClientError);
  });
});
