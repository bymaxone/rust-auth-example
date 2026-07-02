/**
 * @fileoverview Informational chip showing the configured token-delivery mode.
 *
 * The rust-auth backend can deliver tokens as HttpOnly cookies, bearer tokens,
 * or both; this chip surfaces the configured mode read-only. Composes the
 * design-system `Badge` verbatim.
 *
 * @module components/controls/DeliveryModeChip
 */

'use client';

import { Badge } from '@/components/ui/badge';

/** How the backend delivers the session tokens. */
export type TokenDelivery = 'Cookie' | 'Bearer' | 'Both';

/** Read-only chip surfacing the configured {@link TokenDelivery} mode. */
export function DeliveryModeChip({ mode = 'Cookie' }: { readonly mode?: TokenDelivery }) {
  return (
    <Badge variant="outline" className="gap-1 font-mono" title="Configured token delivery">
      <span className="text-muted-foreground">delivery</span>
      {mode}
    </Badge>
  );
}
