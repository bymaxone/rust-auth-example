/**
 * @fileoverview The console shell: fixed topbar + sidebar around the page area.
 *
 * The sibling-standard layout — a 64px topbar and a 250px sidebar (collapsible
 * below `lg`) — wrapping the routed content.
 *
 * @module components/shell/AppShell
 */

import type { ReactNode } from 'react';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';

/** The 64px-topbar / 250px-sidebar shell wrapping the page content. */
export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Topbar />
      <div className="flex pt-16">
        <Sidebar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
