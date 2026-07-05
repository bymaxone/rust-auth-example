# Multi-factor authentication (TOTP)

The example enables time-based one-time-password (TOTP) MFA: a second factor enrolled from an
authenticator app, verified with an RFC 6238 code, and sealed at rest under AES-256-GCM. This
reference documents the configuration, the lifecycle routes, the crypto primitives
(`totp::verify`, `aead::encrypt`/`decrypt`, `encode_secret_base32`, `provisioning_uri`), the
anti-replay markers, and the console flow. It expands
[OVERVIEW §11](./OVERVIEW.md#11-the-authentication-pipelines-deep-dive) with the MFA specifics
and reconciles them against the source.

Identifiers are verified against the example's config wiring in
[`apps/api/src/engine/config.rs`](../apps/api/src/engine/config.rs), the library crypto crate
(`bymax_auth_crypto::totp`, `bymax_auth_crypto::aead`), the MFA store contract
(`bymax_auth_core::traits::store::MfaStore`), and the console surface in
[`apps/web/lib/mfa-api.ts`](../apps/web/lib/mfa-api.ts) and
[`apps/web/components/mfa/`](../apps/web/components/mfa/).

---

## The MFA configuration

MFA is modelled as `Option<MfaConfig>` on the library `AuthConfig`, so a present value
structurally guarantees the key and issuer are set; enabling the MFA controller group requires
it. The example populates it from settings in
[`apps/api/src/engine/config.rs`](../apps/api/src/engine/config.rs):

```rust
// apps/api/src/engine/config.rs
config.mfa = Some(MfaConfig {
    encryption_key: settings.mfa_encryption_key.clone(), // AES-256-GCM key (MFA_ENCRYPTION_KEY)
    issuer: "rust-auth-example".to_owned(),              // shown in authenticator apps
    recovery_code_count: 8,                              // codes minted on enable
    totp_window: 1,                                      // accepted ±30 s drift steps
});
config.controllers = ControllerToggles { mfa: true, ..config.controllers };
```

| Field | Value in this example | Meaning |
| --- | --- | --- |
| `encryption_key` | `MFA_ENCRYPTION_KEY` (base64, decodes to exactly 32 bytes) | seals every TOTP secret at rest |
| `issuer` | `rust-auth-example` | the label shown in the authenticator app |
| `recovery_code_count` | `8` | one-time recovery codes minted on enable |
| `totp_window` | `1` | accepted drift in ±30 s steps |

`MFA_ENCRYPTION_KEY` is validated at boot: it must be base64 that decodes to **exactly 32 bytes**
(an AES-256 key), else startup aborts with a precise error. See
[ENVIRONMENT.md](./ENVIRONMENT.md) for the variable and its guard.

---

## The lifecycle routes

The library mounts the dashboard MFA group under the `/auth` prefix (route constants from
`@bymax-one/rust-auth/shared` `AUTH_ROUTES`):

| Route | `AUTH_ROUTES` key | Purpose |
| --- | --- | --- |
| `POST /auth/mfa/setup` | `MFA_SETUP` | mint a fresh secret + `otpauth://` URI + recovery codes (shown once) |
| `POST /auth/mfa/verify-enable` | `MFA_VERIFY_ENABLE` | activate MFA with the first valid TOTP code |
| `POST /auth/mfa/challenge` | `MFA_CHALLENGE` | complete an MFA-required login (redeems the temp token) |
| `POST /auth/mfa/disable` | `MFA_DISABLE` | disable MFA, gated by a fresh TOTP code |
| `POST /auth/mfa/recovery-codes` | `MFA_RECOVERY_CODES` | regenerate the recovery codes, gated by a fresh TOTP code |

The tenant-less platform-admin domain mirrors this under `/auth/platform/mfa/*`
(`PLATFORM_MFA_SETUP`, `PLATFORM_MFA_VERIFY_ENABLE`, `PLATFORM_MFA_CHALLENGE`,
`PLATFORM_MFA_DISABLE`, `PLATFORM_MFA_RECOVERY_CODES`). Platform MFA is **fail-closed**:
`platform.enabled` without an MFA config refuses an MFA-enabled admin login (see
[OVERVIEW §12](./OVERVIEW.md#12-identity-domains--extension-points)).

---

## TOTP verification

TOTP codes are verified by `bymax_auth_crypto::totp::verify`, an RFC 6238 (over RFC 4226 HOTP,
HMAC-SHA1) implementation:

```rust
// bymax_auth_crypto::totp
pub fn verify(secret: &[u8], code: &str, unix_time: u64, window: u8) -> bool
```

- **Time step** is 30 seconds and codes are **6 digits** (the authenticator-app defaults).
- **Drift tolerance** accepts any code within `±window` 30-second steps. The `window` is
  **clamped** to a maximum of `2` steps, so an oversized (or hostile) value cannot force an
  unbounded number of HOTP computations — the per-verification work is bounded to
  `2 * window + 1` candidates. The example configures `totp_window: 1`.
- **Constant time.** The digit comparison accumulates into a `subtle::Choice` (not an
  early-returning `bool`), and every in-range step is evaluated with no early return, so neither
  the code value nor the matching step leaks through timing.
- **Anti-replay is not this primitive's job** — it lives in the engine + the `MfaStore` markers
  ([below](#the-challenge--anti-replay)).

The implementation is pinned to the RFC 4226 / RFC 6238 test vectors, so it interoperates with
every standard authenticator app.

---

## Secret encoding & the provisioning URI

On `setup` the engine mints a fresh secret and returns it two ways — the raw base32 for manual
entry and an `otpauth://` URI for the QR — both produced by `bymax_auth_crypto::totp`:

```rust
pub fn encode_secret_base32(secret: &[u8]) -> String;          // RFC 4648, upper-case, no padding
pub fn provisioning_uri(secret: &[u8], account: &str, issuer: &str) -> String;
```

`provisioning_uri` produces:

```
otpauth://totp/{issuer}:{account}?secret=...&issuer=...&period=30&digits=6&algorithm=SHA1
```

with the label and `issuer` percent-encoded. Both the base32 secret and the URI embed the live
secret and are therefore sensitive — they are shown once and never persisted.

---

## Sealing the secret at rest

The TOTP secret is never stored in plaintext. It is sealed with AES-256-GCM authenticated
encryption keyed by `MFA_ENCRYPTION_KEY`, using `bymax_auth_crypto::aead`:

```rust
pub fn encrypt(plaintext: &[u8], key: &[u8; 32]) -> Result<String, CryptoError>;
pub fn decrypt(wire: &str, key: &[u8; 32]) -> Result<Vec<u8>, CryptoError>;
```

- **Wire format** is the self-describing string `base64(nonce):base64(tag):base64(ciphertext)`.
- **Fresh nonce per call.** Each `encrypt` draws a fresh 12-byte CSPRNG nonce (GCM nonce reuse
  under one key is catastrophic), so two encryptions of the same secret differ.
- **Opaque failures.** Every decryption failure mode — malformed wire, wrong segment length,
  wrong key, tampered ciphertext or tag — collapses to one `CryptoError::Decrypt`, so the error
  type is not a padding/format oracle.

The sealed wire string is what the `MfaStore` `mfa_setup:` record holds — the store sees only
the opaque ciphertext, never the plaintext secret. The persisted, enabled secret is stored the
same way in Postgres (see [DATABASE.md](./DATABASE.md)); the encrypted TOTP secret and the
recovery codes back the `AuthUser` MFA columns.

---

## The challenge & anti-replay

When a user with MFA enabled logs in, the engine returns an `MfaChallengeResult` carrying a
short-lived MFA temp token (a signed JWT, 5-minute lifetime) instead of a session. The console
routes to the challenge page, which redeems it at `POST /auth/mfa/challenge`. Anti-replay is
enforced by the `MfaStore` markers — three keyspaces in Redis (see
[REDIS.md](./REDIS.md#the-key-catalog)):

| Marker | Prefix | Role |
| --- | --- | --- |
| Pending setup (AEAD-sealed) | `mfa_setup` | the `SET NX` enrollment record consumed by `verify-enable` |
| Temp-token single-use | `mfa` | one-shot marker for the challenge temp token |
| TOTP anti-replay | `tu` | marks a code as used so it cannot be replayed |

The login/OAuth challenge path runs the **fused** `challenge_consume` step: it sets the `tu:`
replay marker `NX` and, *iff* that marker was newly created, deletes the `mfa:` temp token — in
one atomic Lua script. This makes "mark the code used" and "consume the temp token"
inseparable, so neither a replayed code nor two distinct still-valid codes sharing one temp
token can ever issue more than one session. The enable/disable/regenerate paths, which have no
temp token, use the standalone `mark_totp_used` marker.

The enable path reads the pending-setup record with `GET` (not `GETDEL`) so a mistyped code
leaves the token alive for a retry, and consumes it atomically with `take_setup` (`GETDEL`) only
on the completing `verify-enable`.

---

## Recovery codes

Enabling MFA mints `recovery_code_count` (8) one-time recovery codes, returned in the same
`setup` payload and shown once. A recovery code substitutes for a TOTP code at the challenge, and
regenerating them (gated by a fresh TOTP code) invalidates the previous set. Like the secret,
codes are never persisted client-side and are stored server-side only in a hashed form (see
[DATABASE.md](./DATABASE.md) for the recovery-code column).

---

## The console

The web console drives the full lifecycle over the shared `authFetch` client
([`apps/web/lib/mfa-api.ts`](../apps/web/lib/mfa-api.ts)):

| Function | Route | Returns |
| --- | --- | --- |
| `mfaSetup()` | `MFA_SETUP` | `MfaSetupResult` — `secret`, `qrCodeUri`, `recoveryCodes` |
| `mfaVerifyEnable(code)` | `MFA_VERIFY_ENABLE` | resolves on success |
| `mfaDisable(code)` | `MFA_DISABLE` | resolves on success |
| `mfaRegenerateRecoveryCodes(code)` | `MFA_RECOVERY_CODES` | the new `recoveryCodes` |

The enrollment card
([`apps/web/components/mfa/QrEnrollmentCard.tsx`](../apps/web/components/mfa/QrEnrollmentCard.tsx))
renders the `otpauth://` URI as a QR **in the browser** (via `qrcode`, so the secret never leaves
the client), the copyable base32 secret, and the one-time
[`RecoveryCodeGrid`](../apps/web/components/mfa/RecoveryCodeGrid.tsx) with copy + download
affordances and a "shown only once" warning. Nothing here is persisted — the secret and codes
live only in the render.

During an MFA-required login, the temp token is held in memory only by
[`apps/web/lib/mfa-challenge-store.ts`](../apps/web/lib/mfa-challenge-store.ts):
`setPendingMfaChallenge(tempToken)` stores it, and the challenge page consumes it exactly once
with `consumePendingMfaChallenge()`. The token never touches `localStorage`, `sessionStorage`,
cookies, or the URL. The public challenge page lives at `(public)/auth/mfa-challenge`, and the
enrollment UI at `/dashboard/security`; see [DASHBOARD.md](./DASHBOARD.md) for the page specs.

---

## Further reading

- [OVERVIEW.md](./OVERVIEW.md#11-the-authentication-pipelines-deep-dive) — where the MFA
  challenge sits in the login pipeline.
- [REDIS.md](./REDIS.md#the-key-catalog) — the `mfa_setup`/`mfa`/`tu` markers and the fused
  challenge-consume.
- [DATABASE.md](./DATABASE.md) — the AEAD-sealed secret and recovery-code columns.
- [ENVIRONMENT.md](./ENVIRONMENT.md) — `MFA_ENCRYPTION_KEY` and its boot-time guard.
- [DASHBOARD.md](./DASHBOARD.md) — the enrollment card, recovery-code grid, and challenge page.
