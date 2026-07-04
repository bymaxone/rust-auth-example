//! A `reqwest`-based `EmailProvider` delivering via the Resend HTTPS API.
//!
//! It renders the same shared templates as the lettre provider and POSTs each
//! message to Resend with a bearer token. Like the SMTP transport, the OTP/token a
//! message carries appears only in the request body — never in a log line.

use async_trait::async_trait;

use bymax_auth_core::traits::email::{EmailError, EmailProvider, InviteData, SessionInfo};
use secrecy::{ExposeSecret as _, SecretString};
use std::time::Duration;

use crate::email::templates;

/// The Resend transactional-email endpoint.
const RESEND_ENDPOINT: &str = "https://api.resend.com/emails";

/// Install the `aws-lc-rs` rustls provider as the process default exactly once.
///
/// The reqwest TLS backend is built without a pinned provider (to keep the banned
/// `ring` crate off the graph), so it needs a process-default `CryptoProvider` before
/// the first client is constructed. Installing the ring-free `aws-lc-rs` provider here
/// satisfies that requirement; a repeat install is a no-op.
fn install_default_crypto_provider() {
    use std::sync::Once;

    static INIT: Once = Once::new();
    INIT.call_once(|| {
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    });
}

/// HTTPS [`EmailProvider`] backed by the Resend transactional API.
pub struct ResendEmailProvider {
    http: reqwest::Client,
    api_key: SecretString,
    from: String,
    endpoint: String,
}

impl ResendEmailProvider {
    /// Creates a provider bound to a Resend API key and a verified `from` address.
    #[must_use]
    pub fn new(api_key: SecretString, from: String) -> Self {
        Self::with_endpoint(api_key, from, RESEND_ENDPOINT.to_owned())
    }

    /// Creates a provider pointed at an explicit `endpoint`, used to target a local
    /// mock in tests.
    #[must_use]
    fn with_endpoint(api_key: SecretString, from: String, endpoint: String) -> Self {
        install_default_crypto_provider();
        Self {
            http: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(5))
                .timeout(Duration::from_secs(10))
                .build()
                // `Default` for a reqwest client is the zero-config `Client::new()`, the same
                // fallback, without an uncovered error-only closure.
                .unwrap_or_default(),
            api_key,
            from,
            endpoint,
        }
    }

    /// POST a rendered HTML message to the Resend endpoint with bearer auth.
    async fn deliver(&self, to: &str, subject: &str, html: String) -> Result<(), EmailError> {
        let response = self
            .http
            .post(&self.endpoint)
            .bearer_auth(self.api_key.expose_secret())
            .json(&serde_json::json!({
                "from": self.from,
                "to": to,
                "subject": subject,
                "html": html,
            }))
            .send()
            .await
            .map_err(|error| EmailError::Delivery(Box::new(error)))?;
        if response.status().is_success() {
            Ok(())
        } else {
            let status = response.status();
            Err(EmailError::Delivery(
                format!("resend responded with status {status}").into(),
            ))
        }
    }
}

#[async_trait]
impl EmailProvider for ResendEmailProvider {
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
    use std::sync::{Arc, Mutex};
    use time::OffsetDateTime;

    use axum::Router;
    use axum::extract::State;
    use axum::http::{HeaderMap, StatusCode};
    use axum::routing::post;
    use tokio::net::TcpListener;

    /// One captured request: the `Authorization` header and the raw JSON body.
    type Captured = Arc<Mutex<Vec<(String, String)>>>;

    /// A running mock endpoint plus the trigger that shuts its server down gracefully.
    struct MockServer {
        endpoint: String,
        captured: Captured,
        shutdown: tokio::sync::oneshot::Sender<()>,
        handle: tokio::task::JoinHandle<()>,
    }

    impl MockServer {
        /// Signal graceful shutdown and await the server task, so it runs to completion
        /// rather than being aborted when the test process exits.
        async fn stop(self) {
            let _ = self.shutdown.send(());
            let _ = self.handle.await;
        }
    }

