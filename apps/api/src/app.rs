//! Shared application state and the router composition seam.
//!
//! [`AppState`] is the cheaply-cloneable bundle of handles every request needs;
//! [`build_router`] merges the example's own route groups into a single
//! [`Router`]. Later layers attach the database pool, the Redis store handle, and
//! the wired authentication engine to the state as those subsystems are
//! introduced, and mount their route groups onto the value returned here.

use axum::Router;

/// Shared, cheaply-cloneable handles every request needs.
///
/// The database pool, the Redis store handle, and the wired authentication engine
/// are attached to this struct as the persistence, store, and engine layers are
/// introduced; today it carries only the running crate version for the health
/// probe. Cloning is a pointer-cheap operation, so the state is duplicated freely
/// per request without copying the underlying resources.
#[derive(Clone)]
pub struct AppState {
    /// The running crate version, surfaced by the health probe.
    pub version: &'static str,
}

impl AppState {
    /// Build the initial state from compile-time metadata.
    #[must_use]
    pub fn new() -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION"),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
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
        let router = build_router(AppState::default());
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

    #[test]
    fn default_state_carries_the_crate_version() {
        // The default state reports the compile-time crate version verbatim.
        assert_eq!(AppState::default().version, env!("CARGO_PKG_VERSION"));
    }
}
