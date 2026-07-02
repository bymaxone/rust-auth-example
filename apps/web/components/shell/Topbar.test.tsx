/**
 * @fileoverview Tests for the topbar composition.
 *
 * The global controls are stubbed here (each is covered by its own suite) so
 * this suite exercises only the topbar's own brand + control layout.
 *
 * @module components/shell/Topbar.test
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/controls/TenantSelector', () => ({
  TenantSelector: () => <div>tenant-selector</div>,
}));
vi.mock('@/components/controls/DeliveryModeChip', () => ({
  DeliveryModeChip: () => <div>delivery-chip</div>,
}));
vi.mock('@/components/controls/LiveToggle', () => ({ LiveToggle: () => <div>live-toggle</div> }));
vi.mock('@/components/controls/SessionBadge', () => ({
  SessionBadge: () => <div>session-badge</div>,
}));

import { Topbar } from './Topbar';

describe('Topbar', () => {
  it('renders the brand, repo link, and every global control', () => {
    // Verifies the topbar composes the brand plus all four controls.
    render(<Topbar />);

    expect(screen.getByRole('link', { name: 'rust-auth-example' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /repository on GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/bymaxone/rust-auth-example',
    );
    expect(screen.getByText('tenant-selector')).toBeInTheDocument();
    expect(screen.getByText('delivery-chip')).toBeInTheDocument();
    expect(screen.getByText('live-toggle')).toBeInTheDocument();
    expect(screen.getByText('session-badge')).toBeInTheDocument();
  });
});
