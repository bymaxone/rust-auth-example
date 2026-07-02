//! Hermetic OAuth + invitation coverage against the library `testing` doubles plus the
//! example's real `AuditAuthHooks` — no Redis, Postgres, or HTTP. It proves the
//! `on_oauth_login` Create/Link/Reject branches, the MFA challenge branch, the single-use
//! `state` guard, the unverified-email rejection, and the invitation create→accept session.
#![forbid(unsafe_code)]
#![allow(
    // Integration tests panic to signal failure, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this file.
    clippy::unwrap_used,
    clippy::expect_used
)]

mod common;

use std::collections::BTreeMap;
use std::sync::Arc;

use async_trait::async_trait;
use bymax_auth_core::OAuthOutcome;
use bymax_auth_core::context::RequestContext;
use bymax_auth_core::services::auth::AcceptInvitationInput;
use bymax_auth_core::traits::oauth::{
    OAuthProfile, OAuthProvider, OAuthProviderError, OAuthTokens,
};
use bymax_auth_core::traits::{InvitationStore, StoredInvitation, UserRepository};
use bymax_auth_types::{
    AuthError, CreateUserData, CreateWithOAuthData, MfaChallengeResult, UpdateMfaData,
};

/// The tenant the OAuth flows run against.
const TENANT: &str = "acme";
/// The canned identity the mock provider returns.
const MOCK_PROVIDER_ID: &str = "mock-123";
/// The canned verified email the mock profile carries.
const MOCK_EMAIL: &str = "mock@example.com";

/// Recover the `state` query parameter from a mock authorize URL.
fn state_of(url: &str) -> String {
    url.split_once('?')
        .map(|(_, query)| query)
        .unwrap_or_default()
        .split('&')
        .find_map(|pair| pair.strip_prefix("state="))
        .unwrap_or_default()
        .to_owned()
}

/// A fresh request context for a callback.
fn ctx() -> RequestContext {
    RequestContext::new("203.0.113.4", "agent/1.0", BTreeMap::new())
}

/// Data to seed a user already bound to the mock Google identity, with the given status.
fn oauth_user(status: &str) -> CreateWithOAuthData {
    CreateWithOAuthData {
        email: MOCK_EMAIL.to_owned(),
        name: "Existing".to_owned(),
        role: None,
        status: Some(status.to_owned()),
        tenant_id: TENANT.to_owned(),
        email_verified: Some(true),
        oauth_provider: "google".to_owned(),
        oauth_provider_id: MOCK_PROVIDER_ID.to_owned(),
    }
}

/// An OAuth provider whose profile fetch reports the email as unverified, so the engine
/// rejects the callback before the account policy ever runs.
struct UnverifiedProvider;

#[async_trait]
impl OAuthProvider for UnverifiedProvider {
    fn name(&self) -> &str {
        "google"
    }
    fn authorize_url(&self, state: &str, code_challenge: Option<&str>) -> String {
        match code_challenge {
            Some(challenge) => {
                format!("https://mock.test/auth?state={state}&code_challenge={challenge}")
            }
            None => format!("https://mock.test/auth?state={state}"),
        }
    }
    async fn exchange_code(
        &self,
        _code: &str,
        _code_verifier: Option<&str>,
    ) -> Result<OAuthTokens, OAuthProviderError> {
        Ok(OAuthTokens {
            access_token: "at".to_owned(),
            token_type: "bearer".to_owned(),
            expires_in: None,
            scope: None,
            id_token: None,
            refresh_token: None,
        })
    }
    async fn fetch_profile(&self, _access_token: &str) -> Result<OAuthProfile, OAuthProviderError> {
        Err(OAuthProviderError::EmailNotVerified)
    }
}

#[tokio::test]
async fn callback_creates_then_links_without_duplicating() {
    let te = common::testing_engine();

    // First callback for an unseen verified email → Create + a full session.
    let url = te.engine.oauth_initiate("google", TENANT).await.unwrap();
    let created = te
        .engine
        .oauth_callback("google", "code", &state_of(&url), &ctx())
        .await
        .expect("create authenticates");
    assert!(matches!(&created, OAuthOutcome::Authenticated(_)));
    let OAuthOutcome::Authenticated(first) = created else {
        return;
    };
    assert_eq!(first.user.email, MOCK_EMAIL);
    assert_eq!(first.user.oauth_provider.as_deref(), Some("google"));
    assert!(
        te.users
            .find_by_oauth_id("google", MOCK_PROVIDER_ID, TENANT)
            .await
            .unwrap()
            .is_some(),
        "the account was provisioned"
    );

    // A second callback for the same identity → Link to the same account, not a duplicate.
    let url = te.engine.oauth_initiate("google", TENANT).await.unwrap();
    let linked = te
        .engine
        .oauth_callback("google", "code", &state_of(&url), &ctx())
        .await
        .expect("link authenticates");
    assert!(
        matches!(&linked, OAuthOutcome::Authenticated(_)),
        "the link resolves to a session"
    );
    let OAuthOutcome::Authenticated(second) = linked else {
        return;
    };
    assert_eq!(
        second.user.id, first.user.id,
        "the existing account is linked, not duplicated"
    );
}

