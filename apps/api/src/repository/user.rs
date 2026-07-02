//! sqlx/Postgres implementation of the dashboard [`UserRepository`] seam.
//!
//! Every query is a compile-checked `query!`/`query_as!` macro. Reads use
//! `fetch_optional`, so a missing or cross-tenant row is `Ok(None)` rather than an
//! error. The repository holds no business logic — hashing, validation, and token
//! minting all belong to the engine.

use async_trait::async_trait;
use bymax_auth_core::RepositoryError;
use bymax_auth_core::traits::repository::UserRepository;
use bymax_auth_types::{AuthUser, CreateUserData, CreateWithOAuthData, UpdateMfaData};
use sqlx::PgPool;
use time::OffsetDateTime;

use crate::repository::map_sqlx_error;

/// Row projection matching the `users` columns. Private — the repository's public
/// boundary is always the credential-bearing [`AuthUser`].
struct UserRow {
    id: String,
    email: String,
    name: String,
    password_hash: Option<String>,
    role: String,
    status: String,
    tenant_id: String,
    email_verified: bool,
    mfa_enabled: bool,
    mfa_secret: Option<String>,
    mfa_recovery_codes: Option<Vec<String>>,
    oauth_provider: Option<String>,
    oauth_provider_id: Option<String>,
    last_login_at: Option<OffsetDateTime>,
    created_at: OffsetDateTime,
}

impl From<UserRow> for AuthUser {
    fn from(row: UserRow) -> Self {
        Self {
            id: row.id,
            email: row.email,
            name: row.name,
            password_hash: row.password_hash,
            role: row.role,
            status: row.status,
            tenant_id: row.tenant_id,
            email_verified: row.email_verified,
            mfa_enabled: row.mfa_enabled,
            mfa_secret: row.mfa_secret,
            mfa_recovery_codes: row.mfa_recovery_codes,
            oauth_provider: row.oauth_provider,
            oauth_provider_id: row.oauth_provider_id,
            last_login_at: row.last_login_at,
            created_at: row.created_at,
        }
    }
}

/// Postgres-backed dashboard user repository.
pub struct SqlxUserRepository {
    pool: PgPool,
}

