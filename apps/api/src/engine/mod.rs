//! Assembles the fully-wired `AuthEngine` and exposes it for `AppState`.
//!
//! [`build_engine`] is the composition root: it validates the [`config`] profile and
//! assembles the engine from the real sqlx repository, the single shared
//! `Arc<RedisStores>` handle behind every store seam, the resolved email provider, and
//! the audit hooks. The same store handle backs both the engine and the app state, so
//! the process opens exactly one Redis connection pool.

pub mod config;
pub mod oauth;

use std::sync::Arc;

use bymax_auth_core::AuthEngine;
use bymax_auth_core::config::Environment;
use bymax_auth_redis::RedisStores;
use sqlx::PgPool;

use crate::config::Settings;
use crate::email::resolve_email_provider;
use crate::engine::config::build_auth_config;
use crate::hooks::AuditAuthHooks;
use crate::oauth::TlsHttpClientError;
use crate::repository::user::SqlxUserRepository;

/// Failure assembling the engine from settings.
#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    /// The `AuthConfig` was rejected for the target environment.
    #[error("auth configuration rejected: {0}")]
    Config(#[from] bymax_auth_core::ConfigError),
    /// The email provider could not be constructed from settings.
    #[error("email provider construction failed: {0}")]
    Email(#[from] bymax_auth_core::traits::email::EmailError),
    /// The OAuth HTTPS transport could not be constructed.
    #[error("oauth transport construction failed: {0}")]
    OauthTransport(#[from] TlsHttpClientError),
}

/// Builds the production-shaped [`AuthEngine`]: the real sqlx user repository, the
/// single shared `Arc<RedisStores>` handle behind every store seam, the resolved
/// [`EmailProvider`](bymax_auth_core::traits::email::EmailProvider), and the audit
/// hooks.
///
/// The store handle is supplied by the caller so the same pool backs both the engine
/// and the app state. The platform repository seam is wired separately, once the
/// platform-admin domain is enabled.
///
/// # Errors
///
/// Returns an [`EngineError`] when the configuration is rejected or the email provider
/// cannot be constructed.
pub fn build_engine(
    settings: &Settings,
    pool: PgPool,
    stores: Arc<RedisStores>,
    environment: Environment,
) -> Result<AuthEngine, EngineError> {
    let config = build_auth_config(settings, environment)?;

    let mut builder = AuthEngine::builder()
        .config(config)
        .environment(environment)
        .user_repository(Arc::new(SqlxUserRepository::new(pool.clone())))
        .redis_stores(Arc::clone(&stores))
        .email_provider(resolve_email_provider(settings)?)
        .hooks(Arc::new(AuditAuthHooks::new(pool)));

    // Wire the Google OAuth provider (over the example's TLS transport) and the single-use
    // `state` + PKCE store — both satisfied by the one shared `Arc<RedisStores>` handle —
    // only when Google is configured; otherwise the OAuth controller stays disabled.
    if let Some(provider) = oauth::google_provider(settings)? {
        builder = builder.oauth_provider(provider).oauth_state_store(stores);
    }

    let engine = builder.build()?;
    Ok(engine)
}

#[cfg(test)]
#[allow(
    // Panicking is the idiomatic failure signal in tests, so the workspace-level
    // `expect_used` denial is relaxed for this test module only.
    clippy::expect_used
)]
mod tests {
    use super::*;

    /// A lazy Postgres pool and lazy Redis handle for the no-backend engine tests.
    /// The Redis handle is built via `deadpool`, which requires an ambient Tokio runtime,
    /// so the callers run under `#[tokio::test]`.
    fn lazy_handles() -> (PgPool, Arc<RedisStores>) {
        let pool = PgPool::connect_lazy("postgres://postgres:postgres@localhost:5432/example_app")
            .expect("a well-formed url yields a lazy pool");
        let stores =
            crate::stores::connect_stores("redis://127.0.0.1:6379", "rust_auth_example".to_owned())
                .expect("a well-formed redis url yields a lazy handle");
        (pool, stores)
    }

    #[tokio::test]
    async fn builds_engine_from_lazy_handles() {
        // The engine assembles from lazy handles and a valid development configuration
        // with no live backend, proving the production-shaped wiring is internally
        // consistent (the config validates and every required seam is supplied).
        let (pool, stores) = lazy_handles();
        let result = build_engine(
            &crate::config::dev_settings(),
            pool,
            stores,
            Environment::Development,
        );
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn builds_engine_with_google_oauth_wired() {
        // With Google configured the engine registers the `google` provider (over the TLS
        // transport) and satisfies the OAuth state-store seam from the shared handle, so
        // the assembled engine exposes it via `oauth_providers()`.
        let (pool, stores) = lazy_handles();
        let mut settings = crate::config::dev_settings();
        settings.oauth_google_client_id = Some("client-id".to_owned());
        settings.oauth_google_client_secret =
            Some(secrecy::SecretString::from("client-secret".to_owned()));
        settings.oauth_google_callback_url =
            Some("http://localhost:3000/api/auth/oauth/google/callback".to_owned());
        let engine = build_engine(&settings, pool, stores, Environment::Development)
            .expect("an OAuth-enabled engine assembles");
        assert!(engine.oauth_providers().contains_key("google"));
    }

    #[tokio::test]
    async fn a_malformed_smtp_from_is_an_email_error() {
        // An invalid `SMTP_FROM` aborts assembly with the typed email error before any
        // backend is contacted.
        let (pool, stores) = lazy_handles();
        let mut settings = crate::config::dev_settings();
        settings.smtp_from = "not a mailbox".to_owned();
        let result = build_engine(&settings, pool, stores, Environment::Development);
        assert!(matches!(result, Err(EngineError::Email(_))));
    }
}
