//! The native `bymax_auth_client::AuthClient` round-tripped against a spawned example
//! server, proving the service-to-service Rust consumer path end to end over real HTTP:
//! the full authenticated lifecycle (`register` -> `me` -> `refresh` -> `logout`) and the
//! MFA branch (`login` returning [`AuthOutcome::MfaRequired`], completed via
//! `mfa_challenge`). The suite skips cleanly when the test-stack env is unset, matching the
//! other integration files.
#![forbid(unsafe_code)]
#![allow(
    // Panicking is the idiomatic failure signal in tests, so the workspace-level
    // `unwrap_used`/`expect_used`/`panic` denials are relaxed for this suite.
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic
)]

mod common;

use bymax_auth_client::{AuthClient, AuthOutcome, LoginRequest, RegisterRequest};
use serde_json::json;

/// The account password used throughout the round-trip.
const PASSWORD: &str = "Sup3rSecret!pw";

/// `register` -> `me` -> `refresh` -> `logout` all succeed through the typed client, and the
/// client's session bookkeeping tracks the stored token pair across the calls.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_client_authenticated_lifecycle() {
    let Some(app) = common::spawn().await else {
        return;
    };
    let client = AuthClient::new(app.base_url.clone());

    let outcome = client
        .register(&RegisterRequest {
            email: app.email.clone(),
            password: PASSWORD.to_owned(),
            name: "Native User".to_owned(),
            tenant_id: app.tenant_id.clone(),
        })
        .await
        .expect("register round-trips");
    assert!(
        matches!(outcome, AuthOutcome::Authenticated(_)),
        "registration issues a session outright (Both delivery)"
    );
    assert!(
        client.has_session(),
        "the token pair is stored on the client"
    );

    let me = client
        .me()
        .await
        .expect("me round-trips with the stored token");
    assert_eq!(me.email, app.email, "me returns the authenticated account");

    client.refresh().await.expect("refresh rotates the pair");
    client
        .me()
        .await
        .expect("me still resolves against the rotated token");

    client.logout().await.expect("logout clears the session");
    assert!(!client.has_session(), "logout drops the stored token pair");
}

/// A login for an MFA-enrolled account returns [`AuthOutcome::MfaRequired`]; submitting the
/// TOTP through `mfa_challenge` completes the authentication and stores the session.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_client_login_returns_mfa_challenge_then_authenticates() {
    let Some(app) = common::spawn().await else {
        return;
    };
    let base = &app.base_url;
    let raw = &app.client;
    let email = &app.email;
    let tenant = &app.tenant_id;

    // Provision a verified, MFA-enrolled account over the raw surface (the typed client does
    // not expose the enrolment routes), so the native `login` can then exercise the challenge.
    let status = raw
        .post(format!("{base}/auth/register"))
        .json(&json!({ "email": email, "password": PASSWORD, "name": "Mfa User", "tenantId": tenant }))
        .send()
        .await
        .unwrap()
        .status();
    assert_eq!(status.as_u16(), 201, "register");

    let otp = app
        .verification_otps
        .lock()
        .unwrap()
        .get(email)
        .cloned()
        .expect("the verification OTP was captured");
    let status = raw
        .post(format!("{base}/auth/verify-email"))
        .json(&json!({ "email": email, "otp": otp, "tenantId": tenant }))
        .send()
        .await
        .unwrap()
        .status();
    assert_eq!(status.as_u16(), 204, "verify-email");

    let login: serde_json::Value = raw
        .post(format!("{base}/auth/login"))
        .json(&json!({ "email": email, "password": PASSWORD, "tenantId": tenant }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let access = login["accessToken"]
        .as_str()
        .expect("access token")
        .to_owned();

    let setup: serde_json::Value = raw
        .post(format!("{base}/auth/mfa/setup"))
        .bearer_auth(&access)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let secret = setup["secret"]
        .as_str()
        .expect("an enrolment secret")
        .to_owned();

    let enable = raw
        .post(format!("{base}/auth/mfa/verify-enable"))
        .bearer_auth(&access)
        .json(&json!({ "code": common::totp_code(&secret, 0).await }))
        .send()
        .await
        .unwrap();
    assert!(enable.status().is_success(), "mfa verify-enable");

    // The typed client now sees the challenge branch on login.
    let client = AuthClient::new(base.clone());
    let outcome = client
        .login(&LoginRequest {
            email: email.clone(),
            password: PASSWORD.to_owned(),
            tenant_id: tenant.clone(),
        })
        .await
        .expect("login round-trips");
    let challenge = match outcome {
        AuthOutcome::MfaRequired(challenge) => challenge,
        AuthOutcome::Authenticated(_) => panic!("an MFA-enrolled login must return a challenge"),
    };
    assert!(challenge.mfa_required, "the challenge flags mfa_required");
    assert!(
        !client.has_session(),
        "a pending challenge does not yet store a session"
    );

    // Completing the challenge with a fresh in-window code authenticates.
    let code = common::totp_code(&secret, 30).await;
    let result = client
        .mfa_challenge(&challenge.mfa_temp_token, &code)
        .await
        .expect("mfa challenge completes the login");
    assert_eq!(
        result.user.email, *email,
        "the challenge authenticates the account"
    );
    assert!(
        client.has_session(),
        "the completed challenge stores the session"
    );
}
