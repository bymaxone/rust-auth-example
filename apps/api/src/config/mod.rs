//! Typed application configuration, loaded and validated from the environment.
//!
//! [`Settings::load`] layers built-in defaults under the process environment (via
//! `figment`) and deserializes them into a [`Settings`] value, failing fast with a
//! precise [`ConfigError`] when a required variable is missing or a hard guard
//! (`JWT_SECRET` length, `MFA_ENCRYPTION_KEY` shape) is violated — so the process
//! never boots with an unsafe or incomplete configuration.
//!
//! Secret fields (`jwt_secret`, `mfa_encryption_key`) are redacted in the [`Debug`]
//! output so they are never written to logs even if the struct is printed.

use std::fmt;

use base64::Engine as _;
use figment::{
    Figment,
    providers::{Env, Serialized},
};
use serde::{Deserialize, Serialize};

/// The transport selected for outbound transactional email.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EmailProviderKind {
    /// Local SMTP sink (lettre -> Mailpit); the zero-credential default.
    Mailpit,
    /// Hosted transactional provider (gated by `RESEND_API_KEY`).
    Resend,
}

/// The fully validated runtime configuration for `apps/api`.
///
/// Constructed exclusively by [`Settings::load`]; do not build this struct
/// directly in production code.
#[derive(Clone, Serialize, Deserialize)]
pub struct Settings {
    /// TCP port the axum server binds (`API_PORT`, default `4000`).
    pub api_port: u16,
    /// `tracing` filter directive (`LOG_LEVEL`, default `info`).
    pub log_level: String,
    /// sqlx Postgres connection string (`DATABASE_URL`).
    pub database_url: String,
    /// Redis connection string (`REDIS_URL`).
    pub redis_url: String,
    /// Store key namespace (`REDIS_NAMESPACE`, default `rust_auth_example`).
    pub redis_namespace: String,
    /// HS256 signing secret (`JWT_SECRET`); validated `>= 64` chars.
    pub jwt_secret: String,
    /// base64-encoded 32-byte AES-256-GCM key (`MFA_ENCRYPTION_KEY`).
    pub mfa_encryption_key: String,
    /// CORS allow-origin (`WEB_ORIGIN`, default `http://localhost:3000`).
    pub web_origin: String,
    /// Outbound email transport (`EMAIL_PROVIDER`, default `mailpit`).
    pub email_provider: EmailProviderKind,
}

/// Redacts secrets so the struct can be safely printed in logs.
impl fmt::Debug for Settings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Settings")
            .field("api_port", &self.api_port)
            .field("log_level", &self.log_level)
            .field("database_url", &self.database_url)
            .field("redis_url", &self.redis_url)
            .field("redis_namespace", &self.redis_namespace)
            .field("jwt_secret", &"[REDACTED]")
            .field("mfa_encryption_key", &"[REDACTED]")
            .field("web_origin", &self.web_origin)
            .field("email_provider", &self.email_provider)
            .finish()
    }
}

/// Built-in defaults layered under the environment so optional vars may be omitted.
#[derive(Serialize)]
struct Defaults {
    api_port: u16,
    log_level: String,
    redis_namespace: String,
    web_origin: String,
    email_provider: EmailProviderKind,
}

impl Default for Defaults {
    fn default() -> Self {
        Self {
            api_port: 4000,
            log_level: "info".to_string(),
            redis_namespace: "rust_auth_example".to_string(),
            web_origin: "http://localhost:3000".to_string(),
            email_provider: EmailProviderKind::Mailpit,
        }
    }
}

/// Configuration failures surfaced at boot — each `Display` names the variable + constraint.
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    /// A figment extraction error (missing required variable or a type mismatch).
    ///
    /// The inner error is boxed because `figment::Error` is a large type (208 bytes);
    /// boxing keeps `ConfigError` on the stack and avoids inflating every call site.
    #[error("failed to load configuration from the environment: {0}")]
    Extract(Box<figment::Error>),
    /// `JWT_SECRET` is shorter than the HS256 floor.
    #[error(
        "JWT_SECRET must be at least {min} characters (got {got})",
        min = Settings::JWT_SECRET_MIN_LEN
    )]
    JwtSecretTooShort {
        /// The actual length received.
        got: usize,
    },
    /// `MFA_ENCRYPTION_KEY` is not valid base64 or does not decode to exactly 32 bytes.
    #[error("MFA_ENCRYPTION_KEY must be base64-encoded 32 bytes (AES-256-GCM key)")]
    MfaKeyInvalid,
}

impl From<figment::Error> for ConfigError {
    fn from(e: figment::Error) -> Self {
        Self::Extract(Box::new(e))
    }
}

impl Settings {
    /// HS256 secret floor — must be at least this many characters.
    pub const JWT_SECRET_MIN_LEN: usize = 64;

    /// Required decoded length of the MFA key (AES-256-GCM = 32 bytes).
    const MFA_KEY_LEN: usize = 32;

