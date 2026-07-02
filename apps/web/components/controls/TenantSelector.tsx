/**
 * @fileoverview Topbar tenant selector, persisted in the URL via `nuqs`.
 *
 * Sets the `tenant` query param that seeds the `tenant_id` sent on
 * login/register/reset. Hidden inside the tenant-less Platform section. Composes
 * only design-system primitives.
 *
 * @module components/controls/TenantSelector
 */

'use client';

import { usePathname } from 'next/navigation';
import { useQueryState } from 'nuqs';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/** The demo tenants the console can scope requests to. */
const TENANTS = ['acme', 'globex'] as const;

/** URL-persisted tenant selector; renders nothing in the Platform section. */
export function TenantSelector() {
  const pathname = usePathname();
  const [tenant, setTenant] = useQueryState('tenant', { defaultValue: 'acme' });

  if (pathname.startsWith('/platform')) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span className="font-mono">{tenant}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Tenant</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {TENANTS.map((id) => (
          <DropdownMenuItem
            key={id}
            onSelect={() => {
              void setTenant(id);
            }}
          >
            <Check className={cn('mr-2 h-4 w-4', id === tenant ? 'opacity-100' : 'opacity-0')} />
            <span className="font-mono">{id}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
