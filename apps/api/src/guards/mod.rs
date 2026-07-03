//! Example-owned request guards that gate the example's own domain routes.
//!
//! The library ships guard extractors (`AuthUser`, `RequireRole<R>`, `PlatformUser`), but
//! they resolve against the library's private `AuthState`, which a downstream consumer
//! cannot construct — so the example cannot host an extractor-typed route directly. These
//! guards close that gap without reimplementing any security logic: each one sources the
//! bearer credential from the `Authorization` header (exactly as the library accepts it
//! under bearer/both delivery) and delegates every decision to the engine — HS256-pinned,
//! type-checked, revocation-checked token verification (`verify_access_token` /
//! `verify_platform_token`) and the configured role hierarchy (`role_satisfies`). No token
//! parsing, signature check, or role logic is duplicated here.

use axum::extract::{FromRef, FromRequestParts};
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use bymax_auth_types::{AuthError, DashboardClaims, PlatformClaims};

use crate::app::AppState;
use crate::error::AppError;

/// The dashboard role that gates the example's audit read-API. Matches a key in the
/// configured dashboard role hierarchy; the engine resolves transitive satisfaction.
const AUDIT_ADMIN_ROLE: &str = "admin";

/// The platform role that gates the example's platform-only diagnostics route. Matches a key
/// in the configured platform role hierarchy; the engine resolves transitive satisfaction, so
/// a lesser platform role (e.g. `support`) does not satisfy it.
const PLATFORM_ADMIN_ROLE: &str = "admin";

/// Read the bearer access token from the `Authorization` header, if present and non-empty.
/// The scheme match is case-insensitive, mirroring the library's header parsing. A query
/// string is never consulted — a credential never travels in the URL.
fn bearer_token(parts: &Parts) -> Option<String> {
    let value = parts.headers.get(AUTHORIZATION)?.to_str().ok()?;
    let (scheme, rest) = value.split_once(' ')?;
    if !scheme.eq_ignore_ascii_case("Bearer") {
        return None;
    }
    let token = rest.trim();
    if token.is_empty() {
        None
    } else {
        Some(token.to_owned())
    }
}

/// Requires an authenticated dashboard user of any role (the `AuthUser` equivalent).
/// Carries the verified claims for the handler.
#[derive(Debug, Clone)]
pub struct DashboardUser(pub DashboardClaims);

impl<S> FromRequestParts<S> for DashboardUser
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app = AppState::from_ref(state);
        let token = bearer_token(parts).ok_or(AuthError::TokenMissing)?;
        let claims = app.engine.verify_access_token(&token).await?;
        Ok(Self(claims))
    }
}

/// Requires an authenticated dashboard **admin** (the `RequireRole<Admin>` equivalent):
/// a valid dashboard token whose role satisfies `admin` under the dashboard hierarchy.
/// Rejects an unauthenticated request with `401` and an insufficient role with `403`.
#[derive(Debug, Clone)]
pub struct DashboardAdmin(pub DashboardClaims);

impl<S> FromRequestParts<S> for DashboardAdmin
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app = AppState::from_ref(state);
        let token = bearer_token(parts).ok_or(AuthError::TokenMissing)?;
        let claims = app.engine.verify_access_token(&token).await?;
        if app.engine.role_satisfies(&claims.role, AUDIT_ADMIN_ROLE) {
            Ok(Self(claims))
        } else {
            Err(AppError::Auth(AuthError::InsufficientRole))
        }
    }
}

/// Requires a platform token whose role satisfies `admin` under the platform hierarchy: a
/// valid platform token (`type == platform`) presenting a role that transitively includes
/// `admin`. An unauthenticated (or non-platform) request is rejected with `401` and a valid
/// platform token of a lesser role (e.g. `support`) with `403`. A dashboard token fails the
/// platform verification and is rejected — the two token families never cross over.
#[derive(Debug, Clone)]
pub struct PlatformAdmin(pub PlatformClaims);

