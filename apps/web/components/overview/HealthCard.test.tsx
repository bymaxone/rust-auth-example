/**
 * @fileoverview Tests for the Overview HealthCard.
 *
 * Covers: the icon + label + value render together (never colour-only), each tone
 * applies its colour cue, and the optional caption renders only when provided.
 *
 * @module components/overview/HealthCard.test
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CheckCircle2 } from 'lucide-react';
import { HealthCard, type HealthTone } from './HealthCard';

describe('HealthCard', () => {
  it('renders the label, value, and a decorative icon together', () => {
    // Meaning must not rest on colour alone: a label + value + icon are all present.
    const { container } = render(
      <HealthCard label="Login success" value="98%" icon={CheckCircle2} tone="positive" />,
    );
    expect(screen.getByText('Login success')).toBeInTheDocument();
    expect(screen.getByText('98%')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('applies the tone colour cue to the value for every tone', () => {
    // Each tone must tint the value with its distinct colour class.
    const cases: ReadonlyArray<[HealthTone, string]> = [
      ['positive', 'text-emerald-400'],
      ['warning', 'text-amber-400'],
      ['neutral', 'text-foreground'],
      ['info', 'text-sky-400'],
    ];
    for (const [tone, cls] of cases) {
      const { unmount } = render(
        <HealthCard label="M" value="1" icon={CheckCircle2} tone={tone} />,
      );
      expect(screen.getByText('1')).toHaveClass(cls);
      unmount();
    }
  });

  it('renders the caption only when one is supplied', () => {
    // A caption is optional; without it no extra copy appears.
    const { rerender } = render(
      <HealthCard label="M" value="1" icon={CheckCircle2} tone="neutral" caption="last 24h" />,
    );
    expect(screen.getByText('last 24h')).toBeInTheDocument();
    rerender(<HealthCard label="M" value="1" icon={CheckCircle2} tone="neutral" />);
    expect(screen.queryByText('last 24h')).not.toBeInTheDocument();
  });
});
