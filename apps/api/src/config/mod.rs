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
use secrecy::{ExposeSecret as _, SecretString};
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

/// The deployment environment, mapped onto the library's `Environment` at startup.
///
/// It drives the library's production-only guards (secure cookies, redirect https
/// checks). Defaults to `development` for the local-first reference stack; a real
/// deployment sets `APP_ENV=production`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeEnvironment {
    /// A development deployment (the local default).
    #[default]
    Development,
    /// A production deployment.
    Production,
    /// A test deployment.
    Test,
}

impl RuntimeEnvironment {
    /// Map onto the library's [`bymax_auth_core::config::Environment`].
    #[must_use]
    pub fn as_core(self) -> bymax_auth_core::config::Environment {
        use bymax_auth_core::config::Environment;
        match self {
            Self::Development => Environment::Development,
            Self::Production => Environment::Production,
            Self::Test => Environment::Test,
        }
    }
}

/// The fully validated runtime configuration for `apps/api`.
///
/// Bundles the server, datastore, JWT/MFA, email-transport, and CORS settings the
/// service needs at boot. `DATABASE_URL_TEST` is a test-only override read directly by
/// the integration tests and is deliberately not modelled here.
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
    /// Deployment environment (`APP_ENV`, default `development`).
    pub app_env: RuntimeEnvironment,
    /// Settings-level log filter default (`LOG_LEVEL`, default `info`).
    ///
    /// `RUST_LOG` is consumed directly by the tracing `EnvFilter`; it is not a
    /// `Settings` field.
    pub log_level: String,
    /// sqlx Postgres connection string (`DATABASE_URL`).
    pub database_url: String,
    /// Redis connection string (`REDIS_URL`).
    pub redis_url: String,
    /// Store key namespace (`REDIS_NAMESPACE`, default `rust_auth_example`).
    pub redis_namespace: String,
    /// HS256 signing secret (`JWT_SECRET`); validated `>= 64` bytes. Zeroized on drop.
    pub jwt_secret: SecretString,
    /// base64-encoded 32-byte AES-256-GCM key (`MFA_ENCRYPTION_KEY`). Zeroized on drop.
    pub mfa_encryption_key: SecretString,
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
    /// Resend API key (`RESEND_API_KEY`); required when `EMAIL_PROVIDER=resend`,
    /// ignored otherwise.
    ///
    /// A secret: redacted in [`Debug`] and zeroized on drop.
    pub resend_api_key: Option<SecretString>,
    /// Google OAuth client id (`OAUTH_GOOGLE_CLIENT_ID`). Enables Google sign-in only
    /// when set together with the client secret and callback URL; otherwise OAuth stays
    /// disabled.
    pub oauth_google_client_id: Option<String>,
    /// Google OAuth client secret (`OAUTH_GOOGLE_CLIENT_SECRET`). A secret: redacted in
    /// [`Debug`] and zeroized on drop.
    pub oauth_google_client_secret: Option<SecretString>,
    /// Google OAuth callback URL (`OAUTH_GOOGLE_CALLBACK_URL`) — the absolute redirect
    /// URI registered with Google.
    pub oauth_google_callback_url: Option<String>,
}

/// The validated Google OAuth credentials, borrowed from [`Settings`]. Present only when
/// all three `OAUTH_GOOGLE_*` variables are configured together.
#[derive(Clone, Copy)]
pub struct GoogleOAuthSettings<'a> {
    /// The Google OAuth client id.
    pub client_id: &'a str,
    /// The Google OAuth client secret (still protected by [`SecretString`]).
    pub client_secret: &'a SecretString,
    /// The absolute callback URL registered with Google.
    pub callback_url: &'a str,
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
            .field("app_env", &self.app_env)
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
            .field("oauth_google_client_id", &self.oauth_google_client_id)
            // Reveal only presence, never the client secret.
            .field(
                "oauth_google_client_secret",
                &self
                    .oauth_google_client_secret
                    .as_ref()
                    .map(|_| "[REDACTED]"),
            )
            .field("oauth_google_callback_url", &self.oauth_google_callback_url)
            .finish()
    }
}

