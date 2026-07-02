/**
 * @fileoverview Tests for the app shell composition.
 *
 * The topbar and sidebar are stubbed (each is covered by its own suite) so this
 * suite exercises only that the shell frames its page content.
 *
 * @module components/shell/AppShell.test
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./Topbar', () => ({ Topbar: () => <div>topbar</div> }));
vi.mock('./Sidebar', () => ({ Sidebar: () => <div>sidebar</div> }));

import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('frames the topbar, sidebar, and page content', () => {
    // Verifies the shell renders both chrome regions around its children.
    render(
      <AppShell>
        <p>page body</p>
      </AppShell>,
    );

    expect(screen.getByText('topbar')).toBeInTheDocument();
    expect(screen.getByText('sidebar')).toBeInTheDocument();
    expect(screen.getByText('page body')).toBeInTheDocument();
  });
});
