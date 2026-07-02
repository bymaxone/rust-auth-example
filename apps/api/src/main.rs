//! rust-auth-example API binary: the axum service entry point that hosts the
//! `bymax-auth` engine and the example's own domain routes.
#![forbid(unsafe_code)]
#![deny(missing_docs)]

pub mod config;

/// Process entry point for the API binary.
fn main() {
    println!("{} {}", env!("CARGO_PKG_NAME"), env!("CARGO_PKG_VERSION"));
}
