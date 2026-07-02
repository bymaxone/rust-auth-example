//! End-to-end coverage of the mounted `/auth/*` surface: the core flow status codes,
//! the rate-limit `429` + `Retry-After` envelope, and the never-in-audit proof that
//! the emailed verification OTP never lands in an `audit_log` row.
#![forbid(unsafe_code)]
#![allow(
    // Integration tests panic to signal failure, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this file.
    clippy::unwrap_used,
    clippy::expect_used
)]

mod common;

use std::time::Duration;

use serde_json::json;

/// The account password used throughout the flow.
const PASSWORD: &str = "Sup3rSecret!pw";

#[tokio::test]
async fn auth_surface_status_codes_rate_limit_and_masked_audit() {
    let Some(app) = common::spawn().await else {
        return;
    };
    let base = &app.base_url;
    let client = &app.client;
    let tenant = &app.tenant_id;
    let email = &app.email;

    // register -> 201 (a session is issued even with verification pending).
    let resp = client
        .post(format!("{base}/auth/register"))
        .json(&json!({ "email": email, "password": PASSWORD, "name": "Test User", "tenantId": tenant }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 201, "register");

    // The engine "emailed" the verification OTP; the capturing provider recorded it.
    let otp = app
        .verification_otps
        .lock()
        .unwrap()
        .get(email)
        .cloned()
        .expect("the verification OTP was captured");

    // verify-email -> 204.
    let resp = client
        .post(format!("{base}/auth/verify-email"))
        .json(&json!({ "email": email, "otp": otp, "tenantId": tenant }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 204, "verify-email");

    // login -> 200, delivering the bearer tokens in the body (Both mode).
    let resp = client
        .post(format!("{base}/auth/login"))
        .json(&json!({ "email": email, "password": PASSWORD, "tenantId": tenant }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 200, "login");
    let body: serde_json::Value = resp.json().await.unwrap();
    let access = body["accessToken"]
        .as_str()
        .expect("accessToken")
        .to_owned();
    let refresh = body["refreshToken"]
        .as_str()
        .expect("refreshToken")
        .to_owned();

    // me -> 200 with the bearer access token.
    let resp = client
        .get(format!("{base}/auth/me"))
        .bearer_auth(&access)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 200, "me");

    // refresh -> 200, rotating the pair.
    let resp = client
        .post(format!("{base}/auth/refresh"))
        .json(&json!({ "refreshToken": refresh }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 200, "refresh");

    // logout -> 204.
    let resp = client
        .post(format!("{base}/auth/logout"))
        .bearer_auth(&access)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 204, "logout");

    // forgot-password -> 200 even for an unknown account (anti-enumeration).
    let resp = client
        .post(format!("{base}/auth/password/forgot-password"))
        .json(&json!({ "email": "nobody@example.test", "tenantId": tenant }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 200, "forgot-password");

    // Hammering login past the 5/60 limit yields a 429 carrying a Retry-After header.
    let mut throttled = false;
    for _ in 0..12 {
        let resp = client
            .post(format!("{base}/auth/login"))
            .json(&json!({ "email": email, "password": "wrong-password", "tenantId": tenant }))
            .send()
            .await
            .unwrap();
        if resp.status().as_u16() == 429 {
            assert!(
                resp.headers().get("retry-after").is_some(),
                "429 must carry Retry-After"
            );
            throttled = true;
            break;
        }
    }
    assert!(throttled, "the login rate limit must return 429");

    // The lifecycle hooks fire detached, so poll until the run's rows land, then prove
    // the emailed OTP never reached any audit row.
    let mut blob = String::new();
    for _ in 0..40 {
        let count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM audit_log WHERE actor_email = $1")
                .bind(email)
                .fetch_one(&app.pool)
                .await
                .unwrap();
        if count >= 3 {
            blob = sqlx::query_scalar::<_, Option<String>>(
                "SELECT string_agg( \
                    event || ' ' || coalesce(actor_id, '') || ' ' || coalesce(actor_email, '') \
                    || ' ' || coalesce(ip, '') || ' ' || coalesce(user_agent, '') \
                    || ' ' || coalesce(metadata::text, ''), ' ') \
                 FROM audit_log WHERE actor_email = $1",
            )
            .bind(email)
            .fetch_one(&app.pool)
            .await
            .unwrap()
            .unwrap_or_default();
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert!(blob.contains("after_login"), "the login was audited");
    assert!(
        !blob.contains(&otp),
        "the emailed verification OTP must never appear in an audit row"
    );
}
