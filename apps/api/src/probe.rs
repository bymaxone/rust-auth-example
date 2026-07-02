//! Compile-time proof that the three consumed library crates link.
//!
//! Naming one type from each crate forces `rustc` to resolve the path
//! dependencies declared in `Cargo.toml` (a declared-but-unused dependency
//! would not). This module carries no runtime behaviour; its sole purpose is
//! link coverage of the consumed crates.

use bymax_auth_axum::AxumAuthConfig;
use bymax_auth_core::AuthEngine;
use bymax_auth_redis::RedisStores;

/// Returns the default adapter config, having named a type from each consumed
/// crate. The body is intentionally trivial — its purpose is link coverage,
/// not behaviour.
#[must_use]
pub fn consumed_surface_probe() -> AxumAuthConfig {
    // Name the builder entry point (core) without performing any I/O.
    let _engine_builder = AuthEngine::builder;
    // Name the store handle type (redis) via its byte size — no connection made.
    let _stores_size = std::mem::size_of::<RedisStores>();
    AxumAuthConfig::default()
}
