//! The example-owned OAuth transport.
//!
//! [`TlsHttpClient`] is the HTTPS-capable `HttpClient` injected into the built-in
//! `GoogleOAuthProvider`, so the OAuth token/userinfo exchange reaches Google over
//! rustls + aws-lc-rs without pulling `ring`/`openssl` into the dependency graph.

pub mod tls_http_client;

pub use tls_http_client::{TlsHttpClient, TlsHttpClientError};
