/**
 * @fileoverview Tests for exhaustive bilingual auth-error localization.
 *
 * @module lib/error-messages.test
 */

import { describe, it, expect } from 'vitest';
import { AUTH_ERROR_CODES } from '@bymax-one/rust-auth/shared';
import {
  AUTH_ERROR_MESSAGES,
  ALL_CODES_LOCALIZED,
  LOCALIZED_AUTH_CODES,
  localizeAuthError,
} from './error-messages';

const SEVERITIES = new Set(['error', 'warning', 'info']);

describe('AUTH_ERROR_MESSAGES', () => {
  it('localizes every AUTH_ERROR_CODES member in both locales with a valid severity', () => {
    // Verifies the map is exhaustive at runtime, matching the compile-time `satisfies`.
    const codes = Object.values(AUTH_ERROR_CODES);
    expect(LOCALIZED_AUTH_CODES).toHaveLength(codes.length);
    for (const code of codes) {
      const entry = (
        AUTH_ERROR_MESSAGES as Record<
          string,
          (typeof AUTH_ERROR_MESSAGES)[keyof typeof AUTH_ERROR_MESSAGES]
        >
      )[code];
      expect(entry, code).toBeDefined();
      expect(entry?.en.length ?? 0).toBeGreaterThan(0);
      expect(entry?.es.length ?? 0).toBeGreaterThan(0);
      expect(SEVERITIES.has(entry?.severity ?? '')).toBe(true);
    }
  });

  it('asserts exhaustiveness at compile time', () => {
    // Verifies the `never` guard resolves to a literal true.
    expect(ALL_CODES_LOCALIZED).toBe(true);
  });
});

describe('localizeAuthError', () => {
  it('resolves a known code in English by default', () => {
    // Verifies the default-locale path returns the English copy + severity.
    const resolved = localizeAuthError('auth.invalid_credentials');
    expect(resolved.message).toBe('Incorrect email or password.');
    expect(resolved.severity).toBe('error');
  });

  it('resolves a known code in Spanish', () => {
    // Verifies the explicit-locale path returns the Spanish copy.
    const resolved = localizeAuthError('auth.mfa_required', 'es');
    expect(resolved.message).toBe('Introduce el código de tu autenticador para continuar.');
    expect(resolved.severity).toBe('info');
  });

  it('falls back to a generic message for an unknown code', () => {
    // Verifies the fallback branch for a code absent from the map.
    const resolved = localizeAuthError('auth.not_a_real_code', 'es');
    expect(resolved.message).toBe('Algo salió mal. Inténtalo de nuevo.');
    expect(resolved.severity).toBe('error');
  });
});