impl SqlxUserRepository {
    /// Construct the repository over a shared connection pool.
    #[must_use]
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl UserRepository for SqlxUserRepository {
    async fn find_by_id(
        &self,
        id: &str,
        tenant_id: Option<&str>,
    ) -> Result<Option<AuthUser>, RepositoryError> {
        let row = sqlx::query_as!(
            UserRow,
            r#"SELECT id, email, name, password_hash, role, status, tenant_id,
                      email_verified, mfa_enabled, mfa_secret,
                      mfa_recovery_codes AS "mfa_recovery_codes: Vec<String>",
                      oauth_provider, oauth_provider_id, last_login_at, created_at
               FROM users
               WHERE id = $1 AND ($2::text IS NULL OR tenant_id = $2)"#,
            id,
            tenant_id,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(row.map(AuthUser::from))
    }

    async fn find_by_email(
        &self,
        email: &str,
        tenant_id: &str,
    ) -> Result<Option<AuthUser>, RepositoryError> {
        let row = sqlx::query_as!(
            UserRow,
            r#"SELECT id, email, name, password_hash, role, status, tenant_id,
                      email_verified, mfa_enabled, mfa_secret,
                      mfa_recovery_codes AS "mfa_recovery_codes: Vec<String>",
                      oauth_provider, oauth_provider_id, last_login_at, created_at
               FROM users
               WHERE tenant_id = $1 AND email = $2"#,
            tenant_id,
            email,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(row.map(AuthUser::from))
    }

    async fn create(&self, data: CreateUserData) -> Result<AuthUser, RepositoryError> {
        let row = sqlx::query_as!(
            UserRow,
            r#"INSERT INTO users (email, name, password_hash, role, status, tenant_id, email_verified)
               VALUES ($1, $2, $3, COALESCE($4, 'user'), COALESCE($5, 'active'), $6, COALESCE($7, false))
               RETURNING id, email, name, password_hash, role, status, tenant_id,
                         email_verified, mfa_enabled, mfa_secret,
                         mfa_recovery_codes AS "mfa_recovery_codes: Vec<String>",
                         oauth_provider, oauth_provider_id, last_login_at, created_at"#,
            data.email,
            data.name,
            data.password_hash,
            data.role,
            data.status,
            data.tenant_id,
            data.email_verified,
        )
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(AuthUser::from(row))
    }

    async fn update_password(&self, id: &str, password_hash: &str) -> Result<(), RepositoryError> {
        sqlx::query!(
            "UPDATE users SET password_hash = $2 WHERE id = $1",
            id,
            password_hash,
        )
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(())
    }

    async fn update_mfa(&self, id: &str, data: UpdateMfaData) -> Result<(), RepositoryError> {
        sqlx::query!(
            "UPDATE users
             SET mfa_enabled = $2, mfa_secret = $3, mfa_recovery_codes = $4
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

    async fn update_last_login(&self, id: &str) -> Result<(), RepositoryError> {
        sqlx::query!("UPDATE users SET last_login_at = now() WHERE id = $1", id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;
        Ok(())
    }

    async fn update_status(&self, id: &str, status: &str) -> Result<(), RepositoryError> {
        sqlx::query!("UPDATE users SET status = $2 WHERE id = $1", id, status)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;
        Ok(())
    }

    async fn update_email_verified(&self, id: &str, verified: bool) -> Result<(), RepositoryError> {
        sqlx::query!(
            "UPDATE users SET email_verified = $2 WHERE id = $1",
            id,
            verified,
        )
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(())
    }

    async fn find_by_oauth_id(
        &self,
        provider: &str,
        provider_id: &str,
        tenant_id: &str,
    ) -> Result<Option<AuthUser>, RepositoryError> {
        let row = sqlx::query_as!(
            UserRow,
            r#"SELECT id, email, name, password_hash, role, status, tenant_id,
                      email_verified, mfa_enabled, mfa_secret,
                      mfa_recovery_codes AS "mfa_recovery_codes: Vec<String>",
                      oauth_provider, oauth_provider_id, last_login_at, created_at
               FROM users
               WHERE tenant_id = $1 AND oauth_provider = $2 AND oauth_provider_id = $3"#,
            tenant_id,
            provider,
            provider_id,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(row.map(AuthUser::from))
    }

    async fn link_oauth(
        &self,
        user_id: &str,
        provider: &str,
        provider_id: &str,
    ) -> Result<(), RepositoryError> {
        sqlx::query!(
            "UPDATE users SET oauth_provider = $2, oauth_provider_id = $3 WHERE id = $1",
            user_id,
            provider,
            provider_id,
        )
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(())
    }

    async fn create_with_oauth(
        &self,
        data: CreateWithOAuthData,
    ) -> Result<AuthUser, RepositoryError> {
        let row = sqlx::query_as!(
            UserRow,
            r#"INSERT INTO users
                   (email, name, role, status, tenant_id, email_verified,
                    oauth_provider, oauth_provider_id)
               VALUES ($1, $2, COALESCE($3, 'user'), COALESCE($4, 'active'), $5,
                       COALESCE($6, false), $7, $8)
               RETURNING id, email, name, password_hash, role, status, tenant_id,
                         email_verified, mfa_enabled, mfa_secret,
                         mfa_recovery_codes AS "mfa_recovery_codes: Vec<String>",
                         oauth_provider, oauth_provider_id, last_login_at, created_at"#,
            data.email,
            data.name,
            data.role,
            data.status,
            data.tenant_id,
            data.email_verified,
            data.oauth_provider,
            data.oauth_provider_id,
        )
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(AuthUser::from(row))
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

    /// Ensure the tenant exists and start it from a clean slate. Runtime queries
    /// (outside the offline cache) satisfy the `users.tenant_id` foreign key and clear
    /// any rows left by a previous run, so every test is isolated and idempotent.
    async fn prepare_tenant(pool: &PgPool, id: &str) {
        sqlx::query("INSERT INTO tenants (id, name) VALUES ($1, $1) ON CONFLICT (id) DO NOTHING")
            .bind(id)
            .execute(pool)
            .await
            .expect("seed tenant");
        sqlx::query("DELETE FROM users WHERE tenant_id = $1")
            .bind(id)
            .execute(pool)
            .await
            .expect("clear tenant users");
    }

    fn create_data(tenant: &str, email: &str) -> CreateUserData {
        CreateUserData {
            email: email.to_owned(),
            name: "Ada".to_owned(),
            password_hash: Some("$scrypt$ph".to_owned()),
            role: None,
            status: None,
            tenant_id: tenant.to_owned(),
            email_verified: None,
        }
    }

    #[tokio::test]
    async fn create_then_read_round_trips_and_defaults_apply() {
        // A created user returns the full record with the COALESCE column defaults,
        // and both id and email lookups resolve the same row.
        let Some(pool) = test_pool().await else {
            return;
        };
        let tenant = "t_user_roundtrip";
        prepare_tenant(&pool, tenant).await;
        let repo = SqlxUserRepository::new(pool.clone());

        let created = repo
            .create(create_data(tenant, "roundtrip@example.com"))
            .await
            .unwrap();
        assert_eq!(created.email, "roundtrip@example.com");
        assert_eq!(created.role, "user");
        assert_eq!(created.status, "active");
        assert!(!created.email_verified);
        assert_eq!(created.password_hash.as_deref(), Some("$scrypt$ph"));
        assert_eq!(created.mfa_recovery_codes, None);

        let by_id = repo
            .find_by_id(&created.id, Some(tenant))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(by_id.id, created.id);
        let by_email = repo
            .find_by_email("roundtrip@example.com", tenant)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(by_email.id, created.id);
    }

    #[tokio::test]
    async fn missing_and_cross_tenant_reads_are_none() {
        // Absent rows and rows under a different tenant are `Ok(None)`, never an error
        // and never another tenant's row.
        let Some(pool) = test_pool().await else {
            return;
        };
        let tenant = "t_user_isolation";
        let other = "t_user_isolation_other";
        prepare_tenant(&pool, tenant).await;
        prepare_tenant(&pool, other).await;
        let repo = SqlxUserRepository::new(pool.clone());
        let user = repo
            .create(create_data(tenant, "isolated@example.com"))
            .await
            .unwrap();

        assert!(repo.find_by_id("no-such-id", None).await.unwrap().is_none());
        assert!(
            repo.find_by_id(&user.id, Some(other))
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            repo.find_by_email("isolated@example.com", other)
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            repo.find_by_email("ghost@example.com", tenant)
                .await
                .unwrap()
                .is_none()
        );
        // A tenant-agnostic id lookup still resolves the row.
        assert!(repo.find_by_id(&user.id, None).await.unwrap().is_some());
    }

    #[tokio::test]
    async fn scalar_updates_persist() {
        // Each field-level update writes through and is observable on the next read,
        // including the `Vec<String>` recovery codes and the MFA secret.
        let Some(pool) = test_pool().await else {
            return;
        };
        let tenant = "t_user_updates";
        prepare_tenant(&pool, tenant).await;
        let repo = SqlxUserRepository::new(pool.clone());
        let user = repo
            .create(create_data(tenant, "updates@example.com"))
            .await
            .unwrap();

        repo.update_password(&user.id, "$scrypt$rotated")
            .await
            .unwrap();
        repo.update_status(&user.id, "suspended").await.unwrap();
        repo.update_email_verified(&user.id, true).await.unwrap();
        repo.update_last_login(&user.id).await.unwrap();
        repo.update_mfa(
            &user.id,
            UpdateMfaData {
                mfa_enabled: true,
                mfa_secret: Some("enc-secret".to_owned()),
                mfa_recovery_codes: Some(vec!["hash-a".to_owned(), "hash-b".to_owned()]),
            },
        )
        .await
        .unwrap();

        let read = repo
            .find_by_id(&user.id, Some(tenant))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(read.password_hash.as_deref(), Some("$scrypt$rotated"));
        assert_eq!(read.status, "suspended");
        assert!(read.email_verified);
        assert!(read.last_login_at.is_some());
        assert!(read.mfa_enabled);
        assert_eq!(read.mfa_secret.as_deref(), Some("enc-secret"));
        assert_eq!(
            read.mfa_recovery_codes,
            Some(vec!["hash-a".to_owned(), "hash-b".to_owned()])
        );
    }

    #[tokio::test]
    async fn oauth_create_link_and_lookup() {
        // An OAuth-originated user is created without a local password and resolved by
        // its provider identity; linking an existing user attaches an identity too.
        let Some(pool) = test_pool().await else {
            return;
        };
        let tenant = "t_user_oauth";
        let other = "t_user_oauth_other";
        prepare_tenant(&pool, tenant).await;
        prepare_tenant(&pool, other).await;
        let repo = SqlxUserRepository::new(pool.clone());

        let oauth = repo
            .create_with_oauth(CreateWithOAuthData {
                email: "oauth@example.com".to_owned(),
                name: "Grace".to_owned(),
                role: None,
                status: None,
                tenant_id: tenant.to_owned(),
                email_verified: Some(true),
                oauth_provider: "google".to_owned(),
                oauth_provider_id: "g-1".to_owned(),
            })
            .await
            .unwrap();
        assert_eq!(oauth.password_hash, None);
        assert!(oauth.email_verified);

        let found = repo
            .find_by_oauth_id("google", "g-1", tenant)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(found.id, oauth.id);
        // Cross-tenant OAuth lookups are isolated; unknown identities are `None`.
        assert!(
            repo.find_by_oauth_id("google", "g-1", other)
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            repo.find_by_oauth_id("google", "missing", tenant)
                .await
                .unwrap()
                .is_none()
        );

        let local = repo
            .create(create_data(tenant, "linkme@example.com"))
            .await
            .unwrap();
        repo.link_oauth(&local.id, "google", "g-2").await.unwrap();
        let linked = repo
            .find_by_oauth_id("google", "g-2", tenant)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(linked.id, local.id);
    }

    #[tokio::test]
    async fn duplicate_email_is_conflict_and_bad_tenant_is_backend() {
        // A duplicate `(tenant_id, email)` maps to `Conflict`; a foreign-key violation
        // (unknown tenant) is any-other-error, so it maps to `Backend`.
        let Some(pool) = test_pool().await else {
            return;
        };
        let tenant = "t_user_conflict";
        prepare_tenant(&pool, tenant).await;
        let repo = SqlxUserRepository::new(pool.clone());
        repo.create(create_data(tenant, "dupe@example.com"))
            .await
            .unwrap();

        let conflict = repo
            .create(create_data(tenant, "dupe@example.com"))
            .await
            .unwrap_err();
        assert!(matches!(conflict, RepositoryError::Conflict(_)));

        let backend = repo
            .create(create_data("no-such-tenant", "orphan@example.com"))
            .await
            .unwrap_err();
        assert!(matches!(backend, RepositoryError::Backend(_)));
    }
}
