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
    // The audit read-API is admin-gated; mint an admin token under an isolated tenant so its
    // own login audit row does not pollute this tenant's count.
    let admin = common::dashboard_admin_token_isolated(&app).await;
    for i in 0..5 {
        insert_row(&app, &format!("evt-{i}")).await;
    }

    // First page: two newest rows for this tenant, more remaining.
    let page1: Value = app
        .client
        .get(format!("{}/audit/logs", app.base_url))
        .bearer_auth(&admin)
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
        .bearer_auth(&admin)
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
        .bearer_auth(&admin)
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
    let admin = common::dashboard_admin_token_isolated(&app).await;

    let mut resp = app
        .client
        .get(format!("{}/audit/stream", app.base_url))
        .bearer_auth(&admin)
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
async fn diagnostics_force_lockout_reports_a_countdown_and_reset_clears_it() {
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
    // A locked identifier reports a positive remaining-lockout countdown.
    assert!(
        result["remainingLockoutSecs"].as_u64().unwrap() > 0,
        "a locked identifier reports a countdown"
    );

    // Reset clears the lock: a fresh force-lockout run starts from zero prior failures.
    let reset: Value = app
        .client
        .post(format!("{}/diagnostics/reset-lockout", app.base_url))
        .json(&json!({ "identifier": identifier }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(reset["locked"], false, "reset clears the lockout");
}

#[tokio::test]
async fn diagnostics_hook_log_exposes_only_masked_fields() {
    let Some(app) = common::spawn().await else {
        return;
    };
    // Drive a registration so the hook log has fresh rows, and capture the emailed OTP the
    // masked view must never carry.
    let email = &app.email;
    let tenant = &app.tenant_id;
    app.client
        .post(format!("{}/auth/register", app.base_url))
        .json(&json!({ "email": email, "password": "Sup3rSecret!pw", "name": "Hook User", "tenantId": tenant }))
        .send()
        .await
        .unwrap();
    let otp = app
        .verification_otps
        .lock()
        .unwrap()
        .get(email)
        .cloned()
        .expect("the verification OTP was captured");

    // The only fields a hook row may expose — a projection over safe columns, never a
    // token, code, or secret. `details` is the masked context payload (empty today).
    const ALLOWED_FIELDS: [&str; 7] = [
        "id",
        "event",
        "actor",
        "tenantId",
        "ip",
        "createdAt",
        "details",
    ];

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
    assert!(!array.is_empty(), "the hook log returns recent rows");
    for row in array {
        let object = row.as_object().expect("each row is an object");
        assert!(object.contains_key("event"), "each row carries an event");
        // The masked context payload is always an object and is empty (the hooks write no
        // metadata), so it can never carry a secret.
        assert_eq!(
            object.get("details").and_then(Value::as_object),
            Some(&serde_json::Map::new()),
            "details is an empty, masked object"
        );
        for key in object.keys() {
            assert!(
                ALLOWED_FIELDS.contains(&key.as_str()),
                "the hook view must expose only masked fields, found `{key}`"
            );
        }
    }
    // The emailed OTP never appears in the masked view (the never-log-secrets invariant).
    assert!(
        !rows.to_string().contains(&otp),
        "the hook log must never contain the emailed OTP"
    );
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
    // The masked view exposes the event + display actor, never a secret column.
    assert!(array.iter().all(|row| row.get("event").is_some()));
    assert!(array.iter().all(|row| row.get("actor").is_some()));
}

#[tokio::test]
async fn audit_aggregate_returns_the_auth_health_shape() {
    let Some(app) = common::spawn().await else {
        return;
    };
    // The aggregate is admin-gated; an isolated admin keeps this run's own login row out of
    // the caller's tenant. The endpoint reads the whole-population `users` state, so the
    // assertions bound each field rather than pin an exact value.
    let admin = common::dashboard_admin_token_isolated(&app).await;

    let body: Value = app
        .client
        .get(format!("{}/audit/aggregate", app.base_url))
        .bearer_auth(&admin)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    // Every field the Overview consumes is present with the right type/range.
    let login = body["loginSuccessRate"].as_f64().expect("loginSuccessRate");
    let verify = body["verifySuccessRate"]
        .as_f64()
        .expect("verifySuccessRate");
    let mfa = body["mfaEnrolledShare"].as_f64().expect("mfaEnrolledShare");
    assert!((0.0..=1.0).contains(&login), "login rate is a 0..1 share");
    assert!((0.0..=1.0).contains(&verify), "verify rate is a 0..1 share");
    assert!((0.0..=1.0).contains(&mfa), "mfa share is a 0..1 value");
    assert!(
        body["activeSessions"].as_i64().expect("activeSessions") >= 0,
        "active sessions is a non-negative count"
    );
    assert_eq!(
        body["emailProvider"], "mailpit",
        "the test stack resolves the Mailpit transport"
    );
    assert!(
        body["oauthGoogleEnabled"].is_boolean(),
        "oauthGoogleEnabled is a boolean"
    );
}

#[tokio::test]
async fn audit_aggregate_is_admin_gated() {
    let Some(app) = common::spawn().await else {
        return;
    };
    // An unauthenticated request is refused before any query runs.
    let anon = app
        .client
        .get(format!("{}/audit/aggregate", app.base_url))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status().as_u16(), 401, "anonymous is refused");

    // A non-admin dashboard token is forbidden.
    let user_email = format!("agg-user-{}@example.test", app.tenant_id);
    let user = common::dashboard_access_token_with_role(&app, &user_email, "user").await;
    let forbidden = app
        .client
        .get(format!("{}/audit/aggregate", app.base_url))
        .bearer_auth(&user)
        .send()
        .await
        .unwrap();
    assert_eq!(forbidden.status().as_u16(), 403, "a non-admin is forbidden");
}
