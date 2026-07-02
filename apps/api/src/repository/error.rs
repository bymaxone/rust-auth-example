//! Translates raw [`sqlx::Error`] values onto the engine's [`RepositoryError`]
//! contract — the single source of truth reused by every repository.

use bymax_auth_core::RepositoryError;

/// Postgres SQLSTATE raised on a unique-constraint violation.
const PG_UNIQUE_VIOLATION: &str = "23505";

/// Fallback label used when a violated constraint cannot be named.
const UNNAMED_CONSTRAINT: &str = "unique";

/// Map a raw [`sqlx::Error`] onto the engine's [`RepositoryError`] contract.
///
/// A unique-constraint violation (SQLSTATE `23505`) becomes
/// [`RepositoryError::Conflict`], which the engine renders as
/// `auth.email_already_exists`. Every other failure is wrapped as an opaque
/// [`RepositoryError::Backend`] whose cause the engine logs internally. A missing row
/// is never routed here: reads use `fetch_optional` and return `Ok(None)` instead.
#[must_use]
pub fn map_sqlx_error(error: sqlx::Error) -> RepositoryError {
    if let sqlx::Error::Database(db) = &error
        && db.code().as_deref() == Some(PG_UNIQUE_VIOLATION)
    {
        return RepositoryError::Conflict(db.constraint().unwrap_or(UNNAMED_CONSTRAINT).to_owned());
    }
    RepositoryError::Backend(Box::new(error))
}

#[cfg(test)]
#[expect(
    // Panicking is the idiomatic failure signal in tests, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this module.
    clippy::unwrap_used,
    clippy::expect_used
)]
mod tests {
    use super::*;
    use crate::repository::user::SqlxUserRepository;
    use bymax_auth_core::traits::repository::UserRepository;
    use bymax_auth_types::AuthError;
    use sqlx::PgPool;

    /// Connect to the test Postgres and ensure the schema exists, or return `None`
    /// when `DATABASE_URL_TEST` is unset so the suite stays green without a database.
    async fn test_pool() -> Option<PgPool> {
        let Ok(url) = std::env::var("DATABASE_URL_TEST") else {
            eprintln!("skipping DB-backed test: DATABASE_URL_TEST unset");
            return None;
        };
        let pool = PgPool::connect(&url)
            .await
            .expect("connect to test database");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("apply migrations to the test database");
        Some(pool)
    }

    #[test]
    fn non_database_error_maps_to_backend() {
        // Any non-`Database` failure (here a closed pool) is opaque `Backend`, never a
        // conflict — this branch needs no database, so it also holds in CI.
        let mapped = map_sqlx_error(sqlx::Error::PoolClosed);
        assert!(matches!(mapped, RepositoryError::Backend(_)));
    }

    #[test]
    fn email_already_exists_renders_the_conflict_wire_code() {
        // The engine maps a `Conflict` to `AuthError::EmailAlreadyExists`; that error's
        // wire envelope carries `auth.email_already_exists`. There is no
        // `From<RepositoryError>` to assert against (the types live in separate crates),
        // so this pins the target rendering the mapping feeds into.
        let envelope = AuthError::EmailAlreadyExists.to_envelope();
        let json = serde_json::to_value(&envelope).unwrap();
        assert_eq!(json["error"]["code"], "auth.email_already_exists");
    }

    #[tokio::test]
    async fn unique_violation_maps_to_conflict() {
        // A real Postgres unique/primary-key violation (SQLSTATE 23505) maps to
        // `Conflict`, carrying the violated constraint name.
        let Some(pool) = test_pool().await else {
            return;
        };
        sqlx::query("DELETE FROM tenants WHERE id = 't_err_dup'")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO tenants (id, name) VALUES ('t_err_dup', 'dup')")
            .execute(&pool)
            .await
            .unwrap();
        let err = sqlx::query("INSERT INTO tenants (id, name) VALUES ('t_err_dup', 'dup')")
            .execute(&pool)
            .await
            .unwrap_err();
        assert!(matches!(map_sqlx_error(err), RepositoryError::Conflict(_)));
    }

    #[tokio::test]
    async fn other_database_error_maps_to_backend() {
        // A non-unique datastore failure (here a foreign-key violation, SQLSTATE 23503)
        // is a `Database` error whose code is not 23505, so it maps to `Backend`.
        let Some(pool) = test_pool().await else {
            return;
        };
        let err = sqlx::query(
            "INSERT INTO users (email, name, tenant_id) VALUES ('fk@example.com', 'n', 'no_such_tenant')",
        )
        .execute(&pool)
        .await
        .unwrap_err();
        assert!(matches!(map_sqlx_error(err), RepositoryError::Backend(_)));
    }

    #[tokio::test]
    async fn missing_read_is_none_not_an_error() {
        // A missing row is the non-error `Ok(None)` — `RepositoryError` has no
        // "not found" variant.
        let Some(pool) = test_pool().await else {
            return;
        };
        let repo = SqlxUserRepository::new(pool.clone());
        assert!(repo.find_by_id("no-such-id", None).await.unwrap().is_none());
    }
}
