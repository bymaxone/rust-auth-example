//! Property-based and RFC known-answer-test coverage for the crypto/JWT edges the
//! example depends on: RFC 4226/6238 TOTP vectors, the ±2-step TOTP drift window, the
//! PHC password round-trip and rehash-on-strengthen signal, and the HS256 algorithm pin
//! that rejects an `alg: none` / `alg: RS256` token before any signature math. The
//! primitives live in the library; these tests pin the behavioural contract the example
//! relies on, sourced from the RFCs rather than the implementation's own output.
#![forbid(unsafe_code)]
#![allow(
    // Panicking is the idiomatic failure signal in tests, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this suite.
    clippy::unwrap_used,
    clippy::expect_used
)]

use proptest::prelude::*;

use bymax_auth_core::testing::InMemoryStores;
use bymax_auth_core::traits::store::{
    RotateOutcome, SessionKind, SessionRecord, SessionRotation, SessionStore,
};
use bymax_auth_crypto::password::{self, PasswordParams, ScryptParams};
use bymax_auth_crypto::totp;
use bymax_auth_jwt::{HsKey, JwtError, VerifyOptions, hs256};
use bymax_auth_types::DashboardClaims;

/// The RFC 4226 / RFC 6238 test-vector shared secret: the ASCII string "12345678901234567890".
const RFC_SECRET: &[u8] = b"12345678901234567890";

// --- RFC known-answer tests ---------------------------------------------------------

#[test]
fn hotp_matches_rfc4226_appendix_d_vectors() {
    // The ten HOTP values for counters 0..=9 published in RFC 4226 Appendix D (6 digits,
    // HMAC-SHA1). Reproducing them proves the truncation and modulus exactly track the RFC.
    let expected = [
        755_224u32, 287_082, 359_152, 969_429, 338_314, 254_676, 287_922, 162_583, 399_871, 520_489,
    ];
    for (counter, &want) in expected.iter().enumerate() {
        assert_eq!(
            totp::hotp(RFC_SECRET, counter as u64, 6),
            want,
            "HOTP counter {counter} must match the RFC 4226 vector"
        );
    }
}

#[test]
fn totp_matches_rfc6238_appendix_b_vectors() {
    // RFC 6238 Appendix B (SHA1 column) at the published Unix times. The crate returns six
    // digits, so each vector is the low six digits of the RFC's eight-digit value.
    let vectors = [
        (59u64, 287_082u32),
        (1_111_111_109, 81_804),
        (1_111_111_111, 50_471),
        (1_234_567_890, 5_924),
        (2_000_000_000, 279_037),
        (20_000_000_000, 353_130),
    ];
    for (unix_time, want) in vectors {
        assert_eq!(
            totp::totp(RFC_SECRET, unix_time, 30, 6),
            want,
            "TOTP at T={unix_time} must match the RFC 6238 vector"
        );
    }
}

#[test]
fn totp_verify_rejects_a_known_wrong_code() {
    // A deterministic negative: an all-zero code never matches the RFC vector at T=59, so
    // the verifier rejects it regardless of the ±window (this is the KAT reject companion
    // to the property-based accept below).
    assert!(!totp::verify(RFC_SECRET, "000000", 59, 2));
}

// --- Property: TOTP drift window ----------------------------------------------------

proptest! {
    // HMAC-SHA1 is cheap, so a moderate case count exercises many secrets/times without
    // making the suite slow.
    #![proptest_config(ProptestConfig::with_cases(48))]

    /// A code minted for any step within ±2 of the verification step is accepted, and a
    /// code minted five steps away is rejected — the documented drift window, proven across
    /// arbitrary secrets and times.
    #[test]
    fn totp_accepts_within_the_drift_window_and_rejects_outside(
        secret in prop::collection::vec(any::<u8>(), 16..32),
        // Floor is step*(window+1) so subtracting two steps never underflows the u64 clock.
        unix_time in (30u64 * 3)..4_000_000_000u64,
    ) {
        let step = 30u64;
        let digits = 6u32;
        let window = 2u8;
        for k in -2i64..=2 {
            let at = (unix_time as i64 + k * step as i64) as u64;
            let code = format!("{:0>6}", totp::totp(&secret, at, step, digits));
            prop_assert!(
                totp::verify(&secret, &code, unix_time, window),
                "a code {k} steps away must be inside the ±2 window"
            );
        }
        let far = format!("{:0>6}", totp::totp(&secret, unix_time + step * 5, step, digits));
        prop_assert!(
            !totp::verify(&secret, &far, unix_time, window),
            "a code five steps away must fall outside the ±2 window"
        );
    }
}

// --- PHC password round-trip --------------------------------------------------------

