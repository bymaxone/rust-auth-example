/**
 * @fileoverview Tests for the `cn` class-name merge helper.
 *
 * @module lib/utils.test
 */

import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins truthy class names and drops falsy ones', () => {
    // Verifies clsx-style conditional composition passes through.
    expect(cn('a', false, undefined, 'b')).toBe('a b');
  });

  it('resolves conflicting Tailwind utilities so the last one wins', () => {
    // Verifies tailwind-merge deduplication of same-property utilities.
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});
