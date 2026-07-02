//! End-to-end coverage of the mounted invitation chain: an authenticated inviter creates
//! an invitation (tenant from claims, never the body), the invite lands in Mailpit via the
//! lettre `send_invitation`, and acceptance issues a live session and audits
//! `after_invitation_accepted` without persisting the invite token.
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

use common::mailpit;

/// The inviter's account password.
const ADMIN_PASSWORD: &str = "Sup3rSecret!pw";
/// The invitee's chosen password (>= 8 chars).
const INVITEE_PASSWORD: &str = "Inv1tee!pw99";
/// The invitation token length (256-bit, hex-encoded).
const INVITE_TOKEN_LEN: usize = 64;
/// The email-verification OTP length.
const OTP_LEN: usize = 6;

#[tokio::test]
async fn invitation_create_email_accept_chain() {
    let Some(app) = common::spawn_engine(|_| {}).await else {
        return;
    };
    let base = &app.base_url;
    let client = &app.client;
    let tenant = &app.tenant_id;
    let admin = &app.email;
    // A unique invitee address for this run (isolated in Mailpit + the shared database).
    let invitee = admin.replace("user-eng", "invitee-eng");

    // register the inviter -> 201.
    let resp = client
        .post(format!("{base}/auth/register"))
        .json(&json!({ "email": admin, "password": ADMIN_PASSWORD, "name": "Inviter", "tenantId": tenant }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 201, "register");

    // Pull the verification OTP from Mailpit and verify the inviter's email.
    let body = mailpit::wait_for_message_to(client, admin)
        .await
        .expect("the verification email arrives");
    let otp = mailpit::extract_digit_run(&body, OTP_LEN).expect("a 6-digit OTP is present");
    let resp = client
        .post(format!("{base}/auth/verify-email"))
        .json(&json!({ "email": admin, "otp": otp, "tenantId": tenant }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 204, "verify-email");

    // login -> 200, capturing the inviter's bearer access token.
    let resp = client
        .post(format!("{base}/auth/login"))
        .json(&json!({ "email": admin, "password": ADMIN_PASSWORD, "tenantId": tenant }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 200, "login");
    let login: serde_json::Value = resp.json().await.unwrap();
    let access = login["accessToken"]
        .as_str()
        .expect("accessToken")
        .to_owned();

    // POST /auth/invitations without a token -> 401 (the route is guarded by AuthUser).
    let resp = client
        .post(format!("{base}/auth/invitations"))
        .json(&json!({ "email": invitee, "role": "user" }))
        .send()
        .await
        .unwrap();
    assert_eq!(
        resp.status().as_u16(),
        401,
        "unguarded invitation create is rejected"
    );

    // POST /auth/invitations with the bearer token -> 204. No `tenantId` is sent; the
    // engine takes the tenant from the inviter's claims.
    let resp = client
        .post(format!("{base}/auth/invitations"))
        .bearer_auth(&access)
        .json(&json!({ "email": invitee, "role": "user", "tenantName": "Acme" }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 204, "invitation create");

    // Extract the single-use invite token from the invitation email.
    let body = mailpit::wait_for_message_to(client, &invitee)
        .await
        .expect("the invitation email arrives");
    let token = mailpit::extract_hex_run(&body, INVITE_TOKEN_LEN)
        .expect("a 64-hex invite token is present");

    // accept -> 201, issuing a live session for the new user.
    let resp = client
        .post(format!("{base}/auth/invitations/accept"))
        .json(&json!({ "token": token, "name": "New Member", "password": INVITEE_PASSWORD }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 201, "invitation accept");
    let accepted: serde_json::Value = resp.json().await.unwrap();
    assert!(
        accepted["accessToken"]
            .as_str()
            .is_some_and(|token| !token.is_empty()),
        "acceptance issues a session"
    );

    // A second accept of the same token is rejected (single-use).
    let resp = client
        .post(format!("{base}/auth/invitations/accept"))
        .json(&json!({ "token": token, "name": "Replay", "password": INVITEE_PASSWORD }))
        .send()
        .await
        .unwrap();
    assert!(
        resp.status().as_u16() >= 400,
        "a replayed invitation token is rejected, got {}",
        resp.status()
    );

    // The acceptance is audited; poll until the detached hook row lands, then prove the
    // invite token never reached the audit log.
    let mut blob = String::new();
    for _ in 0..40 {
        let count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM audit_log WHERE tenant_id = $1 AND event = 'after_invitation_accepted'",
        )
        .bind(tenant)
        .fetch_one(&app.pool)
        .await
        .unwrap();
        if count >= 1 {
            blob = sqlx::query_scalar::<_, Option<String>>(
                "SELECT string_agg( \
                    event || ' ' || coalesce(actor_id, '') || ' ' || coalesce(actor_email, '') \
                    || ' ' || coalesce(ip, '') || ' ' || coalesce(user_agent, '') \
                    || ' ' || coalesce(metadata::text, ''), ' ') \
                 FROM audit_log WHERE tenant_id = $1",
            )
            .bind(tenant)
            .fetch_one(&app.pool)
            .await
            .unwrap()
            .unwrap_or_default();
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert!(
        blob.contains("after_invitation_accepted"),
        "the acceptance was audited"
    );
    assert!(
        !blob.contains(&token),
        "the invite token must never appear in an audit row"
    );
}
