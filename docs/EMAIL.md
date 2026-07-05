# Email: providers, templates, and locales

How transactional email works in this example: the `EmailProvider` contract, the two shipped transports (lettre →
Mailpit in development, Resend over HTTPS), the seven templates, and how to add a locale. Reconciled against
[`apps/api/src/email/`](../apps/api/src/email/).

Every outbound message goes through the library's `EmailProvider` trait (`bymax_auth_core::traits::email`). This example
ships two implementations of it and binds one at startup from `EMAIL_PROVIDER`.

---

## Email flow overview

1. A library flow (email verification, password reset, MFA change, new sign-in, invitation) calls a `send_*` method on
   the injected `EmailProvider`.
2. The bound provider renders an HTML template through the shared, provider-agnostic
   [`templates`](../apps/api/src/email/templates.rs) module and hands the body to its transport.
3. In development the transport is SMTP → **Mailpit**, which captures the message locally without sending anything
   externally.
4. In production the transport is the **Resend** HTTPS API.

One shared template module renders every message, so the two transports can never drift. The OTP or token a message
carries lives only inside the rendered body — it is **never** written to a `tracing` span or a log line.

---

## Provider selection

The transport is chosen from `EMAIL_PROVIDER`, which is authoritative, by
[`resolve_email_provider`](../apps/api/src/email/mod.rs):

| `EMAIL_PROVIDER` | Provider | Transport |
| --- | --- | --- |
| `mailpit` (default) | `LettreEmailProvider` | SMTP → Mailpit (plaintext, zero-credential) |
| `resend` | `ResendEmailProvider` | Resend HTTPS API |

