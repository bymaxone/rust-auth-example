-- Initial schema for the reference application.
--
-- Creates the five tables the auth engine's persistence boundary needs: `tenants`,
-- the dashboard `users`, the tenant-less `platform_users`, team `invitations`, and the
-- append-only `audit_log`. The `users`/`platform_users` columns back the library's
-- `AuthUser`/`AuthPlatformUser` domain records field-for-field (type + nullability).
-- `gen_random_uuid()` is a core builtin, so no extension is required.

-- Dashboard tenants. Seeded with acme/globex by the development seed.
CREATE TABLE tenants (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dashboard end users. Columns back `bymax_auth_types::domain::AuthUser` exactly:
-- `password_hash` is nullable (OAuth-only accounts carry no local password),
-- `mfa_recovery_codes` is a text array, and the OAuth identity columns are nullable.
CREATE TABLE users (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email               TEXT NOT NULL,
    name                TEXT NOT NULL,
    password_hash       TEXT,                          -- NULL for OAuth-only users
    role                TEXT NOT NULL DEFAULT 'user',
    status              TEXT NOT NULL DEFAULT 'active',
    tenant_id           TEXT NOT NULL REFERENCES tenants(id),
    email_verified      BOOLEAN NOT NULL DEFAULT false,
    mfa_enabled         BOOLEAN NOT NULL DEFAULT false,
    mfa_secret          TEXT,                          -- AEAD-sealed; never plaintext
    mfa_recovery_codes  TEXT[],                        -- keyed hashes; never plaintext
    oauth_provider      TEXT,
    oauth_provider_id   TEXT,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tenant-scoped uniqueness backs find_by_email and raises SQLSTATE 23505 on a
-- duplicate, which the repository maps to a conflict.
CREATE UNIQUE INDEX users_tenant_email_uidx ON users (tenant_id, email);

-- Backs find_by_oauth_id(provider, provider_id, tenant_id); partial so many local
-- accounts (all NULL provider columns) never collide on the index.
CREATE UNIQUE INDEX users_oauth_uidx
    ON users (tenant_id, oauth_provider, oauth_provider_id)
    WHERE oauth_provider IS NOT NULL AND oauth_provider_id IS NOT NULL;

-- Platform admins. Back `AuthPlatformUser`: `password_hash` is NOT NULL, there is no
-- `tenant_id`/`email_verified`, and the record adds `platform_id` and `updated_at`.
CREATE TABLE platform_users (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email               TEXT NOT NULL UNIQUE,
    name                TEXT NOT NULL,
    password_hash       TEXT NOT NULL,
    role                TEXT NOT NULL DEFAULT 'admin',
    status              TEXT NOT NULL DEFAULT 'active',
    mfa_enabled         BOOLEAN NOT NULL DEFAULT false,
    mfa_secret          TEXT,
    mfa_recovery_codes  TEXT[],
    platform_id         TEXT,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Team invitations. `token_hash` stores only a hash of the invitation token.
CREATE TABLE invitations (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id),
    email       TEXT NOT NULL,
    role        TEXT NOT NULL,
    token_hash  TEXT NOT NULL,
    invited_by  TEXT,
    expires_at  TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only audit trail written by the auth lifecycle hooks. Never stores a
-- token, recovery code, or secret.
CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   TEXT,
    actor_id    TEXT,
    actor_email TEXT,
    event       TEXT NOT NULL,
    ip          TEXT,
    user_agent  TEXT,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keyset-pagination index for the audit read API: newest first by (created_at, id).
CREATE INDEX audit_log_keyset_idx ON audit_log (created_at DESC, id DESC);
