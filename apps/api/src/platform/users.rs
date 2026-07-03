//! `GET /platform/users` — read-only list of platform admin accounts.
//!
//! Returns a credential-free projection of every row in `platform_users` as
//! `Vec<SafeAuthPlatformUser>`. The library's `PlatformUserRepository` exposes
//! only per-row lookups, so this handler issues the list query directly against
//! the pool. The handler is guarded by [`PlatformAdmin`] — only a verified
//! platform admin token whose role satisfies `admin` in the platform hierarchy
//! is admitted. A dashboard token is rejected, so cross-domain access is
//! impossible.

use axum::Json;
use axum::extract::State;
use bymax_auth_types::SafeAuthPlatformUser;
use sqlx::FromRow;
use time::OffsetDateTime;

use crate::app::AppState;
use crate::error::AppError;
use crate::guards::PlatformAdmin;

/// Local sqlx projection: the safe columns only — `password_hash`, `mfa_secret`,
/// and `mfa_recovery_codes` are deliberately excluded and are never fetched.
/// `FromRow` is derived so the unchecked `query_as::<_, T>()` function can map
/// the result without a compile-time database or offline `.sqlx/` cache entry.
#[derive(FromRow)]
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

/// The read query. Extracted as a constant so clippy (and reviewers) can confirm
/// `password_hash`, `mfa_secret`, and `mfa_recovery_codes` are absent.
const LIST_PLATFORM_USERS_SQL: &str = r#"
    SELECT id, email, name, role, status, mfa_enabled, platform_id,
           last_login_at, updated_at, created_at
    FROM platform_users
    ORDER BY created_at ASC
"#;

/// `GET /platform/users` — return all platform admins as a credential-free JSON array.
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
    let rows = sqlx::query_as::<_, SafePlatformUserRow>(LIST_PLATFORM_USERS_SQL)
        .fetch_all(&state.pool)
        .await?;

    let users: Vec<SafeAuthPlatformUser> =
        rows.into_iter().map(SafeAuthPlatformUser::from).collect();
    Ok(Json(users))
}

#[cfg(test)]
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
    fn list_sql_excludes_credential_columns() {
        // Verifies the read query constant does not reference the three banned
        // columns: password_hash, mfa_secret, mfa_recovery_codes.
        assert!(
            !LIST_PLATFORM_USERS_SQL.contains("password_hash"),
            "password_hash must not appear in the query"
        );
        assert!(
            !LIST_PLATFORM_USERS_SQL.contains("mfa_secret"),
            "mfa_secret must not appear in the query"
        );
        assert!(
            !LIST_PLATFORM_USERS_SQL.contains("mfa_recovery_codes"),
            "mfa_recovery_codes must not appear in the query"
        );
    }
}
