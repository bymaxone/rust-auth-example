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
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use tokio::net::TcpListener;

use secrecy::SecretString;

use bymax_auth_core::AuthEngine;
use bymax_auth_core::config::Environment;
use bymax_auth_core::traits::email::{EmailError, EmailProvider, InviteData, SessionInfo};
use bymax_auth_redis::RedisStores;
use sqlx::PgPool;

use api::app::{self, AppState};
use api::config::{EmailProviderKind, RuntimeEnvironment, Settings};
use api::engine::build_engine;
use api::engine::config::build_auth_config;
use api::hooks::AuditAuthHooks;
use api::layers::apply_global_layers;
use api::repository::user::SqlxUserRepository;

pub mod mailpit;

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
        app_env: RuntimeEnvironment::Development,
        log_level: "info".to_owned(),
        database_url,
        redis_url,
        redis_namespace: "rust_auth_example_test".to_owned(),
        jwt_secret: SecretString::from(TEST_JWT.to_owned()),
        mfa_encryption_key: SecretString::from(TEST_MFA_KEY.to_owned()),
        web_origin: "http://localhost:3000".to_owned(),
        email_provider: EmailProviderKind::Mailpit,
        smtp_host: "localhost".to_owned(),
        smtp_port: 1025,
        smtp_from: "no-reply@auth.local".to_owned(),
        resend_api_key: None,
        oauth_google_client_id: None,
        oauth_google_client_secret: None,
        oauth_google_callback_url: None,
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

    // Markers must be unique across nextest test PROCESSES (each starts a fresh
    // static), so combine the process id with a per-process atomic counter — no
    // wall-clock, no cross-process collision in the shared test database.
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();
    let tenant_id = format!("tenant-{pid}-{seq}");
    let email = format!("user-{pid}-{seq}@example.test");

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

    let state = AppState::new(
        pool.clone(),
        stores,
        engine,
        RuntimeEnvironment::Development,
    );
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

/// Spawn the example app through the real [`build_engine`] composition root, so the
/// mounted OAuth and invitation surfaces come up exactly as production wires them (real
/// lettre → Mailpit email included). `customize` mutates the base test settings (e.g. to
/// configure Google OAuth). Returns `None` (a skip) when the test-stack env is unset.
///
/// The returned client does not follow redirects, so an OAuth `302` can be inspected; its
/// `verification_otps` map stays empty (this path emails through Mailpit, not a capture).
pub async fn spawn_engine(customize: impl FnOnce(&mut Settings)) -> Option<TestApp> {
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

    static SEQ: AtomicU64 = AtomicU64::new(0);
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();
    let tenant_id = format!("tenant-eng-{pid}-{seq}");
    let email = format!("user-eng-{pid}-{seq}@example.test");

    sqlx::query("INSERT INTO tenants (id, name) VALUES ($1, $1) ON CONFLICT DO NOTHING")
        .bind(&tenant_id)
        .execute(&pool)
        .await
        .expect("seed the test tenant");

    let mut settings = test_settings(database_url, redis_url);
    customize(&mut settings);
    let stores = Arc::new(
        RedisStores::connect(&settings.redis_url, settings.redis_namespace.clone())
            .expect("the redis handle builds"),
    );
    let engine = Arc::new(
        build_engine(
            &settings,
            pool.clone(),
            stores.clone(),
            Environment::Development,
        )
        .expect("the engine builds from settings"),
    );
    let state = AppState::new(
        pool.clone(),
        stores,
        engine,
        RuntimeEnvironment::Development,
    );
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

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("the http client builds");

    Some(TestApp {
        base_url: format!("http://{addr}"),
        client,
        pool,
        verification_otps: Arc::new(Mutex::new(HashMap::new())),
        tenant_id,
        email,
    })
}

/// Configure Google OAuth on the test settings, pointing the provider at the local web
/// origin. The credentials are fixtures — the mounted initiate route mints a real Google
/// authorize URL from them without contacting Google.
pub fn with_google_oauth(settings: &mut Settings) {
    settings.oauth_google_client_id = Some("test-client-id.apps.googleusercontent.com".to_owned());
    settings.oauth_google_client_secret = Some(SecretString::from("test-client-secret".to_owned()));
    settings.oauth_google_callback_url =
        Some("http://localhost:3000/api/auth/oauth/google/callback".to_owned());
}

/// A Postgres + Redis-backed engine wired with the example's real `AuditAuthHooks` and a
/// controllable `MockOAuthProvider` (registered as `google`), for driving the
/// `on_oauth_login` Create/Link/Reject policy end to end against the real audit log.
pub struct OAuthPolicyStack {
    /// The wired engine (OAuth controller on, mock provider + state store from Redis).
    pub engine: AuthEngine,
    /// The shared Postgres pool, for seeding and asserting on `users` / `audit_log`.
    pub pool: PgPool,
    /// A unique tenant provisioned for this run.
    pub tenant_id: String,
}

/// Build an [`OAuthPolicyStack`] against the test stack, or `None` (a skip) when the env
/// is unset. The engine uses the mock provider (canned profile `mock@example.com` /
/// `mock-123`), so the callback is driven without any real HTTP.
pub async fn oauth_policy_stack() -> Option<OAuthPolicyStack> {
    use bymax_auth_core::testing::MockOAuthProvider;

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

    static SEQ: AtomicU64 = AtomicU64::new(0);
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();
    let tenant_id = format!("tenant-oauth-{pid}-{seq}");
    sqlx::query("INSERT INTO tenants (id, name) VALUES ($1, $1) ON CONFLICT DO NOTHING")
        .bind(&tenant_id)
        .execute(&pool)
        .await
        .expect("seed the test tenant");

    let settings = test_settings(database_url, redis_url);
    let mut config = build_auth_config(&settings, Environment::Development)
        .expect("the base configuration validates");
    // Enable the OAuth controller with the mock provider (no Google credentials needed).
    config.controllers.oauth = true;
    let stores = Arc::new(
        RedisStores::connect(&settings.redis_url, settings.redis_namespace.clone())
            .expect("the redis handle builds"),
    );
    let engine = AuthEngine::builder()
        .config(config)
        .environment(Environment::Development)
        .user_repository(Arc::new(SqlxUserRepository::new(pool.clone())))
        .redis_stores(stores.clone())
        .hooks(Arc::new(AuditAuthHooks::new(pool.clone())))
        .oauth_provider(Arc::new(MockOAuthProvider::new("google")))
        .oauth_state_store(stores)
        .build()
        .expect("the mock-OAuth engine builds");

    Some(OAuthPolicyStack {
        engine,
        pool,
        tenant_id,
    })
}
