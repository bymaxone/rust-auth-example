//! Process-wide telemetry installation.
//!
//! The HTTP adapter installs no tracing subscriber by design, so the example owns
//! telemetry: [`init_tracing`] installs a structured JSON subscriber exactly once,
//! before the runtime serves, so the request-tracing spans and every `tracing`
//! event are formatted as line-delimited JSON filtered by `RUST_LOG`.

use tracing_subscriber::EnvFilter;

/// Default log filter used when `RUST_LOG` is absent or unparseable.
const DEFAULT_FILTER: &str = "info";

/// Install the process-wide tracing subscriber (structured JSON).
///
/// The filter is read from `RUST_LOG`, falling back to [`DEFAULT_FILTER`] when it
/// is unset or invalid. `try_init` makes a re-init (for example across tests) a
/// no-op instead of a panic, so this is always safe to call more than once.
pub fn init_tracing() {
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(DEFAULT_FILTER));
    let _ = tracing_subscriber::fmt()
        .json()
        .with_env_filter(filter)
        .try_init();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_tracing_installs_the_subscriber_and_is_idempotent() {
        // The example owns telemetry: the first call installs the global subscriber and a
        // second is a no-op (via `try_init`), never a panic. Asserting a dispatcher IS set
        // afterwards proves the call does its work — a no-op body would leave none. With
        // `RUST_LOG` unset this also exercises the default-filter fallback arm.
        init_tracing();
        init_tracing();
        assert!(tracing::dispatcher::has_been_set());
    }
}
