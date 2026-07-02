//! sqlx/Postgres implementation of the tenant-less [`PlatformUserRepository`] seam.
//!
//! Platform admins are provisioned directly (no self-registration), authenticate with
//! a local password only, and are not tenant-scoped, so every lookup keys on the
//! global identity. Each mutation bumps `updated_at`. As with the dashboard
//! repository, a missing row is `Ok(None)` and there is no business logic here.

use async_trait::async_trait;
use bymax_auth_core::RepositoryError;
use bymax_auth_core::traits::repository::PlatformUserRepository;
use bymax_auth_types::{AuthPlatformUser, UpdatePlatformMfaData};
use sqlx::PgPool;
use time::OffsetDateTime;

use crate::repository::map_sqlx_error;

/// Row projection matching the `platform_users` columns. `password_hash` is
/// non-optional — a platform admin always carries a local credential.
struct PlatformUserRow {
    id: String,
    email: String,
    name: String,
    password_hash: String,
    role: String,
    status: String,
    mfa_enabled: bool,
    mfa_secret: Option<String>,
    mfa_recovery_codes: Option<Vec<String>>,
    platform_id: Option<String>,
    last_login_at: Option<OffsetDateTime>,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

impl From<PlatformUserRow> for AuthPlatformUser {
    fn from(row: PlatformUserRow) -> Self {
        Self {
            id: row.id,
            email: row.email,
            name: row.name,
            password_hash: row.password_hash,
            role: row.role,
            status: row.status,
            mfa_enabled: row.mfa_enabled,
            mfa_secret: row.mfa_secret,
            mfa_recovery_codes: row.mfa_recovery_codes,
            platform_id: row.platform_id,
            last_login_at: row.last_login_at,
            updated_at: row.updated_at,
            created_at: row.created_at,
        }
    }
}

/// Postgres-backed platform-admin repository.
pub struct SqlxPlatformUserRepository {
    pool: PgPool,
}

impl SqlxPlatformUserRepository {
    /// Construct the repository over a shared connection pool.
    #[must_use]
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl PlatformUserRepository for SqlxPlatformUserRepository {
    async fn find_by_id(&self, id: &str) -> Result<Option<AuthPlatformUser>, RepositoryError> {
        let row = sqlx::query_as!(
            PlatformUserRow,
            r#"SELECT id, email, name, password_hash, role, status, mfa_enabled, mfa_secret,
                      mfa_recovery_codes AS "mfa_recovery_codes: Vec<String>",
                      platform_id, last_login_at, created_at, updated_at
               FROM platform_users
               WHERE id = $1"#,
            id,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(row.map(AuthPlatformUser::from))
    }

    async fn find_by_email(
        &self,
        email: &str,
    ) -> Result<Option<AuthPlatformUser>, RepositoryError> {
        let row = sqlx::query_as!(
            PlatformUserRow,
            r#"SELECT id, email, name, password_hash, role, status, mfa_enabled, mfa_secret,
                      mfa_recovery_codes AS "mfa_recovery_codes: Vec<String>",
                      platform_id, last_login_at, created_at, updated_at
               FROM platform_users
               WHERE email = $1"#,
            email,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(row.map(AuthPlatformUser::from))
    }

    async fn update_last_login(&self, id: &str) -> Result<(), RepositoryError> {
        sqlx::query!(
            "UPDATE platform_users SET last_login_at = now(), updated_at = now() WHERE id = $1",
            id,
        )
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(())
    }

    async fn update_mfa(
        &self,
        id: &str,
        data: UpdatePlatformMfaData,
    ) -> Result<(), RepositoryError> {
        sqlx::query!(
            "UPDATE platform_users
             SET mfa_enabled = $2, mfa_secret = $3, mfa_recovery_codes = $4, updated_at = now()
             WHERE id = $1",
            id,
            data.mfa_enabled,
            data.mfa_secret,
            data.mfa_recovery_codes.as_deref(),
        )
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(())
    }

    async fn update_password(&self, id: &str, password_hash: &str) -> Result<(), RepositoryError> {
        sqlx::query!(
            "UPDATE platform_users SET password_hash = $2, updated_at = now() WHERE id = $1",
            id,
            password_hash,
        )
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(())
    }

    async fn update_status(&self, id: &str, status: &str) -> Result<(), RepositoryError> {
        sqlx::query!(
            "UPDATE platform_users SET status = $2, updated_at = now() WHERE id = $1",
            id,
            status,
        )
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(())
    }
}

#[cfg(test)]
#[expect(
    // Panicking is the idiomatic failure signal in tests, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this integration module.
    clippy::unwrap_used,
    clippy::expect_used
)]
mod tests {
    use super::*;

