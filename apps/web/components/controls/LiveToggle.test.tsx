/**
 * @fileoverview Tests for the URL-persisted live toggle.
 *
 * @module components/controls/LiveToggle.test
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';

import { LiveToggle } from './LiveToggle';

describe('LiveToggle', () => {
  it('defaults to live and pauses the tail on click', async () => {
    // Verifies the default live state + the nuqs round-trip when paused.
    const onUrlUpdate = vi.fn();
    render(<LiveToggle />, { wrapper: withNuqsTestingAdapter({ onUrlUpdate }) });

    const button = screen.getByRole('button', { name: /Live/ });
    expect(button).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(button);

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const update = onUrlUpdate.mock.calls.at(-1)?.[0] as { queryString: string };
    expect(update.queryString).toContain('live=false');
  });

  it('renders the paused state from the URL', () => {
    // Verifies the paused branch (icon + label + aria) reads from the query.
    render(<LiveToggle />, { wrapper: withNuqsTestingAdapter({ searchParams: '?live=false' }) });

    const button = screen.getByRole('button', { name: /Paused/ });
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });
});
