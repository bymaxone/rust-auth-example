/**
 * @fileoverview Exhaustive, bilingual localization for every wire-visible auth code.
 *
 * `AUTH_ERROR_MESSAGES` maps each `AUTH_ERROR_CODES` member to an English and a
 * Spanish message plus a severity. The `satisfies Record<AuthErrorCode, …>`
 * annotation makes the map exhaustive at compile time: adding a code to the
 * library without localizing it here fails the build. The `AllCodesLocalized`
 * `never` guard restates that contract explicitly so the intent is unmissable.
 *
 * @module lib/error-messages
 */

import { AUTH_ERROR_CODES, type AuthErrorCode } from '@bymax-one/rust-auth/shared';
import type { ErrorSeverity } from './severity';

/** Supported UI locales for auth copy. */
export type Locale = 'en' | 'es';

/** A localized entry for a single auth code: one string per locale + a severity. */
export interface LocalizedAuthError {
  /** English copy. */
  readonly en: string;
  /** Spanish copy. */
  readonly es: string;
  /** How prominently to surface the message. */
  readonly severity: ErrorSeverity;
}

/** The resolved message a caller renders: the chosen-locale string + its severity. */
export interface ResolvedAuthMessage {
  /** The localized message text. */
  readonly message: string;
  /** How prominently to surface it. */
  readonly severity: ErrorSeverity;
}

/**
 * English + Spanish copy for every wire-visible auth code. `satisfies` keeps this
 * map exhaustive over {@link AuthErrorCode} — a missing or unknown key is a
 * compile error, so the localization can never silently fall behind the library.
 */
export const AUTH_ERROR_MESSAGES = {
  'auth.invalid_credentials': {
    en: 'Incorrect email or password.',
    es: 'Correo electrónico o contraseña incorrectos.',
    severity: 'error',
  },
  'auth.account_locked': {
    en: 'Account temporarily locked. Try again shortly.',
    es: 'Cuenta bloqueada temporalmente. Vuelve a intentarlo en unos minutos.',
    severity: 'warning',
  },
  'auth.account_inactive': {
    en: 'This account is inactive.',
    es: 'Esta cuenta está inactiva.',
    severity: 'warning',
  },
  'auth.account_suspended': {
    en: 'This account has been suspended.',
    es: 'Esta cuenta ha sido suspendida.',
    severity: 'warning',
  },
  'auth.account_banned': {
    en: 'This account has been banned.',
    es: 'Esta cuenta ha sido bloqueada permanentemente.',
    severity: 'error',
  },
  'auth.pending_approval': {
    en: 'Your account is awaiting approval.',
    es: 'Tu cuenta está pendiente de aprobación.',
    severity: 'info',
  },
  'auth.token_expired': {
    en: 'Your session has expired — please sign in again.',
    es: 'Tu sesión ha expirado; vuelve a iniciar sesión.',
    severity: 'error',
  },
  'auth.token_revoked': {
    en: 'Your session was revoked — please sign in again.',
    es: 'Tu sesión fue revocada; vuelve a iniciar sesión.',
    severity: 'error',
  },
  'auth.token_invalid': {
    en: 'Your session is no longer valid — please sign in again.',
    es: 'Tu sesión ya no es válida; vuelve a iniciar sesión.',
    severity: 'error',
  },
  'auth.refresh_token_invalid': {
    en: 'Your session could not be refreshed — please sign in again.',
    es: 'No se pudo renovar tu sesión; vuelve a iniciar sesión.',
    severity: 'error',
  },
  'auth.session_expired': {
    en: 'Your session has expired.',
    es: 'Tu sesión ha expirado.',
    severity: 'error',
  },
  'auth.session_limit_reached': {
    en: 'You have reached the maximum number of active sessions.',
    es: 'Has alcanzado el número máximo de sesiones activas.',
    severity: 'warning',
  },
  'auth.session_not_found': {
    en: 'That session could not be found.',
    es: 'No se encontró esa sesión.',
    severity: 'warning',
  },
  'auth.token_missing': {
    en: 'You need to sign in to continue.',
    es: 'Debes iniciar sesión para continuar.',
    severity: 'error',
  },
  'auth.email_already_exists': {
    en: 'An account with this email already exists.',
    es: 'Ya existe una cuenta con este correo electrónico.',
    severity: 'warning',
  },
  'auth.email_not_verified': {
    en: 'Please verify your email address before signing in.',
    es: 'Verifica tu correo electrónico antes de iniciar sesión.',
    severity: 'warning',
  },
  'auth.mfa_required': {
    en: 'Enter your authenticator code to continue.',
    es: 'Introduce el código de tu autenticador para continuar.',
    severity: 'info',
  },
  'auth.mfa_invalid_code': {
    en: 'That authenticator code is not valid. Please try again.',
    es: 'Ese código de autenticación no es válido. Inténtalo de nuevo.',
    severity: 'error',
  },
  'auth.mfa_already_enabled': {
    en: 'Two-factor authentication is already enabled.',
    es: 'La verificación en dos pasos ya está activada.',
    severity: 'info',
  },
  'auth.mfa_not_enabled': {
    en: 'Two-factor authentication is not enabled on this account.',
    es: 'La verificación en dos pasos no está activada en esta cuenta.',
    severity: 'info',
  },
  'auth.mfa_setup_required': {
    en: 'Set up two-factor authentication to continue.',
    es: 'Configura la verificación en dos pasos para continuar.',
    severity: 'info',
  },
  'auth.mfa_temp_token_invalid': {
    en: 'Your verification session expired — please sign in again.',
    es: 'Tu sesión de verificación expiró; vuelve a iniciar sesión.',
    severity: 'error',
  },
  'auth.recovery_code_invalid': {
    en: 'That recovery code is not valid.',
    es: 'Ese código de recuperación no es válido.',
    severity: 'error',
  },
  'auth.password_too_weak': {
    en: 'Choose a stronger password.',
    es: 'Elige una contraseña más segura.',
    severity: 'warning',
  },
  'auth.password_reset_token_invalid': {
    en: 'This reset link is invalid. Request a new one.',
    es: 'Este enlace de restablecimiento no es válido. Solicita uno nuevo.',
    severity: 'error',
  },
  'auth.password_reset_token_expired': {
    en: 'This reset link has expired. Request a new one.',
    es: 'Este enlace de restablecimiento ha expirado. Solicita uno nuevo.',
    severity: 'warning',
  },
  'auth.otp_invalid': {
    en: 'That code is not valid.',
    es: 'Ese código no es válido.',
    severity: 'error',
  },
  'auth.otp_expired': {
    en: 'That code has expired. Request a new one.',
    es: 'Ese código ha expirado. Solicita uno nuevo.',
    severity: 'warning',
  },
  'auth.otp_max_attempts': {
    en: 'Too many attempts. Please request a new code.',
    es: 'Demasiados intentos. Solicita un código nuevo.',
    severity: 'warning',
  },
  'auth.insufficient_role': {
    en: 'You do not have permission to do that.',
    es: 'No tienes permiso para hacer eso.',
    severity: 'error',
  },
  'auth.forbidden': {
    en: 'Access denied.',
    es: 'Acceso denegado.',
    severity: 'error',
  },
  'auth.invalid_invitation_token': {
    en: 'This invitation is invalid or has already been used.',
    es: 'Esta invitación no es válida o ya ha sido utilizada.',
    severity: 'error',
  },
  'auth.oauth_failed': {
    en: 'Sign-in with the provider failed. Please try again.',
    es: 'El inicio de sesión con el proveedor falló. Inténtalo de nuevo.',
    severity: 'error',
  },
  'auth.oauth_email_mismatch': {
    en: 'The provider email does not match this account.',
    es: 'El correo del proveedor no coincide con esta cuenta.',
    severity: 'error',
  },
  'auth.platform_auth_required': {
    en: 'Platform administrator sign-in is required.',
    es: 'Se requiere el inicio de sesión de administrador de plataforma.',
    severity: 'error',
  },
  'auth.validation': {
    en: 'Please check the highlighted fields and try again.',
    es: 'Revisa los campos indicados e inténtalo de nuevo.',
    severity: 'warning',
  },
  'auth.too_many_requests': {
    en: 'Too many attempts — please wait a moment.',
    es: 'Demasiados intentos; espera un momento.',
    severity: 'warning',
  },
  'auth.internal': {
    en: 'Something went wrong on our side. Please try again.',
    es: 'Algo salió mal de nuestro lado. Inténtalo de nuevo.',
    severity: 'error',
  },
} satisfies Record<AuthErrorCode, LocalizedAuthError>;

