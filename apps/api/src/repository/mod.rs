//! sqlx/Postgres implementations of the engine's persistence seams.
//!
//! Each repository is pure persistence: it maps table rows to the library's domain
//! records and back, returning `Ok(None)` for a missing or cross-tenant row and never
//! embedding business logic. A unique-constraint violation is translated to
//! [`RepositoryError::Conflict`]; every other datastore failure becomes an opaque
//! [`RepositoryError::Backend`].

pub mod platform_user;
pub mod user;

use bymax_auth_core::RepositoryError;

/// Postgres SQLSTATE raised on a unique-constraint violation.
const PG_UNIQUE_VIOLATION: &str = "23505";

/// Fallback label used when a violated constraint cannot be named.
const UNNAMED_CONSTRAINT: &str = "unique";

/// Translate a raw [`sqlx::Error`] onto the engine's [`RepositoryError`] contract.
///
/// A unique-constraint violation (SQLSTATE `23505`) becomes
/// [`RepositoryError::Conflict`], which the engine renders as
/// `auth.email_already_exists`. Every other failure is wrapped as an opaque
/// [`RepositoryError::Backend`] whose cause the engine logs internally. A missing row
/// is never routed here: reads use `fetch_optional` and return `Ok(None)` instead.
fn map_sqlx_error(error: sqlx::Error) -> RepositoryError {
    if let sqlx::Error::Database(db) = &error
        && db.code().as_deref() == Some(PG_UNIQUE_VIOLATION)
    {
        return RepositoryError::Conflict(db.constraint().unwrap_or(UNNAMED_CONSTRAINT).to_owned());
    }
    RepositoryError::Backend(Box::new(error))
}
