//! Idempotent development seed: the `acme`/`globex` demo tenants, a demo tenant admin, and a
//! demo platform admin. Run with `cargo run -p api --bin seed` against a migrated database.
//!
//! Every statement is `ON CONFLICT DO NOTHING`, so re-running the seed is a no-op and
//! never changes the row counts. Passwords are hashed with the library's real scrypt KDF —
//! never a hand-written literal — and the demo credentials are documented local-only fixtures
//! (see `.env.example`), never real secrets.
//!
//! The tenant admin exists because register always mints a `user`, the seed provisions no
//! other tenant member, and creating an invitation itself requires an admin — without a
//! seeded tenant admin the admin-gated journeys (the Overview auth-health cards, the Audit
//! Explorer, and inviting a teammate) are unreachable out of the box.
#![forbid(unsafe_code)]
#![deny(missing_docs)]

use bymax_auth_crypto::password::{self, PasswordParams};
use sqlx::PgPool;

/// Demo tenants provisioned for local exploration.
const DEMO_TENANTS: [(&str, &str); 2] = [("acme", "Acme Inc."), ("globex", "Globex Corp.")];

/// Demo platform-admin email — a documented local-only fixture, not a real account.
const DEMO_ADMIN_EMAIL: &str = "admin@platform.local";

/// Demo tenant-admin email under the `acme` tenant — a documented local-only fixture that
/// bootstraps the admin-gated dashboard journeys. Not a real account.
const DEMO_TENANT_ADMIN_EMAIL: &str = "admin@acme.test";

/// The tenant the demo tenant admin belongs to (one of [`DEMO_TENANTS`]).
const DEMO_TENANT_ADMIN_TENANT: &str = "acme";

/// Demo password shared by both seeded admins — a documented local-only fixture, hashed
/// before it is stored and never a real secret.
const DEMO_ADMIN_PASSWORD: &[u8] = b"ChangeMe!Demo123";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let database_url = std::env::var("DATABASE_URL")?;
    let pool = PgPool::connect(&database_url).await?;

    for (id, name) in DEMO_TENANTS {
        sqlx::query!(
            "INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
            id,
            name,
        )
        .execute(&pool)
        .await?;
    }

    // Hash on a blocking thread: the KDF is synchronous, memory-hard CPU work that must
    // never stall an async runtime worker. Each admin gets its own hash — even for the
    // shared demo password — so no two rows carry an identical `password_hash` (a fresh
    // per-account salt is how password hashing is meant to be used).
    let platform_admin_hash = tokio::task::spawn_blocking(|| {
        password::hash(DEMO_ADMIN_PASSWORD, &PasswordParams::default())
    })
    .await??;
    let tenant_admin_hash = tokio::task::spawn_blocking(|| {
        password::hash(DEMO_ADMIN_PASSWORD, &PasswordParams::default())
    })
    .await??;

    sqlx::query!(
        r#"INSERT INTO platform_users (email, name, password_hash, role, status)
           VALUES ($1, 'Demo Admin', $2, 'admin', 'active')
           ON CONFLICT (email) DO NOTHING"#,
        DEMO_ADMIN_EMAIL,
        platform_admin_hash.as_str(),
    )
    .execute(&pool)
    .await?;

    // `email_verified = true` lets the tenant admin sign in without the verify step, and
    // `ON CONFLICT (tenant_id, email) DO NOTHING` keeps the seed idempotent.
    sqlx::query!(
        r#"INSERT INTO users (email, name, password_hash, role, status, tenant_id, email_verified)
           VALUES ($1, 'Acme Admin', $2, 'admin', 'active', $3, true)
           ON CONFLICT (tenant_id, email) DO NOTHING"#,
        DEMO_TENANT_ADMIN_EMAIL,
        tenant_admin_hash.as_str(),
        DEMO_TENANT_ADMIN_TENANT,
    )
    .execute(&pool)
    .await?;

    println!(
        "seed complete: tenants=acme,globex platform-admin={DEMO_ADMIN_EMAIL} \
         tenant-admin={DEMO_TENANT_ADMIN_EMAIL}"
    );
    Ok(())
}
