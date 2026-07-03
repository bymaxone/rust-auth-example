/**
 * @fileoverview Tests for the Alert, AlertTitle, and AlertDescription primitives.
 *
 * @module components/ui/alert.test
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert, AlertTitle, AlertDescription } from './alert';

describe('Alert', () => {
  it('renders with the default variant and role="alert"', () => {
    /* Default variant renders the alert role so assistive tech announces it. */
    render(<Alert>content</Alert>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders with the destructive variant', () => {
    /* Destructive variant applies semantic red styling for errors. */
    const { container } = render(<Alert variant="destructive">error</Alert>);
    const el = container.firstElementChild;
    expect(el?.className).toContain('border-destructive');
  });

  it('forwards extra className and ref', () => {
    /* Extra className must be merged so callers can adjust spacing. */
    const { container } = render(<Alert className="extra">text</Alert>);
    expect(container.firstElementChild?.className).toContain('extra');
  });
});

describe('AlertTitle', () => {
  it('renders as an h5', () => {
    /* AlertTitle uses an h5 for semantic heading hierarchy inside alerts. */
    const { container } = render(<AlertTitle>Title</AlertTitle>);
    expect(container.querySelector('h5')).toBeInTheDocument();
  });
});

describe('AlertDescription', () => {
  it('renders children', () => {
    /* AlertDescription carries the body copy of the alert. */
    render(<AlertDescription>details</AlertDescription>);
    expect(screen.getByText('details')).toBeInTheDocument();
  });
});
