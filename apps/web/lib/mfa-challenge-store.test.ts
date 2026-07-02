/**
 * @fileoverview Tests for the in-memory MFA-temp-token holder.
 *
 * @module lib/mfa-challenge-store.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setPendingMfaChallenge, consumePendingMfaChallenge } from './mfa-challenge-store';

beforeEach(() => {
  /* Clear the module-level slot between tests by consuming any residual token. */
  consumePendingMfaChallenge();
});

describe('setPendingMfaChallenge / consumePendingMfaChallenge', () => {
  it('returns null when no token is pending', () => {
    /* The holder is empty by default; consume returns null without error. */
    expect(consumePendingMfaChallenge()).toBeNull();
  });

  it('stores a token and returns it on the first consume', () => {
    /* A token written by set must be readable via the first consume. */
    setPendingMfaChallenge('tok123');
    expect(consumePendingMfaChallenge()).toBe('tok123');
  });

  it('clears the slot after the first consume (single-use)', () => {
    /* Single-read guarantee: a second consume after set+consume returns null. */
    setPendingMfaChallenge('tok456');
    consumePendingMfaChallenge();
    expect(consumePendingMfaChallenge()).toBeNull();
  });

  it('replaces a previously stored token', () => {
    /* A second set call overwrites the first token. */
    setPendingMfaChallenge('first');
    setPendingMfaChallenge('second');
    expect(consumePendingMfaChallenge()).toBe('second');
  });
});
