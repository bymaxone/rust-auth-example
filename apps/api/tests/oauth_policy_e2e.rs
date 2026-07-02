//! Drives the concrete `on_oauth_login` Create/Link/Reject policy through the live engine
//! (real `AuditAuthHooks` + a `MockOAuthProvider`): an unseen verified email creates a
//! user, a matching active account links, a not-active match is rejected — and every
//! decision writes a masked audit row that holds no OAuth token or `provider_id`.
#![forbid(unsafe_code)]
#![allow(
    // Integration tests panic to signal failure, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this file.
    clippy::unwrap_used,
    clippy::expect_used
)]

mod common;

use std::collections::BTreeMap;

use bymax_auth_core::OAuthOutcome;
use bymax_auth_core::context::RequestContext;
use bymax_auth_types::AuthError;
use sqlx::PgPool;

/// The canned identity the `MockOAuthProvider` returns on every callback.
const MOCK_PROVIDER_ID: &str = "mock-123";
/// The canned verified email the mock profile carries.
const MOCK_EMAIL: &str = "mock@example.com";
/// The canned access token the mock exchange returns; it must never reach the audit log.
const MOCK_ACCESS_TOKEN: &str = "mock-access";

/// Recover the `state` query parameter from a mock authorize URL.
fn state_of(url: &str) -> String {
    url.split_once('?')
        .map(|(_, query)| query)
        .unwrap_or_default()
        .split('&')
        .find_map(|pair| pair.strip_prefix("state="))
        .unwrap_or_default()
        .to_owned()
}

/// A fresh request context for a callback.
fn ctx() -> RequestContext {
    RequestContext::new("203.0.113.4", "agent/1.0", BTreeMap::new())
}

/// Seed a user already bound to the mock Google identity, with the given status.
async fn seed_oauth_user(pool: &PgPool, tenant: &str, status: &str) -> String {
    sqlx::query_scalar::<_, String>(
        "INSERT INTO users (email, name, role, status, tenant_id, email_verified, \
             oauth_provider, oauth_provider_id) \
         VALUES ($1, 'Existing', 'user', $2, $3, true, 'google', $4) RETURNING id",
    )
    .bind(MOCK_EMAIL)
    .bind(status)
    .bind(tenant)
    .bind(MOCK_PROVIDER_ID)
    .fetch_one(pool)
    .await
    .expect("seed the oauth user")
}

/// Count `audit_log` rows for `tenant` with the given event.
async fn audit_event_count(pool: &PgPool, tenant: &str, event: &str) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM audit_log WHERE tenant_id = $1 AND event = $2",
    )
    .bind(tenant)
    .bind(event)
    .fetch_one(pool)
    .await
    .expect("count audit rows")
}

/// Concatenate every textual column of `tenant`'s audit rows, to prove no secret leaked.
async fn audit_blob(pool: &PgPool, tenant: &str) -> String {
    sqlx::query_scalar::<_, Option<String>>(
        "SELECT string_agg( \
             event || ' ' || coalesce(actor_id, '') || ' ' || coalesce(actor_email, '') \
             || ' ' || coalesce(ip, '') || ' ' || coalesce(user_agent, '') \
             || ' ' || coalesce(metadata::text, ''), ' ') \
         FROM audit_log WHERE tenant_id = $1",
    )
    .bind(tenant)
    .fetch_one(pool)
    .await
    .expect("aggregate audit rows")
    .unwrap_or_default()
}

#[tokio::test]
async fn callback_creates_an_unseen_verified_email() {
    let Some(stack) = common::oauth_policy_stack().await else {
        return;
    };
    let tenant = &stack.tenant_id;

    let url = stack
        .engine
        .oauth_initiate("google", tenant)
        .await
        .expect("initiate mints state");
    let outcome = stack
        .engine
        .oauth_callback("google", "auth-code", &state_of(&url), &ctx())
        .await
        .expect("the callback authenticates");
    assert!(matches!(outcome, OAuthOutcome::Authenticated(_)));

    // A verified user was provisioned from the profile.
    let created = sqlx::query_scalar::<_, bool>(
        "SELECT email_verified FROM users \
         WHERE tenant_id = $1 AND oauth_provider = 'google' AND oauth_provider_id = $2",
    )
    .bind(tenant)
    .bind(MOCK_PROVIDER_ID)
    .fetch_one(&stack.pool)
    .await
    .expect("the created user exists");
    assert!(created, "the created OAuth account is email-verified");

    // The decision was audited, and no OAuth token or provider id leaked into any row.
    assert_eq!(
        audit_event_count(&stack.pool, tenant, "oauth_login_create").await,
        1
    );
    let blob = audit_blob(&stack.pool, tenant).await;
    assert!(
        !blob.contains(MOCK_ACCESS_TOKEN),
        "no access token in the audit log"
    );
    assert!(
        !blob.contains(MOCK_PROVIDER_ID),
        "no provider id in the audit log"
    );
}

#[tokio::test]
async fn callback_links_a_matching_active_account() {
    let Some(stack) = common::oauth_policy_stack().await else {
        return;
    };
    let tenant = &stack.tenant_id;
    let seeded = seed_oauth_user(&stack.pool, tenant, "active").await;

    let url = stack.engine.oauth_initiate("google", tenant).await.unwrap();
    let outcome = stack
        .engine
        .oauth_callback("google", "auth-code", &state_of(&url), &ctx())
        .await
        .expect("the callback authenticates");
    assert!(
        matches!(&outcome, OAuthOutcome::Authenticated(_)),
        "a matching active account must authenticate"
    );
    let OAuthOutcome::Authenticated(result) = outcome else {
        return;
    };
    assert_eq!(
        result.user.id, seeded,
        "the existing account is linked, not duplicated"
    );

    // Exactly one account carries the identity, and the link decision was audited.
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM users \
         WHERE tenant_id = $1 AND oauth_provider = 'google' AND oauth_provider_id = $2",
    )
    .bind(tenant)
    .bind(MOCK_PROVIDER_ID)
    .fetch_one(&stack.pool)
    .await
    .unwrap();
    assert_eq!(count, 1, "no duplicate account was created");
    assert_eq!(
        audit_event_count(&stack.pool, tenant, "oauth_login_link").await,
        1
    );
}

#[tokio::test]
async fn callback_rejects_a_not_active_account() {
    let Some(stack) = common::oauth_policy_stack().await else {
        return;
    };
    let tenant = &stack.tenant_id;
    seed_oauth_user(&stack.pool, tenant, "suspended").await;

    let url = stack.engine.oauth_initiate("google", tenant).await.unwrap();
    let outcome = stack
        .engine
        .oauth_callback("google", "auth-code", &state_of(&url), &ctx())
        .await;
    assert!(
        matches!(outcome, Err(AuthError::OauthFailed)),
        "a not-active account is rejected as the opaque oauth_failed"
    );
    assert_eq!(
        audit_event_count(&stack.pool, tenant, "oauth_login_reject").await,
        1
    );
}
