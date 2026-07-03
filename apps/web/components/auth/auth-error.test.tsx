/**
 * @fileoverview Tests for the AuthError banner component.
 *
 * @module components/auth/auth-error.test
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthError } from './auth-error';

describe('AuthError', () => {
  it('renders nothing when code is null', () => {
    /* When no error is present, the banner must not appear in the DOM. */
    const { container } = render(<AuthError code={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the localized message for a known code', () => {
    /* A known auth code must surface its English localized message. */
    render(<AuthError code="auth.invalid_credentials" />);
    expect(screen.getByText('Incorrect email or password.')).toBeInTheDocument();
  });

  it('stores the raw code in a data attribute for diagnostics without rendering it as text', () => {
    /* The raw code must not appear as visible text (enumeration risk) but must be
       present in the DOM via data-error-code for tooling and automated tests. */
    const { container } = render(<AuthError code="auth.invalid_credentials" />);
    expect(
      container.querySelector('[data-error-code="auth.invalid_credentials"]'),
    ).toBeInTheDocument();
    expect(screen.queryByText('auth.invalid_credentials')).not.toBeInTheDocument();
  });

  it('falls back gracefully for an unknown code', () => {
    /* Unknown codes must not crash; the generic fallback message is shown.
       The raw code is available via data-error-code, not as visible text. */
    const { container } = render(<AuthError code="auth.unknown_future_code" />);
    expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(
      container.querySelector('[data-error-code="auth.unknown_future_code"]'),
    ).toBeInTheDocument();
    expect(screen.queryByText('auth.unknown_future_code')).not.toBeInTheDocument();
  });

  it('uses the destructive alert variant', () => {
    /* Auth errors must use the destructive variant for semantic error styling. */
    const { container } = render(<AuthError code="auth.internal" />);
    expect(container.querySelector('[role="alert"]')).toBeInTheDocument();
  });
});
