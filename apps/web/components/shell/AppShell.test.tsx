/**
 * @fileoverview Tests for the app shell composition and the mobile sidebar toggle.
 *
 * The topbar and sidebar are stubbed (each is covered by its own suite) but the
 * stubs expose the `onMenuOpen` / `onNavClick` callbacks so this suite can drive
 * the shell's open/close state and the mobile backdrop.
 *
 * @module components/shell/AppShell.test
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('./Topbar', () => ({
  Topbar: ({ onMenuOpen }: { onMenuOpen: () => void }) => (
    <button onClick={onMenuOpen}>open-menu</button>
  ),
}));
vi.mock('./Sidebar', () => ({
  Sidebar: ({ isOpen, onNavClick }: { isOpen: boolean; onNavClick?: () => void }) => (
    <button onClick={onNavClick}>sidebar-{isOpen ? 'open' : 'closed'}</button>
  ),
}));

import { AppShell } from './AppShell';

/** The mobile backdrop is a semantic close button; find it by its accessible name. */
function backdrop(): HTMLElement | null {
  return screen.queryByRole('button', { name: 'Close navigation menu' });
}

describe('AppShell', () => {
  it('frames the topbar, sidebar, and page content', () => {
    // Verifies the shell renders both chrome regions around its children.
    render(
      <AppShell>
        <p>page body</p>
      </AppShell>,
    );

    expect(screen.getByText('open-menu')).toBeInTheDocument();
    expect(screen.getByText('sidebar-closed')).toBeInTheDocument();
    expect(screen.getByText('page body')).toBeInTheDocument();
  });

  it('opens the sidebar overlay from the topbar and shows the backdrop', () => {
    // The hamburger sets the open state, which reveals the sidebar overlay + backdrop.
    render(
      <AppShell>
        <p>page body</p>
      </AppShell>,
    );

    expect(backdrop()).toBeNull();

    fireEvent.click(screen.getByText('open-menu'));
    expect(screen.getByText('sidebar-open')).toBeInTheDocument();
    expect(backdrop()).not.toBeNull();
  });

  it('closes the overlay when the backdrop is clicked', () => {
    // Clicking the dimmed backdrop dismisses the sidebar overlay.
    render(
      <AppShell>
        <p>page body</p>
      </AppShell>,
    );

    fireEvent.click(screen.getByText('open-menu'));
    expect(backdrop()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close navigation menu' }));

    expect(screen.getByText('sidebar-closed')).toBeInTheDocument();
    expect(backdrop()).toBeNull();
  });

  it('closes the overlay when a sidebar nav link is clicked', () => {
    // A nav click (via onNavClick) dismisses the overlay so the destination page shows.
    render(
      <AppShell>
        <p>page body</p>
      </AppShell>,
    );

    fireEvent.click(screen.getByText('open-menu'));
    expect(backdrop()).not.toBeNull();

    fireEvent.click(screen.getByText('sidebar-open'));
    expect(screen.getByText('sidebar-closed')).toBeInTheDocument();
    expect(backdrop()).toBeNull();
  });
});
