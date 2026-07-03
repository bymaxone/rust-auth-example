//! Example realtime endpoint authenticated by a single-use WebSocket ticket.
//!
//! The browser first calls `POST /auth/ws-ticket` (mounted by the library and guarded by
//! `AuthUser` + `UserStatus` + `MfaSatisfied`) to mint a short-lived, single-use ticket,
//! then opens `wss://…?ticket=…`. This endpoint redeems that ticket exactly once via the
//! engine's `redeem_ws_ticket`, so a captured URL cannot be replayed. The access JWT never
//! travels in the URL — the ticket is the sole URL-borne credential and it is an opaque,
//! one-shot value, not a token.
//!
//! Once upgraded, the socket subscribes to the realtime [`SessionEvent`](crate::realtime)
//! broadcast and forwards, as JSON, only the `on_new_session` frames that target the
//! authenticated subject and tenant — the live new-session alert the console toasts.

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::Response;
use bymax_auth_types::DashboardClaims;
use serde::Deserialize;
use tokio::sync::broadcast;

use crate::app::AppState;
use crate::error::AppError;
use crate::realtime::{SessionEvent, frame_for};

/// The `?ticket=` query for the WebSocket upgrade — the single URL-borne credential. It is
/// an opaque, one-shot ticket, never an access JWT.
#[derive(Debug, Deserialize)]
pub struct TicketQuery {
    /// The single-use upgrade ticket minted by `POST /auth/ws-ticket`.
    pub ticket: String,
}

/// `GET /ws/example` — upgrade the connection only after the single-use ticket redeems into
/// the dashboard authorization snapshot. A missing ticket fails query extraction, and an
/// invalid/expired/already-redeemed ticket fails redemption; both refuse the upgrade. The
/// JWT is never read from the URL.
///
/// # Errors
///
/// Returns [`AppError`] (rendered as the library's `401` envelope) when the ticket is
/// invalid, expired, or already redeemed. A request without the `ticket` query parameter
/// is rejected during extraction (`400`) before this handler runs.
pub async fn realtime(
    State(state): State<AppState>,
    Query(query): Query<TicketQuery>,
    upgrade: WebSocketUpgrade,
) -> Result<Response, AppError> {
    // Redeem the ticket into the authorization snapshot the socket runs under. Redemption is
    // atomic and single-use, so a replayed ticket is rejected here before any upgrade.
    let claims = state.engine.redeem_ws_ticket(&query.ticket).await?;
    let events = state.session_events.subscribe();
    Ok(upgrade.on_upgrade(move |socket| handle_socket(socket, claims, events)))
}

/// A sink the forward loop writes JSON frames to. Abstracts the WebSocket so the loop's
/// control flow (deliver / lag / close / peer-gone) is unit-testable without a live socket.
/// `Err(())` means the peer has gone away and the loop should stop.
trait FrameSink {
    /// Send one text frame; `Err(())` signals the peer is gone.
    fn send_text(&mut self, text: String) -> impl std::future::Future<Output = Result<(), ()>>;
}

/// The production [`FrameSink`]: writes each frame as a WebSocket text message.
struct WebSocketSink(WebSocket);

impl FrameSink for WebSocketSink {
    async fn send_text(&mut self, text: String) -> Result<(), ()> {
        self.0
            .send(Message::Text(text.into()))
            .await
            .map_err(|_| ())
    }
}

/// Forward realtime `on_new_session` frames to the authenticated socket for the lifetime of
/// the connection. The claims are an authorization snapshot for the socket's lifetime, never
/// re-signed and never granting REST access; only the subject's own sessions are forwarded,
/// and a lagging subscriber skips missed frames rather than blocking the publisher.
async fn handle_socket(
    socket: WebSocket,
    claims: DashboardClaims,
    events: broadcast::Receiver<SessionEvent>,
) {
    let mut sink = WebSocketSink(socket);
    forward_session_events(events, &claims.sub, &claims.tenant_id, &mut sink).await;
}

