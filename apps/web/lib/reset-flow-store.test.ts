/**
 * @fileoverview Tests for the in-memory reset-flow verified-token holder.
 *
 * @module lib/reset-flow-store.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setResetVerifiedToken, consumeResetVerifiedToken } from './reset-flow-store';

beforeEach(() => {
  /* Clear the module-level slot between tests. */
  consumeResetVerifiedToken();
});

describe('setResetVerifiedToken / consumeResetVerifiedToken', () => {
  it('returns null when no token is pending', () => {
    /* The holder is empty by default; consume returns null without error. */
    expect(consumeResetVerifiedToken()).toBeNull();
  });

  it('stores a token and returns it on the first consume', () => {
    /* A token written by set must be readable via the first consume. */
    setResetVerifiedToken('vt_abc');
    expect(consumeResetVerifiedToken()).toBe('vt_abc');
  });

  it('clears the slot after the first consume (single-use)', () => {
    /* Single-read guarantee: a second consume after set+consume returns null. */
    setResetVerifiedToken('vt_def');
    consumeResetVerifiedToken();
    expect(consumeResetVerifiedToken()).toBeNull();
  });

  it('replaces a previously stored token', () => {
    /* A second set call overwrites the first token. */
    setResetVerifiedToken('vt_first');
    setResetVerifiedToken('vt_second');
    expect(consumeResetVerifiedToken()).toBe('vt_second');
  });
});
