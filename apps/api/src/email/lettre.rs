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
            templates::password_reset_token(token, locale)?,
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
            templates::password_reset_otp(otp, locale)?,
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
            templates::verification_otp(otp, locale)?,
        )
        .await
    }

    async fn send_mfa_enabled(&self, email: &str, locale: Option<&str>) -> Result<(), EmailError> {
        self.deliver(
            email,
            "Two-factor authentication enabled",
            templates::mfa_enabled(locale)?,
        )
        .await
    }

    async fn send_mfa_disabled(&self, email: &str, locale: Option<&str>) -> Result<(), EmailError> {
        self.deliver(
            email,
            "Two-factor authentication disabled",
            templates::mfa_disabled(locale)?,
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
            templates::new_session_alert(session, locale)?,
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
            templates::invitation(invite, locale)?,
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

    /// Parse an optional `SMTP_PORT` value, falling back to the Mailpit default when it
    /// is absent or not a valid port number.
    fn parse_port(raw: Option<String>) -> u16 {
        raw.and_then(|p| p.parse().ok()).unwrap_or(1025)
    }

    /// The Mailpit SMTP host/port, from the environment or the local default.
    fn mailpit_endpoint() -> (String, u16) {
        let host = std::env::var("SMTP_HOST").unwrap_or_else(|_| "localhost".to_owned());
        (host, parse_port(std::env::var("SMTP_PORT").ok()))
    }

    /// Whether a Mailpit SMTP relay is reachable, so the delivery test can run.
    fn mailpit_reachable(host: &str, port: u16) -> bool {
        let Ok(mut addrs) = (host, port).to_socket_addrs() else {
            return false;
        };
        addrs.any(|addr| TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok())
    }

    /// The Mailpit REST base URL (its HTTP UI/API port), overridable for CI service containers.
    fn mailpit_rest_base(smtp_host: &str) -> String {
        std::env::var("MAILPIT_URL").unwrap_or_else(|_| format!("http://{smtp_host}:8025"))
    }

    /// Count the messages currently addressed to `to`, via Mailpit's search API. Runs only when
    /// Mailpit is reachable (the caller guards on that), so a request/parse failure is a broken
    /// relay and panics the test rather than silently under-counting.
    async fn mailpit_count_to(client: &reqwest::Client, rest: &str, to: &str) -> usize {
        let url = format!("{rest}/api/v1/search?query=to:{to}");
        let resp = client
            .get(&url)
            .send()
            .await
            .expect("mailpit search request succeeds");
        let body = resp
            .json::<serde_json::Value>()
            .await
            .expect("mailpit search returns json");
        body.get("messages")
            .and_then(serde_json::Value::as_array)
            .map_or(0, Vec::len)
    }

    #[test]
    fn rejects_a_malformed_from_address() {
        // A malformed `from` mailbox fails construction as a typed error, never a panic.
        let result = LettreEmailProvider::new("localhost", 1025, "not a mailbox".to_owned());
        assert!(matches!(result, Err(EmailError::Delivery(_))));
    }

    #[test]
    fn parse_port_reads_a_valid_value_and_falls_back_otherwise() {
        // A numeric value is honoured; a non-numeric value or an absent one falls back to
        // the Mailpit default, so the endpoint is always well-formed.
        assert_eq!(parse_port(Some("2525".to_owned())), 2525);
        assert_eq!(parse_port(Some("not-a-port".to_owned())), 1025);
        assert_eq!(parse_port(None), 1025);
    }

    #[test]
    fn an_unresolvable_host_is_reported_unreachable() {
        // A name reserved never to resolve fails address lookup, so reachability is false
        // without opening a socket (the `.invalid` TLD is guaranteed non-resolvable).
        assert!(!mailpit_reachable("relay.invalid", 1025));
    }

    #[test]
    fn a_closed_port_is_reported_unreachable() {
        // Address resolution succeeds but nothing is listening, so the connect attempt is
        // refused and reachability is false.
        assert!(!mailpit_reachable("127.0.0.1", 1));
    }

    #[tokio::test]
    async fn a_transport_failure_is_a_delivery_error() {
        // A provider pointed at a port with no SMTP listener fails to deliver, exercising
        // the transport-error arm (the send `map_err`) rather than a formatting arm.
        let provider = LettreEmailProvider::new("127.0.0.1", 1, "no-reply@auth.local".to_owned())
            .expect("a valid from address builds the provider");
        let result = provider
            .send_mfa_enabled("recipient@example.test", None)
            .await;
        assert!(matches!(result, Err(EmailError::Delivery(_))));
    }

    #[tokio::test]
    async fn a_malformed_recipient_is_a_delivery_error() {
        // A valid provider still fails fast when the recipient address is malformed, hitting
        // the recipient-parse error branch without contacting a relay.
        let provider =
            LettreEmailProvider::new("localhost", 1025, "no-reply@auth.local".to_owned())
                .expect("a valid from address builds the provider");
        let result = provider.send_mfa_enabled("not a mailbox", None).await;
        assert!(matches!(result, Err(EmailError::Delivery(_))));
    }

    #[tokio::test]
    async fn delivers_every_message_to_mailpit() {
        // Against a live Mailpit relay every one of the seven sends renders and delivers,
        // exercising the transport end to end. Hermetic by default: with no relay reachable
        // (a fresh checkout or a dev box without the test stack) the test skips; CI provides
        // the Mailpit service, so the delivery path is still exercised there.
        let (host, port) = mailpit_endpoint();
        // Skip when no relay is reachable (a fresh checkout / a dev box without the test stack).
        // The coverage pass sets `MAILPIT_FORCE_SKIP` so this skip arm is exercised
        // deterministically — that keeps the two-pass gate at 100% without needing a
        // Mailpit-less pass, which would collide with the SMTP-defaults config test.
        if std::env::var_os("MAILPIT_FORCE_SKIP").is_some() || !mailpit_reachable(&host, port) {
            eprintln!(
                "skipping Mailpit delivery test: {host}:{port} unreachable or MAILPIT_FORCE_SKIP set"
            );
            return;
        }
        let provider = LettreEmailProvider::new(&host, port, "no-reply@auth.local".to_owned())
            .expect("a valid from address builds the provider");
        // A recipient unique to this test process so a shared Mailpit relay stays race-free
        // when several mutation jobs run concurrently.
        let to = format!("recipient-{}@example.test", std::process::id());
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
            .send_email_verification_otp(&to, "123456", Some("en"))
            .await
            .expect("verification otp delivers");
        provider
            .send_password_reset_otp(&to, "654321", None)
            .await
            .expect("reset otp delivers");
        provider
            .send_password_reset_token(&to, "reset-token", None)
            .await
            .expect("reset token delivers");
        provider
            .send_mfa_enabled(&to, None)
            .await
            .expect("mfa enabled delivers");
        provider
            .send_mfa_disabled(&to, None)
            .await
            .expect("mfa disabled delivers");
        provider
            .send_new_session_alert(&to, &session, None)
            .await
            .expect("session alert delivers");
        provider
            .send_invitation(&to, &invite, Some("es"))
            .await
            .expect("invitation delivers");

        // Returning `Ok` is not enough: assert every message actually reached Mailpit. A send
        // mutated to a no-op `Ok(())` would leave this recipient's inbox short of seven.
        let rest = mailpit_rest_base(&host);
        // The api's reqwest TLS backend ships without a bundled crypto provider, so install the
        // process-default aws-lc-rs provider (idempotent) before building an HTTP client.
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
        let client = reqwest::Client::new();
        // Each SMTP send above completes only once Mailpit has accepted the message, so all seven
        // are already stored; a short settle covers the relay's search-index update.
        tokio::time::sleep(Duration::from_millis(500)).await;
        let delivered = mailpit_count_to(&client, &rest, &to).await;
        assert_eq!(
            delivered, 7,
            "all seven messages must arrive at Mailpit for {to}"
        );
    }
}