/// Built-in defaults layered under the environment so optional vars may be omitted.
#[derive(Serialize)]
struct Defaults {
    api_port: u16,
    app_env: RuntimeEnvironment,
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
            app_env: RuntimeEnvironment::Development,
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
    /// `EMAIL_PROVIDER` is `resend` but `RESEND_API_KEY` is absent.
    #[error("`EMAIL_PROVIDER` is `resend` but `RESEND_API_KEY` is not configured")]
    ResendKeyMissing,
    /// Some but not all of the `OAUTH_GOOGLE_*` variables are set. Google sign-in
    /// requires the client id, client secret, and callback URL together, or none at all.
    #[error(
        "OAUTH_GOOGLE_CLIENT_ID, OAUTH_GOOGLE_CLIENT_SECRET, and OAUTH_GOOGLE_CALLBACK_URL \
         must be set together (or all left unset)"
    )]
    OAuthConfigIncomplete,
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
        if self.jwt_secret.expose_secret().len() < Self::JWT_SECRET_MIN_LEN {
            return Err(ConfigError::JwtSecretTooShort {
                got: self.jwt_secret.expose_secret().len(),
            });
        }
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(self.mfa_encryption_key.expose_secret().as_bytes())
            .map_err(|_| ConfigError::MfaKeyInvalid)?;
        if decoded.len() != Self::MFA_KEY_LEN {
            return Err(ConfigError::MfaKeyInvalid);
        }
        if self.email_provider == EmailProviderKind::Resend && self.resend_api_key.is_none() {
            return Err(ConfigError::ResendKeyMissing);
        }
        // Google OAuth is all-or-nothing: a partially-configured provider (e.g. an id
        // without a secret) would silently disable sign-in, so reject it fast at boot.
        let google_fields = [
            self.oauth_google_client_id.is_some(),
            self.oauth_google_client_secret.is_some(),
            self.oauth_google_callback_url.is_some(),
        ];
        let set = google_fields.iter().filter(|present| **present).count();
        if set != 0 && set != google_fields.len() {
            return Err(ConfigError::OAuthConfigIncomplete);
        }
        Ok(())
    }

    /// The configured Google OAuth credentials, present only when all three
    /// `OAUTH_GOOGLE_*` variables are set together. `None` leaves OAuth disabled — the
    /// mounted `/auth/oauth/*` routes then answer `auth.oauth_failed`.
    ///
    /// [`Settings::validate`] rejects a partially-configured provider, so a `Some`
    /// client id here structurally guarantees the secret and callback URL are present.
    #[must_use]
    pub fn google_oauth(&self) -> Option<GoogleOAuthSettings<'_>> {
        match (
            self.oauth_google_client_id.as_deref(),
            self.oauth_google_client_secret.as_ref(),
            self.oauth_google_callback_url.as_deref(),
        ) {
            (Some(client_id), Some(client_secret), Some(callback_url)) => {
                Some(GoogleOAuthSettings {
                    client_id,
                    client_secret,
                    callback_url,
                })
            }
            _ => None,
        }
    }
}

/// A well-formed development [`Settings`] fixture, shared by the crate's unit tests
/// that need a validated configuration (the engine builder and the app state).
#[cfg(test)]
pub(crate) fn dev_settings() -> Settings {
    Settings {
        api_port: 4000,
        app_env: RuntimeEnvironment::Development,
        log_level: "info".to_owned(),
        database_url: "postgres://postgres:postgres@localhost:5432/example_app".to_owned(),
        redis_url: "redis://127.0.0.1:6379".to_owned(),
        redis_namespace: "rust_auth_example".to_owned(),
        jwt_secret: SecretString::from(DEV_FIXTURE_JWT.to_owned()),
        mfa_encryption_key: SecretString::from(
            "ZGV2X29ubHlfbG9jYWxfMzJfYnl0ZV9rZXlfMDAwMDA=".to_owned(),
        ),
        web_origin: "http://localhost:3000".to_owned(),
        email_provider: EmailProviderKind::Mailpit,
        smtp_host: "localhost".to_owned(),
        smtp_port: 1025,
        smtp_from: "no-reply@auth.local".to_owned(),
        resend_api_key: None,
        oauth_google_client_id: None,
        oauth_google_client_secret: None,
        oauth_google_callback_url: None,
    }
}