    /// Load and validate the configuration from process environment variables.
    ///
    /// Layers built-in defaults under the current environment, extracts into
    /// [`Settings`], then enforces the hard guards on the two secret fields.
    ///
    /// # Errors
    ///
    /// Returns [`ConfigError`] when a required variable is missing, a value fails
    /// to parse, or a hard guard is violated.
    pub fn load() -> Result<Self, ConfigError> {
        let settings: Self = Figment::new()
            .merge(Serialized::defaults(Defaults::default()))
            .merge(Env::raw())
            .extract()?;
        settings.validate()?;
        Ok(settings)
    }

    /// Enforce the hard guards on secret fields after a successful extraction.
    fn validate(&self) -> Result<(), ConfigError> {
        if self.jwt_secret.len() < Self::JWT_SECRET_MIN_LEN {
            return Err(ConfigError::JwtSecretTooShort {
                got: self.jwt_secret.len(),
            });
        }
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(self.mfa_encryption_key.as_bytes())
            .map_err(|_| ConfigError::MfaKeyInvalid)?;
        if decoded.len() != Self::MFA_KEY_LEN {
            return Err(ConfigError::MfaKeyInvalid);
        }
        Ok(())
    }
}

#[cfg(test)]
#[allow(
    clippy::expect_used,
    // figment::Jail closures return Result<(), figment::Error> — that type is large
    // by design (it carries rich source/path diagnostics) and is not in our control.
    clippy::result_large_err
)]
mod tests {
    use super::*;

    /// A 32-byte base64 key used as a test fixture (dev-only, never a real key).
    const TEST_MFA_KEY: &str = "ZGV2X29ubHlfbG9jYWxfMzJfYnl0ZV9rZXlfMDAwMDA=";
    /// A 65-character JWT value used as a test fixture (dev-only, never a real secret).
    const TEST_JWT: &str =
        "test_fixture_local_only_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

    /// Set the minimum required env vars, leaving optional ones to defaults.
    fn seed(jail: &mut figment::Jail) {
        jail.set_env(
            "DATABASE_URL",
            "postgres://postgres:postgres@localhost:5432/example_app",
        );
        jail.set_env("REDIS_URL", "redis://localhost:6379");
        jail.set_env("JWT_SECRET", TEST_JWT);
        jail.set_env("MFA_ENCRYPTION_KEY", TEST_MFA_KEY);
    }

    #[test]
    fn loads_a_valid_environment() {
        figment::Jail::expect_with(|jail| {
            seed(jail);
            let settings = Settings::load().expect("valid env must load");
            assert_eq!(settings.api_port, 4000);
            assert_eq!(settings.email_provider, EmailProviderKind::Mailpit);
            // Exercise the Debug impl to verify secrets are redacted.
            let debug = format!("{settings:?}");
            assert!(debug.contains("[REDACTED]"));
            assert!(!debug.contains(TEST_JWT));
            Ok(())
        });
    }

    #[test]
    fn loads_with_resend_email_provider() {
        figment::Jail::expect_with(|jail| {
            seed(jail);
            jail.set_env("EMAIL_PROVIDER", "resend");
            let settings = Settings::load().expect("resend provider must load");
            assert_eq!(settings.email_provider, EmailProviderKind::Resend);
            Ok(())
        });
    }

    #[test]
    fn rejects_missing_required_field() {
        figment::Jail::expect_with(|jail| {
            // DATABASE_URL is required with no default; omitting it must fail extraction.
            jail.set_env("REDIS_URL", "redis://localhost:6379");
            jail.set_env("JWT_SECRET", TEST_JWT);
            jail.set_env("MFA_ENCRYPTION_KEY", TEST_MFA_KEY);
            assert!(matches!(Settings::load(), Err(ConfigError::Extract(_))));
            Ok(())
        });
    }

    #[test]
    fn rejects_short_jwt_secret() {
        figment::Jail::expect_with(|jail| {
            seed(jail);
            jail.set_env("JWT_SECRET", "too-short");
            let err = Settings::load().expect_err("short secret must be rejected");
            assert!(matches!(err, ConfigError::JwtSecretTooShort { got: 9 }));
            // Verify the Display message names the floor and the actual length.
            let msg = err.to_string();
            assert!(msg.contains("64"));
            assert!(msg.contains('9'));
            Ok(())
        });
    }

    #[test]
    fn rejects_malformed_mfa_key() {
        figment::Jail::expect_with(|jail| {
            seed(jail);
            jail.set_env("MFA_ENCRYPTION_KEY", "not-valid-base64-!!");
            assert!(matches!(Settings::load(), Err(ConfigError::MfaKeyInvalid)));
            Ok(())
        });
    }

    #[test]
    fn rejects_mfa_key_wrong_byte_length() {
        figment::Jail::expect_with(|jail| {
            seed(jail);
            // "hello" in base64 — valid encoding but decodes to only 5 bytes, not 32.
            jail.set_env("MFA_ENCRYPTION_KEY", "aGVsbG8=");
            let err = Settings::load().expect_err("wrong-length key must be rejected");
            assert!(matches!(err, ConfigError::MfaKeyInvalid));
            // Verify the Display message describes the 32-byte requirement.
            let msg = err.to_string();
            assert!(msg.contains("32"));
            Ok(())
        });
    }
}