/**
 * Compile-time exhaustiveness guard. If {@link AuthErrorCode} ever gains a member
 * that {@link AUTH_ERROR_MESSAGES} does not localize, `Uncovered` is that member
 * (no longer `never`), the conditional type collapses to `false`, and this
 * assignment fails to compile — a new code cannot ship unlocalized.
 */
type Uncovered = Exclude<AuthErrorCode, keyof typeof AUTH_ERROR_MESSAGES>;
const ALL_CODES_LOCALIZED: [Uncovered] extends [never] ? true : never = true;

/** The message shown for an unknown or non-auth code. */
const GENERIC_FALLBACK: LocalizedAuthError = {
  en: 'Something went wrong. Please try again.',
  es: 'Algo salió mal. Inténtalo de nuevo.',
  severity: 'error',
};

/**
 * Resolve a localized message + severity for an auth code.
 *
 * @param code - The wire code (e.g. `'auth.invalid_credentials'`); unknown codes
 *   fall back to a generic message.
 * @param locale - The target locale; defaults to English.
 * @returns The localized {@link ResolvedAuthMessage}.
 */
export function localizeAuthError(code: string, locale: Locale = 'en'): ResolvedAuthMessage {
  const entry =
    (AUTH_ERROR_MESSAGES as Record<string, LocalizedAuthError>)[code] ?? GENERIC_FALLBACK;
  return { message: entry[locale], severity: entry.severity };
}

/**
 * The full list of localizable wire codes, derived from the library's
 * `AUTH_ERROR_CODES`. Exposed so tests (and future settings surfaces) can iterate
 * every code without duplicating the list.
 */
export const LOCALIZED_AUTH_CODES: readonly AuthErrorCode[] = Object.values(AUTH_ERROR_CODES);

export { ALL_CODES_LOCALIZED };
