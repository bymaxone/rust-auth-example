/**
 * @fileoverview Shared auth-error banner component.
 *
 * Renders a destructive `<Alert>` with the English-localized message for an auth
 * error code. The raw `auth.*` code is kept in a `data-error-code` attribute for
 * diagnostic tooling but is never surfaced as visible text (to avoid leaking
 * account-existence signals to end users and automated crawlers).
 * Returns `null` when `code` is `null` so callers can keep the state slot empty
 * while there is no error to show.
 *
 * @module components/auth/auth-error
 */

'use client';

import type { ReactElement } from 'react';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { messageForCode } from '@/lib/error-messages';

/** Props for the {@link AuthError} component. */
export interface AuthErrorProps {
  /** A wire-visible auth error code, or `null` to render nothing. */
  code: string | null;
}

/**
 * Renders a localized auth error banner. The raw error code is stored in
 * `data-error-code` for diagnostic tooling but is never rendered as visible text.
 * Returns `null` when `code` is `null`.
 *
 * @param code - The auth error code to localize, or `null` for no-op.
 * @returns A destructive alert, or `null`.
 */
export function AuthError({ code }: AuthErrorProps): ReactElement | null {
  if (code === null) return null;
  return (
    <Alert variant="destructive" data-error-code={code}>
      <AlertTitle>{messageForCode(code)}</AlertTitle>
    </Alert>
  );
}
