//! Example-owned platform admin routes — not under `/auth/`.
//!
//! Mounts `GET /platform/users`, a read-only endpoint that returns a
//! credential-free list of all platform admin accounts. The route is guarded by
//! the example's [`crate::guards::PlatformAdmin`] extractor and sits outside the
//! library-owned `/auth/*` namespace, so it is never mistaken for a library route.

pub(crate) mod users;

use axum::Router;
use axum::routing::get;

use crate::app::AppState;

/// Build the example's platform router: `GET /platform/users`.
///
/// This router is unconditionally mounted — the [`crate::guards::PlatformAdmin`]
/// guard enforces authentication and role requirements per request.
pub fn router() -> Router<AppState> {
    Router::new().route("/platform/users", get(users::list_platform_users))
}
