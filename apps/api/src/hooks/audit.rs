//! `AuthHooks` implementation recording every lifecycle event as a masked
//! `audit_log` row — never a token, code, or secret.
//!
//! Each hook receives a [`SafeAuthUser`] (never the credential-bearing `AuthUser`)
//! and a [`HookContext`]; only non-secret context is persisted (the event name, the
//! actor id/email, the tenant, the IP, and the user-agent). The session hash carried
//! by `on_new_session`/`on_session_evicted` is deliberately dropped, so an audit row
//! can never be replayed. `on_oauth_login` and `before_register` keep their library
//! defaults (the OAuth default is a secure DENY) until those policies are wired.

use async_trait::async_trait;
use sqlx::PgPool;

use bymax_auth_core::traits::email::SessionInfo;
use bymax_auth_core::traits::hooks::{AuthHooks, HookContext, HookError};
use bymax_auth_types::SafeAuthUser;

/// Persists auth lifecycle events to the `audit_log` table.
pub struct AuditAuthHooks {
    pool: PgPool,
}

impl AuditAuthHooks {
    /// Creates the hooks bound to the audit Postgres pool.
    #[must_use]
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Insert one masked row: the event name plus the non-secret actor/tenant/request
    /// context only. No token, OTP, MFA secret, recovery code, or session hash is
    /// written.
    async fn record(
        &self,
        event: &str,
        actor_id: Option<&str>,
        ctx: &HookContext,
    ) -> Result<(), HookError> {
        sqlx::query!(
            "INSERT INTO audit_log (event, actor_id, actor_email, tenant_id, ip, user_agent) \
             VALUES ($1, $2, $3, $4, $5, $6)",
            event,
            actor_id,
            ctx.email.as_deref(),
            ctx.tenant_id.as_deref(),
            ctx.ip,
            ctx.user_agent,
        )
        .execute(&self.pool)
        .await
        .map_err(|error| HookError::Internal(Box::new(error)))?;
        Ok(())
    }
}

#[async_trait]
impl AuthHooks for AuditAuthHooks {
    async fn after_register(
        &self,
        user: &SafeAuthUser,
        ctx: &HookContext,
    ) -> Result<(), HookError> {
        self.record("after_register", Some(user.id.as_str()), ctx)
            .await
    }

    async fn after_login(&self, user: &SafeAuthUser, ctx: &HookContext) -> Result<(), HookError> {
        self.record("after_login", Some(user.id.as_str()), ctx)
            .await
    }

    async fn after_logout(&self, user_id: &str, ctx: &HookContext) -> Result<(), HookError> {
        self.record("after_logout", Some(user_id), ctx).await
    }

    async fn after_email_verified(
        &self,
        user: &SafeAuthUser,
        ctx: &HookContext,
    ) -> Result<(), HookError> {
        self.record("after_email_verified", Some(user.id.as_str()), ctx)
            .await
    }

    async fn after_password_reset(
        &self,
        user: &SafeAuthUser,
        ctx: &HookContext,
    ) -> Result<(), HookError> {
        self.record("after_password_reset", Some(user.id.as_str()), ctx)
            .await
    }

    async fn after_mfa_enabled(
        &self,
        user: &SafeAuthUser,
        ctx: &HookContext,
    ) -> Result<(), HookError> {
        self.record("after_mfa_enabled", Some(user.id.as_str()), ctx)
            .await
    }

    async fn after_mfa_disabled(
        &self,
        user: &SafeAuthUser,
        ctx: &HookContext,
    ) -> Result<(), HookError> {
        self.record("after_mfa_disabled", Some(user.id.as_str()), ctx)
            .await
    }

    async fn after_mfa_recovery_codes_regenerated(
        &self,
        user: &SafeAuthUser,
        ctx: &HookContext,
    ) -> Result<(), HookError> {
        self.record(
            "after_mfa_recovery_codes_regenerated",
            Some(user.id.as_str()),
            ctx,
        )
        .await
    }

    async fn after_invitation_accepted(
        &self,
        user: &SafeAuthUser,
        ctx: &HookContext,
    ) -> Result<(), HookError> {
        self.record("after_invitation_accepted", Some(user.id.as_str()), ctx)
            .await
    }

    async fn on_new_session(
        &self,
        user: &SafeAuthUser,
        _session: &SessionInfo,
        ctx: &HookContext,
    ) -> Result<(), HookError> {
        // Record the event only — never the session hash carried by `SessionInfo`.
        self.record("on_new_session", Some(user.id.as_str()), ctx)
            .await
    }

    async fn on_session_evicted(
        &self,
        user_id: &str,
        _evicted_session_hash: &str,
        ctx: &HookContext,
    ) -> Result<(), HookError> {
        // The evicted session hash is intentionally dropped, not persisted.
        self.record("on_session_evicted", Some(user_id), ctx).await
    }
}

