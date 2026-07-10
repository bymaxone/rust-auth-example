/**
 * @fileoverview Tests for the Overview HealthCard.
 *
 * Covers: the icon + label + value render together (never colour-only), the
 * decorative accent chrome (top line + icon badge) is present, and the optional
 * caption renders only when provided.
 *
 * @module components/overview/HealthCard.test
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CheckCircle2 } from 'lucide-react';
import { HealthCard } from './HealthCard';

const ACCENT = '#ff6224';

describe('HealthCard', () => {
  it('renders the label, value, and a decorative icon together', () => {
    // Meaning must not rest on colour alone: a label + value + icon are all present.
    const { container } = render(
      <HealthCard label="Login success" value="98%" icon={CheckCircle2} accent={ACCENT} />,
    );
    expect(screen.getByText('Login success')).toBeInTheDocument();
    // The value keeps its monospace metric styling.
    expect(screen.getByText('98%')).toHaveClass('font-mono', 'text-2xl', 'font-bold', 'text-white');
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    // The icon carries fixed sizing so the metric row stays aligned.
    expect(icon).toHaveClass('h-4', 'w-4');
  });

  it('renders the accent chrome — a top accent line and an icon badge', () => {
    // The accent is decorative chrome: a top gradient line plus a bordered icon badge.
    const { container } = render(
      <HealthCard label="M" value="1" icon={CheckCircle2} accent={ACCENT} />,
    );
    // The top accent line is an absolutely-positioned decorative strip.
    expect(container.querySelector('.absolute.inset-x-0.top-0')).not.toBeNull();
    // The icon badge is a fixed-size chip wrapping the icon.
    const badge = container.querySelector('.h-8.w-8');
    expect(badge).not.toBeNull();
    expect(badge?.querySelector('svg')).not.toBeNull();
  });

  it('renders the caption only when one is supplied', () => {
    // A caption is optional; without it no extra copy appears.
    const { rerender } = render(
      <HealthCard label="M" value="1" icon={CheckCircle2} accent={ACCENT} caption="last 24h" />,
    );
    expect(screen.getByText('last 24h')).toBeInTheDocument();
    rerender(<HealthCard label="M" value="1" icon={CheckCircle2} accent={ACCENT} />);
    expect(screen.queryByText('last 24h')).not.toBeInTheDocument();
  });
});
