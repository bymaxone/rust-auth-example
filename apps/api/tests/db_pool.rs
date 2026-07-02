//! Integration coverage for the Postgres pool provider against the test stack.
//!
//! This exercises the success path of [`api::db::connect_pool`] end to end: it
//! opens the pool against a live Postgres and runs a trivial query. Bring the
//! high-port test stack up first:
//!
//! ```text
//! docker compose -f docker-compose.test.yml up --wait
//! DATABASE_URL_TEST=postgres://postgres:postgres@127.0.0.1:55432/example_app_test \
//!   cargo nextest run -p api --test db_pool
//! ```
//!
//! When `DATABASE_URL_TEST` is unset the test skips (passes) so a database-free CI
//! run still succeeds.
#![forbid(unsafe_code)]
#![allow(
    // Integration tests panic to signal failure, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this file.
    clippy::unwrap_used,
    clippy::expect_used
)]

use api::db::connect_pool;

#[tokio::test]
async fn connects_to_the_test_stack_and_runs_a_query() {
    let Ok(database_url) = std::env::var("DATABASE_URL_TEST") else {
        eprintln!("skipping db_pool integration test: DATABASE_URL_TEST is not set");
        return;
    };

    let pool = connect_pool(&database_url, 1)
        .await
        .expect("the test stack Postgres must be reachable");
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .expect("a trivial query must succeed against the test stack");
}
