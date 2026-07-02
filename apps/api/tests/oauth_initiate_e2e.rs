//! End-to-end coverage of the mounted OAuth initiate/callback surface once Google is
//! wired: `GET /auth/oauth/google` mints a Google authorize `302` carrying PKCE + a
//! single-use `state`, an unknown provider maps to `auth.oauth_failed`, and a forged
//! `state` on the callback is rejected without consuming any resource.
#![forbid(unsafe_code)]
#![allow(
    // Integration tests panic to signal failure, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this file.
    clippy::unwrap_used,
    clippy::expect_used
)]

mod common;

/// Read the `Location` header of a response as a string.
fn location(response: &reqwest::Response) -> String {
    response
        .headers()
        .get("location")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_owned()
}

#[tokio::test]
async fn oauth_initiate_redirects_to_google_with_pkce_and_state() {
    let Some(app) = common::spawn_engine(common::with_google_oauth).await else {
        return;
    };
    let base = &app.base_url;
    let client = &app.client;
    let tenant = &app.tenant_id;

    // initiate -> 302 to Google carrying state + an S256 PKCE challenge.
    let resp = client
        .get(format!("{base}/auth/oauth/google"))
        .query(&[("tenantId", tenant.as_str())])
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 302, "initiate redirects");
    let target = location(&resp);
    assert!(
        target.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"),
        "redirects to the Google authorize endpoint: {target}"
    );
    assert!(
        target.contains("code_challenge="),
        "carries a PKCE challenge"
    );
    assert!(
        target.contains("code_challenge_method=S256"),
        "the challenge is S256"
    );
    // The state is a 64-hex CSRF nonce carried in the authorize URL.
    let state = target
        .split('&')
        .find_map(|pair| pair.strip_prefix("state="))
        .unwrap_or_default();
    assert_eq!(state.len(), 64, "state is a 64-hex nonce: {state}");
    assert!(state.bytes().all(|b| b.is_ascii_hexdigit()));

    // An unknown provider fails as auth.oauth_failed without minting any state.
    let resp = client
        .get(format!("{base}/auth/oauth/unknown"))
        .query(&[("tenantId", tenant.as_str())])
        .send()
        .await
        .unwrap();
    assert_eq!(
        resp.status().as_u16(),
        401,
        "unknown provider is unauthorized"
    );
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["error"]["code"], "auth.oauth_failed");
}

#[tokio::test]
async fn oauth_callback_rejects_a_forged_state() {
    let Some(app) = common::spawn_engine(common::with_google_oauth).await else {
        return;
    };
    let base = &app.base_url;
    let client = &app.client;

    // A never-issued (forged) state on the callback is rejected. With an error redirect
    // configured, the failure surfaces as a 302 to that target carrying `error=oauth_failed`
    // — the client never learns which step failed, and no provider exchange is attempted.
    let resp = client
        .get(format!("{base}/auth/oauth/google/callback"))
        .query(&[("code", "irrelevant"), ("state", &"f".repeat(64))])
        .send()
        .await
        .unwrap();
    assert_eq!(
        resp.status().as_u16(),
        302,
        "a forged state redirects to the error target"
    );
    let target = location(&resp);
    assert!(
        target.contains("error=oauth_failed"),
        "the error redirect carries the opaque code: {target}"
    );
}
