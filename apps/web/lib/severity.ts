/**
 * @fileoverview Severity levels for surfaced auth errors.
 *
 * A localized auth message carries one of these levels so the UI can pick an
 * intent (destructive banner, cautionary notice, or informational hint) without
 * re-deriving it from the raw code.
 *
 * @module lib/severity
 */

/** How prominently an auth message should be surfaced. */
export type ErrorSeverity = 'error' | 'warning' | 'info';
