//! Maps the validated [`Settings`] onto the library OAuth configuration and builds the
//! Google provider with the example's injected TLS transport.
//!
//! OAuth stays disabled unless all three `OAUTH_GOOGLE_*` variables are configured. When
//! they are, [`oauth_config`] derives the operator-configured redirect targets from
//! `WEB_ORIGIN` (never request-derived, so there is no open-redirect surface) and pins a
//! host allow-list, and [`google_provider`] constructs the [`GoogleOAuthProvider`] over
//! the [`TlsHttpClient`].

use std::sync::Arc;

use bymax_auth_core::GoogleOAuthProvider;
use bymax_auth_core::config::{GoogleOAuthConfig, OAuthConfig};
use bymax_auth_core::traits::oauth::OAuthProvider;

use crate::config::Settings;
use crate::oauth::{TlsHttpClient, TlsHttpClientError};

/// Path (relative to `WEB_ORIGIN`) the callback redirects to after a full sign-in.
const SUCCESS_PATH: &str = "/auth/oauth/success";
/// Path (relative to `WEB_ORIGIN`) the callback redirects to for an MFA-enabled user.
const MFA_PATH: &str = "/auth/mfa";
/// Path (relative to `WEB_ORIGIN`) the callback redirects to on an OAuth failure.
const ERROR_PATH: &str = "/auth/oauth/error";

/// Build the library [`OAuthConfig`] from settings.
///
/// Returns [`OAuthConfig::default`] (OAuth disabled) when Google is not configured.
/// Otherwise it wires the Google credentials, the three operator-configured redirect
/// URLs derived from `WEB_ORIGIN`, and a host allow-list of the web-origin and callback
/// hosts, so the production redirect-safety checks have an allow-list to enforce.
#[must_use]
pub fn oauth_config(settings: &Settings) -> OAuthConfig {
    let Some(google) = google_oauth_config(settings) else {
        return OAuthConfig::default();
    };
    let origin = settings.web_origin.trim_end_matches('/');
    OAuthConfig {
        success_redirect_url: Some(format!("{origin}{SUCCESS_PATH}")),
        mfa_redirect_url: Some(format!("{origin}{MFA_PATH}")),
        error_redirect_url: Some(format!("{origin}{ERROR_PATH}")),
        redirect_allowlist: redirect_allowlist(&settings.web_origin, &google.callback_url),
        google: Some(google),
    }
}

/// Build the Google [`OAuthProvider`] with the example's TLS transport, or `None` when
/// Google is not configured (OAuth stays disabled).
///
/// # Errors
///
/// Returns [`TlsHttpClientError`] when the rustls-backed HTTPS transport cannot be built.
pub fn google_provider(
    settings: &Settings,
) -> Result<Option<Arc<dyn OAuthProvider>>, TlsHttpClientError> {
    let Some(google) = google_oauth_config(settings) else {
        return Ok(None);
    };
    let http = Arc::new(TlsHttpClient::new()?);
    Ok(Some(Arc::new(GoogleOAuthProvider::new(google, http))))
}

/// Map the settings' Google credentials onto a library [`GoogleOAuthConfig`], or `None`
/// when Google is not configured. Shared by [`oauth_config`] and [`google_provider`] so the
/// credential mapping lives in exactly one place.
fn google_oauth_config(settings: &Settings) -> Option<GoogleOAuthConfig> {
    let google = settings.google_oauth()?;
    Some(GoogleOAuthConfig {
        client_id: google.client_id.to_owned(),
        client_secret: google.client_secret.clone(),
        callback_url: google.callback_url.to_owned(),
        ..GoogleOAuthConfig::default()
    })
}

/// The host allow-list for the OAuth redirects: the web-origin host and the callback
/// host, de-duplicated. Host-less (relative) or unparsable values contribute nothing.
fn redirect_allowlist(web_origin: &str, callback_url: &str) -> Vec<String> {
    let mut hosts: Vec<String> = Vec::new();
    for url in [web_origin, callback_url] {
        if let Some(host) = host_of(url)
            && !hosts
                .iter()
                .any(|existing| existing.eq_ignore_ascii_case(&host))
        {
            hosts.push(host);
        }
    }
    hosts
}

