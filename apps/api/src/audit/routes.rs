//! The example-owned audit read-API over the `audit_log` table.
//!
//! `GET /audit/logs` is a keyset page (newest first, `id < cursor`) with optional
//! actor/event/tenant filters; `GET /audit/stream` is an SSE tail whose every event
//! `id` is the row's keyset cursor, so a reconnect with `Last-Event-ID` resumes after
//! the last delivered row. Neither surface exposes a token, code, or secret — the rows
//! never contained one.

use std::convert::Infallible;
use std::time::Duration;

use async_stream::stream;
use axum::Json;
use axum::extract::{Query, State};
use axum::http::HeaderMap;
use axum::response::sse::{Event, KeepAlive, Sse};
use futures_core::Stream;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use crate::app::AppState;
use crate::error::AppError;

/// The default page size when the caller does not specify one.
const DEFAULT_LIMIT: i64 = 50;
/// The largest page a caller may request, bounding a single query.
const MAX_LIMIT: i64 = 200;
/// How often the SSE tail polls for newly-appended rows.
const POLL_INTERVAL: Duration = Duration::from_secs(1);
/// The most rows a single SSE poll drains at once.
const STREAM_BATCH: i64 = 100;

/// Query parameters for the keyset audit listing.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditQuery {
    /// Return rows with `id` strictly below this cursor (newest-first paging).
    pub cursor: Option<i64>,
    /// Filter by actor id or actor email.
    pub actor: Option<String>,
    /// Filter by event name.
    pub event: Option<String>,
    /// Filter by tenant id.
    pub tenant_id: Option<String>,
    /// Page size; clamped to `1..=200`.
    #[serde(default = "default_limit")]
    pub limit: i64,
}

/// The default page size for serde when `limit` is absent.
fn default_limit() -> i64 {
    DEFAULT_LIMIT
}

/// One masked audit row on the wire.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditRow {
    /// The keyset cursor (the row's monotonic id).
    pub id: i64,
    /// The lifecycle event name.
    pub event: String,
    /// The actor's email, when known.
    pub actor_email: Option<String>,
    /// The tenant scope, when known.
    pub tenant_id: Option<String>,
    /// The originating IP, when known.
    pub ip: Option<String>,
    /// The RFC 3339 creation timestamp.
    pub created_at: String,
}

/// A keyset page of audit rows.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditPage {
    /// The rows on this page, newest first.
    pub data: Vec<AuditRow>,
    /// The cursor to pass to fetch the next (older) page, when more remain.
    pub next_cursor: Option<i64>,
    /// Whether more rows exist beyond this page.
    pub has_more: bool,
}

/// Render a timestamp as an RFC 3339 string, falling back to an empty string.
fn format_ts(ts: OffsetDateTime) -> String {
    ts.format(&Rfc3339).unwrap_or_default()
}

/// `GET /audit/logs` — a keyset page over `audit_log` (id DESC, `id < cursor`).
///
/// Fetches `limit + 1` rows to compute `has_more`/`next_cursor` without a second
/// count query.
///
/// # Errors
///
/// Returns [`AppError`] when the underlying query fails.
pub async fn list_logs(
    State(state): State<AppState>,
    Query(query): Query<AuditQuery>,
) -> Result<Json<AuditPage>, AppError> {
    let limit = query.limit.clamp(1, MAX_LIMIT);
    let rows = sqlx::query!(
        "SELECT id, event, actor_email, tenant_id, ip, created_at FROM audit_log \
         WHERE ($1::bigint IS NULL OR id < $1) \
           AND ($2::text IS NULL OR actor_id = $2 OR actor_email = $2) \
           AND ($3::text IS NULL OR event = $3) \
           AND ($4::text IS NULL OR tenant_id = $4) \
         ORDER BY id DESC LIMIT $5",
        query.cursor,
        query.actor,
        query.event,
        query.tenant_id,
        limit + 1,
    )
    .fetch_all(&state.pool)
    .await?;

    let has_more = i64::try_from(rows.len()).unwrap_or(i64::MAX) > limit;
    let data: Vec<AuditRow> = rows
        .into_iter()
        .take(usize::try_from(limit).unwrap_or(usize::MAX))
        .map(|row| AuditRow {
            id: row.id,
            event: row.event,
            actor_email: row.actor_email,
            tenant_id: row.tenant_id,
            ip: row.ip,
            created_at: format_ts(row.created_at),
        })
        .collect();
    let next_cursor = if has_more {
        data.last().map(|row| row.id)
    } else {
        None
    };

    Ok(Json(AuditPage {
        data,
        next_cursor,
        has_more,
    }))
}

/// `GET /audit/stream` — an SSE tail of new `audit_log` rows.
///
/// Resumes from the `Last-Event-ID` header (the last delivered row id). Each event's
/// `id` is the row's keyset cursor, so a reconnect continues after the last row.
pub async fn stream_logs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let pool = state.pool.clone();
    let mut last = headers
        .get("last-event-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0);

    let stream = stream! {
        loop {
            tokio::time::sleep(POLL_INTERVAL).await;
            let rows = sqlx::query!(
                "SELECT id, event, actor_email, tenant_id, ip, created_at FROM audit_log \
                 WHERE id > $1 ORDER BY id ASC LIMIT $2",
                last,
                STREAM_BATCH,
            )
            .fetch_all(&pool)
            .await;
            let Ok(rows) = rows else { break };
            for row in rows {
                last = row.id;
                let audit = AuditRow {
                    id: row.id,
                    event: row.event,
                    actor_email: row.actor_email,
                    tenant_id: row.tenant_id,
                    ip: row.ip,
                    created_at: format_ts(row.created_at),
                };
                if let Ok(event) = Event::default().id(row.id.to_string()).json_data(&audit) {
                    yield Ok(event);
                }
            }
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::default())
}
