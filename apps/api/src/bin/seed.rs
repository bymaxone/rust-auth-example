//! Idempotent development seed: the `acme`/`globex` demo tenants and a demo platform
//! admin. Run with `cargo run -p api --bin seed` against a migrated database.
//!
//! Every statement is `ON CONFLICT DO NOTHING`, so re-running the seed is a no-op and
//! never changes the row counts. The admin password is hashed with the library's real
//! scrypt KDF — never a hand-written literal — and the demo credential is a documented
//! local-only fixture (see `.env.example`), never a real secret.
#![forbid(unsafe_code)]
#![deny(missing_docs)]

use bymax_auth_crypto::password::{self, PasswordParams};
use sqlx::PgPool;

/// Demo tenants provisioned for local exploration.
const DEMO_TENANTS: [(&str, &str); 2] = [("acme", "Acme Inc."), ("globex", "Globex Corp.")];

/// Demo platform-admin email — a documented local-only fixture, not a real account.
const DEMO_ADMIN_EMAIL: &str = "admin@platform.local";

/// Demo platform-admin password — a documented local-only fixture, hashed before it is
/// stored and never a real secret.
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
    // never stall an async runtime worker.
    let admin_hash = tokio::task::spawn_blocking(|| {
        password::hash(DEMO_ADMIN_PASSWORD, &PasswordParams::default())
    })
    .await??;

    sqlx::query!(
        r#"INSERT INTO platform_users (email, name, password_hash, role, status)
           VALUES ($1, 'Demo Admin', $2, 'admin', 'active')
           ON CONFLICT (email) DO NOTHING"#,
        DEMO_ADMIN_EMAIL,
        admin_hash,
    )
    .execute(&pool)
    .await?;

    println!("seed complete: tenants=acme,globex platform-admin={DEMO_ADMIN_EMAIL}");
    Ok(())
}
