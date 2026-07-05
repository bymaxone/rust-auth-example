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

  it('applies active-glow tokens to the current link and muted tokens to the rest', () => {
    // Pins the exact class strings on both branches: the active link carries the
    // primary glow, inactive links stay muted, and every link keeps the shared
    // layout tokens. Dropping any of the three class literals diverges the output.
    usePathname.mockReturnValue('/dashboard/audit');
    render(<Sidebar />);

    const active = screen.getByRole('link', { name: /Audit/ });
    const inactive = screen.getByRole('link', { name: /Overview/ });

    // Shared base tokens (present regardless of active state).
    expect(active).toHaveClass('rounded-md');
    expect(active).toHaveClass('transition-colors');
    expect(inactive).toHaveClass('rounded-md');
    expect(inactive).toHaveClass('transition-colors');

    // Active branch tokens.
    expect(active).toHaveClass('bg-primary/10');
    expect(active).toHaveClass('text-primary');
    expect(active).not.toHaveClass('text-muted-foreground');

    // Inactive branch tokens.
    expect(inactive).toHaveClass('text-muted-foreground');
    expect(inactive).not.toHaveClass('bg-primary/10');
  });
});
