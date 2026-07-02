//! An HTTPS-capable [`HttpClient`] for OAuth providers.
//!
//! The library's bundled `ReqwestHttpClient` ships no TLS backend (so `ring`/`openssl`
//! stay off the graph), which leaves Google's `https://` token and userinfo endpoints
//! unreachable. This module owns the example's own transport: a `reqwest` client pinned
//! to a manually-built rustls `ClientConfig` using the aws-lc-rs crypto provider and
//! Mozilla's webpki root bundle, HTTPS-only, with a bounded per-request timeout.
//!
//! The core-owned [`HttpRequest`]/[`HttpResponse`] are translated to and from `reqwest`
//! by pure free functions, and every transport failure collapses to the opaque
//! [`HttpError`] family — no `reqwest` type ever crosses the trait boundary.

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use bymax_auth_core::traits::http::{HttpClient, HttpError, HttpMethod, HttpRequest, HttpResponse};

/// The per-request timeout, bounding a slow OAuth provider.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

/// HTTPS-capable [`HttpClient`] for OAuth providers, backed by `reqwest` over rustls
/// with the aws-lc-rs crypto provider. `ring`/`openssl` are banned, so the transport is
/// pinned to rustls + aws-lc-rs explicitly and never negotiates a native TLS stack.
#[derive(Debug, Clone)]
pub struct TlsHttpClient {
    client: reqwest::Client,
}

/// Construction failures for [`TlsHttpClient`] — the setup path never panics on a bad
/// TLS configuration or an unbuildable client.
#[derive(Debug, thiserror::Error)]
pub enum TlsHttpClientError {
    /// The rustls `ClientConfig` could not be assembled.
    #[error("failed to build the rustls client configuration")]
    Tls(#[source] rustls::Error),
    /// The underlying `reqwest::Client` could not be built.
    #[error("failed to build the HTTPS client")]
    Build(#[source] reqwest::Error),
}

impl TlsHttpClient {
    /// Build the TLS client: Mozilla's webpki roots, the aws-lc-rs rustls provider,
    /// HTTPS-only, and the bounded per-request timeout.
    ///
    /// # Errors
    ///
    /// Returns [`TlsHttpClientError::Tls`] when the rustls configuration cannot be
    /// assembled, or [`TlsHttpClientError::Build`] when the `reqwest` client cannot be
    /// built.
    pub fn new() -> Result<Self, TlsHttpClientError> {
        let mut roots = rustls::RootCertStore::empty();
        roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let tls = rustls::ClientConfig::builder_with_provider(Arc::new(
            rustls::crypto::aws_lc_rs::default_provider(),
        ))
        .with_safe_default_protocol_versions()
        .map_err(TlsHttpClientError::Tls)?
        .with_root_certificates(roots)
        .with_no_client_auth();
        let client = reqwest::Client::builder()
            .use_preconfigured_tls(tls)
            .https_only(true)
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(TlsHttpClientError::Build)?;
        Ok(Self { client })
    }

    /// Build the transport over a caller-supplied `reqwest::Client`. Test-only: the
    /// coverage harness injects a short-timeout, plain-HTTP client so the send
    /// orchestration and error mapping are exercised against a local loopback server.
    #[cfg(test)]
    fn with_client(client: reqwest::Client) -> Self {
        Self { client }
    }
}

#[async_trait]
impl HttpClient for TlsHttpClient {
    async fn send(&self, req: HttpRequest) -> Result<HttpResponse, HttpError> {
        let request = to_reqwest_request(&self.client, req).map_err(map_error)?;
        let response = self.client.execute(request).await.map_err(map_error)?;
        from_reqwest_response(response).await.map_err(map_error)
    }
}

/// Translate the core-owned [`HttpRequest`] into a `reqwest::Request` over `client`.
/// Building resolves the URL, so a malformed URL surfaces here as a `reqwest::Error`.
fn to_reqwest_request(
    client: &reqwest::Client,
    req: HttpRequest,
) -> Result<reqwest::Request, reqwest::Error> {
    let method = match req.method {
        HttpMethod::Get => reqwest::Method::GET,
        HttpMethod::Post => reqwest::Method::POST,
    };
    let mut builder = client.request(method, &req.url);
    for (name, value) in &req.headers {
        builder = builder.header(name.as_str(), value.as_str());
    }
    if let Some(body) = req.body {
        builder = builder.body(body);
    }
    builder.build()
}

/// Read a `reqwest::Response` into the core-owned [`HttpResponse`]. The header values
/// that are not valid UTF-8 degrade to an empty string rather than failing the read.
async fn from_reqwest_response(
    response: reqwest::Response,
) -> Result<HttpResponse, reqwest::Error> {
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .map(|(name, value)| {
            (
                name.as_str().to_owned(),
                value.to_str().unwrap_or_default().to_owned(),
            )
        })
        .collect();
    let body = response.bytes().await?.to_vec();
    Ok(HttpResponse {
        status,
        headers,
        body,
    })
}

/// Classify a `reqwest::Error` into the opaque, transport-agnostic [`HttpError`] family.
/// No `reqwest` type may cross the trait boundary; the `Display` string carries the
/// endpoint and kind but never a request body, so it is safe to retain for monitoring.
fn map_error(err: reqwest::Error) -> HttpError {
    if err.is_timeout() {
        HttpError::Timeout
    } else if err.is_connect() {
        HttpError::Connect(err.to_string())
    } else {
        HttpError::Transport(err.to_string())
    }
}

#[cfg(test)]
#[allow(
    // Panicking is the idiomatic failure signal in tests, so the workspace-level
    // `unwrap_used`/`expect_used` denials are relaxed for this test module only.
    clippy::unwrap_used,
    clippy::expect_used
)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
    use tokio::net::TcpListener;

