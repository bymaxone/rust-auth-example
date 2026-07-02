//! Builds the example's `AuthConfig` profile from validated settings.
//!
//! [`build_auth_config`] turns the process [`Settings`] into a library
//! [`AuthConfig`], selects the token-delivery mode and role hierarchy, enables the
//! `sessions` + `mfa` controller groups, and rejects the result fail-fast for the
//! target [`Environment`] so the engine is never assembled from an invalid config.

use std::collections::HashMap;

use bymax_auth_core::config::{ControllerToggles, Environment, MfaConfig, TokenDelivery};
use bymax_auth_core::{AuthConfig, ConfigError};
use secrecy::SecretString;

use crate::config::Settings;

/// Issuer label shown in authenticator apps during TOTP enrolment.
const MFA_ISSUER: &str = "rust-auth-example";
/// Recovery codes minted when a user enables MFA.
const MFA_RECOVERY_CODE_COUNT: u8 = 8;
/// Accepted number of ±30s drift windows when verifying a TOTP code.
const MFA_TOTP_WINDOW: u8 = 1;

/// Assembles the example's [`AuthConfig`] from validated [`Settings`] and rejects
/// it fail-fast for the target [`Environment`].
///
/// Picks the `nest_compat_defaults` profile (or `secure_defaults` under the
/// `argon2` feature), injects the HS256 secret, seals TOTP secrets with the
/// configured AES-256-GCM key, sets the dashboard role hierarchy, and enables the
/// `sessions` + `mfa` controller groups. The `oauth`/`invitations`/`platform`
/// route groups stay off until their seams are wired.
///
/// # Errors
///
/// Returns a [`ConfigError`] when the configuration is rejected for the target
/// environment — a `JWT_SECRET` shorter than the floor or with too little entropy,
/// an empty or dangling role hierarchy, or an invalid MFA key.
pub fn build_auth_config(
    settings: &Settings,
    environment: Environment,
) -> Result<AuthConfig, ConfigError> {
    #[cfg(not(feature = "argon2"))]
    let mut config = AuthConfig::nest_compat_defaults();
    #[cfg(feature = "argon2")]
    let mut config = AuthConfig::secure_defaults();

    // The HS256 signing secret; its length and entropy are enforced by `validate`.
    config.jwt.secret = SecretString::from(settings.jwt_secret.clone());

    // Deliver tokens as both HttpOnly cookies and the response body, so the reference
    // surface serves cookie-based browser clients and bearer-token API clients alike.
    config.token_delivery = TokenDelivery::Both;

    // The dashboard role hierarchy is fully denormalized: each role lists every role it
    // transitively includes, so a satisfaction check is a single-level lookup.
    config.roles.hierarchy = HashMap::from([
        (
            "admin".to_owned(),
            vec!["admin".to_owned(), "user".to_owned()],
        ),
        ("user".to_owned(), vec!["user".to_owned()]),
    ]);

    // Seal TOTP secrets with the AES-256-GCM key. Enabling the MFA controller group
    // structurally requires this configuration to be present.
    config.mfa = Some(MfaConfig {
        encryption_key: SecretString::from(settings.mfa_encryption_key.clone()),
        issuer: MFA_ISSUER.to_owned(),
        recovery_code_count: MFA_RECOVERY_CODE_COUNT,
        totp_window: MFA_TOTP_WINDOW,
    });

    // The platform-admin domain is wired separately once its repository and routes are
    // added; enabling it here would auto-promote the platform controller group in `build`.
    config.platform.enabled = false;

    // Enable only the sessions and MFA controller groups; the oauth/invitations/platform
    // route groups stay off until their seams are wired.
    config.controllers = ControllerToggles {
        sessions: true,
        mfa: true,
        ..config.controllers
    };

    // Fail-fast: rejects a weak/low-entropy secret, an empty role hierarchy, or a bad key.
    config.validate(environment)?;
    Ok(config)
}

#[cfg(test)]
#[allow(
    // Panicking is the idiomatic failure signal in tests, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this test module only.
    clippy::unwrap_used,
    clippy::expect_used
)]
mod tests {
    use super::*;
    use crate::config::EmailProviderKind;
    use secrecy::ExposeSecret as _;

    /// A 72-byte, mixed-alphabet JWT fixture: over the 32-char floor and above the
    /// entropy threshold (dev-only, never a real secret).
    const TEST_JWT: &str =
        "dev_only_local_secret_change_me_0123456789abcdef0123456789abcdef0123456789";
    /// A base64 32-byte AES-256-GCM key fixture (dev-only, never a real key).
    const TEST_MFA_KEY: &str = "ZGV2X29ubHlfbG9jYWxfMzJfYnl0ZV9rZXlfMDAwMDA=";

    /// Build a `Settings` fixture with the given JWT secret; every other field is a
    /// well-formed development value.
    fn settings_with_secret(jwt_secret: &str) -> Settings {
        Settings {
            api_port: 4000,
            log_level: "info".to_owned(),
            database_url: "postgres://postgres:postgres@localhost:5432/example_app".to_owned(),
            redis_url: "redis://localhost:6379".to_owned(),
            redis_namespace: "rust_auth_example".to_owned(),
            jwt_secret: jwt_secret.to_owned(),
            mfa_encryption_key: TEST_MFA_KEY.to_owned(),
            web_origin: "http://localhost:3000".to_owned(),
            email_provider: EmailProviderKind::Mailpit,
        }
    }

    #[test]
    fn valid_settings_yield_a_wired_config() {
        // A well-formed development configuration validates cleanly and carries the
        // example's chosen delivery mode, role hierarchy, and controller toggles.
        let config = build_auth_config(&settings_with_secret(TEST_JWT), Environment::Development)
            .expect("a valid development configuration must build");
        assert_eq!(config.jwt.secret.expose_secret(), TEST_JWT);
        assert_eq!(config.token_delivery, TokenDelivery::Both);
        assert!(config.controllers.sessions);
        assert!(config.controllers.mfa);
        assert!(!config.controllers.oauth);
        assert!(!config.controllers.invitations);
        assert!(!config.controllers.platform);
        assert!(!config.platform.enabled);
        assert!(config.mfa.is_some());
        assert!(config.roles.hierarchy.contains_key("admin"));
    }

    #[test]
    fn short_secret_is_rejected() {
        // A secret below the length floor aborts config assembly with the precise
        // library variant, not a generic failure. `AuthConfig` has no `Debug`, so the
        // outcome is matched rather than unwrapped.
        let result = build_auth_config(&settings_with_secret("short"), Environment::Development);
        assert!(matches!(result, Err(ConfigError::JwtSecretTooShort { .. })));
    }

    #[test]
    fn low_entropy_secret_is_rejected() {
        // A long but low-entropy secret (a single repeated character) clears the length
        // floor yet fails the entropy guard.
        let result = build_auth_config(
            &settings_with_secret(&"a".repeat(64)),
            Environment::Development,
        );
        assert!(matches!(
            result,
            Err(ConfigError::JwtSecretLowEntropy { .. })
        ));
    }
}
