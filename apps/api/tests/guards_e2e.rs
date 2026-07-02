//! The example's own routes are gated by guards that delegate to the engine — the allowed
//! path answers, and the unauthenticated (`401`), wrong-role (`403`), and cross-domain
//! (`401`/`403`) paths are refused, in both identity domains.
#![forbid(unsafe_code)]
#![allow(
    // Integration tests panic to signal failure, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this file.
    clippy::unwrap_used,
    clippy::expect_used
)]

mod common;

/// The admin-gated audit read-API: an admin dashboard token is allowed, no token is `401`,
/// a non-admin is `403`, and a platform token (wrong domain) is refused.
#[tokio::test]
async fn audit_requires_an_admin_dashboard_token() {
    let Some(app) = common::spawn().await else {
        return;
    };
    let base = &app.base_url;
    let client = &app.client;
    let admin_email = format!("guard-admin-{}@example.test", app.tenant_id);
    let user_email = format!("guard-user-{}@example.test", app.tenant_id);
    let admin = common::dashboard_access_token_with_role(&app, &admin_email, "admin").await;
    let user = common::dashboard_access_token_with_role(&app, &user_email, "user").await;
    let (_id, platform_email) = common::seed_platform_admin(&app.pool).await;
    let platform = common::platform_login(&app, &platform_email).await;

    let url = format!("{base}/audit/logs");

    // An admin dashboard token is allowed.
    let resp = client.get(&url).bearer_auth(&admin).send().await.unwrap();
    assert_eq!(resp.status().as_u16(), 200, "admin -> 200");

    // No token is unauthenticated.
    let resp = client.get(&url).send().await.unwrap();
    assert_eq!(resp.status().as_u16(), 401, "no token -> 401");

    // A non-admin dashboard token is forbidden.
    let resp = client.get(&url).bearer_auth(&user).send().await.unwrap();
    assert_eq!(resp.status().as_u16(), 403, "non-admin -> 403");

    // A platform token cannot satisfy a dashboard guard (wrong domain).
    let resp = client
        .get(&url)
        .bearer_auth(&platform)
        .send()
        .await
        .unwrap();
    assert!(
        matches!(resp.status().as_u16(), 401 | 403),
        "a platform token is refused by the dashboard guard"
    );
}

/// The authenticated-only diagnostics route admits any valid dashboard user and refuses an
/// unauthenticated request.
#[tokio::test]
async fn whoami_requires_any_authenticated_dashboard_user() {
    let Some(app) = common::spawn().await else {
        return;
    };
    let base = &app.base_url;
    let client = &app.client;
    let user = common::dashboard_access_token(&app).await;
    let url = format!("{base}/diagnostics/whoami");

    let resp = client.get(&url).bearer_auth(&user).send().await.unwrap();
    assert_eq!(resp.status().as_u16(), 200, "an authenticated user -> 200");

    let resp = client.get(&url).send().await.unwrap();
    assert_eq!(resp.status().as_u16(), 401, "no token -> 401");
}

/// The platform-only diagnostics route admits a platform admin and refuses a dashboard token
/// (and an unauthenticated request) — the two token families never cross over.
#[tokio::test]
async fn platform_only_route_rejects_a_dashboard_token() {
    let Some(app) = common::spawn().await else {
        return;
    };
    let base = &app.base_url;
    let client = &app.client;
    let (_id, platform_email) = common::seed_platform_admin(&app.pool).await;
    let platform = common::platform_login(&app, &platform_email).await;
    let dashboard = common::dashboard_access_token(&app).await;
    let url = format!("{base}/diagnostics/platform");

    // A platform token is allowed.
    let resp = client
        .get(&url)
        .bearer_auth(&platform)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 200, "platform token -> 200");

    // A dashboard token is refused (wrong domain).
    let resp = client
        .get(&url)
        .bearer_auth(&dashboard)
        .send()
        .await
        .unwrap();
    assert!(
        matches!(resp.status().as_u16(), 401 | 403),
        "a dashboard token cannot reach a platform-only route"
    );

    // No token is unauthenticated.
    let resp = client.get(&url).send().await.unwrap();
    assert_eq!(resp.status().as_u16(), 401, "no token -> 401");
}

/// The platform-admin-gated route enforces the platform role hierarchy, not merely the token
/// family: an `admin` platform token is admitted, while a valid `support` platform token — a
/// lesser role that does not satisfy `admin` — is refused with `403`. This proves cross-role
/// isolation inside the platform domain.
#[tokio::test]
async fn platform_route_enforces_the_admin_role() {
    let Some(app) = common::spawn().await else {
        return;
    };
    let base = &app.base_url;
    let client = &app.client;
    let (_admin_id, admin_email) = common::seed_platform_admin(&app.pool).await;
    let admin = common::platform_login(&app, &admin_email).await;
    let (_support_id, support_email) =
        common::seed_platform_user_with_role(&app.pool, "support").await;
    let support = common::platform_login(&app, &support_email).await;
    let url = format!("{base}/diagnostics/platform");

    // An admin platform token satisfies the `admin` requirement.
    let resp = client.get(&url).bearer_auth(&admin).send().await.unwrap();
    assert_eq!(resp.status().as_u16(), 200, "platform admin -> 200");

    // A valid platform token whose role does not satisfy `admin` is forbidden.
    let resp = client.get(&url).bearer_auth(&support).send().await.unwrap();
    assert_eq!(resp.status().as_u16(), 403, "a lesser platform role -> 403");
}
