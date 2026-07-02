//! Shared, provider-agnostic transactional-email rendering.
//!
//! Every provider (lettre → Mailpit, Resend) renders identical HTML through this one
//! module, so the two transports can never drift. Each render function accepts an
//! optional BCP-47 `locale` and selects a localized copy set, falling back to English.
//! The rendered body carries only the value the email legitimately delivers (the OTP,
//! reset token, or invitation token) — never a persisted secret.

use askama::Template;
use time::format_description::well_known::Rfc3339;

use bymax_auth_core::traits::email::{InviteData, SessionInfo};

/// The localized, structural copy shared by every template. The dynamic values
/// (OTP/token/session details) are language-independent and supplied separately.
struct Copy {
    verify_heading: &'static str,
    verify_intro: &'static str,
    reset_otp_heading: &'static str,
    reset_otp_intro: &'static str,
    reset_token_heading: &'static str,
    reset_token_intro: &'static str,
    mfa_enabled_heading: &'static str,
    mfa_enabled_intro: &'static str,
    mfa_disabled_heading: &'static str,
    mfa_disabled_intro: &'static str,
    session_heading: &'static str,
    session_intro: &'static str,
    device_label: &'static str,
    ip_label: &'static str,
    session_label: &'static str,
    invite_heading: &'static str,
    invite_intro: &'static str,
    inviter_label: &'static str,
    tenant_label: &'static str,
    token_label: &'static str,
    expiry_label: &'static str,
    code_expiry: &'static str,
    link_expiry: &'static str,
    footer: &'static str,
}

/// The default English copy.
const EN: Copy = Copy {
    verify_heading: "Verify your email",
    verify_intro: "Use this one-time code to confirm your email address:",
    reset_otp_heading: "Reset your password",
    reset_otp_intro: "Use this one-time code to reset your password:",
    reset_token_heading: "Reset your password",
    reset_token_intro: "Use this token to reset your password:",
    mfa_enabled_heading: "Two-factor authentication enabled",
    mfa_enabled_intro: "Two-factor authentication was just turned on for your account.",
    mfa_disabled_heading: "Two-factor authentication disabled",
    mfa_disabled_intro: "Two-factor authentication was just turned off for your account.",
    session_heading: "New sign-in to your account",
    session_intro: "We noticed a sign-in from a new device or location:",
    device_label: "Device",
    ip_label: "IP address",
    session_label: "Session",
    invite_heading: "You have been invited",
    invite_intro: "You have been invited to join a workspace:",
    inviter_label: "Invited by",
    tenant_label: "Workspace",
    token_label: "Invitation token",
    expiry_label: "Expires",
    code_expiry: "This code expires shortly, so please use it soon.",
    link_expiry: "This token expires shortly, so please use it soon.",
    footer: "If you did not expect this email, you can safely ignore it.",
};

/// The Spanish copy, selected for a `es` language tag.
const ES: Copy = Copy {
    verify_heading: "Verifica tu correo",
    verify_intro: "Usa este código de un solo uso para confirmar tu correo:",
    reset_otp_heading: "Restablece tu contraseña",
    reset_otp_intro: "Usa este código de un solo uso para restablecer tu contraseña:",
    reset_token_heading: "Restablece tu contraseña",
    reset_token_intro: "Usa este token para restablecer tu contraseña:",
    mfa_enabled_heading: "Verificación en dos pasos activada",
    mfa_enabled_intro: "Se acaba de activar la verificación en dos pasos en tu cuenta.",
    mfa_disabled_heading: "Verificación en dos pasos desactivada",
    mfa_disabled_intro: "Se acaba de desactivar la verificación en dos pasos en tu cuenta.",
    session_heading: "Nuevo inicio de sesión en tu cuenta",
    session_intro: "Detectamos un inicio de sesión desde un dispositivo o lugar nuevo:",
    device_label: "Dispositivo",
    ip_label: "Dirección IP",
    session_label: "Sesión",
    invite_heading: "Te han invitado",
    invite_intro: "Te han invitado a unirte a un espacio de trabajo:",
    inviter_label: "Invitado por",
    tenant_label: "Espacio de trabajo",
    token_label: "Token de invitación",
    expiry_label: "Caduca",
    code_expiry: "Este código caduca pronto, úsalo cuanto antes.",
    link_expiry: "Este token caduca pronto, úsalo cuanto antes.",
    footer: "Si no esperabas este correo, puedes ignorarlo con seguridad.",
};

