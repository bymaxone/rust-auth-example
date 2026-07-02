//! Platform-admin domain: the mounted `/auth/platform/*` routes answer over HTTP and the
//! dashboard/platform token families are isolated in both directions.
#![forbid(unsafe_code)]
#![allow(
    // Integration tests panic to signal failure, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this file.
    clippy::unwrap_used,
    clippy::expect_used
)]

mod common;

/// The engine exposes the platform service and repository seam once the domain is enabled,
/// and the five mounted platform routes answer with their documented status codes.
#[tokio::test]
async fn platform_login_me_refresh_logout_sessions() {
    let Some(app) = common::spawn().await else {
        return;
    };

    // The platform domain is enabled, so both seams resolve.
    assert!(
        app.engine.platform_auth().is_some(),
        "the platform auth service resolves once platform.enabled"
    );
    assert!(
        app.engine.platform_user_repository().is_some(),
        "the platform repository seam is wired"
    );

    let (_id, email) = common::seed_platform_admin(&app.pool).await;
    let base = &app.base_url;
    let client = &app.client;

    // login -> 200 with the bearer token pair (Both delivery).
    let resp = client
        .post(format!("{base}/auth/platform/login"))
        .json(&serde_json::json!({ "email": email, "password": common::PLATFORM_ADMIN_PASSWORD }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 200, "platform login");
    let body: serde_json::Value = resp.json().await.unwrap();
    let access = body["accessToken"]
        .as_str()
        .expect("accessToken")
        .to_owned();
    let refresh = body["refreshToken"]
        .as_str()
        .expect("refreshToken")
        .to_owned();
    // The platform safe user is tenant-less: no `tenantId` crosses the wire.
    assert!(
        body["user"].get("tenantId").is_none(),
        "a platform user carries no tenant id"
    );

    // me -> 200 with the bearer access token.
    let resp = client
        .get(format!("{base}/auth/platform/me"))
        .bearer_auth(&access)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 200, "platform me");

    // refresh -> 200, rotating the platform pair.
    let resp = client
        .post(format!("{base}/auth/platform/refresh"))
        .json(&serde_json::json!({ "refreshToken": refresh }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 200, "platform refresh");

    // revoke every platform session -> 204 (before logout, which revokes the token).
    let resp = client
        .delete(format!("{base}/auth/platform/sessions"))
        .bearer_auth(&access)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 204, "platform revoke-all sessions");

    // logout -> 204 (best-effort; tolerates the already-revoked session).
    let resp = client
        .post(format!("{base}/auth/platform/logout"))
        .bearer_auth(&access)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 204, "platform logout");
}

/// A dashboard access token must never satisfy the platform boundary, and a platform token
/// must never satisfy the dashboard boundary — proven both at the engine verify seam and
/// over HTTP against the mounted `me` routes.
#[tokio::test]
async fn dashboard_and_platform_tokens_are_isolated() {
    let Some(app) = common::spawn().await else {
        return;
    };
    let (_id, email) = common::seed_platform_admin(&app.pool).await;
    let base = &app.base_url;
    let client = &app.client;

    let dashboard_token = common::dashboard_access_token(&app).await;
    let platform_token = common::platform_login(&app, &email).await;

    // Engine seam: a dashboard token fails `verify_platform_token`, and a platform token
    // fails `verify_access_token` (distinct `type` discriminators fail deserialization).
    let platform_err = app
        .engine
        .verify_platform_token(&dashboard_token)
        .await
        .expect_err("a dashboard token is not a platform token");
    assert!(
        matches!(platform_err.http_status(), 401 | 403),
        "cross-domain rejection is 401/403, got {}",
        platform_err.http_status()
    );
    let dashboard_err = app
        .engine
        .verify_access_token(&platform_token)
        .await
        .expect_err("a platform token is not a dashboard token");
    assert!(
        matches!(dashboard_err.http_status(), 401 | 403),
        "cross-domain rejection is 401/403, got {}",
        dashboard_err.http_status()
    );

    // Over HTTP: the dashboard token is refused by the platform guard, and the platform
    // token is refused by the dashboard guard.
    let resp = client
        .get(format!("{base}/auth/platform/me"))
        .bearer_auth(&dashboard_token)
        .send()
        .await
        .unwrap();
    assert!(
        matches!(resp.status().as_u16(), 401 | 403),
        "a dashboard token cannot reach /auth/platform/me"
    );

    let resp = client
        .get(format!("{base}/auth/me"))
        .bearer_auth(&platform_token)
        .send()
        .await
        .unwrap();
    assert!(
        matches!(resp.status().as_u16(), 401 | 403),
        "a platform token cannot reach /auth/me"
    );
}
