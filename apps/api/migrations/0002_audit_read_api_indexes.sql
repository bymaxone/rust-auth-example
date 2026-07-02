-- Indexes supporting the example's audit read-API and the schema's foreign keys.
--
-- The audit read-API pages newest-first by `id` (the keyset cursor) and filters by
-- tenant, event, and actor, so each filterable column is indexed together with
-- `id DESC` — a filtered page then satisfies both the predicate and the ORDER BY from
-- one index range scan. The `actor` filter matches either identity column, so both are
-- indexed. The original `(created_at DESC, id DESC)` index matched no read path (every
-- query orders by `id`) and is dropped.
--
-- `audit_log.tenant_id` is deliberately left without a foreign key: the table is an
-- append-only, decoupled sink and platform-level events carry no tenant.

DROP INDEX IF EXISTS audit_log_keyset_idx;

CREATE INDEX audit_log_tenant_id_idx ON audit_log (tenant_id, id DESC);
CREATE INDEX audit_log_event_idx ON audit_log (event, id DESC);
CREATE INDEX audit_log_actor_id_idx ON audit_log (actor_id, id DESC);
CREATE INDEX audit_log_actor_email_idx ON audit_log (actor_email, id DESC);

-- Foreign-key columns are not auto-indexed by PostgreSQL; index them so a tenant
-- delete or update does not sequentially scan the child tables.
CREATE INDEX users_tenant_id_idx ON users (tenant_id);
CREATE INDEX invitations_tenant_id_idx ON invitations (tenant_id);
