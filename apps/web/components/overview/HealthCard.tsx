/**
 * @fileoverview A single auth-health metric tile for the Overview grid.
 *
 * Each tile carries three redundant cues so meaning never rests on colour alone:
 * a leading icon, a text label, and the formatted value. The tile is a dark-glass
 * KPI card — a top accent gradient line, an accent-tinted icon badge, and a
 * monospace value — with a subtle lift on hover. The accent colour is decorative
 * chrome and is applied per tile by the caller.
 *
 * @module components/overview/HealthCard
 */

import type { LucideIcon } from 'lucide-react';

/** Props for {@link HealthCard}. */
export interface HealthCardProps {
  /** The metric label (e.g. "Login success"). */
  readonly label: string;
  /** The pre-formatted value (e.g. "98%", "12"). */
  readonly value: string;
  /** The leading icon conveying the metric independently of colour. */
  readonly icon: LucideIcon;
  /** The accent colour (hex) tinting the top line, icon badge, and icon. */
  readonly accent: string;
  /** Optional supporting caption. */
  readonly caption?: string;
}

/**
 * Render one metric as a dark-glass KPI tile with icon badge + label + value.
 *
 * @param props - The metric to display.
 */
export function HealthCard({ label, value, icon: Icon, accent, caption }: HealthCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-5 transition-all duration-200 hover:-translate-y-px">
      {/* Top accent line */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.5 opacity-60"
        style={{ background: `linear-gradient(to right, transparent, ${accent}, transparent)` }}
      />

      <div className="flex flex-col gap-3">
        {/* Icon badge */}
        <div
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border"
          style={{ background: `${accent}15`, borderColor: `${accent}25` }}
        >
          <Icon className="h-4 w-4" style={{ color: accent }} aria-hidden="true" />
        </div>

        {/* Value + label */}
        <div>
          <p className="font-mono text-2xl font-bold leading-none text-white">{value}</p>
          <p className="mt-1 text-xs font-medium text-[rgba(255,255,255,0.5)]">{label}</p>
          {caption !== undefined && (
            <p className="mt-1 text-xs text-[rgba(255,255,255,0.35)]">{caption}</p>
          )}
        </div>
      </div>
    </div>
  );
}