#[cfg(test)]
#[allow(
    // Panicking is the idiomatic failure signal in tests, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this test module only.
    clippy::unwrap_used,
    clippy::expect_used
)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use std::sync::atomic::{AtomicU64, Ordering};
    use time::OffsetDateTime;

    /// A session hash marker that must never end up in an audit row.
    const SESSION_HASH_MARKER: &str = "SESSIONHASHdeadbeefMARKER";
    /// An evicted-session hash marker that must never end up in an audit row.
    const EVICTED_HASH_MARKER: &str = "EVICTEDHASHcafef00dMARKER";

    /// A deterministic, collision-free tenant marker scoped to this process run.
    fn unique_marker() -> String {
        static SEQ: AtomicU64 = AtomicU64::new(0);
        let seq = SEQ.fetch_add(1, Ordering::Relaxed);
        format!("audit-test-{}-{seq}", std::process::id())
    }

    fn ctx(marker: &str) -> HookContext {
        HookContext {
            user_id: Some("user-1".to_owned()),
            email: Some("user@example.test".to_owned()),
            tenant_id: Some(marker.to_owned()),
            ip: "203.0.113.4".to_owned(),
            user_agent: "agent/1.0".to_owned(),
            sanitized_headers: BTreeMap::new(),
        }
    }

    fn safe_user() -> SafeAuthUser {
        SafeAuthUser {
            id: "user-1".to_owned(),
            email: "user@example.test".to_owned(),
            name: "User One".to_owned(),
            role: "user".to_owned(),
            status: "active".to_owned(),
            tenant_id: "acme".to_owned(),
            email_verified: true,
            mfa_enabled: false,
            oauth_provider: None,
            oauth_provider_id: None,
            last_login_at: None,
            created_at: OffsetDateTime::UNIX_EPOCH,
        }
    }

    #[tokio::test]
    async fn write_failure_maps_to_internal() {
        // A pool that cannot reach a database surfaces as the typed internal hook error,
        // never a panic. The pool is lazy with a short acquire timeout, so no live
        // database is required and the failure is observed promptly.
        let pool = sqlx::postgres::PgPoolOptions::new()
            .acquire_timeout(std::time::Duration::from_millis(200))
            .connect_lazy("postgres://127.0.0.1:1/does_not_exist")
            .expect("a well-formed url yields a lazy pool");
        let hooks = AuditAuthHooks::new(pool);
        let result = hooks.after_login(&safe_user(), &ctx("unreachable")).await;
        assert!(matches!(result, Err(HookError::Internal(_))));
    }

    #[tokio::test]
    async fn every_hook_writes_a_masked_row_without_secrets() {
        // Against the test stack, every lifecycle hook writes exactly one row scoped to a
        // unique tenant marker, and no session hash is ever persisted.
        let Ok(database_url) = std::env::var("DATABASE_URL_TEST") else {
            eprintln!("skipping audit hooks integration test: DATABASE_URL_TEST is not set");
            return;
        };
        let pool = PgPool::connect(&database_url)
            .await
            .expect("the test stack Postgres must be reachable");
        let marker = unique_marker();
        let c = ctx(&marker);
        let user = safe_user();
        let session = SessionInfo {
            device: "Chrome".to_owned(),
            ip: "203.0.113.4".to_owned(),
            session_hash: SESSION_HASH_MARKER.to_owned(),
        };
        let hooks = AuditAuthHooks::new(pool.clone());

        hooks
            .after_register(&user, &c)
            .await
            .expect("after_register");
        hooks.after_login(&user, &c).await.expect("after_login");
        hooks
            .after_logout("user-1", &c)
            .await
            .expect("after_logout");
        hooks
            .after_email_verified(&user, &c)
            .await
            .expect("after_email_verified");
        hooks
            .after_password_reset(&user, &c)
            .await
            .expect("after_password_reset");
        hooks
            .after_mfa_enabled(&user, &c)
            .await
            .expect("after_mfa_enabled");
        hooks
            .after_mfa_disabled(&user, &c)
            .await
            .expect("after_mfa_disabled");
        hooks
            .after_mfa_recovery_codes_regenerated(&user, &c)
            .await
            .expect("after_mfa_recovery_codes_regenerated");
        hooks
            .after_invitation_accepted(&user, &c)
            .await
            .expect("after_invitation_accepted");
        hooks
            .on_new_session(&user, &session, &c)
            .await
            .expect("on_new_session");
        hooks
            .on_session_evicted("user-1", EVICTED_HASH_MARKER, &c)
            .await
            .expect("on_session_evicted");

        let count = sqlx::query_scalar!(
            "SELECT count(*) FROM audit_log WHERE tenant_id = $1",
            marker
        )
        .fetch_one(&pool)
        .await
        .expect("count query")
        .unwrap_or_default();
        assert_eq!(count, 11, "every hook writes exactly one row");

        // Concatenate every textual column of this run's rows and prove no session hash
        // (or evicted hash) leaked into any of them.
        let blob = sqlx::query_scalar!(
            "SELECT string_agg( \
                event || ' ' || coalesce(actor_id, '') || ' ' || coalesce(actor_email, '') \
                || ' ' || coalesce(ip, '') || ' ' || coalesce(user_agent, '') \
                || ' ' || coalesce(metadata::text, ''), ' ') \
             FROM audit_log WHERE tenant_id = $1",
            marker
        )
        .fetch_one(&pool)
        .await
        .expect("aggregate query")
        .unwrap_or_default();
        assert!(!blob.contains(SESSION_HASH_MARKER));
        assert!(!blob.contains(EVICTED_HASH_MARKER));
        assert!(blob.contains("after_login"));
    }
}
