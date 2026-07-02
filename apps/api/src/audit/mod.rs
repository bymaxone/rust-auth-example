//! The example-owned audit read surface over the `audit_log` table.
//!
//! The lifecycle hooks write the rows; this module reads them back as a keyset page
//! and a live SSE tail, never exposing a token, code, or secret.

pub mod routes;

use axum::Router;
use axum::routing::get;

use crate::app::AppState;

/// The audit read-API route group: keyset list + SSE tail.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/audit/logs", get(routes::list_logs))
        .route("/audit/stream", get(routes::stream_logs))
}
