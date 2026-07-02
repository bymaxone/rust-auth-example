//! Assembles the fully-wired `AuthEngine` and exposes it for `AppState`.
//!
//! [`config::build_auth_config`] produces the validated [`bymax_auth_core::AuthConfig`]
//! profile; the engine-assembly seam that consumes it, together with the sqlx
//! repositories, the one `Arc<RedisStores>` store handle, the resolved email
//! provider, and the audit hooks, is introduced alongside those collaborators.

pub mod config;