    /// Spawn a local mock that records each request and replies with `status`.
    async fn spawn_mock(status: StatusCode) -> MockServer {
        let captured: Captured = Arc::new(Mutex::new(Vec::new()));
        let state = (captured.clone(), status);
        let app = Router::new()
            .route(
                "/emails",
                post(
                    |State((buf, status)): State<(Captured, StatusCode)>,
                     headers: HeaderMap,
                     body: String| async move {
                        let auth = headers
                            .get(axum::http::header::AUTHORIZATION)
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or_default()
                            .to_owned();
                        buf.lock().expect("capture buffer lock").push((auth, body));
                        status
                    },
                ),
            )
            .with_state(state);
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind mock");
        let addr = listener.local_addr().expect("mock addr");
        let (shutdown, rx) = tokio::sync::oneshot::channel();
        let handle = tokio::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = rx.await;
                })
                .await;
        });
        MockServer {
            endpoint: format!("http://{addr}/emails"),
            captured,
            shutdown,
            handle,
        }
    }

    fn session() -> SessionInfo {
        SessionInfo {
            device: "Firefox".to_owned(),
            ip: "198.51.100.7".to_owned(),
            session_hash: "cafef00d".to_owned(),
        }
    }

    fn invite() -> InviteData {
        InviteData {
            inviter_name: "Grace".to_owned(),
            tenant_name: "Globex".to_owned(),
            invite_token: "f".repeat(64),
            expires_at: OffsetDateTime::UNIX_EPOCH,
        }
    }

    #[tokio::test]
    async fn posts_every_message_with_bearer_auth() {
        // Each of the seven sends reaches `/emails` with the bearer key and the rendered
        // body, and the mock's 2xx maps to `Ok`.
        let mock = spawn_mock(StatusCode::OK).await;
        let provider = ResendEmailProvider::with_endpoint(
            SecretString::from("re_key_123".to_owned()),
            "no-reply@auth.local".to_owned(),
            mock.endpoint.clone(),
        );
        let to = "recipient@example.test";
        provider
            .send_email_verification_otp(to, "123456", Some("en"))
            .await
            .expect("verification otp posts");
        provider
            .send_password_reset_otp(to, "654321", None)
            .await
            .expect("reset otp posts");
        provider
            .send_password_reset_token(to, "reset-token", None)
            .await
            .expect("reset token posts");
        provider
            .send_mfa_enabled(to, None)
            .await
            .expect("mfa enabled posts");
        provider
            .send_mfa_disabled(to, None)
            .await
            .expect("mfa disabled posts");
        provider
            .send_new_session_alert(to, &session(), None)
            .await
            .expect("session alert posts");
        provider
            .send_invitation(to, &invite(), Some("es"))
            .await
            .expect("invitation posts");

        {
            let calls = mock.captured.lock().expect("capture buffer lock");
            assert_eq!(calls.len(), 7);
            for (auth, body) in calls.iter() {
                assert_eq!(auth, "Bearer re_key_123");
                assert!(body.contains("\"from\":\"no-reply@auth.local\""));
            }
            // The verification body carries the emailed OTP.
            assert!(calls[0].1.contains("123456"));
        }
        mock.stop().await;
    }

    #[tokio::test]
    async fn non_success_status_maps_to_delivery_error() {
        // A provider 5xx surfaces as the opaque delivery error rather than a silent success.
        let mock = spawn_mock(StatusCode::INTERNAL_SERVER_ERROR).await;
        let provider = ResendEmailProvider::with_endpoint(
            SecretString::from("re_key_123".to_owned()),
            "no-reply@auth.local".to_owned(),
            mock.endpoint.clone(),
        );
        let result = provider
            .send_email_verification_otp("recipient@example.test", "123456", None)
            .await;
        assert!(matches!(result, Err(EmailError::Delivery(_))));
        mock.stop().await;
    }

    #[tokio::test]
    async fn a_network_failure_maps_to_a_delivery_error() {
        // Pointing the provider at a port with no listener makes the POST fail to connect,
        // exercising the transport-error arm rather than an HTTP-status arm.
        let provider = ResendEmailProvider::with_endpoint(
            SecretString::from("re_key_123".to_owned()),
            "no-reply@auth.local".to_owned(),
            "http://127.0.0.1:1/emails".to_owned(),
        );
        let result = provider
            .send_mfa_enabled("recipient@example.test", None)
            .await;
        assert!(matches!(result, Err(EmailError::Delivery(_))));
    }
}