/// Select the copy set for a BCP-47 `locale`, matching only the primary language
/// subtag and defaulting to English.
fn copy_for(locale: Option<&str>) -> &'static Copy {
    let primary = locale
        .and_then(|tag| tag.split(['-', '_']).next())
        .map(str::to_ascii_lowercase);
    match primary.as_deref() {
        Some("es") => &ES,
        _ => &EN,
    }
}

/// Render a template, logging and returning an empty body on the (compile-time
/// improbable) render failure rather than silently swallowing it.
fn log_render_error(error: askama::Error) -> String {
    tracing::error!(?error, "email template render failed");
    String::new()
}

/// Email-verification OTP template.
#[derive(Template)]
#[template(path = "email/email_verification_otp.html")]
struct VerificationOtp<'a> {
    heading: &'a str,
    intro: &'a str,
    otp: &'a str,
    expiry: &'a str,
    footer: &'a str,
}

/// Password-reset OTP template.
#[derive(Template)]
#[template(path = "email/password_reset_otp.html")]
struct PasswordResetOtp<'a> {
    heading: &'a str,
    intro: &'a str,
    otp: &'a str,
    expiry: &'a str,
    footer: &'a str,
}

/// Password-reset link-token template.
#[derive(Template)]
#[template(path = "email/password_reset_token.html")]
struct PasswordResetToken<'a> {
    heading: &'a str,
    intro: &'a str,
    token: &'a str,
    expiry: &'a str,
    footer: &'a str,
}

/// MFA-enabled security-alert template.
#[derive(Template)]
#[template(path = "email/mfa_enabled.html")]
struct MfaEnabled<'a> {
    heading: &'a str,
    intro: &'a str,
    footer: &'a str,
}

/// MFA-disabled security-alert template.
#[derive(Template)]
#[template(path = "email/mfa_disabled.html")]
struct MfaDisabled<'a> {
    heading: &'a str,
    intro: &'a str,
    footer: &'a str,
}

/// New-session security-alert template.
#[derive(Template)]
#[template(path = "email/new_session_alert.html")]
struct NewSessionAlert<'a> {
    heading: &'a str,
    intro: &'a str,
    device_label: &'a str,
    device: &'a str,
    ip_label: &'a str,
    ip: &'a str,
    session_label: &'a str,
    session_hash: &'a str,
    footer: &'a str,
}

/// Tenant-invitation template.
#[derive(Template)]
#[template(path = "email/invitation.html")]
struct Invitation<'a> {
    heading: &'a str,
    intro: &'a str,
    inviter_label: &'a str,
    inviter_name: &'a str,
    tenant_label: &'a str,
    tenant_name: &'a str,
    token_label: &'a str,
    invite_token: &'a str,
    expiry_label: &'a str,
    expires_at: &'a str,
    footer: &'a str,
}

/// Render the email-verification OTP body.
pub(crate) fn verification_otp(otp: &str, locale: Option<&str>) -> String {
    let c = copy_for(locale);
    VerificationOtp {
        heading: c.verify_heading,
        intro: c.verify_intro,
        otp,
        expiry: c.code_expiry,
        footer: c.footer,
    }
    .render()
    .unwrap_or_else(log_render_error)
}

/// Render the password-reset OTP body.
pub(crate) fn password_reset_otp(otp: &str, locale: Option<&str>) -> String {
    let c = copy_for(locale);
    PasswordResetOtp {
        heading: c.reset_otp_heading,
        intro: c.reset_otp_intro,
        otp,
        expiry: c.code_expiry,
        footer: c.footer,
    }
    .render()
    .unwrap_or_else(log_render_error)
}

/// Render the password-reset link-token body.
pub(crate) fn password_reset_token(token: &str, locale: Option<&str>) -> String {
    let c = copy_for(locale);
    PasswordResetToken {
        heading: c.reset_token_heading,
        intro: c.reset_token_intro,
        token,
        expiry: c.link_expiry,
        footer: c.footer,
    }
    .render()
    .unwrap_or_else(log_render_error)
}

