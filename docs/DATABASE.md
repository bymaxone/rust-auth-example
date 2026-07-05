# Database schema walkthrough

A table-by-table tour of the Postgres schema and the two sqlx repositories that satisfy the library's persistence
seams. Reconciled against the migrations in [`apps/api/migrations/`](../apps/api/migrations/) and the repositories in
[`apps/api/src/repository/`](../apps/api/src/repository/). Read this before forking the schema for your own app.

> **Domain records, field-for-field.** The `users` and `platform_users` columns back the library's `AuthUser` and
> `AuthPlatformUser` domain records (from `bymax_auth_types`) exactly — same types, same nullability. Three columns are
> produced by the library and stored **verbatim**; see [Library-owned columns](#library-owned-columns).

---

## Tables

The initial migration [`0001_init.sql`](../apps/api/migrations/0001_init.sql) creates five tables:
`tenants`, `users`, `platform_users`, `invitations`, and `audit_log`. `gen_random_uuid()` is a Postgres core builtin, so
no extension is required.

### `tenants` — the isolation boundary

Dashboard tenants. Seeded with `acme` / `globex` by the development seed.

| Column | Type | Nullable | Purpose |
| --- | --- | --- | --- |
| `id` | `TEXT` | no | Primary key. The value sent in the tenant header and stored on every dashboard user. |
| `name` | `TEXT` | no | Human-readable tenant name. |
| `created_at` | `TIMESTAMPTZ` | no | Row creation timestamp; default `now()`. |

### `users` — tenant-scoped dashboard account

Backs [`AuthUser`](../apps/api/src/repository/user.rs) exactly and is the boundary the `SqlxUserRepository` reads and
writes.

| Column | Type | Nullable | Purpose |
| --- | --- | --- | --- |
| `id` | `TEXT` | no | Primary key; default `gen_random_uuid()::text`. |
| `email` | `TEXT` | no | Login identifier; unique **within** a tenant. |
| `name` | `TEXT` | no | Display name. |
| `password_hash` | `TEXT` | yes | Library-owned. `NULL` for OAuth-only accounts. |
| `role` | `TEXT` | no | RBAC role; default `'user'`. |
| `status` | `TEXT` | no | Lifecycle state; default `'active'`. |
| `tenant_id` | `TEXT` | no | Owning tenant. `REFERENCES tenants(id)`; every query scopes by it. |
| `email_verified` | `BOOLEAN` | no | Set after the verification flow; default `false`. |
| `mfa_enabled` | `BOOLEAN` | no | Whether TOTP is active; default `false`. |
| `mfa_secret` | `TEXT` | yes | Library-owned. AEAD-sealed; never plaintext. |
| `mfa_recovery_codes` | `TEXT[]` | yes | Library-owned. Keyed hashes; never plaintext. |
| `oauth_provider` | `TEXT` | yes | e.g. `google`. Part of the OAuth identity composite. |
| `oauth_provider_id` | `TEXT` | yes | The provider's stable user id. |
| `last_login_at` | `TIMESTAMPTZ` | yes | Updated on each successful login. |
| `created_at` | `TIMESTAMPTZ` | no | Row creation timestamp; default `now()`. |

Indexes:

- `users_tenant_email_uidx` — `UNIQUE (tenant_id, email)`. Backs `find_by_email`; a duplicate raises SQLSTATE `23505`,
  which the repository maps to a conflict. Two tenants may reuse an email.
- `users_oauth_uidx` — `UNIQUE (tenant_id, oauth_provider, oauth_provider_id)` **partial**, `WHERE oauth_provider IS NOT
  NULL AND oauth_provider_id IS NOT NULL`. Backs `find_by_oauth_id`; local accounts (all-NULL provider columns) never
  collide.
- `users_tenant_id_idx` — `(tenant_id)`. Added in [`0002`](../apps/api/migrations/0002_audit_read_api_indexes.sql) so a
  tenant delete/update does not sequentially scan the child table.

### `platform_users` — tenant-less admin account

Backs [`AuthPlatformUser`](../apps/api/src/repository/platform_user.rs). Platform admins are provisioned directly (no
self-registration), authenticate with a local password only, and are **not** tenant-scoped. Relative to `users` there is
no `tenant_id` and no `email_verified`; the record adds `platform_id` and `updated_at`, and `password_hash` is `NOT
NULL`.

| Column | Type | Nullable | Purpose |
| --- | --- | --- | --- |
| `id` | `TEXT` | no | Primary key; default `gen_random_uuid()::text`. |
| `email` | `TEXT` | no | Globally unique (`UNIQUE`). |
| `name` | `TEXT` | no | Display name. |
| `password_hash` | `TEXT` | no | Library-owned. Required — a platform admin always carries a local credential. |
| `role` | `TEXT` | no | Platform role; default `'admin'`. |
| `status` | `TEXT` | no | Lifecycle state; default `'active'`. |
| `mfa_enabled` | `BOOLEAN` | no | Default `false`. |
| `mfa_secret` | `TEXT` | yes | Library-owned. AEAD-sealed. |
| `mfa_recovery_codes` | `TEXT[]` | yes | Library-owned. Keyed hashes. |
| `platform_id` | `TEXT` | yes | Optional grouping for multi-platform deployments. |
| `last_login_at` | `TIMESTAMPTZ` | yes | Updated on each successful platform login. |
| `created_at` | `TIMESTAMPTZ` | no | Row creation timestamp; default `now()`. |
| `updated_at` | `TIMESTAMPTZ` | no | Bumped on every mutation; default `now()`. |

### `invitations` — pending / accepted tenant invite

Team invitations. `token_hash` stores only a hash of the invitation token — the raw token is only ever emailed.

| Column | Type | Nullable | Purpose |
| --- | --- | --- | --- |
| `id` | `TEXT` | no | Primary key; default `gen_random_uuid()::text`. |
| `tenant_id` | `TEXT` | no | Target tenant. `REFERENCES tenants(id)`. |
| `email` | `TEXT` | no | Invitee's email. |
| `role` | `TEXT` | no | Role granted on acceptance. |
| `token_hash` | `TEXT` | no | Hash of the raw invitation token; never the raw value. |
| `invited_by` | `TEXT` | yes | Inviter's id, when available. |
| `expires_at` | `TIMESTAMPTZ` | no | Invite expiry. |
| `accepted_at` | `TIMESTAMPTZ` | yes | Set when the invite is accepted. |
| `created_at` | `TIMESTAMPTZ` | no | Row creation timestamp; default `now()`. |

Index: `invitations_tenant_id_idx` — `(tenant_id)`, added in
[`0002`](../apps/api/migrations/0002_audit_read_api_indexes.sql) for the same foreign-key reason as `users`.

### `audit_log` — append-only lifecycle record

Written by the auth lifecycle hooks and read back by the example's audit surface
([`apps/api/src/audit/`](../apps/api/src/audit/)); see
[`OVERVIEW.md §15`](./OVERVIEW.md#15-auth-event-tracking--the-audit-domain). Rows are never updated or deleted — that is
why there is **no `updated_at`** — and never store a token, recovery code, or secret.

| Column | Type | Nullable | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGSERIAL` | no | Primary key; the keyset-pagination cursor. |
| `tenant_id` | `TEXT` | yes | `NULL` for platform-level events. Deliberately **no** foreign key — an append-only, decoupled sink. |
| `actor_id` | `TEXT` | yes | The user/admin that triggered the event, when known. |
| `actor_email` | `TEXT` | yes | The actor's email, when known. |
| `event` | `TEXT` | no | Event slug. |
| `ip` | `TEXT` | yes | Source IP, when available. |
| `user_agent` | `TEXT` | yes | Request user agent, when available. |
| `metadata` | `JSONB` | yes | Structured detail; never tokens, hashes, or OTPs. |
| `created_at` | `TIMESTAMPTZ` | no | Event timestamp; default `now()`. |

Indexes ([`0002`](../apps/api/migrations/0002_audit_read_api_indexes.sql)): the audit read-API pages newest-first by
`id` and filters by tenant, event, and actor, so each filterable column is indexed together with `id DESC` — a filtered
page then satisfies both the predicate and the `ORDER BY` from one index range scan. Migration `0002` drops the original
`audit_log_keyset_idx` and creates `audit_log_tenant_id_idx (tenant_id, id DESC)`, `audit_log_event_idx (event, id
DESC)`, `audit_log_actor_id_idx (actor_id, id DESC)`, and `audit_log_actor_email_idx (actor_email, id DESC)`.

---

## Library-owned columns

Three columns are produced by the library and stored **exactly** as it returns them. Re-hashing or re-encrypting any of
them locks users out or breaks decryption:

| Column | Produced by | Rule |
| --- | --- | --- |
| `password_hash` | the library password KDF (scrypt by default; argon2 under the `argon2` feature) | Store verbatim. Never re-hash. |
| `mfa_secret` | the library MFA service (AES-256-GCM) | Sealed at rest. Store verbatim; never plaintext. See [`MFA.md`](./MFA.md). |
| `mfa_recovery_codes` | the library MFA service | Keyed hashes. Store verbatim; never plaintext. |

The repository row projections select and persist these as opaque strings — the repository holds **no** business logic
(hashing, validation, and token minting all belong to the engine).

---

## The repositories

Both repositories are pure persistence over a shared `sqlx::PgPool`. Every query is a compile-checked
`query!`/`query_as!` macro, reads use `fetch_optional` so a **missing or cross-tenant row is `Ok(None)`** (never an
error), and the module maps table rows to the library's domain records and back.

### `SqlxUserRepository` — `impl bymax_auth_core::traits::repository::UserRepository`

[`apps/api/src/repository/user.rs`](../apps/api/src/repository/user.rs) — 11 methods:

`find_by_id`, `find_by_email`, `create`, `update_password`, `update_mfa`, `update_last_login`, `update_status`,
`update_email_verified`, `find_by_oauth_id`, `link_oauth`, `create_with_oauth`.

- Reads (`find_by_id`, `find_by_email`, `find_by_oauth_id`) scope by `tenant_id`; a missing or cross-tenant row is
  `Ok(None)`. (`find_by_id` accepts an optional `tenant_id`: `NULL` resolves the row regardless of tenant.)
- `create` and `create_with_oauth` apply the column defaults via `COALESCE` (`role → 'user'`, `status → 'active'`,
  `email_verified → false`); `create_with_oauth` writes no `password_hash`.
- The scalar updates (`update_password`, `update_status`, `update_email_verified`, `update_last_login`, `update_mfa`,
  `link_oauth`) write through by `id`.

### `SqlxPlatformUserRepository` — `impl bymax_auth_core::traits::repository::PlatformUserRepository`

[`apps/api/src/repository/platform_user.rs`](../apps/api/src/repository/platform_user.rs) — 6 methods:

`find_by_id`, `find_by_email`, `update_last_login`, `update_mfa`, `update_password`, `update_status`.

- Lookups key on the global identity (no tenant scoping); a missing row is `Ok(None)`.
- Every mutation additionally bumps `updated_at = now()`.

### Error mapping

[`apps/api/src/repository/error.rs`](../apps/api/src/repository/error.rs) — the single `map_sqlx_error` mapper reused by
both repositories:

- A unique-constraint violation (Postgres SQLSTATE `23505`) becomes `RepositoryError::Conflict`, which the engine renders
  as the wire code **`auth.email_already_exists`**.
- Every other datastore failure becomes an opaque `RepositoryError::Backend` whose cause the engine logs internally
  (for example an unknown-tenant foreign-key violation).
- A missing row is never routed here — reads use `fetch_optional` and return `Ok(None)`.

---

## Connection pool

The pool is opened by [`connect_pool`](../apps/api/src/db.rs) at boot. It establishes the **first connection eagerly**,
so a misconfigured `DATABASE_URL` or an unreachable database aborts startup immediately with a typed `AppError::Database`
(a 5-second acquire timeout) rather than failing on the first request. The runtime pool caps at 10 connections.

---

## Migrations

Migrations live under [`apps/api/migrations/`](../apps/api/migrations/) and are applied with `sqlx::migrate!`. Two exist:

| File | Contents |
| --- | --- |
| [`0001_init.sql`](../apps/api/migrations/0001_init.sql) | The five tables and their initial indexes. |
| [`0002_audit_read_api_indexes.sql`](../apps/api/migrations/0002_audit_read_api_indexes.sql) | The audit read-API keyset indexes and the two foreign-key indexes on `users` / `invitations`. |

---

## Seed

`cargo run -p api --bin seed` ([`apps/api/src/bin/seed.rs`](../apps/api/src/bin/seed.rs)) provisions the demo fixtures
against a migrated database. Every statement is `ON CONFLICT DO NOTHING`, so re-running the seed is a no-op and never
changes the row counts. It produces:

- **2 tenants** — `acme` (Acme Inc.) and `globex` (Globex Corp.).
- **1 platform admin** — `admin@platform.local`, password `ChangeMe!Demo123`.

The admin password is hashed with the library's real scrypt KDF (`bymax_auth_crypto::password::hash`) — never a
hand-written literal — and the demo credential is a documented local-only fixture (also in
[`.env.example`](../.env.example)), never a real secret. **Dev-only**; never run in production.

---

## Further reading

- [`OVERVIEW.md §12`](./OVERVIEW.md#12-identity-domains--extension-points) — the two identity domains and the repository
  seams these tables satisfy.
- [`ENVIRONMENT.md`](./ENVIRONMENT.md) — `DATABASE_URL` and the boot-time database connection.
- [`REDIS.md`](./REDIS.md) — the ephemeral state (sessions, OTPs, invite tokens) that complements these tables.
- [`MFA.md`](./MFA.md) — how `mfa_secret` and `mfa_recovery_codes` are produced and consumed.
