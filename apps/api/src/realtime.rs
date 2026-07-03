//! Realtime session-event fan-out shared by the audit hooks (the publisher) and the
//! example WebSocket (the subscriber).
//!
//! The `on_new_session` lifecycle hook publishes a masked [`SessionEvent`] onto a
//! process-wide [`tokio::sync::broadcast`] channel; each `/ws/example` socket subscribes
//! and forwards only the frames that target its own authenticated subject and tenant. The
//! event carries the routing keys (`sub`/`tenant`) and the originating IP only — never a
//! token, code, or session hash — and the wire frame narrows that further to
//! `{ "event": "on_new_session", "ip": … }`.

use serde_json::json;
use tokio::sync::broadcast;

/// The fan-out buffer depth. A slow socket that falls this far behind observes a
/// `Lagged` signal (missed frames) rather than blocking the publisher; the audit trail
/// remains the durable record, so a dropped realtime frame is a cosmetic loss only.
const SESSION_EVENT_CAPACITY: usize = 256;

/// A newly-established session, broadcast to any subscribed WebSocket.
///
/// Carries the routing keys so a socket forwards only its own user's sessions, plus the
/// originating IP surfaced in the client frame. Deliberately excludes the session hash and
/// every credential — the frame can never be replayed or leak a secret.
#[derive(Clone, Debug)]
pub struct SessionEvent {
    /// The subject (user id) the session belongs to — a routing key, never serialized.
    pub sub: String,
    /// The tenant the session belongs to — a routing key, never serialized.
    pub tenant: String,
    /// The originating IP surfaced in the client frame.
    pub ip: String,
}

/// Create the broadcast sender used to fan session events out to WebSocket subscribers.
///
/// The paired receiver is dropped: subscribers are minted on demand via
/// [`broadcast::Sender::subscribe`], and the sender is retained in the app state and the
/// audit hooks.
#[must_use]
pub fn channel() -> broadcast::Sender<SessionEvent> {
    broadcast::channel(SESSION_EVENT_CAPACITY).0
}

/// Build the JSON frame for `event` **iff** it targets the socket's authenticated subject
/// and tenant; otherwise `None`, so a socket never forwards another user's session.
///
/// The frame is exactly `{ "event": "on_new_session", "ip": … }` — the shape the browser
/// `use-new-session-alerts` hook consumes. Serializing a `Value` is infallible, so the
/// frame is returned directly.
#[must_use]
pub fn frame_for(event: &SessionEvent, sub: &str, tenant: &str) -> Option<String> {
    if event.sub != sub || event.tenant != tenant {
        return None;
    }
    Some(json!({ "event": "on_new_session", "ip": event.ip }).to_string())
}

#[cfg(test)]
#[allow(
    // Panicking is the idiomatic failure signal in tests, so the workspace-level
    // `expect_used` denial is relaxed for this test module only.
    clippy::expect_used
)]
mod tests {
    use super::*;

    fn event() -> SessionEvent {
        SessionEvent {
            sub: "user-1".to_owned(),
            tenant: "acme".to_owned(),
            ip: "203.0.113.7".to_owned(),
        }
    }

    #[test]
    fn frame_targets_the_matching_subject_and_tenant() {
        // A session for this socket's own subject + tenant yields the exact wire frame.
        let frame = frame_for(&event(), "user-1", "acme").expect("a matching event frames");
        assert_eq!(frame, r#"{"event":"on_new_session","ip":"203.0.113.7"}"#);
    }

    #[test]
    fn frame_is_none_for_a_different_subject() {
        // Another user's session must never be forwarded to this socket.
        assert!(frame_for(&event(), "user-2", "acme").is_none());
    }

    #[test]
    fn frame_is_none_for_a_different_tenant() {
        // A same-id subject in a different tenant is still filtered out.
        assert!(frame_for(&event(), "user-1", "globex").is_none());
    }

    #[test]
    fn channel_yields_a_sender_with_no_initial_subscribers() {
        // The paired receiver is dropped, so the fresh sender has no subscribers until a
        // socket subscribes.
        let sender = channel();
        assert_eq!(sender.receiver_count(), 0);
    }
}
