/**
 * @fileoverview Tests for the OAuth decision trace.
 *
 * Covers: both decisions render their label, and every branch renders its label.
 *
 * @module components/oauth/DecisionTrace.test
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DecisionTrace } from './DecisionTrace';
import type { OAuthBranch } from '@/lib/oauth';

describe('DecisionTrace', () => {
  it('renders the "created" decision', () => {
    // A new-user decision must be labelled clearly.
    render(<DecisionTrace trace={{ decision: 'created', branch: 'authenticated' }} />);
    expect(screen.getByText('Created a new user')).toBeInTheDocument();
    expect(screen.getByText('Authenticated session')).toBeInTheDocument();
  });

  it('renders the "linked" decision', () => {
    // A link-to-existing decision must be labelled clearly.
    render(<DecisionTrace trace={{ decision: 'linked', branch: 'redirect' }} />);
    expect(screen.getByText('Linked to an existing user')).toBeInTheDocument();
    expect(screen.getByText('Redirect')).toBeInTheDocument();
  });

  it('renders each branch label', () => {
    // Every resolved branch must map to a human label.
    const cases: ReadonlyArray<[OAuthBranch, string]> = [
      ['authenticated', 'Authenticated session'],
      ['redirect', 'Redirect'],
      ['mfa_challenge', 'MFA challenge'],
    ];
    for (const [branch, label] of cases) {
      const { unmount } = render(<DecisionTrace trace={{ decision: 'created', branch }} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });
});
