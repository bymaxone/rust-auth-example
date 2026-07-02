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

/// Validate that `from` is a well-formed RFC 5321 mailbox.
///
/// Both the Resend and Mailpit paths call this before constructing a provider so
/// an invalid `SMTP_FROM` is always reported as the same typed [`EmailError`].
fn parse_smtp_from(from: &str) -> Result<(), EmailError> {
    from.parse::<::lettre::message::Mailbox>()
        .map(|_| ())
        .map_err(|e| EmailError::Delivery(Box::new(e)))
}

/// Report which transport [`resolve_email_provider`] will select for `settings`.
///
/// `EMAIL_PROVIDER` is authoritative: it names the configured transport regardless
/// of whether a `RESEND_API_KEY` is also present. Surfaced so a health or diagnostics
/// view can name the active transport without constructing it.
#[must_use]
pub fn resolve_kind(settings: &Settings) -> EmailProviderKind {
    settings.email_provider
}

/// Select the active email provider from settings.
///
/// `EMAIL_PROVIDER` is authoritative:
/// - `resend` → requires `RESEND_API_KEY`; builds the Resend HTTPS transport.
/// - `mailpit` → builds the zero-credential lettre → Mailpit transport (even when a
///   `RESEND_API_KEY` happens to be set — the explicit choice wins).
///
/// `SMTP_FROM` is validated as a well-formed mailbox on both paths before any
/// provider is constructed.
///
/// # Errors
///
/// Returns [`EmailError::Delivery`] when `EMAIL_PROVIDER` is `resend` but
/// `RESEND_API_KEY` is absent, when `SMTP_FROM` is not a valid mailbox, or when the
/// lettre transport cannot be built.
pub fn resolve_email_provider(settings: &Settings) -> Result<Arc<dyn EmailProvider>, EmailError> {
    // Validate smtp_from upfront so both paths produce the same typed error on
    // an invalid SMTP_FROM.
    parse_smtp_from(&settings.smtp_from)?;

    match settings.email_provider {
        EmailProviderKind::Resend => {
            let key = settings.resend_api_key.as_ref().ok_or_else(|| {
                EmailError::Delivery(
                    "`EMAIL_PROVIDER` is `resend` but `RESEND_API_KEY` is not configured".into(),
                )
            })?;
            Ok(Arc::new(ResendEmailProvider::new(
                key.clone(),
                settings.smtp_from.clone(),
            )))
        }
        EmailProviderKind::Mailpit => Ok(Arc::new(LettreEmailProvider::new(
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
    use crate::config::{EmailProviderKind, RuntimeEnvironment};
    use secrecy::SecretString;

    /// A base `Settings` fixture with `EMAIL_PROVIDER=mailpit` and no Resend key.
    fn settings() -> Settings {
        Settings {
            api_port: 4000,
            app_env: RuntimeEnvironment::Development,
            log_level: "info".to_owned(),
            database_url: "postgres://localhost/example".to_owned(),
            redis_url: "redis://localhost:6379".to_owned(),
            redis_namespace: "rust_auth_example".to_owned(),
            jwt_secret: SecretString::from("x".repeat(64)),
            mfa_encryption_key: SecretString::from(
                "ZGV2X29ubHlfbG9jYWxfMzJfYnl0ZV9rZXlfMDAwMDA=".to_owned(),
            ),
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
        // EMAIL_PROVIDER=mailpit with no key: the Mailpit transport is chosen and builds.
        let s = settings();
        assert_eq!(resolve_kind(&s), EmailProviderKind::Mailpit);
        assert!(resolve_email_provider(&s).is_ok());
    }

    #[test]
    fn selects_resend_when_provider_and_key_are_set() {
        // EMAIL_PROVIDER=resend + key present: the Resend HTTPS transport is built.
        let mut s = settings();
        s.email_provider = EmailProviderKind::Resend;
        s.resend_api_key = Some(SecretString::from("re_key".to_owned()));
        assert_eq!(resolve_kind(&s), EmailProviderKind::Resend);
        assert!(resolve_email_provider(&s).is_ok());
    }

    #[test]
    fn mailpit_selected_with_key_present_uses_mailpit() {
        // When EMAIL_PROVIDER=mailpit, the explicit choice wins even if a Resend key is
        // also configured — the key is simply ignored.
        let mut s = settings();
        s.resend_api_key = Some(SecretString::from("re_key".to_owned()));
        assert_eq!(resolve_kind(&s), EmailProviderKind::Mailpit);
        let provider = resolve_email_provider(&s);
        assert!(provider.is_ok());
    }

    #[test]
    fn resend_selected_without_key_returns_delivery_error() {
        // EMAIL_PROVIDER=resend with no key: must return a typed error, not a silent
        // fallback to Mailpit.
        let mut s = settings();
        s.email_provider = EmailProviderKind::Resend;
        assert!(matches!(
            resolve_email_provider(&s),
            Err(EmailError::Delivery(_))
        ));
    }

    #[test]
    fn invalid_from_address_is_a_typed_error() {
        // A malformed SMTP_FROM fails construction on the Mailpit path with a typed error.
        let mut s = settings();
        s.smtp_from = "not a mailbox".to_owned();
        assert!(matches!(
            resolve_email_provider(&s),
            Err(EmailError::Delivery(_))
        ));
    }

    #[test]
    fn invalid_from_address_rejected_on_resend_path() {
        // A malformed SMTP_FROM fails construction on the Resend path with the same typed
        // error — the shared smtp_from validation fires before the key check.
        let mut s = settings();
        s.email_provider = EmailProviderKind::Resend;
        s.resend_api_key = Some(SecretString::from("re_key".to_owned()));
        s.smtp_from = "not a mailbox".to_owned();
        assert!(matches!(
            resolve_email_provider(&s),
            Err(EmailError::Delivery(_))
        ));
    }
}
