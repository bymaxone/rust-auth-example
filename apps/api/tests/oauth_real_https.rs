//! Opt-in real-HTTPS smoke test for the example's `TlsHttpClient`. It reaches a live
//! Google `https://` endpoint through rustls + aws-lc-rs, proving the TLS transport works
//! end to end. It is `#[ignore]`-by-default and additionally env-gated, so CI never depends
//! on network access or credentials; run it with `--ignored` once `OAUTH_GOOGLE_*` is set.
#![forbid(unsafe_code)]
#![allow(
    // Integration tests panic to signal failure, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this file.
    clippy::unwrap_used,
    clippy::expect_used
)]

use api::oauth::TlsHttpClient;
use bymax_auth_core::traits::http::{HttpClient, HttpMethod, HttpRequest};

/// Google's public OpenID Connect discovery document — a stable, unauthenticated HTTPS
/// endpoint, ideal for proving the TLS handshake and body read without any credentials.
const DISCOVERY_URL: &str = "https://accounts.google.com/.well-known/openid-configuration";

#[tokio::test]
#[ignore = "requires OAUTH_GOOGLE_* credentials + network; run with --ignored"]
async fn tls_http_client_reaches_google() {
    // Skip gracefully unless the opt-in credentials are configured, so an accidental
    // `--ignored` run in a credential-free environment still passes.
    if std::env::var("OAUTH_GOOGLE_CLIENT_ID").is_err() {
        eprintln!("skipping real-HTTPS test: OAUTH_GOOGLE_CLIENT_ID is not set");
        return;
    }

    let client = TlsHttpClient::new().expect("the TLS client builds");
    let response = client
        .send(HttpRequest {
            method: HttpMethod::Get,
            url: DISCOVERY_URL.to_owned(),
            headers: vec![("accept".to_owned(), "application/json".to_owned())],
            body: None,
        })
        .await
        .expect("the TLS client reaches Google over https");
    assert!(
        (200..400).contains(&response.status),
        "a 2xx/3xx status proves the TLS handshake succeeded, got {}",
        response.status
    );
    assert!(
        !response.body.is_empty(),
        "the discovery document has a body"
    );
}