#[tokio::test]
async fn callback_rejects_a_not_active_account() {
    let te = common::testing_engine();
    te.users
        .create_with_oauth(oauth_user("suspended"))
        .await
        .unwrap();

    let url = te.engine.oauth_initiate("google", TENANT).await.unwrap();
    let outcome = te
        .engine
        .oauth_callback("google", "code", &state_of(&url), &ctx())
        .await;
    assert!(matches!(outcome, Err(AuthError::OauthFailed)));
}

#[tokio::test]
async fn callback_returns_an_mfa_challenge_for_an_mfa_user() {
    let te = common::testing_engine();
    let user = te
        .users
        .create_with_oauth(oauth_user("active"))
        .await
        .unwrap();
    te.users
        .update_mfa(
            &user.id,
            UpdateMfaData {
                mfa_enabled: true,
                mfa_secret: Some("enc".to_owned()),
                mfa_recovery_codes: None,
            },
        )
        .await
        .unwrap();

    let url = te.engine.oauth_initiate("google", TENANT).await.unwrap();
    let outcome = te
        .engine
        .oauth_callback("google", "code", &state_of(&url), &ctx())
        .await
        .expect("the callback resolves to a challenge");
    assert!(matches!(
        outcome,
        OAuthOutcome::MfaChallenge(MfaChallengeResult {
            mfa_required: true,
            ..
        })
    ));
}

#[tokio::test]
async fn callback_rejects_forged_and_replayed_state() {
    let te = common::testing_engine();

    // A never-issued state is rejected without consuming any resource.
    assert!(matches!(
        te.engine
            .oauth_callback("google", "code", &"f".repeat(64), &ctx())
            .await,
        Err(AuthError::OauthFailed)
    ));

    // A genuine state is single-use: the first callback consumes it, the replay fails.
    let url = te.engine.oauth_initiate("google", TENANT).await.unwrap();
    let state = state_of(&url);
    assert!(
        te.engine
            .oauth_callback("google", "code", &state, &ctx())
            .await
            .is_ok()
    );
    assert!(matches!(
        te.engine
            .oauth_callback("google", "code", &state, &ctx())
            .await,
        Err(AuthError::OauthFailed)
    ));
}

#[tokio::test]
async fn callback_rejects_an_unverified_email() {
    let te = common::testing_engine_with(Arc::new(UnverifiedProvider));
    let url = te.engine.oauth_initiate("google", TENANT).await.unwrap();
    let outcome = te
        .engine
        .oauth_callback("google", "code", &state_of(&url), &ctx())
        .await;
    assert!(matches!(outcome, Err(AuthError::OauthFailed)));
}

#[tokio::test]
async fn invitation_create_accept_issues_a_session() {
    let te = common::testing_engine();
    let inviter = te
        .users
        .create(CreateUserData {
            email: "inviter@example.com".to_owned(),
            name: "Inviter".to_owned(),
            password_hash: Some("$scrypt$seed".to_owned()),
            role: Some("admin".to_owned()),
            status: Some("active".to_owned()),
            tenant_id: TENANT.to_owned(),
            email_verified: Some(true),
        })
        .await
        .unwrap();

    // The create path runs (the emailed token is opaque under the NoOp provider), then a
    // known invitation is stored directly so the accept path can be driven.
    te.engine
        .invite(
            &inviter.id,
            "invitee@example.com",
            "user",
            TENANT,
            Some("Acme"),
        )
        .await
        .expect("the invitation is created");
    let token = "c".repeat(64);
    te.stores
        .put_invitation(
            &token,
            &StoredInvitation {
                email: "invitee@example.com".to_owned(),
                role: "user".to_owned(),
                tenant_id: TENANT.to_owned(),
                inviter_user_id: inviter.id.clone(),
            },
            600,
        )
        .await
        .unwrap();

    let accepted = te
        .engine
        .accept_invitation(
            AcceptInvitationInput {
                token: token.clone(),
                name: "New Member".to_owned(),
                password: "invitee-strong-pw".to_owned(),
            },
            "203.0.113.4",
            "agent/1.0",
            BTreeMap::new(),
        )
        .await
        .expect("acceptance issues a session");
    assert_eq!(accepted.user.email, "invitee@example.com");
    assert!(!accepted.access_token.is_empty(), "a session is issued");

    // The token is single-use: a replay is rejected.
    assert!(matches!(
        te.engine
            .accept_invitation(
                AcceptInvitationInput {
                    token,
                    name: "Replay".to_owned(),
                    password: "another-strong-pw".to_owned(),
                },
                "203.0.113.4",
                "agent/1.0",
                BTreeMap::new(),
            )
            .await,
        Err(AuthError::InvalidInvitationToken)
    ));
}