- `resend` **requires** `RESEND_API_KEY`; a missing key is a typed `EmailError::Delivery`, never a silent fallback to
  Mailpit. (`Settings::load` also rejects `resend` without a key at boot — see
  [`ENVIRONMENT.md`](./ENVIRONMENT.md#boot-time-validation).)
- `mailpit` wins even when a `RESEND_API_KEY` is also present — the explicit choice is honoured and the key is ignored.
- `SMTP_FROM` is validated as a well-formed RFC 5321 mailbox on **both** paths: the Resend path checks it explicitly
  before the key check; the Mailpit path while building the transport. An invalid `SMTP_FROM` is the same typed
  `EmailError::Delivery` regardless of the selected transport.

`resolve_kind(&settings)` reports the selected `EmailProviderKind` (`Mailpit` \| `Resend`) without constructing a
provider, so a health or diagnostics view can name the active transport.

---

## The `EmailProvider` contract

Both providers implement every method of `bymax_auth_core::traits::email::EmailProvider`. Each returns `Result<(),
EmailError>` and accepts an optional BCP-47 `locale`. The seven methods, in the order the trait defines them, with the
English subject line and the template each renders:

| Method | Subject (English) | Template | Fires on |
| --- | --- | --- | --- |
| `send_password_reset_token(email, token, locale)` | `Reset your password` | `password_reset_token.html` | Forgot password (link-token mode) |
| `send_password_reset_otp(email, otp, locale)` | `Reset your password` | `password_reset_otp.html` | Forgot password (OTP mode) |
| `send_email_verification_otp(email, otp, locale)` | `Verify your email` | `email_verification_otp.html` | Registration / resend verification |
| `send_mfa_enabled(email, locale)` | `Two-factor authentication enabled` | `mfa_enabled.html` | After MFA enrolment is confirmed |
| `send_mfa_disabled(email, locale)` | `Two-factor authentication disabled` | `mfa_disabled.html` | After MFA is disabled |
| `send_new_session_alert(email, session, locale)` | `New sign-in to your account` | `new_session_alert.html` | Each fresh sign-in (new session) |
| `send_invitation(email, invite, locale)` | `You have been invited` | `invitation.html` | Admin invites a teammate |

`send_new_session_alert` receives a `SessionInfo { device, ip, session_hash }`; `send_invitation` receives an
`InviteData { inviter_name, tenant_name, invite_token, expires_at }`. The `session_hash` is the library's display-only
short hash — never the raw refresh token — so rendering it into the email body carries no credential.

`EmailError` has a single opaque `Delivery` variant: every transport, formatting, or render failure maps to it, so the
HTTP layer never leaks a transport internal to the client.

---

## The two providers

### `LettreEmailProvider` — SMTP → Mailpit

[`apps/api/src/email/lettre.rs`](../apps/api/src/email/lettre.rs). Built with
`LettreEmailProvider::new(host, port, from)`, it opens a **plaintext** async SMTP transport
(`builder_dangerous`) — Mailpit speaks plain SMTP, so no TLS backend is pulled in. Each `send_*` renders the template and
delivers an `text/html` message; a malformed `from` or recipient mailbox, or a transport failure, is
`EmailError::Delivery`. The default endpoint is `SMTP_HOST:SMTP_PORT` = `localhost:1025`.

### `ResendEmailProvider` — Resend HTTPS API

[`apps/api/src/email/resend.rs`](../apps/api/src/email/resend.rs). Built with `ResendEmailProvider::new(api_key, from)`,
it POSTs each rendered message to `https://api.resend.com/emails` with bearer auth (connect timeout 5s, total 10s). A
non-success HTTP status or a network failure is `EmailError::Delivery`. The `reqwest` TLS backend ships without a bundled
crypto provider (to keep the banned `ring` crate off the graph), so the provider installs the ring-free `aws-lc-rs`
rustls provider as the process default exactly once before building its client.

---

## Templates

Templates are compiled HTML rendered with [`askama`](https://docs.rs/askama), under
[`apps/api/templates/email/`](../apps/api/templates/email/). Each is bound to a render struct in
[`templates.rs`](../apps/api/src/email/templates.rs) via `#[template(path = "email/<name>.html")]`:

```
apps/api/templates/email/
├── email_verification_otp.html
├── password_reset_otp.html
├── password_reset_token.html
├── mfa_enabled.html
├── mfa_disabled.html
├── new_session_alert.html
└── invitation.html
```

A render failure is mapped to `EmailError::Delivery` (and logged only as "email template render failed", never with the
body). To change a message's markup, edit the corresponding `.html` file — because askama compiles templates, the change
applies on the next build.

### Registering a custom transport

Implement `bymax_auth_core::traits::email::EmailProvider` for your own type (SendGrid, SES, …) and wire it into the
engine builder in place of `resolve_email_provider` — the library never assumes a concrete transport. See the seams table
in [`OVERVIEW.md §12`](./OVERVIEW.md#12-identity-domains--extension-points).

---

## Locales

Every `send_*` method accepts an optional BCP-47 `locale`. The shared template module selects a copy set from the
**primary language subtag** (matching on `-`/`_`) and falls back to English:

- **English** (`EN`) — the default copy set, used for any unmatched tag.
- **Spanish** (`ES`) — selected for a primary subtag of `es` (for example `es`, `es-ES`).

The dynamic values (OTP, token, session details) are language-independent and supplied separately, so switching the copy
never alters them. To add a locale, extend the `Copy` sets and the `copy_for` match in
[`templates.rs`](../apps/api/src/email/templates.rs); keep all user-facing wording in the copy sets and templates.

---

## Production considerations

When `EMAIL_PROVIDER=resend`:

- `SMTP_FROM` must be a sender address **verified** in the Resend dashboard.
- Configure DNS for the sending domain — **SPF**, **DKIM**, and **DMARC** — or mail lands in spam or is rejected.
- Keep `RESEND_API_KEY` in the secret store, never in the repository.

---

## Further reading

- [`ENVIRONMENT.md`](./ENVIRONMENT.md) — `EMAIL_PROVIDER`, `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM`, and `RESEND_API_KEY`.
- [`OVERVIEW.md §12`](./OVERVIEW.md#12-identity-domains--extension-points) — the `EmailProvider` seam and bring-your-own
  transports.
- [`MFA.md`](./MFA.md) — the flows behind the MFA-enabled / MFA-disabled alerts.
