//! rust-auth-example API binary. Hosts the axum service that mounts the
//! `bymax-auth` engine and the example's own domain routes. This entry point is
//! fleshed out as the configuration loader, engine wiring, and routers land; for
//! now it only proves the workspace compiles under the pinned toolchain.
#![forbid(unsafe_code)]
#![deny(missing_docs)]

/// Process entry point. Replaced by the Tokio runtime + `axum::serve(API_PORT)`
/// bootstrap once the service is wired.
fn main() {
    println!("rust-auth-example api: bootstrap not yet wired");
}
