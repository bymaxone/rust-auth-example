//! The example-owned diagnostics surface.
//!
//! Dev-facing endpoints that expose the engine's server-only primitives — password
//! rehash strength, brute-force lockout, and the recent hook-event stream — so they
//! can be exercised and observed from the console.

pub mod routes;

use axum::Router;
use axum::routing::{get, post};

use crate::app::AppState;

/// The diagnostics route group.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/diagnostics/hash-strength", post(routes::hash_strength))
        .route("/diagnostics/force-lockout", post(routes::force_lockout))
        .route("/diagnostics/hooks", get(routes::recent_hooks))
}
