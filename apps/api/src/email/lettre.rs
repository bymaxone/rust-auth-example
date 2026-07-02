//! A `lettre` SMTP `EmailProvider` that renders the shared transactional templates
//! and delivers them to the local Mailpit relay.
//!
//! The transport is plaintext (Mailpit speaks plain SMTP), so no TLS backend is
//! pulled in. The OTP/token a message carries lives only inside the rendered body;
//! it is never written to a `tracing` span or a log line.

use async_trait::async_trait;
use lettre::message::Mailbox;
use lettre::message::header::ContentType;
use lettre::transport::smtp::Error as SmtpError;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

use bymax_auth_core::traits::email::{EmailError, EmailProvider, InviteData, SessionInfo};

use crate::email::templates;

/// SMTP-backed [`EmailProvider`] targeting Mailpit in development.
pub struct LettreEmailProvider {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
}

/// Map any transport/formatting failure to the opaque [`EmailError::Delivery`].
fn delivery<E>(error: E) -> EmailError
where
    E: std::error::Error + Send + Sync + 'static,
{
    EmailError::Delivery(Box::new(error))
}

impl LettreEmailProvider {
    /// Build a plaintext SMTP transport to `host:port` (Mailpit speaks plain SMTP).
    ///
    /// # Errors
    ///
    /// Returns [`EmailError::Delivery`] when `from` is not a valid mailbox.
    pub fn new(host: &str, port: u16, from: String) -> Result<Self, EmailError> {
        let from = from.parse::<Mailbox>().map_err(delivery)?;
        let transport = AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(host)
            .port(port)
            .build();
        Ok(Self { transport, from })
    }

    /// Render an HTML message and deliver it over the SMTP transport.
    async fn deliver(&self, to: &str, subject: &str, html: String) -> Result<(), EmailError> {
        let message = Message::builder()
            .from(self.from.clone())
            .to(to.parse::<Mailbox>().map_err(delivery)?)
            .subject(subject)
            .header(ContentType::TEXT_HTML)
            .body(html)
            .map_err(delivery)?;
        self.transport
            .send(message)
            .await
            .map(|_| ())
            .map_err(|error: SmtpError| delivery(error))
    }
}

#[async_trait]
impl EmailProvider for LettreEmailProvider {
    async fn send_password_reset_token(
        &self,
        email: &str,
        token: &str,
        locale: Option<&str>,
    ) -> Result<(), EmailError> {
        self.deliver(
            email,
            "Reset your password",
            templates::password_reset_token(token, locale),
        )
        .await
    }

    async fn send_password_reset_otp(
        &self,
        email: &str,
        otp: &str,
        locale: Option<&str>,
    ) -> Result<(), EmailError> {
        self.deliver(
            email,
            "Reset your password",
            templates::password_reset_otp(otp, locale),
        )
        .await
    }

    async fn send_email_verification_otp(
        &self,
        email: &str,
        otp: &str,
        locale: Option<&str>,
    ) -> Result<(), EmailError> {
        self.deliver(
            email,
            "Verify your email",
            templates::verification_otp(otp, locale),
        )
        .await
    }

    async fn send_mfa_enabled(&self, email: &str, locale: Option<&str>) -> Result<(), EmailError> {
        self.deliver(
            email,
            "Two-factor authentication enabled",
            templates::mfa_enabled(locale),
        )
        .await
    }

    async fn send_mfa_disabled(&self, email: &str, locale: Option<&str>) -> Result<(), EmailError> {
        self.deliver(
            email,
            "Two-factor authentication disabled",
            templates::mfa_disabled(locale),
        )
        .await
    }

    async fn send_new_session_alert(
        &self,
        email: &str,
        session: &SessionInfo,
        locale: Option<&str>,
    ) -> Result<(), EmailError> {
        self.deliver(
            email,
            "New sign-in to your account",
            templates::new_session_alert(session, locale),
        )
        .await
    }

    async fn send_invitation(
        &self,
        email: &str,
        invite: &InviteData,
        locale: Option<&str>,
    ) -> Result<(), EmailError> {
        self.deliver(
            email,
            "You have been invited",
            templates::invitation(invite, locale),
        )
        .await
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
    use std::net::{TcpStream, ToSocketAddrs};
    use std::time::Duration;
    use time::OffsetDateTime;

    /// The Mailpit SMTP host/port, from the environment or the local default.
    fn mailpit_endpoint() -> (String, u16) {
        let host = std::env::var("SMTP_HOST").unwrap_or_else(|_| "localhost".to_owned());
        let port = std::env::var("SMTP_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(1025);
        (host, port)
    }

    /// Whether a Mailpit SMTP relay is reachable, so the delivery test can run.
    fn mailpit_reachable(host: &str, port: u16) -> bool {
        let Ok(mut addrs) = (host, port).to_socket_addrs() else {
            return false;
        };
        addrs.any(|addr| TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok())
    }

    #[test]
    fn rejects_a_malformed_from_address() {
        // A malformed `from` mailbox fails construction as a typed error, never a panic.
        let result = LettreEmailProvider::new("localhost", 1025, "not a mailbox".to_owned());
        assert!(matches!(result, Err(EmailError::Delivery(_))));
    }

    #[tokio::test]
    async fn delivers_every_message_to_mailpit() {
        // Against a live Mailpit relay every one of the seven sends renders and delivers,
        // exercising the transport end to end. The test skips when no relay is reachable so
        // an SMTP-free run still passes.
        let (host, port) = mailpit_endpoint();
        if !mailpit_reachable(&host, port) {
            eprintln!("skipping lettre delivery test: no Mailpit SMTP relay at {host}:{port}");
            return;
        }
        let provider = LettreEmailProvider::new(&host, port, "no-reply@auth.local".to_owned())
            .expect("a valid from address builds the provider");
        let to = "recipient@example.test";
        let session = SessionInfo {
            device: "Chrome on macOS".to_owned(),
            ip: "203.0.113.4".to_owned(),
            session_hash: "deadbeef".to_owned(),
        };
        let invite = InviteData {
            inviter_name: "Ada".to_owned(),
            tenant_name: "Acme".to_owned(),
            invite_token: "0".repeat(64),
            expires_at: OffsetDateTime::UNIX_EPOCH,
        };
        provider
            .send_email_verification_otp(to, "123456", Some("en"))
            .await
            .expect("verification otp delivers");
        provider
            .send_password_reset_otp(to, "654321", None)
            .await
            .expect("reset otp delivers");
        provider
            .send_password_reset_token(to, "reset-token", None)
            .await
            .expect("reset token delivers");
        provider
            .send_mfa_enabled(to, None)
            .await
            .expect("mfa enabled delivers");
        provider
            .send_mfa_disabled(to, None)
            .await
            .expect("mfa disabled delivers");
        provider
            .send_new_session_alert(to, &session, None)
            .await
            .expect("session alert delivers");
        provider
            .send_invitation(to, &invite, Some("es"))
            .await
            .expect("invitation delivers");
    }
}