/// The host component of an absolute (or protocol-relative) URL, mirroring the library's
/// allow-list host extraction: strip the scheme, take the authority up to the first path
/// or query delimiter, drop any userinfo, and drop the port (keeping a bracketed IPv6
/// literal intact). Returns `None` for a host-less same-origin path.
fn host_of(url: &str) -> Option<String> {
    let after_scheme = match url.split_once("://") {
        Some((_, rest)) => rest,
        None => url.strip_prefix("//")?,
    };
    let authority = after_scheme
        .split(['/', '?', '#', '\\'])
        .next()
        .unwrap_or(after_scheme);
    let without_userinfo = authority.rsplit('@').next().unwrap_or(authority);
    let host = if without_userinfo.starts_with('[') {
        without_userinfo
            .find(']')
            .map_or(without_userinfo, |close| &without_userinfo[..=close])
    } else {
        without_userinfo
            .split(':')
            .next()
            .unwrap_or(without_userinfo)
    };
    if host.is_empty() {
        None
    } else {
        Some(host.to_owned())
    }
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
    use secrecy::{ExposeSecret as _, SecretString};

    /// Settings with Google OAuth configured against the given web origin + callback.
    fn oauth_settings(web_origin: &str, callback: &str) -> Settings {
        let mut settings = crate::config::dev_settings();
        settings.web_origin = web_origin.to_owned();
        settings.oauth_google_client_id = Some("client-id".to_owned());
        settings.oauth_google_client_secret = Some(SecretString::from("client-secret".to_owned()));
        settings.oauth_google_callback_url = Some(callback.to_owned());
        settings
    }

    #[test]
    fn oauth_config_is_disabled_without_google() {
        // With no Google credentials the mapper yields the empty default: OAuth off.
        let config = oauth_config(&crate::config::dev_settings());
        assert!(config.google.is_none());
        assert!(config.success_redirect_url.is_none());
        assert!(config.redirect_allowlist.is_empty());
    }

    #[test]
    fn oauth_config_wires_google_redirects_and_allowlist() {
        // A configured provider derives the three redirect URLs from the web origin and
        // pins the web-origin + callback hosts on the allow-list.
        let settings = oauth_settings(
            "http://localhost:3000/",
            "http://localhost:3000/api/auth/oauth/google/callback",
        );
        let config = oauth_config(&settings);
        let google = config.google.expect("google is configured");
        assert_eq!(google.client_id, "client-id");
        assert_eq!(google.client_secret.expose_secret(), "client-secret");
        assert_eq!(
            config.success_redirect_url.as_deref(),
            Some("http://localhost:3000/auth/oauth/success")
        );
        assert_eq!(
            config.error_redirect_url.as_deref(),
            Some("http://localhost:3000/auth/oauth/error")
        );
        assert_eq!(
            config.mfa_redirect_url.as_deref(),
            Some("http://localhost:3000/auth/mfa")
        );
        // Both candidate URLs share the `localhost` host, so it appears once.
        assert_eq!(config.redirect_allowlist, vec!["localhost".to_owned()]);
    }

    #[test]
    fn allowlist_collects_distinct_hosts() {
        // A callback on a different host contributes a second allow-list entry.
        let config = oauth_config(&oauth_settings(
            "https://app.example.com",
            "https://api.example.com/callback",
        ));
        assert_eq!(
            config.redirect_allowlist,
            vec!["app.example.com".to_owned(), "api.example.com".to_owned()]
        );
    }

    #[test]
    fn production_config_validates_the_derived_allowlist() {
        // The derived allow-list must satisfy the library's production redirect-host check
        // for every candidate URL (the three redirects + the Google callback). Building and
        // validating the full config under `Production` exercises the library's own host
        // matcher against our `host_of` output, so any divergence surfaces here as a
        // validation failure rather than a silently broken redirect in production.
        let settings = oauth_settings(
            "https://app.example.com",
            "https://app.example.com/api/auth/oauth/google/callback",
        );
        let config = crate::engine::config::build_auth_config(
            &settings,
            bymax_auth_core::config::Environment::Production,
        )
        .expect("the production OAuth config validates against the library allow-list");
        assert_eq!(
            config.oauth.redirect_allowlist,
            vec!["app.example.com".to_owned()]
        );
        assert!(config.controllers.oauth);
    }

    #[test]
    fn google_provider_is_none_without_credentials() {
        // No Google credentials → no provider, no TLS client built.
        let provider = google_provider(&crate::config::dev_settings());
        assert!(matches!(provider, Ok(None)));
    }

    #[test]
    fn google_provider_builds_the_named_provider() {
        // A configured provider constructs over the TLS transport and answers to `google`.
        let settings = oauth_settings(
            "http://localhost:3000",
            "http://localhost:3000/api/auth/oauth/google/callback",
        );
        let provider = google_provider(&settings).expect("the provider builds");
        let provider = provider.expect("google is configured");
        assert_eq!(provider.name(), "google");
    }

    #[test]
    fn host_of_handles_ports_userinfo_ipv6_and_relative() {
        // Ports and userinfo are stripped; a bracketed IPv6 literal is kept; a relative
        // path has no host.
        assert_eq!(
            host_of("http://localhost:3000/x").as_deref(),
            Some("localhost")
        );
        assert_eq!(
            host_of("https://user:pw@example.com:8443/p").as_deref(),
            Some("example.com")
        );
        assert_eq!(host_of("https://[::1]:8443/p").as_deref(), Some("[::1]"));
        assert_eq!(
            host_of("//cdn.example.com/p").as_deref(),
            Some("cdn.example.com")
        );
        assert_eq!(host_of("/relative/path"), None);
        assert_eq!(host_of("https://"), None);
    }
}
