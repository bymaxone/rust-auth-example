//! rust-auth-example API binary: the axum service entry point that hosts the
//! `bymax-auth` engine and the example's own domain routes.
#![forbid(unsafe_code)]
#![deny(missing_docs)]

mod config;
mod probe;

use config::Settings;

/// Process entry point for the API binary.
fn main() {
    // Verify the three consumed library crates link at startup; the result is
    // intentionally discarded — the call exists to satisfy the link probe.
    let _ = probe::consumed_surface_probe();
    match Settings::load() {
        Ok(s) => println!(
            "{} {} configuration loaded (API port {})",
            env!("CARGO_PKG_NAME"),
            env!("CARGO_PKG_VERSION"),
            s.api_port
        ),
        Err(e) => {
            eprintln!("configuration error: {e}");
            std::process::exit(1);
        }
    }
}
