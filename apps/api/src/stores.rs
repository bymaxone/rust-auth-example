//! The Redis store handle provider.
//!
//! [`connect_stores`] builds the single [`RedisStores`] handle that wires every
//! store seam of the engine. `RedisStores::connect` is lazy — it builds a
//! connection pool without any I/O — so a malformed `REDIS_URL` is the only
//! failure surfaced here; the first real round-trip happens when a store method
//! runs. The handle is shared through an [`Arc`], the way the engine expects it.

use std::sync::Arc;

use bymax_auth_redis::RedisStores;
use bymax_auth_types::AuthError;

use crate::error::AppError;

/// Build the single Redis store handle that wires every store seam of the engine.
///
/// The pool is lazy, so this performs no network I/O; a malformed `REDIS_URL` is
/// the only failure surfaced. Backend failures collapse to the opaque
/// [`AuthError::Internal`], so a connection detail never reaches a client.
///
/// # Errors
///
/// Returns an [`AppError`] wrapping [`AuthError::Internal`] when the URL is
/// malformed or the pool cannot be constructed.
pub fn connect_stores(redis_url: &str, namespace: String) -> Result<Arc<RedisStores>, AppError> {
    let stores = RedisStores::connect(redis_url, namespace)
        .map_err(|err| AppError::from(AuthError::from(err)))?;
    Ok(Arc::new(stores))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn malformed_url_is_rejected_opaquely() {
        // A URL the Redis client cannot parse fails pool construction; it surfaces
        // as the opaque internal error (the never-leak boundary), never a panic.
        let result = connect_stores("http://not-a-redis-url", "rust_auth_example".to_string());
        assert!(matches!(
            result,
            Err(AppError::Auth(AuthError::Internal(_)))
        ));
    }

    #[test]
    fn well_formed_url_builds_a_lazy_handle() {
        // Construction is lazy: a syntactically valid URL yields a handle without
        // opening a connection, so no live Redis is needed here.
        let result = connect_stores("redis://127.0.0.1:6379", "rust_auth_example".to_string());
        assert!(result.is_ok());
    }
}
