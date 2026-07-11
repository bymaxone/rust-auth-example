/**
 * @fileoverview The console shell: fixed topbar + sidebar around the page area.
 *
 * The sibling-standard layout — a 64px topbar and a 250px sidebar (a fixed
 * overlay below `lg`, a sticky column at `lg+`) — wrapping the routed content.
 * Owns the mobile sidebar open/close state: the topbar hamburger opens it, a
 * nav click or the backdrop dismisses it. The main column is centered and capped
 * at `max-w-5xl`, matching the shared design system.
 *
 * @module components/shell/AppShell
 */

'use client';

import { useState, type ReactNode } from 'react';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';

/** The 64px-topbar / 250px-sidebar shell wrapping the page content. */
export function AppShell({ children }: { readonly children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <Topbar onMenuOpen={() => setSidebarOpen(true)} />

      <div className="flex pt-16">
        <Sidebar isOpen={sidebarOpen} onNavClick={() => setSidebarOpen(false)} />

        {/* Mobile sidebar backdrop — a semantic button so keyboard and screen-reader
            users have an accessible way to dismiss the overlay. */}
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close navigation menu"
            className="z-30 fixed inset-0 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="min-w-0 flex-1 px-6 py-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </>
  );
}
