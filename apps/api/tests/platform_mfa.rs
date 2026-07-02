//! Platform MFA runs against the platform identity (`MfaContext::Platform`) and is
//! fail-closed: an MFA-enabled admin is refused a session when the deployment has no MFA
//! surface. TOTP codes are always computed from the enrolment secret, never hard-coded.
#![forbid(unsafe_code)]
#![allow(
    // Integration tests panic to signal failure, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this file.
    clippy::unwrap_used,
    clippy::expect_used
)]

mod common;

/// Enrol a fresh admin in TOTP and return `(access_token, secret)`. Enrolment consumes the
/// code at offset 0, so a caller performs at most one further TOTP-gated step at offset 30
/// to stay within the anti-replay budget of the tight drift window.
async fn enrol_admin_mfa(app: &common::TestApp) -> (String, String) {
    let (_id, email) = common::seed_platform_admin(&app.pool).await;
    let access = common::platform_login(app, &email).await;
    let setup: serde_json::Value = app
        .client
        .post(format!("{}/auth/platform/mfa/setup", app.base_url))
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
    assert!(
        setup["qrCodeUri"].as_str().is_some(),
        "setup returns a QR provisioning URI"
    );
    let code = common::totp_code(&secret, 0).await;
    let resp = app
        .client
        .post(format!("{}/auth/platform/mfa/verify-enable", app.base_url))
        .bearer_auth(&access)
        .json(&serde_json::json!({ "code": code }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 204, "verify-enable");
    (access, secret)
}

/// Full platform enrol → re-login challenge round-trip. The challenge routes through
/// `MfaContext::Platform` and yields a `PlatformAuthResult` — a tenant-less platform session,
/// never a dashboard result.
#[tokio::test]
async fn platform_mfa_setup_enable_challenge_roundtrip() {
    let Some(app) = common::spawn().await else {
        return;
    };
    let (_id, email) = common::seed_platform_admin(&app.pool).await;
    let base = &app.base_url;
    let client = &app.client;

    let access = common::platform_login(&app, &email).await;
    let setup: serde_json::Value = client
        .post(format!("{base}/auth/platform/mfa/setup"))
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

    let code = common::totp_code(&secret, 0).await;
    let resp = client
        .post(format!("{base}/auth/platform/mfa/verify-enable"))
        .bearer_auth(&access)
        .json(&serde_json::json!({ "code": code }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 204, "verify-enable");

    // Re-login now returns an MFA challenge (temp token), not a session.
    let challenge: serde_json::Value = client
        .post(format!("{base}/auth/platform/login"))
        .json(&serde_json::json!({ "email": email, "password": common::PLATFORM_ADMIN_PASSWORD }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        challenge["mfaRequired"], true,
        "an enrolled admin's login returns a challenge"
    );
    let temp = challenge["mfaTempToken"]
        .as_str()
        .expect("a temp token")
        .to_owned();

    // The platform challenge issues a platform session (a fresh in-window code at +1 step).
    let code = common::totp_code(&secret, 30).await;
    let resp = client
        .post(format!("{base}/auth/platform/mfa/challenge"))
        .json(&serde_json::json!({ "mfaTempToken": temp, "code": code }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 200, "platform mfa challenge");
    let body: serde_json::Value = resp.json().await.unwrap();
    assert!(
        body["accessToken"].as_str().is_some(),
        "the challenge issues a platform access token"
    );
    assert!(
        body["user"].get("tenantId").is_none(),
        "a platform MFA result is tenant-less (MfaContext::Platform, not dashboard)"
    );
}

/// The platform `disable` route is mounted and answers 204 for an enrolled admin.
#[tokio::test]
async fn platform_mfa_disable_route_answers() {
    let Some(app) = common::spawn().await else {
        return;
    };
    let (access, secret) = enrol_admin_mfa(&app).await;
    let code = common::totp_code(&secret, 30).await;
    let resp = app
        .client
        .post(format!("{}/auth/platform/mfa/disable", app.base_url))
        .bearer_auth(&access)
        .json(&serde_json::json!({ "code": code }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 204, "platform mfa disable");
}

/// The platform `recovery-codes` route is mounted and returns a fresh code set.
#[tokio::test]
async fn platform_mfa_recovery_codes_route_answers() {
    let Some(app) = common::spawn().await else {
        return;
    };
    let (access, secret) = enrol_admin_mfa(&app).await;
    let code = common::totp_code(&secret, 30).await;
    let resp = app
        .client
        .post(format!("{}/auth/platform/mfa/recovery-codes", app.base_url))
        .bearer_auth(&access)
        .json(&serde_json::json!({ "code": code }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 200, "platform mfa recovery-codes");
    let body: serde_json::Value = resp.json().await.unwrap();
    assert!(
        body["recoveryCodes"]
            .as_array()
            .is_some_and(|codes| !codes.is_empty()),
        "a fresh recovery-code set is returned"
    );
}

/// Fail-closed: `platform.enabled` with no MFA surface must refuse an MFA-enabled admin —
/// the login returns an error, never a `PlatformLoginResult::Success`.
#[tokio::test]
async fn platform_mfa_enabled_admin_refused_when_mfa_unconfigured() {
    let Some((engine, pool)) = common::platform_engine_without_mfa().await else {
        return;
    };
    let (_id, email) = common::seed_platform_admin_mfa_enabled(&pool).await;
    let result = engine
        .platform_login(
            &email,
            common::PLATFORM_ADMIN_PASSWORD,
            "127.0.0.1",
            "integration-test",
        )
        .await;
    assert!(
        !matches!(
            result,
            Ok(bymax_auth_types::PlatformLoginResult::Success(_))
        ),
        "an MFA-enabled admin must never receive a session when MFA is unconfigured"
    );
    assert!(
        result.is_err(),
        "the fail-closed default refuses the login with an error"
    );
}
