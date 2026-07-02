/**
 * @fileoverview Topbar live toggle, persisted in the URL via `nuqs`.
 *
 * Pauses or resumes the live audit tail. The paused/live state lives in the
 * `live` query param so a view stays shareable. Composes the design-system
 * `Button` verbatim.
 *
 * @module components/controls/LiveToggle
 */

'use client';

import { parseAsBoolean, useQueryState } from 'nuqs';
import { Pause, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** URL-persisted toggle that pauses/resumes the live audit tail. */
export function LiveToggle() {
  const [live, setLive] = useQueryState('live', parseAsBoolean.withDefault(true));

  return (
    <Button
      variant={live ? 'secondary' : 'outline'}
      size="sm"
      className="gap-2"
      aria-pressed={live}
      onClick={() => {
        void setLive(!live);
      }}
    >
      {live ? <Radio className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      {live ? 'Live' : 'Paused'}
    </Button>
  );
}
