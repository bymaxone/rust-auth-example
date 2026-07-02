//! Example realtime endpoint authenticated by a single-use WebSocket ticket.
//!
//! The browser first calls `POST /auth/ws-ticket` (mounted by the library and guarded by
//! `AuthUser` + `UserStatus` + `MfaSatisfied`) to mint a short-lived, single-use ticket,
//! then opens `wss://…?ticket=…`. This endpoint redeems that ticket exactly once via the
//! engine's `redeem_ws_ticket`, so a captured URL cannot be replayed. The access JWT never
//! travels in the URL — the ticket is the sole URL-borne credential and it is an opaque,
//! one-shot value, not a token.

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::Response;
use bymax_auth_types::DashboardClaims;
use serde::Deserialize;

use crate::app::AppState;
use crate::error::AppError;

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
/// missing, invalid, expired, or already redeemed.
pub async fn realtime(
    State(state): State<AppState>,
    Query(query): Query<TicketQuery>,
    upgrade: WebSocketUpgrade,
) -> Result<Response, AppError> {
    // Redeem the ticket into the authorization snapshot the socket runs under. Redemption is
    // atomic and single-use, so a replayed ticket is rejected here before any upgrade.
    let claims = state.engine.redeem_ws_ticket(&query.ticket).await?;
    Ok(upgrade.on_upgrade(move |socket| handle_socket(socket, claims)))
}

/// Echo the authenticated subject once, then close — the demo payload for the example
/// socket. The claims are an authorization snapshot for the socket's lifetime, never
/// re-signed and never granting REST access.
async fn handle_socket(mut socket: WebSocket, claims: DashboardClaims) {
    let greeting = Message::Text(format!("authenticated: {}", claims.sub).into());
    if socket.send(greeting).await.is_ok() {
        // Close the connection cleanly after the single demo payload.
        let _ = socket.send(Message::Close(None)).await;
    }
}
