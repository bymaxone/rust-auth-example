//! The auth lifecycle-hook seam.
//!
//! [`AuditAuthHooks`] is the example's `AuthHooks` implementation: it records every
//! lifecycle event as a masked `audit_log` row, receiving only a `SafeAuthUser` and a
//! sanitized `HookContext`, and never persisting a token, code, or secret.

pub mod audit;
pub mod oauth_policy;

pub use audit::AuditAuthHooks;
