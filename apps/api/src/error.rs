//! The example's top-level error type for its own handlers.
//!
//! Library-originated failures render through the adapter's [`error_response`],
//! preserving the canonical `{ "error": { code, message, details } }` envelope and
//! the mapped HTTP status. Every infrastructure failure — a database error or any
//! other boxed source — collapses to an opaque `auth.internal` 500: the source is
//! logged by the adapter, never serialized into the response body, so a connection
//! string or backend detail can never leak to a client.

use axum::response::{IntoResponse, Response};
use bymax_auth_axum::error_response;
use bymax_auth_types::AuthError;

/// The example's top-level error for its own handlers.
///
/// The [`AppError::Auth`] variant is rendered verbatim by the adapter (correct
/// status + stable public error code); every other variant is surfaced opaquely
/// as `auth.internal` (500) so an internal detail is never exposed to the client.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// A typed library failure — rendered verbatim by the adapter.
    #[error(transparent)]
    Auth(#[from] AuthError),
    /// A database failure — surfaced opaquely as `auth.internal` (500).
    #[error("database error")]
    Database(#[source] sqlx::Error),
    /// Any other infrastructure failure — surfaced opaquely as `auth.internal` (500).
    #[error("internal error")]
    Internal(#[source] Box<dyn std::error::Error + Send + Sync>),
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        Self::Database(err)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        match self {
            Self::Auth(err) => error_response(&err),
            // Wrap as `AuthError::Internal` so the wire envelope uses the generic
            // `auth.internal` client message — the source string is never exposed.
            Self::Database(err) => error_response(&AuthError::Internal(Box::new(err))),
            Self::Internal(err) => error_response(&AuthError::Internal(err)),
        }
    }
}

#[cfg(test)]
#[allow(
    // Panicking is the idiomatic failure signal in tests, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this test module only.
    clippy::unwrap_used,
    clippy::expect_used
)]
mod tests {
    use super::*;
    use axum::http::StatusCode;
    use http_body_util::BodyExt as _;

    /// Read a response body into a JSON value for envelope assertions.
    async fn body_json(response: Response) -> serde_json::Value {
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice(&bytes).expect("body must be JSON")
    }

    #[tokio::test]
    async fn auth_error_renders_the_delegated_envelope() {
        // A library error renders verbatim through the adapter: correct status and
        // stable public code, never re-implemented locally.
        let response = AppError::from(AuthError::InvalidCredentials).into_response();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let json = body_json(response).await;
        assert_eq!(json["error"]["code"], "auth.invalid_credentials");
    }

    #[tokio::test]
    async fn internal_error_never_leaks_the_source_string() {
        // The never-leak invariant: an internal source collapses to an opaque 500
        // whose body carries the generic code and none of the source detail.
        let secret = "SECRET-CONNECTION-STRING";
        let response = AppError::Internal(Box::new(std::io::Error::other(secret))).into_response();
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        let json = body_json(response).await;
        assert_eq!(json["error"]["code"], "auth.internal");
        assert!(!json.to_string().contains(secret));
    }

    #[tokio::test]
    async fn database_error_collapses_to_an_opaque_internal_500() {
        // The `Database` arm and the `From<sqlx::Error>` conversion both route to
        // the opaque `auth.internal` envelope — a backend detail never reaches the
        // client.
        let response = AppError::from(sqlx::Error::PoolClosed).into_response();
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        let json = body_json(response).await;
        assert_eq!(json["error"]["code"], "auth.internal");
    }
}
