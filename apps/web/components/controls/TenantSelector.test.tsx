/**
 * @fileoverview Tests for the URL-persisted tenant selector.
 *
 * @module components/controls/TenantSelector.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname }));

import { TenantSelector } from './TenantSelector';

beforeEach(() => {
  usePathname.mockReset();
});

describe('TenantSelector', () => {
  it('renders nothing inside the platform section', () => {
    // Verifies the selector is hidden in the tenant-less platform area.
    usePathname.mockReturnValue('/platform/users');
    const { container } = render(<TenantSelector />, { wrapper: withNuqsTestingAdapter() });

    expect(container).toBeEmptyDOMElement();
  });

  it('defaults to acme and persists the picked tenant to the URL', async () => {
    // Verifies the default value + the nuqs round-trip on selection.
    usePathname.mockReturnValue('/dashboard');
    const onUrlUpdate = vi.fn();
    render(<TenantSelector />, { wrapper: withNuqsTestingAdapter({ onUrlUpdate }) });

    const trigger = screen.getByRole('button', { name: /acme/ });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });

    const globex = await screen.findByText('globex');
    fireEvent.click(globex);

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const update = onUrlUpdate.mock.calls.at(-1)?.[0] as { queryString: string };
    expect(update.queryString).toContain('tenant=globex');
  });
});
