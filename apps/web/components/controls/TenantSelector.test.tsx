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

  it('marks only the active tenant with a visible check', async () => {
    // Verifies the static check classes plus the selected/idle opacity split:
    // the default tenant (acme) is opaque, the other (globex) is transparent.
    usePathname.mockReturnValue('/dashboard');
    render(<TenantSelector />, { wrapper: withNuqsTestingAdapter() });

    const trigger = screen.getByRole('button', { name: /acme/ });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });

    const acmeItem = await screen.findByRole('menuitem', { name: /acme/ });
    const globexItem = screen.getByRole('menuitem', { name: /globex/ });

    const acmeCheck = acmeItem.querySelector('svg');
    const globexCheck = globexItem.querySelector('svg');
    expect(acmeCheck).not.toBeNull();
    expect(globexCheck).not.toBeNull();

    // Both checks share the static sizing/spacing classes.
    expect(acmeCheck).toHaveClass('mr-2', 'h-4', 'w-4');
    expect(globexCheck).toHaveClass('mr-2', 'h-4', 'w-4');

    // Only the active tenant's check is opaque; the idle one is hidden.
    expect(acmeCheck).toHaveClass('opacity-100');
    expect(acmeCheck).not.toHaveClass('opacity-0');
    expect(globexCheck).toHaveClass('opacity-0');
    expect(globexCheck).not.toHaveClass('opacity-100');
  });
});
