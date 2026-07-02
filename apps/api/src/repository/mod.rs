//! sqlx/Postgres implementations of the engine's persistence seams.
//!
//! Each repository is pure persistence: it maps table rows to the library's domain
//! records and back, returning `Ok(None)` for a missing or cross-tenant row and never
//! embedding business logic. A unique-constraint violation is translated to
//! [`bymax_auth_core::RepositoryError::Conflict`]; every other datastore failure
//! becomes an opaque [`bymax_auth_core::RepositoryError::Backend`] via the shared
//! [`error::map_sqlx_error`] mapper.

pub mod error;
pub mod platform_user;
pub mod user;

pub use error::map_sqlx_error;
