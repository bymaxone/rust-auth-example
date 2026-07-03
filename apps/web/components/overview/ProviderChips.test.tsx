/**
 * @fileoverview Tests for the Overview ProviderChips row.
 *
 * Covers: the email-provider chip reflects the configured provider, and the OAuth
 * chip shows on/off with a redundant label (never colour-only).
 *
 * @module components/overview/ProviderChips.test
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProviderChips } from './ProviderChips';

describe('ProviderChips', () => {
  it('shows the configured email provider', () => {
    // The email chip must name the wired provider.
    render(<ProviderChips emailProvider="resend" oauthGoogleEnabled={false} />);
    expect(screen.getByText('resend')).toBeInTheDocument();
  });

  it('shows Google OAuth as on with a text label when enabled', () => {
    // OAuth status must be conveyed by text, not colour alone.
    render(<ProviderChips emailProvider="mailpit" oauthGoogleEnabled={true} />);
    expect(screen.getByText('Google OAuth')).toBeInTheDocument();
    expect(screen.getByText('on')).toBeInTheDocument();
  });

  it('shows Google OAuth as off when disabled', () => {
    // The disabled state must render the explicit "off" label.
    render(<ProviderChips emailProvider="mailpit" oauthGoogleEnabled={false} />);
    expect(screen.getByText('off')).toBeInTheDocument();
  });
});
