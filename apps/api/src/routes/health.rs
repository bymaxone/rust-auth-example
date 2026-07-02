//! The liveness probe route.
//!
//! `GET /health` returns `200` with the running crate version, so an orchestrator
//! or load balancer can confirm the process is accepting requests.

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use crate::app::AppState;

/// The `/health` probe payload: a liveness flag and the running crate version.
#[derive(Debug, Serialize)]
pub struct HealthResponse {
    /// Always `"ok"` while the process is accepting requests.
    pub status: &'static str,
    /// The running crate version (`CARGO_PKG_VERSION`).
    pub version: &'static str,
}

/// Liveness probe — returns `200` with the running crate version.
pub async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: state.version,
    })
}

/// The example's health route group.
pub fn routes() -> Router<AppState> {
    Router::new().route("/health", get(health))
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
    use http_body_util::BodyExt as _;
    use tower::ServiceExt as _;

    #[tokio::test]
    async fn health_reports_ok_and_the_crate_version() {
        // The probe answers 200 with the stable liveness flag and the exact crate
        // version surfaced through the shared state.
        let router = routes().with_state(AppState::for_test());
        let response = router
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(json["status"], "ok");
        assert_eq!(json["version"], env!("CARGO_PKG_VERSION"));
    }
}