    /// Connect to the test Postgres and ensure the schema exists, or return `None`
    /// when `DATABASE_URL_TEST` is unset so the suite stays green without a database.
    async fn test_pool() -> Option<PgPool> {
        let url = std::env::var("DATABASE_URL_TEST").ok()?;
        let pool = PgPool::connect(&url)
            .await
            .expect("connect to test database");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("apply migrations to the test database");
        Some(pool)
    }

    /// Provision a platform admin from a clean slate via runtime queries (outside the
    /// offline cache), returning its generated id. Any prior row for the email is
    /// cleared first so the test is isolated and idempotent.
    async fn insert_admin(pool: &PgPool, email: &str) -> String {
        sqlx::query("DELETE FROM platform_users WHERE email = $1")
            .bind(email)
            .execute(pool)
            .await
            .expect("clear admin");
        let (id,): (String,) = sqlx::query_as(
            "INSERT INTO platform_users (email, name, password_hash)
             VALUES ($1, 'Demo Admin', '$scrypt$ph')
             RETURNING id",
        )
        .bind(email)
        .fetch_one(pool)
        .await
        .expect("insert admin");
        id
    }

    #[tokio::test]
    async fn find_round_trips_every_field() {
        // A provisioned admin resolves by id and by email, with the non-optional
        // password hash, the null platform id, and the timestamps all present.
        let Some(pool) = test_pool().await else {
            return;
        };
        let repo = SqlxPlatformUserRepository::new(pool.clone());
        let id = insert_admin(&pool, "roundtrip@platform.local").await;

        let by_id = repo.find_by_id(&id).await.unwrap().unwrap();
        assert_eq!(by_id.email, "roundtrip@platform.local");
        assert_eq!(by_id.password_hash, "$scrypt$ph");
        assert_eq!(by_id.role, "admin");
        assert_eq!(by_id.status, "active");
        assert_eq!(by_id.platform_id, None);
        assert_eq!(by_id.last_login_at, None);

        let by_email = repo
            .find_by_email("roundtrip@platform.local")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(by_email.id, id);
    }

    #[tokio::test]
    async fn missing_lookups_are_none() {
        // Absent ids and emails are `Ok(None)`, never an error.
        let Some(pool) = test_pool().await else {
            return;
        };
        let repo = SqlxPlatformUserRepository::new(pool.clone());
        assert!(repo.find_by_id("no-such-id").await.unwrap().is_none());
        assert!(
            repo.find_by_email("ghost@platform.local")
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn updates_persist_and_bump_updated_at() {
        // Each mutation writes through and advances `updated_at`, including the
        // `Vec<String>` recovery codes and the MFA secret.
        let Some(pool) = test_pool().await else {
            return;
        };
        let repo = SqlxPlatformUserRepository::new(pool.clone());
        let id = insert_admin(&pool, "updates@platform.local").await;
        let initial = repo.find_by_id(&id).await.unwrap().unwrap();

        repo.update_password(&id, "$scrypt$rotated").await.unwrap();
        repo.update_status(&id, "suspended").await.unwrap();
        repo.update_last_login(&id).await.unwrap();
        repo.update_mfa(
            &id,
            UpdatePlatformMfaData {
                mfa_enabled: true,
                mfa_secret: Some("enc-secret".to_owned()),
                mfa_recovery_codes: Some(vec!["hash-a".to_owned(), "hash-b".to_owned()]),
            },
        )
        .await
        .unwrap();

        let read = repo.find_by_id(&id).await.unwrap().unwrap();
        assert_eq!(read.password_hash, "$scrypt$rotated");
        assert_eq!(read.status, "suspended");
        assert!(read.last_login_at.is_some());
        assert!(read.mfa_enabled);
        assert_eq!(read.mfa_secret.as_deref(), Some("enc-secret"));
        assert_eq!(
            read.mfa_recovery_codes,
            Some(vec!["hash-a".to_owned(), "hash-b".to_owned()])
        );
        assert!(read.updated_at >= initial.updated_at);
    }
}
