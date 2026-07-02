//! Assembles the fully-wired `AuthEngine` and exposes it for `AppState`.
//!
//! [`build_engine`] is the composition root: it validates the [`config`] profile,
//! constructs the single `Arc<RedisStores>` handle that wires every store seam, and
//! assembles the engine from the real sqlx repository, the resolved email provider,
//! and the audit hooks. The result is stored as `Arc<AuthEngine>` in the app state.

pub mod config;

use std::sync::Arc;

use bymax_auth_core::AuthEngine;
use bymax_auth_core::config::Environment;
use bymax_auth_redis::{RedisStoreError, RedisStores};
use sqlx::PgPool;

use crate::config::Settings;
use crate::email::resolve_email_provider;
use crate::engine::config::build_auth_config;
use crate::hooks::AuditAuthHooks;
use crate::repository::user::SqlxUserRepository;

/// Failure assembling the engine from settings.
#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    /// The `AuthConfig` was rejected for the target environment.
    #[error("auth configuration rejected: {0}")]
    Config(#[from] bymax_auth_core::ConfigError),
    /// The Redis store handle could not be constructed.
    #[error("redis store construction failed: {0}")]
    RedisStore(#[from] RedisStoreError),
    /// The email provider could not be constructed from settings.
    #[error("email provider construction failed: {0}")]
    Email(#[from] bymax_auth_core::traits::email::EmailError),
}

/// Builds the production-shaped [`AuthEngine`]: the real sqlx user repository, one
/// `Arc<RedisStores>` store handle behind every store seam, the resolved
/// [`EmailProvider`](bymax_auth_core::traits::email::EmailProvider), and the audit
/// hooks.
///
/// The platform repository seam is wired separately, once the platform-admin domain
/// is enabled; enabling it flips `platform.enabled` and requires that repository.
///
/// # Errors
///
/// Returns an [`EngineError`] when the configuration is rejected, the Redis handle
/// cannot be built, or the email provider cannot be constructed.
pub fn build_engine(
    settings: &Settings,
    pool: PgPool,
    environment: Environment,
) -> Result<AuthEngine, EngineError> {
    let config = build_auth_config(settings, environment)?;
    let stores = Arc::new(RedisStores::connect(
        &settings.redis_url,
        settings.redis_namespace.clone(),
    )?);

    let engine = AuthEngine::builder()
        .config(config)
        .environment(environment)
        .user_repository(Arc::new(SqlxUserRepository::new(pool.clone())))
        .redis_stores(stores)
        .email_provider(resolve_email_provider(settings)?)
        .hooks(Arc::new(AuditAuthHooks::new(pool)))
        .build()?;
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

    #[tokio::test]
    async fn builds_engine_from_lazy_handles() {
        // The engine assembles from lazy pools and a valid development configuration
        // with no live backend, proving the production-shaped wiring is internally
        // consistent (the config validates and every required seam is supplied).
        let pool = PgPool::connect_lazy("postgres://postgres:postgres@localhost:5432/example_app")
            .expect("a well-formed url yields a lazy pool");
        let result = build_engine(
            &crate::config::dev_settings(),
            pool,
            Environment::Development,
        );
        assert!(result.is_ok());
    }
}
