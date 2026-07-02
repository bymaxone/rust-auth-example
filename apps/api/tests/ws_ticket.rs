//! The WebSocket ticket is single-use: `POST /auth/ws-ticket` mints a short-lived ticket,
//! the example `/ws/example` endpoint redeems it exactly once (a replay is rejected), and the
//! access JWT never travels in the URL.
#![forbid(unsafe_code)]
#![allow(
    // Integration tests panic to signal failure, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this file.
    clippy::unwrap_used,
    clippy::expect_used
)]

mod common;

/// The `ws://` base URL for the spawned app, derived from its `http://` base.
fn ws_base(app: &common::TestApp) -> String {
    app.base_url.replacen("http://", "ws://", 1)
}

/// The library `POST /auth/ws-ticket` mint answers for an authenticated user, and the
/// engine redeems a minted ticket exactly once — a replay is rejected (single-use).
#[tokio::test]
async fn ws_ticket_mints_and_is_single_use() {
    let Some(app) = common::spawn().await else {
        return;
    };
    let access = common::dashboard_access_token(&app).await;

    // The mounted mint endpoint returns a ticket for the authenticated session.
    let resp = app
        .client
        .post(format!("{}/auth/ws-ticket", app.base_url))
        .bearer_auth(&access)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 200, "ws-ticket mint");
    let body: serde_json::Value = resp.json().await.unwrap();
    assert!(
        body["ticket"].as_str().is_some_and(|t| !t.is_empty()),
        "the mint returns a non-empty ticket"
    );

    // Engine seam: a minted ticket redeems once and a replay is rejected.
    let claims = app.engine.verify_access_token(&access).await.unwrap();
    let ticket = app.engine.issue_ws_ticket(&claims).await.unwrap();
    let first = app.engine.redeem_ws_ticket(&ticket).await;
    assert!(first.is_ok(), "the first redeem succeeds");
    assert_eq!(
        first.unwrap().sub,
        claims.sub,
        "the redeemed snapshot reconstructs the subject"
    );
    let replay = app.engine.redeem_ws_ticket(&ticket).await;
    assert!(
        replay.is_err(),
        "a replayed ticket is rejected (redeem once)"
    );
}

/// The example endpoint upgrades only with a valid ticket; a replay of the same ticket and an
/// absent ticket are both refused before the upgrade. The JWT is never in the URL.
#[tokio::test]
async fn ws_example_upgrades_once_and_rejects_replay_and_absent() {
    let Some(app) = common::spawn().await else {
        return;
    };
    let access = common::dashboard_access_token(&app).await;

    // Mint a ticket through the library endpoint (the JWT stays in the Authorization header).
    let body: serde_json::Value = app
        .client
        .post(format!("{}/auth/ws-ticket", app.base_url))
        .bearer_auth(&access)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let ticket = body["ticket"].as_str().unwrap().to_owned();
    let ws_base = ws_base(&app);

    // A valid ticket upgrades the connection (the 101 handshake only completes once the
    // ticket has been redeemed inside the handler).
    let connect =
        tokio_tungstenite::connect_async(format!("{ws_base}/ws/example?ticket={ticket}")).await;
    assert!(connect.is_ok(), "a valid ticket upgrades the connection");
    drop(connect);

    // The same ticket is single-use: a second upgrade attempt is refused.
    let replay =
        tokio_tungstenite::connect_async(format!("{ws_base}/ws/example?ticket={ticket}")).await;
    assert!(
        replay.is_err(),
        "a replayed ticket is refused before upgrade"
    );

    // An absent ticket is refused (query extraction fails before any upgrade).
    let absent = tokio_tungstenite::connect_async(format!("{ws_base}/ws/example")).await;
    assert!(
        absent.is_err(),
        "an absent ticket is refused before upgrade"
    );

    // A structurally-present but bogus ticket is refused (redemption fails).
    let bogus =
        tokio_tungstenite::connect_async(format!("{ws_base}/ws/example?ticket=not-a-real-ticket"))
            .await;
    assert!(bogus.is_err(), "a bogus ticket is refused before upgrade");
}
