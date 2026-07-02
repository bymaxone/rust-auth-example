//! The Postgres connection pool provider.
//!
//! [`connect_pool`] opens the pool the repositories share, establishing the first
//! connection eagerly so a misconfigured `DATABASE_URL` or an unreachable database
//! aborts startup immediately with a precise, typed error rather than failing on
//! the first request.

use std::time::Duration;

use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

use crate::error::AppError;

/// How long to wait for the first connection before declaring the database unreachable.
const ACQUIRE_TIMEOUT: Duration = Duration::from_secs(5);

/// Open the Postgres pool the repositories will share.
///
/// Eagerly establishes the first connection so a misconfigured `DATABASE_URL` or an
/// unreachable database aborts startup immediately, rather than failing on the
/// first request.
///
/// # Errors
///
/// Returns [`AppError::Database`] when the first connection cannot be established
/// within [`ACQUIRE_TIMEOUT`] (unreachable host, refused port, or bad credentials).
pub async fn connect_pool(database_url: &str, max_connections: u32) -> Result<PgPool, AppError> {
    PgPoolOptions::new()
        .max_connections(max_connections)
        .acquire_timeout(ACQUIRE_TIMEOUT)
        .connect(database_url)
        .await
        .map_err(AppError::Database)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn connecting_to_a_closed_port_fails_fast() {
        // The fail-fast-at-boot contract: an unreachable database surfaces as the
        // typed `Database` variant, deterministically and without panicking. Port 1
        // has no listener, so the connection is refused immediately.
        let result = connect_pool("postgres://127.0.0.1:1/none", 1).await;
        assert!(matches!(result, Err(AppError::Database(_))));
    }
}
