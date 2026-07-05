# Redis stores, namespace & key catalog

Every ephemeral, security-sensitive datum this app keeps — refresh sessions, the access-token
revocation list, OTPs, brute-force counters, WebSocket tickets, password-reset and invitation
proofs, MFA setup/challenge markers, and the OAuth `state` — lives in Redis, behind a single
handle. This reference documents that handle, the namespace it prefixes every key with, the
eight store traits it satisfies, and the twenty-prefix key catalog. It expands
[OVERVIEW §12](./OVERVIEW.md#12-identity-domains--extension-points) with the concrete
trait/prefix mapping and reconciles it against the library source.

The identifiers below are verified against the example wiring in
[`apps/api/src/stores.rs`](../apps/api/src/stores.rs) and
[`apps/api/src/engine/mod.rs`](../apps/api/src/engine/mod.rs), and against the library store
crate (`bymax_auth_redis`: `RedisStores`, `NamespacedRedis`, `Prefix`) and the core store
contracts (`bymax_auth_core::traits::store`).

---

## One handle, every seam

`Arc<RedisStores>` (`RedisStores::connect(url, namespace)`) implements **all eight** store
traits, so it wires straight into the engine builder through a single seam:

- [`SessionStore`](#the-store-traits) · [`OtpStore`](#the-store-traits) ·
  [`BruteForceStore`](#the-store-traits) · [`WsTicketStore`](#the-store-traits) ·
  [`PasswordResetStore`](#the-store-traits) · [`InvitationStore`](#the-store-traits) ·
  [`MfaStore`](#the-store-traits) · [`OAuthStateStore`](#the-store-traits)

The example builds the handle once, in
[`apps/api/src/stores.rs`](../apps/api/src/stores.rs), and shares the same `Arc` between the
engine and the app state, so the process opens exactly one connection pool:

```rust
// apps/api/src/stores.rs
pub fn connect_stores(redis_url: &str, namespace: String) -> Result<Arc<RedisStores>, AppError> {
    let stores = RedisStores::connect(redis_url, namespace)
        .map_err(|err| AppError::from(AuthError::from(err)))?;
    Ok(Arc::new(stores))
}
```

`RedisStores::connect` builds a `deadpool-redis` pool **lazily** — no network I/O happens at
construction, so a malformed `REDIS_URL` is the only failure surfaced here (the first real
round-trip happens when a store method runs). A backend failure collapses to the opaque
`AuthError::Internal`, so a connection detail never reaches a client.

In [`apps/api/src/engine/mod.rs`](../apps/api/src/engine/mod.rs) the one handle satisfies every
store seam. The engine builder takes it via `redis_stores(Arc::clone(&stores))`; when Google
OAuth is configured, the **same** handle also satisfies the OAuth `state` seam via
`oauth_state_store(stores)`:

```rust
let mut builder = AuthEngine::builder()
    // ...required repository + email + hooks seams...
    .redis_stores(Arc::clone(&stores));           // session/otp/brute-force/reset/… 

if let Some(provider) = oauth::google_provider(settings)? {
    builder = builder.oauth_provider(provider).oauth_state_store(stores);
}
```

---

## The namespace

The library prefixes **every** key it owns with `{namespace}:`, applied in exactly one place —
`NamespacedRedis`, the sole component permitted to build a fully-qualified key:

```rust
// bymax_auth_redis::keys::NamespacedRedis
pub fn key(&self, prefix: Prefix, id: &str) -> String {
    format!("{}:{}:{}", self.namespace, prefix.as_str(), id) // e.g. "rt:abc" → "rust_auth_example:rt:abc"
}
```

The `id` segment is always a hash/HMAC of an identifier (or an opaque high-entropy id), never
raw PII. The namespace comes from `REDIS_NAMESPACE` (default `rust_auth_example`; the library's
own fallback is `auth`) so several projects can share one Redis instance without colliding.
Unlike the SHA-256/HMAC identifier segments, the namespace is applied uniformly: in this
backend **every** prefix — including the access-token revocation list `rv` — passes through
`NamespacedRedis`, so there is **no** un-namespaced key. A key outside the
`rust_auth_example:` prefix is a bug.

`REDIS_URL` and `REDIS_NAMESPACE` are documented in
[ENVIRONMENT.md](./ENVIRONMENT.md); `REDIS_URL` is required (the `.env.example` sets
`redis://localhost:6379`) and `REDIS_NAMESPACE` defaults to `rust_auth_example`.

---

## The store traits

Each trait is a domain-level, intent-named contract (`bymax_auth_core::traits::store`); the
canonical implementation is the Redis backend, and each trait can be swapped for an in-memory
fake under test. Every fallible method returns `AuthError` — the same error the engine
surfaces — so a store failure never leaks a Redis detail.

| Trait | Methods | Backs prefixes |
| --- | --- | --- |
| `SessionStore` | `create_session`, `rotate`, `find_session`, `list_sessions`, `revoke_session`, `delete_grace_pointer`, `revoke_all`, `blacklist_access`, `is_blacklisted` | `rt`/`prt`, `rp`/`prp`, `sess`/`psess`, `sd`/`psd`, `rv` |
| `OtpStore` | `put`, `verify`, `try_begin_resend` | `otp`, `resend` |
| `BruteForceStore` | `is_locked`, `record_failure`, `reset`, `remaining_lockout_secs` | `lf` |
| `WsTicketStore` | `mint`, `redeem` | `wst` |
| `PasswordResetStore` | `put_token`, `consume_token`, `delete_token`, `put_verified`, `consume_verified` | `pr`, `prv` |
| `InvitationStore` | `put_invitation`, `consume_invitation` | `inv` |
| `MfaStore` *(`mfa` feature)* | `put_setup_nx`, `get_setup`, `take_setup`, `put_temp`, `get_temp`, `del_temp`, `mark_totp_used`, `challenge_consume` | `mfa_setup`, `mfa`, `tu` |
| `OAuthStateStore` *(`oauth` feature)* | `put_state`, `take_state` | `os` |

The `SessionKind` argument (`Dashboard` / `Platform`) selects the prefix pair
(`rt`/`prt`, `rp`/`prp`, `sess`/`psess`, `sd`/`psd`), so the two identity domains never share a
session key. The single-use proof stores (`PasswordResetStore`, `InvitationStore`,
`OAuthStateStore`) key on `sha256(token)` and consume with `getdel`, so a proof is valid exactly
once; a consume of an absent/expired/already-used key is the non-error `Ok(None)`.

---

## The key catalog

`Prefix` is the typed set of the twenty catalog prefixes; `Prefix::as_str` returns the stable
wire form, byte-identical to the `@bymax-one/nest-auth` catalog so both backends can share one
Redis. Every key carries a TTL (a value with no TTL would be a bug). TTLs are supplied by the
engine from the `AuthConfig` and are shown here at their library defaults.

| `Prefix` | Wire | Purpose | Owning trait | TTL (default source) |
| --- | --- | --- | --- | --- |
| `Rt` | `rt` | Dashboard refresh-token session | `SessionStore` | ~7 days (`refresh_expires_in_days: 7`) |
| `Rv` | `rv` | Access-JWT revocation blacklist | `SessionStore` | remaining access life (≤ 15 min) |
| `Rp` | `rp` | Dashboard rotation grace pointer | `SessionStore` | ~30 s (`refresh_grace_window`) |
| `Sess` | `sess` | Dashboard active-session index (SET) | `SessionStore` | ~7 days (refresh lifetime) |
| `Sd` | `sd` | Dashboard per-session detail | `SessionStore` | ~7 days (refresh lifetime) |
| `Lf` | `lf` | Per-tenant failed-login counter | `BruteForceStore` | 15 min (`brute_force.window: 900s`) |
| `Otp` | `otp` | One-time password (email verify / reset) | `OtpStore` | 10 min (`otp_ttl: 600s`) |
| `Resend` | `resend` | OTP-resend cooldown | `OtpStore` | the resend cooldown window |
| `Wst` | `wst` | Single-use WebSocket upgrade ticket | `WsTicketStore` | short (~30 s) |
| `Pr` | `pr` | Password-reset link-token proof | `PasswordResetStore` | 10 min (`token_ttl: 600s`) |
| `Prv` | `prv` | Password-reset OTP "verified" token | `PasswordResetStore` | 10 min (`otp_ttl: 600s`) |
| `Inv` | `inv` | Pending invitation | `InvitationStore` | 48 h (`invitations.token_ttl: 172800s`) |
| `Prt` | `prt` | Platform-admin refresh session | `SessionStore` | ~7 days (refresh lifetime) |
| `Prp` | `prp` | Platform rotation grace pointer | `SessionStore` | ~30 s (`refresh_grace_window`) |
| `Psess` | `psess` | Platform active-session index (SET) | `SessionStore` | ~7 days (refresh lifetime) |
| `Psd` | `psd` | Platform per-session detail | `SessionStore` | ~7 days (refresh lifetime) |
| `MfaSetup` | `mfa_setup` | MFA pending-setup record (AEAD-sealed) | `MfaStore` | the pending-enrollment window |
| `Mfa` | `mfa` | MFA temp-token single-use marker | `MfaStore` | 5 min (MFA challenge lifetime) |
| `Tu` | `tu` | TOTP anti-replay marker | `MfaStore` | the TOTP step window |
| `Os` | `os` | Single-use OAuth `state` + PKCE record | `OAuthStateStore` | 10 min (OAuth flow window) |

The `sess`/`psess` SET stores its members as `sd`-hash suffixes; the store reconstructs the full
namespaced key when it invalidates a user's sessions. See [MFA.md](./MFA.md) for the
`mfa_setup`/`mfa`/`tu` lifecycle and [OAUTH_GOOGLE.md](./OAUTH_GOOGLE.md) for the `os` `state`
round-trip.

---

## Atomicity, no-PII, and TTLs

Three invariants are owned by the store implementation, never by the trait contract:

- **Atomicity.** Every read-decide-write transition that could race under concurrency — refresh
  rotation with a grace window, the ownership-checked session revoke, the revoke-all
  transaction, the fixed-window brute-force counter, the attempt-bounded OTP verify, the
  single-use WebSocket ticket, and the **fused** MFA challenge consume — runs as a single atomic
  Lua script. This is the one place a naive store implementation introduces a security bug.
- **No PII in keys.** High-entropy secrets are SHA-256-hashed and low-entropy identifiers are
  HMAC-SHA-256-hashed by the engine before they reach the store; the WebSocket ticket is hashed
  in the store. Only a hash/HMAC or an opaque id is ever a key segment.
- **Every key has a TTL.** So an eviction policy of `volatile-lru` is safe, and losing Redis
  forces re-authentication but causes no durable data loss — that lives in Postgres
  (see [DATABASE.md](./DATABASE.md)).

Stored JSON is camelCase, byte-identical to the nest-auth payloads, so the two backends can
share one Redis instance.

---

## Bring your own store backend

The store seam is swappable: implement the eight traits over any key/value backend and pass the
handle to the engine builder in place of `RedisStores`. Under the `testing` feature the library
ships `InMemoryStores`, which the API test suite uses so end-to-end runs need no live Redis. When
implementing your own, the **atomicity requirements** above are mandatory — the race-sensitive
transitions must be a single atomic step, or a concurrent refresh/rotation/challenge can issue
more than one session.

---

## Inspecting keys

```bash
# Count keys
docker compose exec redis redis-cli DBSIZE

# List this app's keys (SCAN, never KEYS — KEYS blocks the server)
docker compose exec redis redis-cli --scan --pattern 'rust_auth_example:*' | head

# Inspect one key's type and remaining TTL
docker compose exec redis redis-cli TYPE 'rust_auth_example:rt:<hash>'
docker compose exec redis redis-cli TTL  'rust_auth_example:rt:<hash>'

# A user's active dashboard sessions (a SET of session-detail hashes)
docker compose exec redis redis-cli SMEMBERS 'rust_auth_example:sess:<userId>'

# Wipe the dev keyspace — logs EVERY user out. Never run against a shared or production instance.
docker compose exec redis redis-cli FLUSHDB
```

`FLUSHDB` clears sessions, refresh tokens, OTPs, brute-force counters, and the revocation list —
useful to reset local auth state, never to be pointed at production.

---

## Further reading

- [OVERVIEW.md](./OVERVIEW.md#12-identity-domains--extension-points) — the store seam among the
  extension points, and the one-handle wiring.
- [MFA.md](./MFA.md) — the `mfa_setup`/`mfa`/`tu` markers and the fused challenge-consume.
- [OAUTH_GOOGLE.md](./OAUTH_GOOGLE.md) — the single-use `os` `state` + PKCE record.
- [DATABASE.md](./DATABASE.md) — the durable store behind the ephemeral one.
- [ENVIRONMENT.md](./ENVIRONMENT.md) — `REDIS_URL` and `REDIS_NAMESPACE`.