impl<S> FromRequestParts<S> for PlatformAdmin
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app = AppState::from_ref(state);
        let token = bearer_token(parts).ok_or(AuthError::PlatformAuthRequired)?;
        // A token-authentication failure (a dashboard/invalid/expired/revoked token) is
        // "platform auth required" (401); an infrastructure failure propagates unchanged so
        // it never masquerades as an auth failure.
        let claims = app
            .engine
            .verify_platform_token(&token)
            .await
            .map_err(map_platform_error)?;
        // The token is a valid platform token; require its role to satisfy `admin` under the
        // platform hierarchy, so a lesser platform role (e.g. `support`) is refused with `403`.
        if app
            .engine
            .platform_role_satisfies(&claims.role, PLATFORM_ADMIN_ROLE)
        {
            Ok(Self(claims))
        } else {
            Err(AppError::Auth(AuthError::InsufficientRole))
        }
    }
}

/// Collapse a platform token-authentication failure to `PlatformAuthRequired` (401),
/// mirroring the library's platform guard; every other error (notably `Internal`) is
/// propagated unchanged so an outage surfaces as a 500, not a masked 401.
fn map_platform_error(error: AuthError) -> AuthError {
    match error {
        AuthError::TokenInvalid | AuthError::TokenExpired | AuthError::TokenRevoked => {
            AuthError::PlatformAuthRequired
        }
        other => other,
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
    use axum::http::Request;

    /// Build request parts carrying a single `Authorization` header value.
    fn parts_with_authorization(value: &str) -> Parts {
        Request::builder()
            .header(AUTHORIZATION, value)
            .body(())
            .expect("a well-formed request builds")
            .into_parts()
            .0
    }

    #[test]
    fn bearer_token_reads_a_bearer_credential_case_insensitively() {
        // The happy path: a `Bearer <token>` header (any scheme casing) yields the token.
        let parts = parts_with_authorization("bEaRer  the-access-token");
        assert_eq!(bearer_token(&parts).as_deref(), Some("the-access-token"));
    }

    #[test]
    fn bearer_token_rejects_a_non_bearer_scheme() {
        // A different auth scheme (e.g. HTTP Basic) is not a bearer credential, so the
        // guard sees no token and rejects the request as unauthenticated.
        let parts = parts_with_authorization("Basic dXNlcjpwYXNzd29yZA==");
        assert!(bearer_token(&parts).is_none());
    }

    #[test]
    fn bearer_token_rejects_an_empty_token_after_the_scheme() {
        // A `Bearer` scheme with only whitespace after it carries no credential, so it is
        // treated as missing rather than as an empty-string token.
        let parts = parts_with_authorization("Bearer    ");
        assert!(bearer_token(&parts).is_none());
    }

    #[test]
    fn bearer_token_rejects_a_scheme_without_a_separator() {
        // A header value with no space cannot split into scheme + credential.
        let parts = parts_with_authorization("Bearer");
        assert!(bearer_token(&parts).is_none());
    }

    #[test]
    fn bearer_token_is_absent_when_no_header_is_present() {
        // No `Authorization` header at all is simply an absent credential.
        let parts = Request::builder()
            .body(())
            .expect("a well-formed request builds")
            .into_parts()
            .0;
        assert!(bearer_token(&parts).is_none());
    }

    #[test]
    fn map_platform_error_collapses_token_failures_to_platform_auth_required() {
        // A token-authentication failure (invalid, expired, or revoked) is reported as the
        // platform 401, mirroring the library's platform guard.
        for error in [
            AuthError::TokenInvalid,
            AuthError::TokenExpired,
            AuthError::TokenRevoked,
        ] {
            assert!(matches!(
                map_platform_error(error),
                AuthError::PlatformAuthRequired
            ));
        }
    }

    #[test]
    fn map_platform_error_passes_an_internal_error_through_unchanged() {
        // An infrastructure failure must propagate as-is so an outage surfaces as a 500,
        // never masked as a 401 that would hide the real fault from operators.
        let internal = AuthError::Internal(Box::<dyn std::error::Error + Send + Sync>::from(
            "database pool exhausted",
        ));
        assert!(matches!(
            map_platform_error(internal),
            AuthError::Internal(_)
        ));
    }
}
