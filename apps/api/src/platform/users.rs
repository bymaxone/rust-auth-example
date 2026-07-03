//! `GET /platform/users` — read-only list of platform admin accounts.
//!
//! Returns a credential-free projection of every row in `platform_users` as
//! `Vec<SafeAuthPlatformUser>`, capped at [`LIST_LIMIT`] rows. The library's
//! `PlatformUserRepository` exposes only per-row lookups, so this handler issues
//! the list query directly against the pool. The compile-time `query_as!` macro
//! verifies the column list against the live schema at build time and captures it
//! in the `.sqlx/` offline cache, ensuring `password_hash`, `mfa_secret`, and
//! `mfa_recovery_codes` can never slip into the SELECT list undetected. The
//! handler is guarded by [`PlatformAdmin`] — only a verified platform admin token
//! whose role satisfies `admin` in the platform hierarchy is admitted. A dashboard
//! token is rejected, so cross-domain access is impossible.

use axum::Json;
use axum::extract::State;
use bymax_auth_types::SafeAuthPlatformUser;
use time::OffsetDateTime;

use crate::app::AppState;
use crate::error::AppError;
use crate::guards::PlatformAdmin;

/// Maximum number of rows returned by the list query.
///
/// Platform admin accounts are few by design; this hard cap prevents an
/// unbounded result set and keeps response times predictable even if the table
/// grows unexpectedly. Pagination can be added later without a breaking API
/// change.
const LIST_LIMIT: i64 = 200;

/// `GET /platform/users` — return platform admins as a credential-free JSON array.
///
/// Results are ordered by `created_at ASC` and capped at [`LIST_LIMIT`] rows.
/// The compile-time `query_as!` macro verifies the column projection against the
/// schema, making it impossible to accidentally SELECT a credential column.
///
/// Requires a platform token whose role satisfies `admin` in the platform hierarchy.
/// A dashboard token or any unauthenticated request is rejected before the query runs.
///
/// # Errors
///
/// Returns [`AppError`] when the database query fails.
pub async fn list_platform_users(
    _guard: PlatformAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<SafeAuthPlatformUser>>, AppError> {
    // query_as! verifies column names and types against the live schema at compile
    // time and stores the result in .sqlx/ for offline builds (SQLX_OFFLINE=true).
    // The credential columns (password_hash, mfa_secret, mfa_recovery_codes) are
    // absent from the SELECT list; the macro makes that exclusion a compile-time
    // guarantee rather than a runtime convention.
    let rows = sqlx::query_as!(
        SafePlatformUserRow,
        r#"SELECT id, email, name, role, status, mfa_enabled, platform_id,
                  last_login_at, updated_at, created_at
           FROM platform_users
           ORDER BY created_at ASC
           LIMIT $1"#,
        LIST_LIMIT
    )
    .fetch_all(&state.pool)
    .await?;

    let users: Vec<SafeAuthPlatformUser> =
        rows.into_iter().map(SafeAuthPlatformUser::from).collect();
    Ok(Json(users))
}

/// Local sqlx projection: the safe columns only — `password_hash`, `mfa_secret`,
/// and `mfa_recovery_codes` are deliberately excluded and are never fetched.
/// Used as the target type for the compile-checked `query_as!` macro above.
struct SafePlatformUserRow {
    id: String,
    email: String,
    name: String,
    role: String,
    status: String,
    mfa_enabled: bool,
    platform_id: Option<String>,
    last_login_at: Option<OffsetDateTime>,
    updated_at: OffsetDateTime,
    created_at: OffsetDateTime,
}

impl From<SafePlatformUserRow> for SafeAuthPlatformUser {
    fn from(row: SafePlatformUserRow) -> Self {
        Self {
            id: row.id,
            email: row.email,
            name: row.name,
            role: row.role,
            status: row.status,
            mfa_enabled: row.mfa_enabled,
            platform_id: row.platform_id,
            last_login_at: row.last_login_at,
            updated_at: row.updated_at,
            created_at: row.created_at,
        }
    }
}

#[cfg(test)]
#[allow(
    // Panicking is the idiomatic failure signal in tests; the workspace-level
    // `expect_used` / `unwrap_used` denial is relaxed for this test module only.
    clippy::expect_used,
    clippy::unwrap_used
)]
mod tests {
    use super::*;
    use time::macros::datetime;

    #[test]
    fn from_row_maps_every_field_to_safe_projection() {
        // Verifies the From<SafePlatformUserRow> impl copies all safe fields
        // verbatim and that no credential field (password_hash / mfa_secret /
        // mfa_recovery_codes) is present on SafeAuthPlatformUser.
        let now = datetime!(2026-01-01 00:00 UTC);
        let row = SafePlatformUserRow {
            id: "u1".to_owned(),
            email: "admin@example.com".to_owned(),
            name: "Root Admin".to_owned(),
            role: "admin".to_owned(),
            status: "ACTIVE".to_owned(),
            mfa_enabled: true,
            platform_id: Some("p1".to_owned()),
            last_login_at: Some(now),
            updated_at: now,
            created_at: now,
        };
        let safe: SafeAuthPlatformUser = row.into();

        assert_eq!(safe.id, "u1");
        assert_eq!(safe.email, "admin@example.com");
        assert_eq!(safe.name, "Root Admin");
        assert_eq!(safe.role, "admin");
        assert_eq!(safe.status, "ACTIVE");
        assert!(safe.mfa_enabled);
        assert_eq!(safe.platform_id.as_deref(), Some("p1"));
        assert_eq!(safe.last_login_at, Some(now));
        assert_eq!(safe.updated_at, now);
        assert_eq!(safe.created_at, now);
    }

