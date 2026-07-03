/**
 * @fileoverview Tests for the navigation sidebar's active-route highlighting.
 *
 * @module components/shell/Sidebar.test
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname }));

import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  it('renders both nav sections and marks the active route', () => {
    // Verifies the active link glows (aria-current) while others stay inactive.
    usePathname.mockReturnValue('/dashboard/audit');
    render(<Sidebar />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Audit/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Overview/ })).not.toHaveAttribute('aria-current');
  });

  it('lists every dashboard console surface', () => {
    // Every authenticated surface must be reachable from the primary nav.
    usePathname.mockReturnValue('/');
    render(<Sidebar />);

    for (const label of [
      'Overview',
      'Trigger Center',
      'Security',
      'Sessions',
      'OAuth',
      'Invitations',
      'Audit',
      'Account',
    ]) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    }
    // The Overview link points at the console root, not `/dashboard`.
    expect(screen.getByRole('link', { name: /Overview/ })).toHaveAttribute('href', '/');
  });
});
