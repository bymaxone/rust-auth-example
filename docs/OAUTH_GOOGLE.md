# Google OAuth (sign-in)

The example wires the library's built-in Google provider over an example-owned TLS transport,
and implements the mandatory account-resolution policy (`on_oauth_login`). This reference
documents enabling Google, the injected `HttpClient`, the endpoints and scopes, the
PKCE + `state` flow, the Create/Link/Reject decision, the redirect-safety checks, and the
console panel. It expands
[OVERVIEW §11](./OVERVIEW.md#11-the-authentication-pipelines-deep-dive) with the OAuth specifics
and reconciles them against the source.

Identifiers are verified against
[`apps/api/src/engine/oauth.rs`](../apps/api/src/engine/oauth.rs),
[`apps/api/src/oauth/tls_http_client.rs`](../apps/api/src/oauth/tls_http_client.rs),
[`apps/api/src/hooks/oauth_policy.rs`](../apps/api/src/hooks/oauth_policy.rs), the library
provider (`bymax_auth_core::GoogleOAuthProvider`), the OAuth contracts
(`bymax_auth_core::traits::oauth`, `bymax_auth_core::traits::http`), and the console flow in
[`apps/web/lib/oauth.ts`](../apps/web/lib/oauth.ts).

---

## Enabling Google

Google sign-in is **all-or-nothing**: it stays disabled unless all three `OAUTH_GOOGLE_*`
variables are configured together.

| Variable | Meaning |
| --- | --- |
| `OAUTH_GOOGLE_CLIENT_ID` | the Google OAuth client id |
| `OAUTH_GOOGLE_CLIENT_SECRET` | the Google OAuth client secret (redacted in `Debug`, zeroized on drop) |
| `OAUTH_GOOGLE_CALLBACK_URL` | the absolute redirect URI registered with Google |

A partially-configured provider is rejected fast at boot: `Settings::validate` counts the three
fields and, if the count is neither `0` nor `3`, returns `ConfigError::OAuthConfigIncomplete` so
a missing secret can never silently disable sign-in. When all three are set,
`Settings::google_oauth()` returns the credentials and the OAuth controller group is enabled;
otherwise the mounted `/auth/oauth/*` routes answer `auth.oauth_failed`. See
[ENVIRONMENT.md](./ENVIRONMENT.md) for the variables and their guard.

The example's `.env.example` registers the callback at the web origin behind the console's
`/api` proxy, e.g. `http://localhost:3000/api/auth/oauth/google/callback`.

---

## The provider & the injected TLS transport

The library's built-in `GoogleOAuthProvider` performs every network call through an injected,
object-safe `HttpClient` — it never constructs a concrete client. Its bundled `ReqwestHttpClient`
ships **no TLS backend** (so `ring`/`openssl` stay off the dependency graph), which leaves
Google's `https://` endpoints unreachable. The example therefore injects its own transport,
`TlsHttpClient`:

```rust
// apps/api/src/engine/oauth.rs
let http = Arc::new(TlsHttpClient::new()?);
Ok(Some(Arc::new(GoogleOAuthProvider::new(google, http))))
//                 GoogleOAuthProvider::new(config: GoogleOAuthConfig, http: Arc<dyn HttpClient>)
```

`TlsHttpClient` ([`apps/api/src/oauth/tls_http_client.rs`](../apps/api/src/oauth/tls_http_client.rs))
is a `reqwest` client pinned to a manually-built **rustls** `ClientConfig` using the
**aws-lc-rs** crypto provider (never `ring`, never a native TLS stack) and Mozilla's webpki root
bundle, HTTPS-only, with a bounded 10-second per-request timeout:

```rust
let tls = rustls::ClientConfig::builder_with_provider(Arc::new(
    rustls::crypto::aws_lc_rs::default_provider(),
))
.with_safe_default_protocol_versions()?
.with_root_certificates(roots)
.with_no_client_auth();
let client = reqwest::Client::builder()
    .use_preconfigured_tls(tls)
    .https_only(true)
    .timeout(REQUEST_TIMEOUT) // 10s
    .build()?;
```

The core-owned `HttpRequest`/`HttpResponse` types carry no `reqwest`/`http` type across the trait
boundary; every transport failure collapses to the opaque `HttpError` family (`Timeout`,
`Connect`, `Transport`), which the engine in turn maps to the client-facing `auth.oauth_failed`.
Construction never panics — a bad TLS config or an unbuildable client surfaces as the typed
`TlsHttpClientError` (`Tls` / `Build`).

To bring your own transport, implement `HttpClient` (one method, `send`) over whatever stack you
already have and inject it in place of `TlsHttpClient`.

---

## Endpoints & scopes

The provider reproduces the standard Google OpenID Connect endpoints, verbatim from
`bymax_auth_core::providers::google`:

| Endpoint | URL | Used by |
| --- | --- | --- |
| Authorization | `https://accounts.google.com/o/oauth2/v2/auth` | `authorize_url` (the consent screen) |
| Token | `https://oauth2.googleapis.com/token` | `exchange_code` (authorization-code exchange) |
| Userinfo | `https://www.googleapis.com/oauth2/v2/userinfo` | `fetch_profile` (profile fetch) |

The default scopes are the canonical OpenID Connect set `openid email profile`. The authorize URL
carries `response_type=code`, the `client_id`, the `redirect_uri`, the `scope`, the `state`, and —
when PKCE is used — `code_challenge` + `code_challenge_method=S256` (the verifier is never
exposed). `exchange_code` posts `grant_type=authorization_code` and asserts the returned
`token_type` is `bearer` before the access token is used. Crucially, `fetch_profile` **rejects
unless Google positively confirms the email is verified** (`verified_email == Some(true)`), so a
non-standard or changed response can never promote an unverified account to a trusted subject.

---

## The flow

1. **Initiate.** The console navigates the browser to `GET /auth/oauth/google` (a 302). The
   engine mints a 64-hex CSRF `state` and a PKCE `code_verifier`/`code_challenge`, stores the
   opaque payload (the tenant scope + the verifier) under `os:{sha256(state)}` in Redis with a
   short TTL (see [REDIS.md](./REDIS.md#the-key-catalog)), and redirects to Google's authorization
   endpoint.
2. **Consent.** The user approves at Google, which redirects back to the registered
   `OAUTH_GOOGLE_CALLBACK_URL` (`GET /auth/oauth/google/callback`) with `code` and `state`.
3. **Verify + consume `state`.** The engine reads-and-deletes `os:{sha256(state)}` with `getdel`
   (single-use), so a captured or replayed `state` fails.
4. **Exchange + profile.** `exchange_code` swaps the `code` (forwarding the PKCE verifier) for
   tokens; `fetch_profile` fetches the normalized `OAuthProfile` and enforces the verified-email
   gate.
5. **Decide.** The engine consults [`on_oauth_login`](#the-on_oauth_login-policy) for the
   Create/Link/Reject decision.
6. **Redirect.** The callback issues a 302 to one of the operator-configured targets
   ([below](#redirect-safety)).

---

## The `on_oauth_login` policy

`on_oauth_login` is a **blocking decision hook**, and its library default is a **secure DENY**
(`OAuthLoginResult::Reject`) — OAuth sign-in stays disabled until the deployer implements it. The
example implements the concrete policy in
[`apps/api/src/hooks/oauth_policy.rs`](../apps/api/src/hooks/oauth_policy.rs):

```rust
// apps/api/src/hooks/oauth_policy.rs
pub(crate) fn decide_oauth_login(
    _profile: &OAuthProfile,
    existing_user: Option<&SafeAuthUser>,
) -> OAuthLoginResult {
    match existing_user {
        Some(user) if user.status != "active" => OAuthLoginResult::Reject {
            reason: Some("linked account is not active".to_owned()),
        },
        Some(_) => OAuthLoginResult::Link,
        None => OAuthLoginResult::Create,
    }
}
```

- **Create** — no local account is bound to the identity (`existing_user == None`). Safe to
  provision, because the provider already gated the email as verified.
- **Link** — a matching account in good standing (`status == "active"`) links the OAuth identity.
- **Reject** — a matching account that is not active is refused with a client-safe reason.

The decision is recorded to the audit log by the example's `AuthHooks` implementation — `Create`
→ `oauth_login_create`, `Link` → `oauth_login_link`, `Reject` → `oauth_login_reject` (see
[OVERVIEW §15](./OVERVIEW.md#15-auth-event-tracking--the-audit-domain)).

---

## Redirect safety

The three callback redirect targets are **operator-configured** and derived from `WEB_ORIGIN` —
never request-derived — so there is no open-redirect surface. `oauth_config` in
[`apps/api/src/engine/oauth.rs`](../apps/api/src/engine/oauth.rs) builds them:

| Target | Path (appended to `WEB_ORIGIN`) | When |
| --- | --- | --- |
| Success | `/auth/oauth/success` | a full sign-in completed |
| MFA | `/auth/mfa` | the account has MFA enabled (challenge before tokens) |
| Error | `/auth/oauth/error` | the callback failed (`?error=<code>` appended) |

`oauth_config` also pins a `redirect_allowlist` of the web-origin host and the callback host
(de-duplicated, extracted by `host_of`, which strips scheme/userinfo/port and keeps a bracketed
IPv6 literal). Under `Environment::Production` the library validates every candidate redirect
against this allow-list, and requires `WEB_ORIGIN` to be `https://` — so a misconfigured redirect
fails fast at boot rather than silently at runtime.

---

## The console

The console gates the affordance and validates the callback trace in
[`apps/web/lib/oauth.ts`](../apps/web/lib/oauth.ts):

- `isGoogleOAuthEnabled()` reads `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED` (`'true'` shows the button).
- `googleInitiateUrl(tenantId)` builds the browser entry URL to the 302 initiate route
  (`{NEXT_PUBLIC_API_URL}/auth/oauth/google?tenantId=…`); PKCE + `state` are minted server-side.
- `parseCallbackTrace(decision, branch)` validates the callback's `decision`
  (`created` | `linked`) and `branch` (`authenticated` | `redirect` | `mfa_challenge`) query
  values into a typed `OAuthCallbackTrace`, or `null` when either is invalid.

The panel at `/dashboard/oauth`
(`apps/web/app/(dashboard)/dashboard/oauth/page.tsx`) renders "Continue with Google" when
enabled (or a "not configured" explainer otherwise), the
localized `auth.*` code on failure, and the `on_oauth_login` Create-vs-Link `DecisionTrace` from
the `decision`/`branch` query values the callback reports back. See
[DASHBOARD.md](./DASHBOARD.md) for the full page spec.

---

## Bring your own provider

The provider seam is the `OAuthProvider` trait (four methods: `name`, `authorize_url`,
`exchange_code`, `fetch_profile`). Implement it for another provider, perform its network I/O
through the injected `HttpClient`, and register it on the engine builder. The `state` + PKCE
storage (`OAuthStateStore`, the `os:` keyspace) and the `on_oauth_login` decision are
provider-agnostic and apply unchanged.

---

## Further reading

- [OVERVIEW.md](./OVERVIEW.md#11-the-authentication-pipelines-deep-dive) — the OAuth flow within
  the pipeline overview.
- [REDIS.md](./REDIS.md#the-key-catalog) — the single-use `os:` `state` + PKCE record.
- [MFA.md](./MFA.md) — the MFA challenge branch a verified OAuth login can route to.
- [ENVIRONMENT.md](./ENVIRONMENT.md) — the `OAUTH_GOOGLE_*` variables and
  `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED`.
- [DASHBOARD.md](./DASHBOARD.md) — the OAuth panel and decision trace.
