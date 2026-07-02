//! Shared integration-test harness: an in-process app wired with a capturing email
//! provider so a flow test can read the OTPs the engine "emails" without a live SMTP
//! relay, plus a real Postgres + Redis-backed engine.
#![forbid(unsafe_code)]
#![allow(
    // Integration tests panic to signal failure, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this harness.
    clippy::unwrap_used,
    clippy::expect_used,
    // The harness exposes a few helpers a given test file may not use.
    dead_code
)]

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use tokio::net::TcpListener;

use bymax_auth_core::AuthEngine;
use bymax_auth_core::config::Environment;
use bymax_auth_core::traits::email::{EmailError, EmailProvider, InviteData, SessionInfo};
use bymax_auth_redis::RedisStores;
use sqlx::PgPool;

use api::app::{self, AppState};
use api::config::{EmailProviderKind, Settings};
use api::engine::config::build_auth_config;
use api::hooks::AuditAuthHooks;
use api::layers::apply_global_layers;
use api::repository::user::SqlxUserRepository;

/// A high-entropy JWT fixture that clears the length + entropy guards (dev-only).
const TEST_JWT: &str = "iN7wQ2eR9tY4uI1oP6aS3dF8gH5jK0lZ2xC7vB4nM9qW1eR6tY3uI8oP5aS0dF7gH";
/// A base64 32-byte AES-256-GCM key fixture (dev-only).
const TEST_MFA_KEY: &str = "ZGV2X29ubHlfbG9jYWxfMzJfYnl0ZV9rZXlfMDAwMDA=";

/// Install the ring-free `aws-lc-rs` rustls provider once, so the reqwest client (and
/// the app's TLS-capable clients) have a process-default crypto provider.
fn install_crypto() {
    use std::sync::Once;
    static INIT: Once = Once::new();
    INIT.call_once(|| {
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    });
}

/// An `EmailProvider` that records the verification OTP it is asked to send, so a flow
/// test can complete `verify-email` without a live inbox. Every send succeeds.
struct CapturingEmailProvider {
    verification_otps: Arc<Mutex<HashMap<String, String>>>,
}

#[async_trait]
impl EmailProvider for CapturingEmailProvider {
    async fn send_password_reset_token(
        &self,
        _email: &str,
        _token: &str,
        _locale: Option<&str>,
    ) -> Result<(), EmailError> {
        Ok(())
    }
    async fn send_password_reset_otp(
        &self,
        _email: &str,
        _otp: &str,
        _locale: Option<&str>,
    ) -> Result<(), EmailError> {
        Ok(())
    }
    async fn send_email_verification_otp(
        &self,
        email: &str,
        otp: &str,
        _locale: Option<&str>,
    ) -> Result<(), EmailError> {
        self.verification_otps
            .lock()
            .unwrap()
            .insert(email.to_owned(), otp.to_owned());
        Ok(())
    }
    async fn send_mfa_enabled(
        &self,
        _email: &str,
        _locale: Option<&str>,
    ) -> Result<(), EmailError> {
        Ok(())
    }
    async fn send_mfa_disabled(
        &self,
        _email: &str,
        _locale: Option<&str>,
    ) -> Result<(), EmailError> {
        Ok(())
    }
    async fn send_new_session_alert(
        &self,
        _email: &str,
        _session: &SessionInfo,
        _locale: Option<&str>,
    ) -> Result<(), EmailError> {
        Ok(())
    }
    async fn send_invitation(
        &self,
        _email: &str,
        _invite: &InviteData,
        _locale: Option<&str>,
    ) -> Result<(), EmailError> {
        Ok(())
    }
}

/// A spawned in-process app under test.
pub struct TestApp {
    /// The base URL, e.g. `http://127.0.0.1:PORT`.
    pub base_url: String,
    /// An HTTP client for driving the surface.
    pub client: reqwest::Client,
    /// The shared Postgres pool, for asserting on the `audit_log`.
    pub pool: PgPool,
    /// The verification OTPs the engine "emailed", keyed by recipient.
    pub verification_otps: Arc<Mutex<HashMap<String, String>>>,
    /// A unique tenant id provisioned for this run.
    pub tenant_id: String,
    /// A unique end-user email for this run.
    pub email: String,
}

/// Build a `Settings` fixture bound to the test stack endpoints.
fn test_settings(database_url: String, redis_url: String) -> Settings {
    Settings {
        api_port: 0,
        log_level: "info".to_owned(),
        database_url,
        redis_url,
        redis_namespace: "rust_auth_example_test".to_owned(),
        jwt_secret: TEST_JWT.to_owned(),
        mfa_encryption_key: TEST_MFA_KEY.to_owned(),
        web_origin: "http://localhost:3000".to_owned(),
        email_provider: EmailProviderKind::Mailpit,
        smtp_host: "localhost".to_owned(),
        smtp_port: 1025,
        smtp_from: "no-reply@auth.local".to_owned(),
        resend_api_key: None,
    }
}

/// Spawn the app against the test stack, returning `None` (a skip) when the required
/// `DATABASE_URL_TEST` / `REDIS_URL` are not configured.
pub async fn spawn() -> Option<TestApp> {
    let Ok(database_url) = std::env::var("DATABASE_URL_TEST") else {
        eprintln!("skipping integration test: DATABASE_URL_TEST is not set");
        return None;
    };
    let Ok(redis_url) = std::env::var("REDIS_URL") else {
        eprintln!("skipping integration test: REDIS_URL is not set");
        return None;
    };
    install_crypto();

    let pool = PgPool::connect(&database_url)
        .await
        .expect("the test stack Postgres must be reachable");

    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let tenant_id = format!("tenant-{unique}");
    let email = format!("user-{unique}@example.test");

    // The user FK requires the tenant to exist; provision an isolated one for this run.
    sqlx::query("INSERT INTO tenants (id, name) VALUES ($1, $1) ON CONFLICT DO NOTHING")
        .bind(&tenant_id)
        .execute(&pool)
        .await
        .expect("seed the test tenant");

    let settings = test_settings(database_url, redis_url);
    let config = build_auth_config(&settings, Environment::Development)
        .expect("the test configuration validates");
    let stores = Arc::new(
        RedisStores::connect(&settings.redis_url, settings.redis_namespace.clone())
            .expect("the redis handle builds"),
    );
    let verification_otps = Arc::new(Mutex::new(HashMap::new()));
    let email_provider = Arc::new(CapturingEmailProvider {
        verification_otps: verification_otps.clone(),
    });

    let engine = Arc::new(
        AuthEngine::builder()
            .config(config)
            .environment(Environment::Development)
            .user_repository(Arc::new(SqlxUserRepository::new(pool.clone())))
            .redis_stores(stores.clone())
            .email_provider(email_provider)
            .hooks(Arc::new(AuditAuthHooks::new(pool.clone())))
            .build()
            .expect("the engine builds from the test seams"),
    );

    let state = AppState::new(pool.clone(), stores, engine);
    let router =
        apply_global_layers(app::build_router(state), &settings).expect("global layers apply");

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind the test app");
    let addr = listener.local_addr().expect("the app address");
    tokio::spawn(async move {
        let _ = axum::serve(
            listener,
            router.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await;
    });

    install_crypto();
    let client = reqwest::Client::builder()
        .build()
        .expect("the http client builds");

    Some(TestApp {
        base_url: format!("http://{addr}"),
        client,
        pool,
        verification_otps,
        tenant_id,
        email,
    })
}
