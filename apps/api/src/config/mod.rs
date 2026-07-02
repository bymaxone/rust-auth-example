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
//!
//! Configuration is read from **unprefixed** environment variables (e.g.
//! `DATABASE_URL`, `JWT_SECRET`) to match the documented `.env` contract, so a
//! matching ambient variable in the shell will override the corresponding default.

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
/// Models the configuration variables the current API surface needs. Variables
/// used by later phases (SMTP host/port, OAuth credentials, `DATABASE_URL_TEST`,
/// `RESEND_API_KEY`) are absent here by design and will be added when those
/// phases wire their respective subsystems.
///
/// Constructed exclusively by [`Settings::load`]; do not build this struct
/// directly in production code.
///
/// Deliberately does **not** derive [`Serialize`]: the redacting [`Debug`] impl
/// only guards debug/log output, so a `Serialize` derive would make it easy to
/// accidentally emit the secret fields in plaintext through some other sink.
#[derive(Clone, Deserialize)]
pub struct Settings {
    /// TCP port the axum server binds (`API_PORT`, default `4000`).
    pub api_port: u16,
    /// Settings-level log filter default (`LOG_LEVEL`, default `info`).
    ///
    /// `RUST_LOG` is consumed directly by the tracing `EnvFilter` when logging
    /// is wired in a later phase; it is not a `Settings` field.
    pub log_level: String,
    /// sqlx Postgres connection string (`DATABASE_URL`).
    pub database_url: String,
    /// Redis connection string (`REDIS_URL`).
    pub redis_url: String,
    /// Store key namespace (`REDIS_NAMESPACE`, default `rust_auth_example`).
    pub redis_namespace: String,
    /// HS256 signing secret (`JWT_SECRET`); validated `>= 64` bytes.
    pub jwt_secret: String,
    /// base64-encoded 32-byte AES-256-GCM key (`MFA_ENCRYPTION_KEY`).
    pub mfa_encryption_key: String,
    /// CORS allow-origin (`WEB_ORIGIN`, default `http://localhost:3000`).
    pub web_origin: String,
    /// Outbound email transport (`EMAIL_PROVIDER`, default `mailpit`).
    pub email_provider: EmailProviderKind,
    /// SMTP relay host for the lettre provider (`SMTP_HOST`, default `localhost`).
    pub smtp_host: String,
    /// SMTP relay port (`SMTP_PORT`, default `1025`, the Mailpit listener).
    pub smtp_port: u16,
    /// `From` mailbox for outbound mail (`SMTP_FROM`, default `no-reply@auth.local`).
    pub smtp_from: String,
    /// Resend API key (`RESEND_API_KEY`); when present, selects the Resend transport.
    ///
    /// A secret: redacted in the [`Debug`] output so it never reaches a log line.
    pub resend_api_key: Option<String>,
}

/// Redacts secrets so the struct can be safely printed in logs.
///
/// `database_url` and `redis_url` are redacted alongside the two dedicated secret
/// fields because a connection string can embed a password in its userinfo
/// component. The redacted fields are still accessed so the compiler confirms they
/// exist and are the correct type; only the value is suppressed.
impl fmt::Debug for Settings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // For the two connection strings, emit only a byte-length hint instead of
        // the value, so the debug output stays useful without revealing secrets.
        let db_hint = format!("[REDACTED {} bytes]", self.database_url.len());
        let redis_hint = format!("[REDACTED {} bytes]", self.redis_url.len());
        f.debug_struct("Settings")
            .field("api_port", &self.api_port)
            .field("log_level", &self.log_level)
            .field("database_url", &db_hint)
            .field("redis_url", &redis_hint)
            .field("redis_namespace", &self.redis_namespace)
            .field("jwt_secret", &"[REDACTED]")
            .field("mfa_encryption_key", &"[REDACTED]")
            .field("web_origin", &self.web_origin)
            .field("email_provider", &self.email_provider)
            .field("smtp_host", &self.smtp_host)
            .field("smtp_port", &self.smtp_port)
            .field("smtp_from", &self.smtp_from)
            // Reveal only presence, never the key material.
            .field(
                "resend_api_key",
                &self.resend_api_key.as_ref().map(|_| "[REDACTED]"),
            )
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
    smtp_host: String,
    smtp_port: u16,
    smtp_from: String,
}

