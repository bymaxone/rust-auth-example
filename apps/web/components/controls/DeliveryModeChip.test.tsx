/**
 * @fileoverview Tests for the informational delivery-mode chip.
 *
 * @module components/controls/DeliveryModeChip.test
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeliveryModeChip } from './DeliveryModeChip';

describe('DeliveryModeChip', () => {
  it('defaults to the Cookie delivery mode', () => {
    // Verifies the default prop renders the cookie-mode chip.
    render(<DeliveryModeChip />);

    expect(screen.getByText('Cookie')).toBeInTheDocument();
    expect(screen.getByText('delivery')).toBeInTheDocument();
  });

  it('renders the configured delivery mode', () => {
    // Verifies an explicit mode overrides the default.
    render(<DeliveryModeChip mode="Bearer" />);

    expect(screen.getByText('Bearer')).toBeInTheDocument();
  });
});
