//! The outbound transactional-email seam.
//!
//! One shared [`templates`] module renders every message so the two transports can
//! never drift; [`lettre::LettreEmailProvider`] delivers over SMTP to the local
//! Mailpit relay and [`resend::ResendEmailProvider`] delivers over the Resend HTTPS
//! API. [`resolve_email_provider`] picks between them from the runtime configuration.

pub mod lettre;
pub mod resend;
pub(crate) mod templates;

use std::sync::Arc;

use bymax_auth_core::traits::email::{EmailError, EmailProvider};

use crate::config::{EmailProviderKind, Settings};
use crate::email::lettre::LettreEmailProvider;
use crate::email::resend::ResendEmailProvider;

/// Report which transport [`resolve_email_provider`] will select for `settings`.
///
/// A configured `RESEND_API_KEY` is authoritative: when present the Resend HTTPS
/// transport is used, otherwise the zero-credential lettre → Mailpit relay. Surfaced
/// so a health or diagnostics view can name the active transport without constructing
/// it.
#[must_use]
pub fn resolve_kind(settings: &Settings) -> EmailProviderKind {
    match settings.resend_api_key {
        Some(_) => EmailProviderKind::Resend,
        None => EmailProviderKind::Mailpit,
    }
}

/// Select the active email provider from settings: the Resend HTTPS transport when a
/// `RESEND_API_KEY` is configured, otherwise the zero-credential lettre → Mailpit
/// transport.
///
/// # Errors
///
/// Returns an [`EmailError`] when the lettre transport cannot be built because the
/// configured `SMTP_FROM` is not a valid mailbox.
pub fn resolve_email_provider(settings: &Settings) -> Result<Arc<dyn EmailProvider>, EmailError> {
    match settings.resend_api_key.as_deref() {
        Some(key) => Ok(Arc::new(ResendEmailProvider::new(
            key.to_owned(),
            settings.smtp_from.clone(),
        ))),
        None => Ok(Arc::new(LettreEmailProvider::new(
            &settings.smtp_host,
            settings.smtp_port,
            settings.smtp_from.clone(),
        )?)),
    }
}

#[cfg(test)]
#[allow(
    // Panicking is the idiomatic failure signal in tests, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this test module only.
    clippy::unwrap_used,
    clippy::expect_used
)]
mod tests {
    use super::*;
    use crate::config::EmailProviderKind;

    /// A base `Settings` fixture with no Resend key configured.
    fn settings() -> Settings {
        Settings {
            api_port: 4000,
            log_level: "info".to_owned(),
            database_url: "postgres://localhost/example".to_owned(),
            redis_url: "redis://localhost:6379".to_owned(),
            redis_namespace: "rust_auth_example".to_owned(),
            jwt_secret: "x".repeat(64),
            mfa_encryption_key: "ZGV2X29ubHlfbG9jYWxfMzJfYnl0ZV9rZXlfMDAwMDA=".to_owned(),
            web_origin: "http://localhost:3000".to_owned(),
            email_provider: EmailProviderKind::Mailpit,
            smtp_host: "localhost".to_owned(),
            smtp_port: 1025,
            smtp_from: "no-reply@auth.local".to_owned(),
            resend_api_key: None,
        }
    }

    #[test]
    fn selects_lettre_when_no_resend_key() {
        // With no Resend key the zero-credential Mailpit transport is chosen and builds.
        let s = settings();
        assert_eq!(resolve_kind(&s), EmailProviderKind::Mailpit);
        assert!(resolve_email_provider(&s).is_ok());
    }

    #[test]
    fn selects_resend_when_a_key_is_present() {
        // A configured key switches the selector to the Resend HTTPS transport.
        let mut s = settings();
        s.resend_api_key = Some("re_key".to_owned());
        assert_eq!(resolve_kind(&s), EmailProviderKind::Resend);
        assert!(resolve_email_provider(&s).is_ok());
    }

    #[test]
    fn invalid_from_address_is_a_typed_error() {
        // A malformed `SMTP_FROM` fails provider construction fail-fast for the lettre path.
        let mut s = settings();
        s.smtp_from = "not a mailbox".to_owned();
        assert!(matches!(
            resolve_email_provider(&s),
            Err(EmailError::Delivery(_))
        ));
    }
}
