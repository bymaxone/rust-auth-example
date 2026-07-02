//! End-to-end coverage of the example-owned audit read-API (keyset list + SSE resume)
//! and the diagnostics endpoints (hash strength, force lockout, recent hooks).
#![forbid(unsafe_code)]
#![allow(
    // Integration tests panic to signal failure, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this file.
    clippy::unwrap_used,
    clippy::expect_used
)]

mod common;

use std::time::{Duration, Instant};

use bymax_auth_crypto::password::{PasswordParams, hash};
use serde_json::{Value, json};

/// Insert one masked audit row for a tenant and return its id.
async fn insert_row(app: &common::TestApp, event: &str) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "INSERT INTO audit_log (event, actor_id, actor_email, tenant_id, ip, user_agent) \
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    )
    .bind(event)
    .bind("actor-1")
    .bind(&app.email)
    .bind(&app.tenant_id)
    .bind("203.0.113.9")
    .bind("agent/1.0")
    .fetch_one(&app.pool)
    .await
    .unwrap()
}

#[tokio::test]
async fn audit_keyset_pagination_walks_newest_first() {
    let Some(app) = common::spawn().await else {
        return;
    };
    for i in 0..5 {
        insert_row(&app, &format!("evt-{i}")).await;
    }

    // First page: two newest rows for this tenant, more remaining.
    let page1: Value = app
        .client
        .get(format!("{}/audit/logs", app.base_url))
        .query(&[("tenantId", app.tenant_id.as_str()), ("limit", "2")])
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(page1["data"].as_array().unwrap().len(), 2);
    assert_eq!(page1["hasMore"], true);
    let cursor = page1["nextCursor"].as_i64().expect("a next cursor");

    // Second page continues strictly below the cursor (older rows).
    let page2: Value = app
        .client
        .get(format!("{}/audit/logs", app.base_url))
        .query(&[
            ("tenantId", app.tenant_id.as_str()),
            ("limit", "2"),
            ("cursor", &cursor.to_string()),
        ])
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let first_id_page2 = page2["data"][0]["id"].as_i64().unwrap();
    assert!(first_id_page2 < cursor, "the next page is strictly older");

    // Without an explicit limit the default page size applies and returns every row for
    // the tenant, so no more remain and the cursor is null.
    let full: Value = app
        .client
        .get(format!("{}/audit/logs", app.base_url))
        .query(&[("tenantId", app.tenant_id.as_str())])
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(full["data"].as_array().unwrap().len(), 5);
    assert_eq!(full["hasMore"], false);
    assert!(full["nextCursor"].is_null());
}

#[tokio::test]
async fn audit_stream_resumes_from_last_event_id() {
    let Some(app) = common::spawn().await else {
        return;
    };
    // A marker row; a reconnect just below its id must redeliver exactly it.
    let marker_event = format!("sse-marker-{}", app.tenant_id);
    let marker_id = insert_row(&app, &marker_event).await;

    let mut resp = app
        .client
        .get(format!("{}/audit/stream", app.base_url))
        .header("Last-Event-ID", (marker_id - 1).to_string())
        .send()
        .await
        .unwrap();

    let mut body = String::new();
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(6) {
        match tokio::time::timeout(Duration::from_millis(500), resp.chunk()).await {
            Ok(Ok(Some(chunk))) => {
                body.push_str(&String::from_utf8_lossy(&chunk));
                if body.contains(&marker_event) {
                    break;
                }
            }
            Ok(Ok(None)) | Ok(Err(_)) => break,
            Err(_) => {}
        }
    }
    assert!(
        body.contains(&marker_event),
        "the SSE tail resumes and delivers the row above Last-Event-ID"
    );
    assert!(
        body.contains(&format!("id: {marker_id}")),
        "each SSE event carries the row id as its event id"
    );
}

#[tokio::test]
async fn diagnostics_hash_strength_flags_stale_hashes() {
    let Some(app) = common::spawn().await else {
        return;
    };
    // A legacy `scrypt:hex:hex` hash must be flagged for rehash.
    let legacy: Value = app
        .client
        .post(format!("{}/diagnostics/hash-strength", app.base_url))
        .json(&json!({ "phc": "scrypt:00112233:44556677" }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(legacy["needsRehash"], true);

    // A fresh hash at the current parameters must not need a rehash.
    let fresh_phc = hash(b"correct horse battery staple", &PasswordParams::default()).unwrap();
    let fresh: Value = app
        .client
        .post(format!("{}/diagnostics/hash-strength", app.base_url))
        .json(&json!({ "phc": fresh_phc }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(fresh["needsRehash"], false);
}

#[tokio::test]
async fn diagnostics_force_lockout_locks_the_identifier() {
    let Some(app) = common::spawn().await else {
        return;
    };
    let identifier = format!("lockout-{}", app.tenant_id);
    let result: Value = app
        .client
        .post(format!("{}/diagnostics/force-lockout", app.base_url))
        .json(&json!({ "identifier": identifier }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(result["locked"], true);
    assert!(result["attempts"].as_i64().unwrap() >= 1);
}

#[tokio::test]
async fn diagnostics_recent_hooks_returns_a_masked_view() {
    let Some(app) = common::spawn().await else {
        return;
    };
    let event = format!("recent-{}", app.tenant_id);
    insert_row(&app, &event).await;

    let rows: Value = app
        .client
        .get(format!("{}/diagnostics/hooks", app.base_url))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let array = rows.as_array().expect("an array of rows");
    assert!(!array.is_empty());
    // The masked view exposes the event + actor email, never a secret column.
    assert!(array.iter().all(|row| row.get("event").is_some()));
}