/// Drive the fan-out receiver, forwarding only the frames that target `sub`/`tenant` to
/// `sink`, until the peer disconnects or every publisher is dropped. A lagging subscriber
/// skips the missed frames and keeps tailing rather than tearing the connection down.
async fn forward_session_events<S: FrameSink>(
    mut events: broadcast::Receiver<SessionEvent>,
    sub: &str,
    tenant: &str,
    sink: &mut S,
) {
    loop {
        match events.recv().await {
            Ok(event) => {
                if let Some(frame) = frame_for(&event, sub, tenant)
                    && sink.send_text(frame).await.is_err()
                {
                    // The peer has gone away; drop the subscription and stop.
                    break;
                }
            }
            // The socket fell behind the fan-out buffer: skip the missed frames and keep
            // tailing rather than tearing the connection down.
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            // Every publisher has been dropped (process shutdown): close cleanly.
            Err(broadcast::error::RecvError::Closed) => break,
        }
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
    use crate::realtime;

    /// A test [`FrameSink`] that records delivered frames and can be told to fail (as a peer
    /// that has gone away) after a chosen number of successful sends.
    struct RecordingSink {
        sent: Vec<String>,
        fail_after: usize,
    }

    impl FrameSink for RecordingSink {
        async fn send_text(&mut self, text: String) -> Result<(), ()> {
            if self.sent.len() >= self.fail_after {
                return Err(());
            }
            self.sent.push(text);
            Ok(())
        }
    }

    fn event(sub: &str) -> SessionEvent {
        SessionEvent {
            sub: sub.to_owned(),
            tenant: "acme".to_owned(),
            ip: "203.0.113.7".to_owned(),
        }
    }

    #[tokio::test]
    async fn forwards_matching_frames_and_stops_when_the_channel_closes() {
        // A matching event is delivered; a non-matching one is skipped; dropping the sender
        // closes the channel and ends the loop.
        let sender = realtime::channel();
        let events = sender.subscribe();
        sender.send(event("user-9")).unwrap(); // different subject -> skipped
        sender.send(event("user-1")).unwrap(); // this subject -> delivered
        drop(sender); // closes the channel so the loop terminates deterministically

        let mut sink = RecordingSink {
            sent: Vec::new(),
            fail_after: usize::MAX,
        };
        forward_session_events(events, "user-1", "acme", &mut sink).await;

        assert_eq!(
            sink.sent.len(),
            1,
            "only the subject's own frame is forwarded"
        );
        assert!(sink.sent[0].contains("on_new_session"));
        assert!(sink.sent[0].contains("203.0.113.7"));
    }

    #[tokio::test]
    async fn stops_when_the_peer_has_gone_away() {
        // A send error (the peer disconnected) ends the loop rather than spinning.
        let sender = realtime::channel();
        let events = sender.subscribe();
        sender.send(event("user-1")).unwrap();

        let mut sink = RecordingSink {
            sent: Vec::new(),
            fail_after: 0, // the very first send fails
        };
        forward_session_events(events, "user-1", "acme", &mut sink).await;
        assert!(
            sink.sent.is_empty(),
            "no frame is recorded once the peer is gone"
        );
    }

    #[tokio::test]
    async fn skips_missed_frames_when_the_subscriber_lags() {
        // Overflowing the buffer surfaces a `Lagged` signal, which the loop tolerates: it
        // keeps tailing and still delivers a later matching frame.
        let (sender, receiver) = tokio::sync::broadcast::channel(1);
        // Two sends into a depth-1 buffer without draining forces the next recv to lag.
        sender.send(event("user-1")).unwrap();
        sender.send(event("user-1")).unwrap();
        sender.send(event("user-1")).unwrap();
        drop(sender);

        let mut sink = RecordingSink {
            sent: Vec::new(),
            fail_after: usize::MAX,
        };
        forward_session_events(receiver, "user-1", "acme", &mut sink).await;
        // The lag skipped the overflowed frames; at least the newest retained frame is sent.
        assert!(!sink.sent.is_empty(), "tailing continues past a lag");
    }
}
