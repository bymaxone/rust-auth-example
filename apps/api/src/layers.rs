//! The example's global middleware stack.
//!
//! [`apply_global_layers`] wraps the example's router, outermost-first, with a
//! request-tracing layer, a `WEB_ORIGIN`-allow-listed CORS layer, a set of static
//! security response headers, and a request-body size cap. The authentication
//! adapter applies its own internal stack to the mounted `/auth/*` routes; this
//! stack governs the example's own routes and the merged surface.

use axum::Router;
use axum::http::{HeaderName, HeaderValue, Method, header};
use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::TraceLayer;

use crate::config::Settings;
use crate::error::AppError;

/// The tenant discriminator the browser sends on every dashboard request.
const X_TENANT_ID: HeaderName = HeaderName::from_static("x-tenant-id");
/// Defense-in-depth body cap for the example's own routes (1 MiB).
const MAX_BODY_BYTES: usize = 1024 * 1024;

/// Build the CORS layer from the validated `WEB_ORIGIN` allow-list.
///
/// Credentialed CORS forbids a wildcard origin, so the single configured origin is
/// parsed to an exact `HeaderValue`; `x-tenant-id` is allowed inbound and
/// `Retry-After` is exposed so the browser can read the rate-limit countdown.
///
/// # Errors
///
/// Returns [`AppError::Internal`] when `WEB_ORIGIN` is not a valid header value.
pub fn cors_layer(settings: &Settings) -> Result<CorsLayer, AppError> {
    let origin = settings
        .web_origin
        .parse::<HeaderValue>()
        .map_err(|err| AppError::Internal(Box::new(err)))?;
    Ok(CorsLayer::new()
        .allow_origin(origin)
        .allow_credentials(true)
        .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION, X_TENANT_ID])
        .expose_headers([header::RETRY_AFTER]))
}

/// Wrap a router with the example's global middleware, outermost-first.
///
/// # Errors
///
/// Returns [`AppError::Internal`] when the CORS layer cannot be built from the
/// configured `WEB_ORIGIN`.
pub fn apply_global_layers(router: Router, settings: &Settings) -> Result<Router, AppError> {
    let cors = cors_layer(settings)?;
    // Layered innermost-last: the body-limit runs closest to the handler, then the
    // static security headers, the CORS layer, and finally the trace layer wrap
    // outward — so tracing is the outermost layer and records every request first
    // (including a CORS preflight).
    let router = router
        .layer(RequestBodyLimitLayer::new(MAX_BODY_BYTES))
        .layer(SetResponseHeaderLayer::overriding(
            header::REFERRER_POLICY,
            HeaderValue::from_static("no-referrer"),
        ))
        // Ignored by browsers over plain HTTP; enforces HTTPS once served behind TLS.
        .layer(SetResponseHeaderLayer::overriding(
            header::STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static("max-age=63072000; includeSubDomains"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("x-frame-options"),
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("x-content-type-options"),
            HeaderValue::from_static("nosniff"),
        ))
        .layer(cors)
        .layer(TraceLayer::new_for_http());
    Ok(router)
}

#[cfg(test)]
#[allow(
    // Panicking is the idiomatic failure signal in tests, so the workspace-level
    // `unwrap_used` denial is relaxed for this test module only.
    clippy::unwrap_used
)]
mod tests {
    use super::*;
    use crate::config::{EmailProviderKind, RuntimeEnvironment};
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use axum::routing::get;
    use secrecy::SecretString;
    use tower::ServiceExt as _;

    /// The origin the browser sends on every dashboard request in these tests.
    const ORIGIN: &str = "http://localhost:3000";

    /// Build a minimal `Settings` with the given `web_origin` for layer tests.
    fn settings(web_origin: &str) -> Settings {
        Settings {
            api_port: 4000,
            app_env: RuntimeEnvironment::Development,
            log_level: "info".to_string(),
            database_url: "postgres://localhost/example".to_string(),
            redis_url: "redis://localhost:6379".to_string(),
            redis_namespace: "rust_auth_example".to_string(),
            jwt_secret: SecretString::from("x".repeat(64)),
            mfa_encryption_key: SecretString::from(
                "ZGV2X29ubHlfbG9jYWxfMzJfYnl0ZV9rZXlfMDAwMDA=".to_string(),
            ),
            web_origin: web_origin.to_string(),
            email_provider: EmailProviderKind::Mailpit,
            smtp_host: "localhost".to_string(),
            smtp_port: 1025,
            smtp_from: "no-reply@auth.local".to_string(),
            resend_api_key: None,
            oauth_google_client_id: None,
            oauth_google_client_secret: None,
            oauth_google_callback_url: None,
        }
    }

    /// A tiny router that answers `GET /` with `200`.
    fn base_router() -> Router {
        Router::new().route("/", get(|| async {}))
    }

    #[tokio::test]
    async fn preflight_echoes_origin_and_allows_the_tenant_header() {
        // A credentialed preflight echoes the exact configured origin (never `*`)
        // and lists the tenant header the browser needs to send.
        let router = apply_global_layers(base_router(), &settings(ORIGIN)).unwrap();
        let response = router
            .oneshot(
                Request::builder()
                    .method(Method::OPTIONS)
                    .uri("/")
                    .header(header::ORIGIN, ORIGIN)
                    .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
                    .header(header::ACCESS_CONTROL_REQUEST_HEADERS, "x-tenant-id")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let headers = response.headers();
        assert_eq!(
            headers
                .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                .and_then(|v| v.to_str().ok()),
            Some(ORIGIN)
        );
        assert!(
            headers
                .get(header::ACCESS_CONTROL_ALLOW_HEADERS)
                .and_then(|v| v.to_str().ok())
                .is_some_and(|v| v.contains("x-tenant-id"))
        );
    }

    #[tokio::test]
    async fn actual_response_exposes_retry_after_and_security_headers() {
        // A real cross-origin response exposes `Retry-After` (so the browser can
        // read the rate-limit countdown) and carries the static security headers.
        let router = apply_global_layers(base_router(), &settings(ORIGIN)).unwrap();
        let response = router
            .oneshot(
                Request::builder()
                    .uri("/")
                    .header(header::ORIGIN, ORIGIN)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let headers = response.headers();
        assert!(
            headers
                .get(header::ACCESS_CONTROL_EXPOSE_HEADERS)
                .and_then(|v| v.to_str().ok())
                .is_some_and(|v| v.to_ascii_lowercase().contains("retry-after"))
        );
        assert_eq!(
            headers
                .get(HeaderName::from_static("x-content-type-options"))
                .and_then(|v| v.to_str().ok()),
            Some("nosniff")
        );
        assert_eq!(
            headers
                .get(HeaderName::from_static("x-frame-options"))
                .and_then(|v| v.to_str().ok()),
            Some("DENY")
        );
        assert_eq!(
            headers
                .get(header::REFERRER_POLICY)
                .and_then(|v| v.to_str().ok()),
            Some("no-referrer")
        );
        assert!(
            headers
                .get(header::STRICT_TRANSPORT_SECURITY)
                .and_then(|v| v.to_str().ok())
                .is_some_and(|v| v.contains("max-age="))
        );
    }

    #[test]
    fn unparseable_web_origin_is_rejected() {
        // A malformed `WEB_ORIGIN` (a control character is not a valid header value)
        // surfaces as the opaque internal error rather than a panic.
        let result = cors_layer(&settings("http://localhost:3000\n"));
        assert!(matches!(result, Err(AppError::Internal(_))));
    }
}