/// Render the MFA-enabled alert body.
pub(crate) fn mfa_enabled(locale: Option<&str>) -> String {
    let c = copy_for(locale);
    MfaEnabled {
        heading: c.mfa_enabled_heading,
        intro: c.mfa_enabled_intro,
        footer: c.footer,
    }
    .render()
    .unwrap_or_else(log_render_error)
}

/// Render the MFA-disabled alert body.
pub(crate) fn mfa_disabled(locale: Option<&str>) -> String {
    let c = copy_for(locale);
    MfaDisabled {
        heading: c.mfa_disabled_heading,
        intro: c.mfa_disabled_intro,
        footer: c.footer,
    }
    .render()
    .unwrap_or_else(log_render_error)
}

/// Render the new-session alert body from the session context.
pub(crate) fn new_session_alert(session: &SessionInfo, locale: Option<&str>) -> String {
    // `session.session_hash` is the library's display-only short hash (never the raw
    // refresh token), so rendering it into the email body carries no credential.
    let c = copy_for(locale);
    NewSessionAlert {
        heading: c.session_heading,
        intro: c.session_intro,
        device_label: c.device_label,
        device: &session.device,
        ip_label: c.ip_label,
        ip: &session.ip,
        session_label: c.session_label,
        session_hash: &session.session_hash,
        footer: c.footer,
    }
    .render()
    .unwrap_or_else(log_render_error)
}

/// Render the tenant-invitation body from the invite context.
pub(crate) fn invitation(invite: &InviteData, locale: Option<&str>) -> String {
    let c = copy_for(locale);
    // `expires_at` is rendered as an RFC 3339 UTC string for a stable, locale-
    // independent format.
    let expires_at = invite.expires_at.format(&Rfc3339).unwrap_or_default();
    Invitation {
        heading: c.invite_heading,
        intro: c.invite_intro,
        inviter_label: c.inviter_label,
        inviter_name: &invite.inviter_name,
        tenant_label: c.tenant_label,
        tenant_name: &invite.tenant_name,
        token_label: c.token_label,
        invite_token: &invite.invite_token,
        expiry_label: c.expiry_label,
        expires_at: &expires_at,
        footer: c.footer,
    }
    .render()
    .unwrap_or_else(log_render_error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::OffsetDateTime;

    fn session() -> SessionInfo {
        SessionInfo {
            device: "Chrome on macOS".to_owned(),
            ip: "203.0.113.4".to_owned(),
            session_hash: "deadbeef".to_owned(),
        }
    }

    fn invite() -> InviteData {
        InviteData {
            inviter_name: "Ada".to_owned(),
            tenant_name: "Acme".to_owned(),
            invite_token: "0".repeat(64),
            expires_at: OffsetDateTime::UNIX_EPOCH,
        }
    }

    #[test]
    fn otp_bodies_carry_the_code_and_default_to_english() {
        // The verification and reset OTP bodies embed the code and, with no locale, render
        // the English heading.
        let body = verification_otp("123456", None);
        assert!(body.contains("123456"));
        assert!(body.contains("Verify your email"));
        assert!(password_reset_otp("654321", Some("en-US")).contains("654321"));
    }

    #[test]
    fn spanish_locale_selects_localized_copy() {
        // A `es` primary subtag switches the copy while keeping the dynamic value intact.
        let body = verification_otp("123456", Some("es-ES"));
        assert!(body.contains("Verifica tu correo"));
        assert!(body.contains("123456"));
    }

    #[test]
    fn token_and_alert_bodies_render_their_context() {
        // The reset-token, MFA, session, and invitation bodies each render their fields.
        assert!(password_reset_token("tok-abc", None).contains("tok-abc"));
        assert!(mfa_enabled(None).contains("enabled"));
        assert!(mfa_disabled(None).contains("disabled"));
        let alert = new_session_alert(&session(), None);
        assert!(alert.contains("Chrome on macOS") && alert.contains("203.0.113.4"));
        let inv = invitation(&invite(), Some("es"));
        assert!(inv.contains("Acme") && inv.contains(&"0".repeat(64)));
    }
}
