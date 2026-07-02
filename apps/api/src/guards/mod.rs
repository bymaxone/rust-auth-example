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

/// Read the bearer access token from the `Authorization` header, if present and non-empty.
/// The scheme match is case-insensitive, mirroring the library's header parsing. A query
/// string is never consulted — a credential never travels in the URL.
fn bearer_token(parts: &Parts) -> Option<String> {
    let value = parts.headers.get(AUTHORIZATION)?.to_str().ok()?;
    let token = value
        .strip_prefix("Bearer ")
        .or_else(|| value.strip_prefix("bearer "))?
        .trim();
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

/// Requires an authenticated platform admin (the `PlatformUser` equivalent): a valid
/// platform token (`type == platform`). A dashboard token presented here fails the platform
/// verification and is rejected — the two token families never cross over.
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
        Ok(Self(claims))
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
