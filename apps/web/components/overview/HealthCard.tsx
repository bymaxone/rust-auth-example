/**
 * @fileoverview A single auth-health metric card for the Overview grid.
 *
 * Each card carries three redundant cues so meaning never rests on colour alone:
 * a leading icon, a text label, and the formatted value — with a tone that tints
 * the icon and value. Composes the design-system `Card` verbatim.
 *
 * @module components/overview/HealthCard
 */

import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** The semantic tone of a metric, mapped to a redundant colour cue. */
export type HealthTone = 'positive' | 'warning' | 'neutral' | 'info';

/** Props for {@link HealthCard}. */
export interface HealthCardProps {
  /** The metric label (e.g. "Login success"). */
  readonly label: string;
  /** The pre-formatted value (e.g. "98%", "12"). */
  readonly value: string;
  /** The leading icon conveying the metric independently of colour. */
  readonly icon: LucideIcon;
  /** The semantic tone; tints the icon + value. */
  readonly tone: HealthTone;
  /** Optional supporting caption. */
  readonly caption?: string;
}

/** Colour cue per tone — always paired with an icon + label, never colour-only. */
const TONE_CLASS: Record<HealthTone, string> = {
  positive: 'text-emerald-400',
  warning: 'text-amber-400',
  neutral: 'text-foreground',
  info: 'text-sky-400',
};

/**
 * Render one metric as a glass card with icon + label + value.
 *
 * @param props - The metric to display.
 */
export function HealthCard({ label, value, icon: Icon, tone, caption }: HealthCardProps) {
  const toneClass = TONE_CLASS[tone];
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-5">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-4 w-4', toneClass)} aria-hidden="true" />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
        </div>
        <span className={cn('font-mono text-2xl font-bold', toneClass)}>{value}</span>
        {caption !== undefined && <span className="text-xs text-muted-foreground">{caption}</span>}
      </CardContent>
    </Card>
  );
}
