//! The example-owned audit read surface over the `audit_log` table.
//!
//! The lifecycle hooks write the rows; this module reads them back as a keyset page
//! and a live SSE tail, never exposing a token, code, or secret. Both the list and the
//! tail accept `tenantId`/`actor`/`event` filters so a caller can scope the results.
//!
//! These routes are intentionally unauthenticated for local exploration and MUST be
//! placed behind an admin authorization guard before any non-development deployment
//! (the rows carry emails, IPs, and tenant ids). The role-guard demo wires that
//! authorization.

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