impl Default for Defaults {
    fn default() -> Self {
        Self {
            api_port: 4000,
            log_level: "info".to_string(),
            redis_namespace: "rust_auth_example".to_string(),
            web_origin: "http://localhost:3000".to_string(),
            email_provider: EmailProviderKind::Mailpit,
            smtp_host: "localhost".to_string(),
            smtp_port: 1025,
            smtp_from: "no-reply@auth.local".to_string(),
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
    Extract(#[source] Box<figment::Error>),
    /// `JWT_SECRET` is shorter than the HS256 floor.
    #[error(
        "JWT_SECRET must be at least {min} bytes (got {got})",
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
    /// HS256 secret floor — must be at least this many bytes.
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
        // NOTE: Env::raw() is intentionally unscoped (no prefix) so it reads the
        // documented .env variable names verbatim; a matching ambient variable
        // therefore overrides the corresponding default.
        Self::from_figment(
            Figment::new()
                .merge(Serialized::defaults(Defaults::default()))
                .merge(Env::raw()),
        )
    }

    /// Extract and validate [`Settings`] from an already-assembled figment.
    ///
    /// Separated from [`load`](Self::load) so tests can supply a figment that is
    /// hermetic with respect to the process environment (the CI runner populates
    /// ambient variables such as `DATABASE_URL` that would otherwise leak in).
    ///
    /// # Errors
    ///
    /// Returns [`ConfigError`] when a required key is missing, a value fails to
    /// parse, or a hard guard is violated.
    fn from_figment(figment: Figment) -> Result<Self, ConfigError> {
        let settings: Self = figment.extract()?;
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
    // .expect() is the idiomatic failure mode in tests — a panic here is a test
    // failure signal, not a runtime error path, so the workspace deny is relaxed.
    clippy::expect_used,
    // figment::Jail closures return Result<(), figment::Error> — that type is large
    // by design (it carries rich source/path diagnostics) and is not in our control.
    clippy::result_large_err
)]
mod tests {
    use super::*;

    /// A 32-byte base64 key used as a test fixture (dev-only, never a real key).
    const TEST_MFA_KEY: &str = "ZGV2X29ubHlfbG9jYWxfMzJfYnl0ZV9rZXlfMDAwMDA=";
    /// A 72-byte JWT value used as a test fixture (dev-only, never a real secret).
    /// All characters are ASCII, so byte length equals character length.
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
            assert!(!debug.contains(TEST_MFA_KEY));
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
    fn smtp_defaults_apply_and_the_resend_key_is_redacted() {
        figment::Jail::expect_with(|jail| {
            seed(jail);
            jail.set_env("RESEND_API_KEY", "re_test_secret_value");
            let settings = Settings::load().expect("valid env with a resend key must load");
            assert_eq!(settings.smtp_host, "localhost");
            assert_eq!(settings.smtp_port, 1025);
            assert_eq!(settings.smtp_from, "no-reply@auth.local");
            assert_eq!(
                settings.resend_api_key.as_deref(),
                Some("re_test_secret_value")
            );
            // The key value is present but never rendered in the debug output.
            let debug = format!("{settings:?}");
            assert!(debug.contains("[REDACTED]"));
            assert!(!debug.contains("re_test_secret_value"));
            Ok(())
        });
    }

    #[test]
    fn rejects_missing_required_field() {
        // Build the figment directly (no process `Env`) so the check is hermetic:
        // the CI runner sets an ambient `DATABASE_URL`, which would otherwise
        // satisfy the "required" field and mask the failure. `database_url` is
        // required with no default, so omitting it here must fail extraction.
        let figment = Figment::new()
            .merge(Serialized::defaults(Defaults::default()))
            .merge(Serialized::default("redis_url", "redis://localhost:6379"))
            .merge(Serialized::default("jwt_secret", TEST_JWT))
            .merge(Serialized::default("mfa_encryption_key", TEST_MFA_KEY));
        assert!(matches!(
            Settings::from_figment(figment),
            Err(ConfigError::Extract(_))
        ));
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