    /// What a one-shot local server does once it accepts a connection.
    enum Behavior {
        /// Drain the request, then write the given raw HTTP/1.1 response bytes.
        Respond(Vec<u8>),
        /// Drain the request, then drop the connection without responding.
        Drop,
        /// Accept and then hang, so a short client timeout fires.
        Hang,
    }

    /// Bind a plain-HTTP listener on `127.0.0.1:0`, serve `behavior` for exactly one
    /// connection on a background task, and return the bound address. A plain-HTTP
    /// loopback server keeps the translation, response-mapping, and error-mapping paths
    /// hermetic (no external network, no real TLS).
    async fn spawn_server(behavior: Behavior) -> std::net::SocketAddr {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind a loopback listener");
        let addr = listener.local_addr().expect("the listener address");
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.expect("accept one connection");
            let mut buf = [0u8; 1024];
            let _ = socket.read(&mut buf).await;
            match behavior {
                Behavior::Respond(bytes) => {
                    let _ = socket.write_all(&bytes).await;
                    let _ = socket.flush().await;
                }
                Behavior::Drop => {}
                Behavior::Hang => {
                    tokio::time::sleep(Duration::from_secs(30)).await;
                }
            }
        });
        addr
    }

    /// A raw `200 OK` response carrying `body`.
    fn ok_response(body: &str) -> Vec<u8> {
        format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .into_bytes()
    }

    /// Install the ring-free aws-lc-rs rustls provider as the process default once, so a
    /// plain `reqwest::Client` (whose rustls feature configures TLS eagerly at build time)
    /// has a crypto provider even though the loopback requests never negotiate TLS.
    fn install_crypto() {
        use std::sync::Once;
        static INIT: Once = Once::new();
        INIT.call_once(|| {
            let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
        });
    }

    /// A plain-HTTP reqwest client with a short timeout, so the loopback send paths run
    /// without TLS and the hang path trips promptly.
    fn test_client(timeout: Duration) -> reqwest::Client {
        install_crypto();
        reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .expect("a plain client builds")
    }

    #[test]
    fn new_builds_a_tls_client() {
        // The production constructor assembles the rustls config and the HTTPS client.
        assert!(TlsHttpClient::new().is_ok());
    }

    #[test]
    fn to_reqwest_request_round_trips_method_headers_and_body() {
        // Both verbs, the headers, and the optional body translate onto the reqwest
        // request; a bodyless GET carries no body.
        let client = test_client(Duration::from_secs(5));
        let post = to_reqwest_request(
            &client,
            HttpRequest {
                method: HttpMethod::Post,
                url: "http://127.0.0.1/token".to_owned(),
                headers: vec![("content-type".to_owned(), "application/json".to_owned())],
                body: Some(b"payload".to_vec()),
            },
        )
        .expect("post translates");
        assert_eq!(post.method(), reqwest::Method::POST);
        assert_eq!(post.url().as_str(), "http://127.0.0.1/token");
        assert_eq!(
            post.headers()
                .get("content-type")
                .map(|v| v.to_str().unwrap()),
            Some("application/json")
        );
        assert_eq!(
            post.body().and_then(|b| b.as_bytes()),
            Some(b"payload".as_slice())
        );

        let get = to_reqwest_request(
            &client,
            HttpRequest {
                method: HttpMethod::Get,
                url: "http://127.0.0.1/userinfo".to_owned(),
                headers: Vec::new(),
                body: None,
            },
        )
        .expect("get translates");
        assert_eq!(get.method(), reqwest::Method::GET);
        assert!(get.body().is_none());
    }

    #[test]
    fn to_reqwest_request_rejects_a_malformed_url() {
        // A URL the client cannot parse fails at build time as a reqwest error.
        let client = test_client(Duration::from_secs(5));
        let result = to_reqwest_request(
            &client,
            HttpRequest {
                method: HttpMethod::Get,
                url: "not a url".to_owned(),
                headers: Vec::new(),
                body: None,
            },
        );
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn send_maps_status_headers_and_body() {
        // A GET over the loopback server round-trips: status, a response header, and the
        // body all map onto the core-owned response.
        let addr = spawn_server(Behavior::Respond(ok_response("hello"))).await;
        let client = TlsHttpClient::with_client(test_client(Duration::from_secs(5)));
        let res = client
            .send(HttpRequest {
                method: HttpMethod::Get,
                url: format!("http://{addr}/userinfo"),
                headers: vec![("accept".to_owned(), "text/plain".to_owned())],
                body: None,
            })
            .await;
        assert!(matches!(&res, Ok(r) if r.status == 200 && r.body == b"hello"));
        let res = res.expect("a 200 response maps");
        assert!(
            res.headers
                .iter()
                .any(|(k, v)| k == "content-length" && v == "5")
        );
    }

    #[tokio::test]
    async fn send_maps_a_bad_url_to_transport() {
        // A malformed URL fails translation and maps to the transport error (neither a
        // timeout nor a connect failure).
        let client = TlsHttpClient::with_client(test_client(Duration::from_secs(5)));
        let res = client
            .send(HttpRequest {
                method: HttpMethod::Get,
                url: "not a url".to_owned(),
                headers: Vec::new(),
                body: None,
            })
            .await;
        assert!(matches!(res, Err(HttpError::Transport(_))));
    }

    #[tokio::test]
    async fn send_maps_a_dead_port_to_connect() {
        // Connecting to a closed loopback port is a connect error.
        let dead = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind a loopback listener");
        let dead_addr = dead.local_addr().expect("the listener address");
        drop(dead);
        let client = TlsHttpClient::with_client(test_client(Duration::from_secs(5)));
        let res = client
            .send(HttpRequest {
                method: HttpMethod::Get,
                url: format!("http://{dead_addr}/"),
                headers: Vec::new(),
                body: None,
            })
            .await;
        assert!(matches!(res, Err(HttpError::Connect(_))));
    }

    #[tokio::test]
    async fn send_maps_a_dropped_connection_to_transport() {
        // A server that closes the connection without responding is a (non-connect,
        // non-timeout) transport error.
        let addr = spawn_server(Behavior::Drop).await;
        let client = TlsHttpClient::with_client(test_client(Duration::from_secs(5)));
        let res = client
            .send(HttpRequest {
                method: HttpMethod::Get,
                url: format!("http://{addr}/"),
                headers: Vec::new(),
                body: None,
            })
            .await;
        assert!(matches!(res, Err(HttpError::Transport(_))));
    }

    #[tokio::test]
    async fn send_maps_a_hanging_origin_to_timeout() {
        // A hanging origin trips the short per-request timeout, mapped to the timeout error.
        let addr = spawn_server(Behavior::Hang).await;
        let client = TlsHttpClient::with_client(test_client(Duration::from_millis(300)));
        let res = client
            .send(HttpRequest {
                method: HttpMethod::Get,
                url: format!("http://{addr}/"),
                headers: Vec::new(),
                body: None,
            })
            .await;
        assert!(matches!(res, Err(HttpError::Timeout)));
    }

    #[test]
    fn construction_error_messages_are_stable() {
        // Both construction-error variants render a stable, non-leaking message.
        let tls = TlsHttpClientError::Tls(rustls::Error::General("boom".to_owned()));
        assert_eq!(
            tls.to_string(),
            "failed to build the rustls client configuration"
        );
        // A malformed URL yields a real reqwest error to wrap in the build variant.
        let client = test_client(Duration::from_secs(1));
        let reqwest_err = to_reqwest_request(
            &client,
            HttpRequest {
                method: HttpMethod::Get,
                url: "not a url".to_owned(),
                headers: Vec::new(),
                body: None,
            },
        )
        .expect_err("a malformed url errors");
        let build = TlsHttpClientError::Build(reqwest_err);
        assert_eq!(build.to_string(), "failed to build the HTTPS client");
    }
}