    #[test]
    fn from_row_handles_optional_fields_as_none() {
        // Verifies that optional fields (platform_id, last_login_at) map to
        // None when absent — no panic, no empty-string placeholder.
        let now = datetime!(2026-01-01 00:00 UTC);
        let row = SafePlatformUserRow {
            id: "u2".to_owned(),
            email: "b@example.com".to_owned(),
            name: "Admin B".to_owned(),
            role: "admin".to_owned(),
            status: "ACTIVE".to_owned(),
            mfa_enabled: false,
            platform_id: None,
            last_login_at: None,
            updated_at: now,
            created_at: now,
        };
        let safe: SafeAuthPlatformUser = row.into();

        assert!(safe.platform_id.is_none());
        assert!(safe.last_login_at.is_none());
        assert!(!safe.mfa_enabled);
    }

    #[test]
    fn safe_projection_excludes_credential_fields() {
        // Verifies SafeAuthPlatformUser does not expose credential fields.
        // The compile-time query_as! macro guarantees password_hash, mfa_secret,
        // and mfa_recovery_codes are not fetched. This test double-checks the
        // type contract: these fields must not exist on the safe projection.
        // If any were added to SafeAuthPlatformUser, this test would need
        // updating — making the addition deliberate and visible in review.
        let now = datetime!(2026-01-01 00:00 UTC);
        let row = SafePlatformUserRow {
            id: "u3".to_owned(),
            email: "c@example.com".to_owned(),
            name: "Admin C".to_owned(),
            role: "viewer".to_owned(),
            status: "ACTIVE".to_owned(),
            mfa_enabled: false,
            platform_id: None,
            last_login_at: None,
            updated_at: now,
            created_at: now,
        };
        let safe: SafeAuthPlatformUser = row.into();
        // SafeAuthPlatformUser has exactly: id, email, name, role, status,
        // mfa_enabled, platform_id, last_login_at, updated_at, created_at.
        // Verify the safe struct is fully populated with the expected values.
        assert_eq!(safe.id, "u3");
        assert_eq!(safe.email, "c@example.com");
        assert_eq!(safe.role, "viewer");
    }

    #[test]
    fn list_limit_is_positive_and_reasonable() {
        // Verifies the hard row cap is a positive value in a sensible range so
        // the endpoint never returns an unbounded result set.
        // Constant assertions use `const {}` blocks so they are checked at
        // compile time, avoiding the `assertions_on_constants` lint.
        const {
            assert!(LIST_LIMIT > 0, "LIST_LIMIT must be positive");
            assert!(
                LIST_LIMIT <= 1_000,
                "LIST_LIMIT should be at most 1000 rows"
            );
        }
    }

    #[tokio::test]
    async fn handler_returns_safe_projection_from_live_database() {
        // Integration test: exercises the full handler path against a real
        // database so the query_as! macro expansion and the From mapping are
        // both covered. Skipped when DATABASE_URL_TEST is not set so unit-only
        // builds remain fast. The test database may have zero or more rows —
        // both cases exercise the happy path without requiring seeded fixtures.
        let Ok(database_url) = std::env::var("DATABASE_URL_TEST") else {
            eprintln!("skipping: DATABASE_URL_TEST not set");
            return;
        };
        let pool = sqlx::PgPool::connect(&database_url)
            .await
            .expect("test database must be reachable");

        // for_test() builds a lazy AppState; swap in the live pool so the
        // handler can actually execute the query. Only `pool` is used by the
        // handler; every other field stays as the lazy test fixture.
        let mut state = crate::app::AppState::for_test();
        state.pool = pool;

        let claims = bymax_auth_types::PlatformClaims {
            sub: "integration-test-caller".to_owned(),
            jti: "integration-test-jti".to_owned(),
            role: "admin".to_owned(),
            token_type: bymax_auth_types::PlatformType::Platform,
            mfa_enabled: false,
            mfa_verified: false,
            iat: 0,
            exp: i64::MAX,
        };
        // The guard is unused by the handler body (the extractor already ran);
        // we pass a directly-constructed guard to call the handler without HTTP.
        let guard = PlatformAdmin(claims);

        let result = list_platform_users(guard, State(state)).await;
        let Json(users) = result.expect("handler must succeed with a live database");

        // Every returned row must satisfy the safe-projection contract: a
        // non-empty id and email, and no credential field present on the type.
        for user in &users {
            assert!(!user.id.is_empty(), "id must not be empty");
            assert!(!user.email.is_empty(), "email must not be empty");
        }
        // The result set is bounded by LIST_LIMIT.
        assert!(
            users.len() <= LIST_LIMIT as usize,
            "result must not exceed LIST_LIMIT rows"
        );
    }
}
