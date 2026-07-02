//! Shared application state and the router composition seam.
//!
//! [`AppState`] is the cheaply-cloneable bundle of handles every request needs;
//! [`build_router`] merges the example's own route groups into a single
//! [`Router`]. Later layers attach the Redis store handle and the wired
//! authentication engine to the state as those subsystems are introduced, and
//! mount their route groups onto the value returned here.

use std::sync::Arc;

use axum::Router;
use bymax_auth_redis::RedisStores;
use sqlx::PgPool;

/// Shared, cheaply-cloneable handles every request needs.
///
/// The wired authentication engine is attached to this struct as the engine layer
/// is introduced; today it carries the running crate version for the health probe,
/// the shared Postgres pool, and the shared Redis store handle. Cloning is a
/// pointer-cheap operation (the pool clone and the `Arc` clone are handle copies),
/// so the state is duplicated freely per request.
#[derive(Clone)]
pub struct AppState {
    /// The running crate version, surfaced by the health probe.
    pub version: &'static str,
    /// The shared Postgres connection pool the repositories draw from.
    pub pool: PgPool,
    /// The shared Redis store handle backing every store seam of the engine.
    pub stores: Arc<RedisStores>,
}

impl AppState {
    /// Build the state from the connected handles and compile-time metadata.
    #[must_use]
    pub fn new(pool: PgPool, stores: Arc<RedisStores>) -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION"),
            pool,
            stores,
        }
    }
}

/// Compose the example's own router.
///
/// Later layers merge their route groups and the mounted authentication router
/// onto the value returned here before the global middleware stack wraps it.
pub fn build_router(state: AppState) -> Router {
    Router::new().with_state(state)
}

#[cfg(test)]
impl AppState {
    /// Build a state with a lazy, non-connecting pool for unit tests.
    ///
    /// `connect_lazy` constructs the pool without any I/O, so unit tests exercise
    /// the router and handlers without a live database.
    #[allow(
        // A malformed URL is the only failure mode of `connect_lazy`; the literal
        // below is well-formed, so the `expect` is unreachable. The workspace-level
        // `expect_used` denial is relaxed for this test-only constructor.
        clippy::expect_used
    )]
    pub(crate) fn for_test() -> Self {
        let pool = PgPool::connect_lazy("postgres://localhost/placeholder")
            .expect("a well-formed url yields an infallible lazy pool");
        let stores = crate::stores::connect_stores(
            "redis://127.0.0.1:6379",
            "rust_auth_example".to_string(),
        )
        .expect("a well-formed redis url yields an infallible lazy handle");
        Self::new(pool, stores)
    }
}

#[cfg(test)]
#[allow(
    // Panicking is the idiomatic failure signal in tests, so the workspace-level
    // `unwrap_used` denial is relaxed for this test module only.
    clippy::unwrap_used
)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt as _;

    #[tokio::test]
    async fn unknown_path_returns_not_found() {
        // The bare router answers as a service: an unmapped path resolves to 404,
        // proving the composition seam produces a live tower service.
        let router = build_router(AppState::for_test());
        let response = router
            .oneshot(
                Request::builder()
                    .uri("/does-not-exist")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn state_carries_the_crate_version() {
        // The state reports the compile-time crate version verbatim. This runs in a
        // Tokio context because building the lazy pool requires the runtime.
        assert_eq!(AppState::for_test().version, env!("CARGO_PKG_VERSION"));
    }
}