#[test]
fn phc_round_trips_and_flags_a_strengthened_cost() {
    // `verify(hash(pw))` is always true for the right password and false for a mutated one,
    // and `needs_rehash` flips only when the active parameters are strengthened — the
    // rehash-on-verify contract the login path relies on. scrypt at the production cost
    // factor is deliberately expensive, so this exercises a small, representative set of
    // passwords rather than a wide proptest sweep that would hash hundreds of times in the
    // unoptimized test build.
    let passwords = ["hunter2!", "correct horse battery staple"];
    for pw in passwords {
        let phc = password::hash(pw.as_bytes(), &PasswordParams::default()).expect("hash");

        assert!(
            password::verify(pw.as_bytes(), &phc).expect("verify ok"),
            "the correct password must verify against its own hash"
        );
        let wrong = format!("wrong-{pw}-mismatch");
        assert!(
            !password::verify(wrong.as_bytes(), &phc).expect("verify mismatch"),
            "a different password must not verify against the stored hash"
        );

        // The default writer produced this hash, so it is not stale against itself.
        assert!(!password::needs_rehash(&phc, &PasswordParams::default()));
        // Doubling the scrypt cost factor (2^15 -> 2^16) makes the stored hash stale.
        let stronger = PasswordParams {
            scrypt: ScryptParams {
                cost_factor: 1 << 16,
                ..ScryptParams::default()
            },
            ..PasswordParams::default()
        };
        assert!(
            password::needs_rehash(&phc, &stronger),
            "a stronger active cost must mark the stored hash for rehash"
        );
    }
}

// --- HS256 algorithm pinning --------------------------------------------------------

#[test]
fn hs256_verify_rejects_a_non_hs256_algorithm_before_the_hmac_check() {
    // A verifier that honoured the token's own `alg` would accept `alg: none` (no signature)
    // or a public-key algorithm masquerading as an HMAC — the classic alg-confusion attack.
    // The library must reject both with `UnsupportedAlg`, decided from the header alone
    // before any HMAC computation. The payload never has to deserialize: the alg pin fires
    // first, so `{}` as the claims segment is sufficient.
    let key = HsKey::new(b"a-32-byte-minimum-hmac-secret-000".to_vec());
    let opts = VerifyOptions::default();

    // Header {"alg":"none","typ":"JWT"} . {} . (empty signature).
    let alg_none = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.e30.";
    // Header {"alg":"RS256","typ":"JWT"} . {} . (bogus signature bytes).
    let alg_rs256 = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.e30.AAAA";

    for token in [alg_none, alg_rs256] {
        let result = hs256::verify::<DashboardClaims>(token, &key, &opts);
        assert!(
            matches!(result, Err(JwtError::UnsupportedAlg)),
            "a non-HS256 algorithm must be rejected as UnsupportedAlg, got {result:?}"
        );
    }
}

// --- Refresh-rotation reuse defence -------------------------------------------------

#[tokio::test]
async fn a_refresh_token_replayed_past_the_grace_window_is_invalid() {
    // Rotation is single-use with a short grace window. Once the presented token has been
    // rotated and its grace pointer has elapsed (modelled here by deleting it), replaying
    // the same token finds neither a live session nor a grace pointer, so the store returns
    // `RotateOutcome::Invalid` — the signal the engine turns into a full-session revoke.
    let stores = InMemoryStores::new();
    let old_hash = "a".repeat(64);
    let new_hash = "b".repeat(64);
    let newer_hash = "c".repeat(64);

    let record = SessionRecord {
        user_id: "user-1".to_owned(),
        tenant_id: Some("acme".to_owned()),
        role: "user".to_owned(),
        device: "Chrome".to_owned(),
        ip: "203.0.113.9".to_owned(),
        created_at: time::OffsetDateTime::UNIX_EPOCH,
    };

    stores
        .create_session(SessionKind::Dashboard, &old_hash, &record, 3_600)
        .await
        .expect("plant the initial session");

    let first = stores
        .rotate(
            SessionKind::Dashboard,
            &SessionRotation {
                old_hash: old_hash.clone(),
                new_hash: new_hash.clone(),
                new_raw: "raw-new".to_owned(),
                new_record: record.clone(),
                refresh_ttl: 3_600,
                grace_ttl: 60,
            },
        )
        .await
        .expect("the first rotation succeeds");
    assert!(
        matches!(first, RotateOutcome::Rotated(_)),
        "the live token rotates once"
    );

    // The grace window elapses (the just-rotated token can no longer recover the session).
    stores
        .delete_grace_pointer(SessionKind::Dashboard, &old_hash)
        .await
        .expect("drop the grace pointer");

    let replay = stores
        .rotate(
            SessionKind::Dashboard,
            &SessionRotation {
                old_hash: old_hash.clone(),
                new_hash: newer_hash,
                new_raw: "raw-newer".to_owned(),
                new_record: record,
                refresh_ttl: 3_600,
                grace_ttl: 60,
            },
        )
        .await
        .expect("the replayed rotation resolves without error");
    assert!(
        matches!(replay, RotateOutcome::Invalid),
        "a token replayed past the grace window is invalid"
    );
}