/// A high-entropy, mixed-alphabet JWT fixture that clears the length + entropy guards
/// (dev-only, never a real secret).
#[cfg(test)]
const DEV_FIXTURE_JWT: &str = "aB3xY7zQ9kL2mN5pR8tV1wF4hJ6dS0gC7uE2iO5aZ4bH8nK1qW6mD9fT2vX5cP8b";

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
    fn runtime_environment_maps_onto_the_library_environment() {
        // Every runtime environment maps onto its library counterpart, and the default
        // is the local-first development environment.
        use bymax_auth_core::config::Environment;
        assert_eq!(
            RuntimeEnvironment::Development.as_core(),
            Environment::Development
        );
        assert_eq!(
            RuntimeEnvironment::Production.as_core(),
            Environment::Production
        );
        assert_eq!(RuntimeEnvironment::Test.as_core(), Environment::Test);
        assert_eq!(
            RuntimeEnvironment::default(),
            RuntimeEnvironment::Development
        );
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
            jail.set_env("RESEND_API_KEY", "re_test_key");
            let settings = Settings::load().expect("resend provider with key must load");
            assert_eq!(settings.email_provider, EmailProviderKind::Resend);
            Ok(())
        });
    }

    #[test]
    fn rejects_resend_provider_without_key() {
        figment::Jail::expect_with(|jail| {
            seed(jail);
            jail.set_env("EMAIL_PROVIDER", "resend");
            // No RESEND_API_KEY set — must refuse to boot.
            let err = Settings::load().expect_err("resend without key must be rejected");
            assert!(matches!(err, ConfigError::ResendKeyMissing));
            let msg = err.to_string();
            assert!(msg.contains("RESEND_API_KEY"));
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
                settings.resend_api_key.as_ref().map(|k| k.expose_secret()),
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
    fn accepts_a_jwt_secret_exactly_at_the_floor() {
        // The floor is inclusive: a secret of exactly JWT_SECRET_MIN_LEN bytes must load, so the
        // guard is `len < MIN` — a `<=` mutant would wrongly reject the boundary-length secret.
        figment::Jail::expect_with(|jail| {
            seed(jail);
            let at_floor = &TEST_JWT[..Settings::JWT_SECRET_MIN_LEN];
            jail.set_env("JWT_SECRET", at_floor);
            let settings = Settings::load().expect("a secret exactly at the floor must load");
            assert_eq!(
                settings.jwt_secret.expose_secret().len(),
                Settings::JWT_SECRET_MIN_LEN
            );
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
    fn rejects_partial_google_oauth_config() {
        figment::Jail::expect_with(|jail| {
            seed(jail);
            // Only the client id is set; the secret and callback are missing.
            jail.set_env("OAUTH_GOOGLE_CLIENT_ID", "id.apps.googleusercontent.com");
            let err = Settings::load().expect_err("a partial google config must be rejected");
            assert!(matches!(err, ConfigError::OAuthConfigIncomplete));
            assert!(err.to_string().contains("OAUTH_GOOGLE_CLIENT_ID"));
            Ok(())
        });
    }

    #[test]
    fn full_google_oauth_config_loads_and_redacts_the_secret() {
        figment::Jail::expect_with(|jail| {
            seed(jail);
            jail.set_env("OAUTH_GOOGLE_CLIENT_ID", "id.apps.googleusercontent.com");
            jail.set_env("OAUTH_GOOGLE_CLIENT_SECRET", "top-secret-oauth-value");
            jail.set_env(
                "OAUTH_GOOGLE_CALLBACK_URL",
                "http://localhost:3000/api/auth/oauth/google/callback",
            );
            let settings = Settings::load().expect("a full google config must load");
            let google = settings.google_oauth().expect("google is configured");
            assert_eq!(google.client_id, "id.apps.googleusercontent.com");
            assert_eq!(
                google.client_secret.expose_secret(),
                "top-secret-oauth-value"
            );
            // The client secret is never rendered in the debug output.
            let debug = format!("{settings:?}");
            assert!(debug.contains("[REDACTED]"));
            assert!(!debug.contains("top-secret-oauth-value"));
            Ok(())
        });
    }

    #[test]
    fn google_oauth_is_none_when_unset() {
        // With no OAUTH_GOOGLE_* variables the accessor reports OAuth disabled.
        figment::Jail::expect_with(|jail| {
            seed(jail);
            let settings = Settings::load().expect("valid env must load");
            assert!(settings.google_oauth().is_none());
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
