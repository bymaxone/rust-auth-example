//! Binary entry point for the rust-auth-example API service.
//!
//! This is the thin, non-testable glue that wires the [`api`] library into a
//! running process: it loads the validated configuration, composes the router,
//! binds the configured port, and serves with peer-address capture and a
//! graceful-shutdown signal. All reusable logic lives in the library crate.
#![forbid(unsafe_code)]
#![deny(missing_docs)]

use std::net::SocketAddr;
use std::sync::Arc;

use api::{app, config, db, engine, layers, stores, telemetry};
use bymax_auth_core::config::Environment;
use tokio::signal;

/// Maximum size of the shared Postgres connection pool.
const MAX_DB_CONNECTIONS: u32 = 10;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    telemetry::init_tracing();

    let settings = config::Settings::load()?;
    let pool = db::connect_pool(&settings.database_url, MAX_DB_CONNECTIONS).await?;
    let stores = stores::connect_stores(&settings.redis_url, settings.redis_namespace.clone())?;
    // Assemble the engine once at startup; a rejected config or unbuildable seam aborts
    // boot with the precise `EngineError` message rather than serving a broken surface.
    let engine = Arc::new(engine::build_engine(
        &settings,
        pool.clone(),
        Environment::Development,
    )?);
    let state = app::AppState::new(pool, stores, engine);
    let app = layers::apply_global_layers(app::build_router(state), &settings)?;

    let addr = SocketAddr::from(([127, 0, 0, 1], settings.api_port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "api listening");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    Ok(())
}

/// Resolve when the process receives Ctrl-C or (on Unix) `SIGTERM`, so in-flight
/// requests drain before the listener stops accepting new connections.
///
/// Both the non-Unix arm and the signal-install-failure arm fall back to a future
/// that never resolves, so the process still shuts down cleanly on Ctrl-C alone.
async fn shutdown_signal() {
    let ctrl_c = async {
        match signal::ctrl_c().await {
            Ok(()) => {}
            Err(_) => std::future::pending::<()>().await,
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match signal::unix::signal(signal::unix::SignalKind::terminate()) {
            Ok(mut sig) => {
                sig.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }
}
