//! The pure OAuth account-resolution policy backing `on_oauth_login`.
//!
//! The engine calls the hook only after the provider has proved the profile email is
//! verified (`GoogleOAuthProvider::fetch_profile` rejects an unverified Google email), so
//! an unseen email is safe to provision. This module owns the single, auditable decision:
//! **Create** an account for an unseen identity, **Link** a matching one that is in good
//! standing, and **Reject** a match that is not active.

use bymax_auth_core::traits::hooks::OAuthLoginResult;
use bymax_auth_core::traits::oauth::OAuthProfile;
use bymax_auth_types::SafeAuthUser;

/// The account status that permits an OAuth link. Any other status is refused.
const ACTIVE_STATUS: &str = "active";

/// Decide the OAuth account action for a verified provider profile.
///
/// - No account bound to the identity (`existing_user == None`) → [`OAuthLoginResult::Create`].
/// - A matching account in good standing (`status == "active"`) → [`OAuthLoginResult::Link`].
/// - A matching account that is not active → [`OAuthLoginResult::Reject`] with a
///   client-safe reason.
///
/// The profile is intentionally not consulted here: the provider already gated the email
/// as verified, so the decision turns only on whether a local account exists and is in
/// good standing.
pub(crate) fn decide_oauth_login(
    _profile: &OAuthProfile,
    existing_user: Option<&SafeAuthUser>,
) -> OAuthLoginResult {
    match existing_user {
        Some(user) if user.status != ACTIVE_STATUS => OAuthLoginResult::Reject {
            reason: Some("linked account is not active".to_owned()),
        },
        Some(_) => OAuthLoginResult::Link,
        None => OAuthLoginResult::Create,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::OffsetDateTime;

    /// A verified Google profile fixture.
    fn profile() -> OAuthProfile {
        OAuthProfile {
            provider: "google".to_owned(),
            provider_id: "google-123".to_owned(),
            email: "user@example.test".to_owned(),
            name: Some("User".to_owned()),
            avatar: None,
        }
    }

    /// A `SafeAuthUser` with the given status (credential-free, as the hook receives it).
    fn safe_user(status: &str) -> SafeAuthUser {
        SafeAuthUser {
            id: "user-1".to_owned(),
            email: "user@example.test".to_owned(),
            name: "User".to_owned(),
            role: "user".to_owned(),
            status: status.to_owned(),
            tenant_id: "acme".to_owned(),
            email_verified: true,
            mfa_enabled: false,
            oauth_provider: Some("google".to_owned()),
            oauth_provider_id: Some("google-123".to_owned()),
            last_login_at: None,
            created_at: OffsetDateTime::UNIX_EPOCH,
        }
    }

    #[test]
    fn an_unseen_identity_is_created() {
        // No existing account → provision a new one from the verified profile.
        assert!(matches!(
            decide_oauth_login(&profile(), None),
            OAuthLoginResult::Create
        ));
    }

    #[test]
    fn a_matching_active_account_is_linked() {
        // A matching account in good standing links the OAuth identity.
        let user = safe_user("active");
        assert!(matches!(
            decide_oauth_login(&profile(), Some(&user)),
            OAuthLoginResult::Link
        ));
    }

    #[test]
    fn a_matching_inactive_account_is_rejected() {
        // A matching account that is not active is refused with a client-safe reason.
        let user = safe_user("suspended");
        assert!(matches!(
            decide_oauth_login(&profile(), Some(&user)),
            OAuthLoginResult::Reject { reason: Some(_) }
        ));
    }
}
