//! Shared application state and the router composition seam.
//!
//! [`AppState`] is the cheaply-cloneable bundle of handles every request needs — the
//! Postgres pool, the shared Redis store handle, and the fully-wired `AuthEngine`.
//! [`build_router`] mounts the library auth surface (derived from the engine's
//! controller toggles) and merges the example's own domain routes onto one [`Router`].

use std::sync::Arc;

use axum::Router;
use bymax_auth_axum::{AuthRouter, AxumAuthConfig, ClientIpSource, RateLimitConfig};
use bymax_auth_core::AuthEngine;
use bymax_auth_redis::RedisStores;
use sqlx::PgPool;

use crate::config::RuntimeEnvironment;

/// Shared, cheaply-cloneable handles every request needs.
///
/// It carries the running crate version for the health probe, the shared Postgres
/// pool the example's own routes query, the shared Redis store handle, and the
/// fully-wired [`AuthEngine`] the example's routes reach for server-only primitives.
/// Cloning is pointer-cheap (the pool clone and the `Arc` clones are handle copies),
/// so the state is duplicated freely per request.
#[derive(Clone)]
pub struct AppState {
    /// The running crate version, surfaced by the health probe.
    pub version: &'static str,
    /// Deployment environment; controls which route groups mount at startup.
    pub app_env: RuntimeEnvironment,
    /// The shared Postgres connection pool the example's own routes draw from.
    pub pool: PgPool,
    /// The shared Redis store handle backing every store seam of the engine.
    pub stores: Arc<RedisStores>,
    /// The fully-wired authentication engine, shared with the mounted auth router.
    pub engine: Arc<AuthEngine>,
}

impl AppState {
    /// Build the state from the connected handles, the wired engine, compile-time
    /// metadata, and the deployment environment.
    #[must_use]
    pub fn new(
        pool: PgPool,
        stores: Arc<RedisStores>,
        engine: Arc<AuthEngine>,
        app_env: RuntimeEnvironment,
    ) -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION"),
            app_env,
            pool,
            stores,
            engine,
        }
    }
}

/// Compose the full example `Router`: the mounted library auth surface plus the
/// example's own domain routes, sharing one `Arc<AuthEngine>`.
///
/// The library router is derived from the engine's resolved `ControllerToggles`, so
/// only the enabled groups (`auth`, `password_reset`, `sessions`, `mfa`) mount. The
/// example's own routes are merged onto the same value before the global middleware
/// stack wraps it.
pub fn build_router(state: AppState) -> Router {
    let auth = AuthRouter::from_engine(
        Arc::clone(&state.engine),
        AxumAuthConfig {
            route_prefix: "auth".to_owned(),
            rate_limits: RateLimitConfig::default(),
            client_ip_source: ClientIpSource::PeerAddr,
            ..Default::default()
        },
    )
    .into_router();

    example_routes(state.app_env).with_state(state).merge(auth)
}

/// The example's own domain routes.
///
/// The audit read-API (`/audit/*`) and diagnostics surface (`/diagnostics/*`) are
/// development-only: they expose the full audit trail unauthenticated and allow
/// force-locking any account, so they must not be reachable in production.
/// Only the health probe mounts unconditionally.
fn example_routes(app_env: RuntimeEnvironment) -> Router<AppState> {
    let mut router = Router::new().merge(crate::routes::health::routes());
    if app_env == RuntimeEnvironment::Development {
        router = router
            .merge(crate::audit::router())
            .merge(crate::diagnostics::router());
    }
    router
}

#[cfg(test)]
impl AppState {
    /// Build a state with lazy, non-connecting handles and a fully-wired engine for
    /// unit tests.
    ///
    /// Every backend handle is lazy (`connect_lazy` / `RedisStores::connect`) and the
    /// engine builds without I/O, so unit tests exercise the router and handlers
    /// without any live backend.
    #[allow(
        // The literals below are well-formed and every pool/handle is lazy, so the
        // engine builds infallibly here; the workspace-level `expect_used` denial is
        // relaxed for this test-only constructor.
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
        let engine = Arc::new(
            crate::engine::build_engine(
                &crate::config::dev_settings(),
                pool.clone(),
                Arc::clone(&stores),
                bymax_auth_core::config::Environment::Development,
            )
            .expect("the dev settings fixture yields a valid engine"),
        );
        Self::new(pool, stores, engine, RuntimeEnvironment::Development)
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

    #[tokio::test]
    async fn audit_and_diagnostics_are_absent_outside_development() {
        // In non-Development environments the audit and diagnostics routes must not
        // mount — every such path resolves to 404, proving they are unreachable in
        // production without any authentication bypass needed.
        let mut state = AppState::for_test();
        state.app_env = RuntimeEnvironment::Production;
        let router = build_router(state);
        for uri in [
            "/audit/logs",
            "/audit/stream",
            "/diagnostics/hash-strength",
            "/diagnostics/force-lockout",
            "/diagnostics/hooks",
        ] {
            let response = router
                .clone()
                .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(
                response.status(),
                StatusCode::NOT_FOUND,
                "{uri} must be absent outside Development"
            );
        }
    }
}
