//! Builds the example's `AuthConfig` profile from validated settings.
//!
//! [`build_auth_config`] turns the process [`Settings`] into a library
//! [`AuthConfig`], selects the token-delivery mode and role hierarchy, enables the
//! `sessions` + `mfa` controller groups, and rejects the result fail-fast for the
//! target [`Environment`] so the engine is never assembled from an invalid config.

use std::collections::HashMap;

use bymax_auth_core::config::{ControllerToggles, Environment, MfaConfig, TokenDelivery};
use bymax_auth_core::{AuthConfig, ConfigError};

use crate::config::Settings;

/// Issuer label shown in authenticator apps during TOTP enrolment.
const MFA_ISSUER: &str = "rust-auth-example";
/// Recovery codes minted when a user enables MFA.
const MFA_RECOVERY_CODE_COUNT: u8 = 8;
/// Accepted number of ±30s drift windows when verifying a TOTP code.
const MFA_TOTP_WINDOW: u8 = 1;
/// The platform-admin role granted to the seeded demo administrator.
const PLATFORM_ADMIN_ROLE: &str = "admin";

/// Assembles the example's [`AuthConfig`] from validated [`Settings`] and rejects
/// it fail-fast for the target [`Environment`].
///
/// Picks the `nest_compat_defaults` profile (or `secure_defaults` under the
/// `argon2` feature), injects the HS256 secret, seals TOTP secrets with the
/// configured AES-256-GCM key, sets the dashboard and platform role hierarchies, and
/// enables the `sessions` + `mfa` + `platform` + `invitations` controller groups. OAuth
/// is enabled from settings when Google is configured. Enabling the platform domain
/// structurally requires the `SqlxPlatformUserRepository` seam, wired by the builder.
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
    config.jwt.secret = settings.jwt_secret.clone();

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
        encryption_key: settings.mfa_encryption_key.clone(),
        issuer: MFA_ISSUER.to_owned(),
        recovery_code_count: MFA_RECOVERY_CODE_COUNT,
        totp_window: MFA_TOTP_WINDOW,
    });

    // Light up the tenant-less platform-admin domain. It is doubly gated: this config flag
    // plus the `platform` controller toggle below. Enabling it structurally requires a
    // platform role hierarchy and the `SqlxPlatformUserRepository` seam wired at build time.
    config.platform.enabled = true;

    // The platform role hierarchy is fully denormalized (each role lists every role it
    // transitively includes) so a satisfaction check is a single-level lookup. It is a
    // distinct namespace from the dashboard hierarchy: platform tokens never cross over.
    config.roles.platform_hierarchy = Some(HashMap::from([(
        PLATFORM_ADMIN_ROLE.to_owned(),
        vec![PLATFORM_ADMIN_ROLE.to_owned()],
    )]));

    // Enable the sessions, MFA, and platform controller groups. The combined platform-MFA
    // group mounts automatically from `platform && mfa`.
    config.controllers = ControllerToggles {
        sessions: true,
        mfa: true,
        platform: true,
        ..config.controllers
    };

    // Enable the team-invitation domain. Its `inv:` single-use store is satisfied by the
    // shared `RedisStores` handle, and the controller group is turned on here (the builder
    // also auto-promotes it from `invitations.enabled`).
    config.invitations.enabled = true;
    config.controllers.invitations = true;

    // Wire the OAuth surface from settings: when Google is configured, populate the
    // provider credentials, the operator-configured redirect targets, and the host
    // allow-list, and enable the OAuth controller group. Otherwise OAuth stays off and
    // the mounted routes answer `auth.oauth_failed`.
    config.oauth = crate::engine::oauth::oauth_config(settings);
    if config.oauth.google.is_some() {
        config.controllers.oauth = true;
    }

    // Fail-fast: rejects a weak/low-entropy secret, an empty role hierarchy, a bad key,
    // or an unsafe OAuth redirect configuration.
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
    use secrecy::{ExposeSecret as _, SecretString};

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
            app_env: crate::config::RuntimeEnvironment::Development,
            log_level: "info".to_owned(),
            database_url: "postgres://postgres:postgres@localhost:5432/example_app".to_owned(),
            redis_url: "redis://localhost:6379".to_owned(),
            redis_namespace: "rust_auth_example".to_owned(),
            jwt_secret: SecretString::from(jwt_secret.to_owned()),
            mfa_encryption_key: SecretString::from(TEST_MFA_KEY.to_owned()),
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
        assert!(config.controllers.invitations);
        assert!(config.invitations.enabled);
        assert!(config.controllers.platform);
        assert!(config.platform.enabled);
        assert!(config.mfa.is_some());
        assert!(config.roles.hierarchy.contains_key("admin"));
        assert!(
            config
                .roles
                .platform_hierarchy
                .as_ref()
                .is_some_and(|hierarchy| hierarchy.contains_key("admin"))
        );
    }

    #[test]
    fn google_configured_enables_the_oauth_controller() {
        // Configuring Google turns on the OAuth controller group and wires the provider
        // credentials + redirect config, and the result still validates.
        let mut settings = settings_with_secret(TEST_JWT);
        settings.oauth_google_client_id = Some("client-id".to_owned());
        settings.oauth_google_client_secret = Some(SecretString::from("client-secret".to_owned()));
        settings.oauth_google_callback_url =
            Some("http://localhost:3000/api/auth/oauth/google/callback".to_owned());
        let config = build_auth_config(&settings, Environment::Development)
            .expect("a configured OAuth profile must build");
        assert!(config.controllers.oauth);
        assert!(config.oauth.google.is_some());
        assert!(config.oauth.success_redirect_url.is_some());
        assert_eq!(
            config.oauth.redirect_allowlist,
            vec!["localhost".to_owned()]
        );
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
