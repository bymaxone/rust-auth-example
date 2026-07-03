//! The example-owned audit read-API over the `audit_log` table.
//!
//! `GET /audit/logs` is a keyset page (newest first, `id < cursor`) with optional
//! actor/event/tenant filters; `GET /audit/stream` is an SSE tail whose every event
//! `id` is the row's keyset cursor, so a reconnect with `Last-Event-ID` resumes after
//! the last delivered row; `GET /audit/aggregate` rolls the trail and the `users` table
//! into the auth-health headline counters the Overview renders. No surface exposes a
//! token, code, or secret — the rows never contained one.

use std::convert::Infallible;
use std::time::Duration;

use async_stream::stream;
use axum::Json;
use axum::extract::{Query, State};
use axum::http::HeaderMap;
use axum::response::sse::{Event, KeepAlive, Sse};
use futures_core::Stream;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use time::Duration as TimeDuration;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use crate::app::AppState;
use crate::config::EmailProviderKind;
use crate::error::AppError;
use crate::guards::DashboardAdmin;

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
    /// The display actor: the actor email, else the actor id, else the `system` sentinel.
    pub actor: String,
    /// The tenant scope, when known.
    pub tenant_id: Option<String>,
    /// The originating IP, when known.
    pub ip: Option<String>,
    /// The RFC 3339 creation timestamp.
    pub created_at: String,
    /// The masked detail payload. The lifecycle hooks write no metadata, so this is empty
    /// today; it is surfaced (and defensively redacted client-side) so a future masked
    /// context field flows through without a shape change — never a token, code, or secret.
    pub details: Value,
}

/// Build a display actor from the masked columns: the actor email, else the actor id, else
/// the `system` sentinel for a system/tenant-less event.
pub(crate) fn actor_display(actor_email: Option<String>, actor_id: Option<String>) -> String {
    actor_email
        .or(actor_id)
        .unwrap_or_else(|| "system".to_owned())
}

/// Parse the masked `metadata` text column into a JSON object, defaulting to an empty
/// object when absent or unparseable (the hooks write no metadata, so it is empty today).
pub(crate) fn details_of(metadata: Option<String>) -> Value {
    metadata
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_else(|| json!({}))
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

/// Optional filters for the live audit tail, mirroring the keyset listing.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditStreamQuery {
    /// Restrict the tail to a single actor id or actor email.
    pub actor: Option<String>,
    /// Restrict the tail to a single event name.
    pub event: Option<String>,
    /// Restrict the tail to a single tenant.
    pub tenant_id: Option<String>,
}

/// Render a timestamp as an RFC 3339 string, falling back to an empty string.
pub(crate) fn format_ts(ts: OffsetDateTime) -> String {
    ts.format(&Rfc3339).unwrap_or_default()
}

/// `GET /audit/logs` — a keyset page over `audit_log` (id DESC, `id < cursor`).
///
/// Admin-only: the [`DashboardAdmin`](crate::guards::DashboardAdmin) guard rejects an
/// unauthenticated request with `401` and a non-admin with `403` before the query runs.
/// Fetches `limit + 1` rows to compute `has_more`/`next_cursor` without a second
/// count query.
///
/// # Errors
///
/// Returns [`AppError`] when the underlying query fails.
pub async fn list_logs(
    _admin: crate::guards::DashboardAdmin,
    State(state): State<AppState>,
    Query(query): Query<AuditQuery>,
) -> Result<Json<AuditPage>, AppError> {
    let limit = query.limit.clamp(1, MAX_LIMIT);
    let rows = sqlx::query!(
        "SELECT id, event, actor_email, actor_id, tenant_id, ip, created_at, \
                metadata::text AS metadata \
         FROM audit_log \
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
            actor: actor_display(row.actor_email, row.actor_id),
            tenant_id: row.tenant_id,
            ip: row.ip,
            created_at: format_ts(row.created_at),
            details: details_of(row.metadata),
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
/// Admin-only: the [`DashboardAdmin`](crate::guards::DashboardAdmin) guard gates the tail
/// (an unauthenticated request is `401`, a non-admin `403`). Resumes from the
/// `Last-Event-ID` header (the last delivered row id). Each event's `id` is the row's keyset
/// cursor, so a reconnect continues after the last row.
pub async fn stream_logs(
    _admin: crate::guards::DashboardAdmin,
    State(state): State<AppState>,
    Query(filter): Query<AuditStreamQuery>,
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
                "SELECT id, event, actor_email, actor_id, tenant_id, ip, created_at, \
                        metadata::text AS metadata \
                 FROM audit_log \
                 WHERE id > $1 \
                   AND ($3::text IS NULL OR actor_id = $3 OR actor_email = $3) \
                   AND ($4::text IS NULL OR event = $4) \
                   AND ($5::text IS NULL OR tenant_id = $5) \
                 ORDER BY id ASC LIMIT $2",
                last,
                STREAM_BATCH,
                filter.actor,
                filter.event,
                filter.tenant_id,
            )
            .fetch_all(&pool)
            .await;
            let rows = match rows {
                Ok(rows) => rows,
                Err(error) => {
                    tracing::error!(?error, "audit stream poll failed");
                    continue;
                }
            };
            for row in rows {
                last = row.id;
                let id = row.id;
                let audit = AuditRow {
                    id: row.id,
                    event: row.event,
                    actor: actor_display(row.actor_email, row.actor_id),
                    tenant_id: row.tenant_id,
                    ip: row.ip,
                    created_at: format_ts(row.created_at),
                    details: details_of(row.metadata),
                };
                if let Ok(event) = Event::default().id(id.to_string()).json_data(&audit) {
                    yield Ok(event);
                }
            }
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::default())
}

/// The window, in hours, over which the aggregate counts recent session activity.
const AGGREGATE_WINDOW_HOURS: i64 = 24;

/// The auth-health aggregate the Overview renders as headline cards.
///
/// The three rates are population shares over the `users` table (an honest, derivable
/// health signal); `active_sessions` counts the sessions established within the recent
/// window from the audit trail; the provider fields come from the resolved configuration.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditAggregate {
    /// Share of users with a recorded successful login (`last_login_at` set), `0..1`.
    pub login_success_rate: f64,
    /// Share of users with a verified email, `0..1`.
    pub verify_success_rate: f64,
    /// Count of sessions established within the recent window.
    pub active_sessions: i64,
    /// Share of users with MFA enrolled, `0..1`.
    pub mfa_enrolled_share: f64,
    /// The configured outbound email transport.
    pub email_provider: EmailProviderKind,
    /// Whether Google OAuth is configured in this environment.
    pub oauth_google_enabled: bool,
}

/// The raw counts the aggregate is computed from — separated so the (branchy) rate
/// arithmetic is unit-testable without a database.
struct AggregateCounts {
    /// Total dashboard users.
    total: i64,
    /// Users with a recorded successful login.
    logged_in: i64,
    /// Users with a verified email.
    verified: i64,
    /// Users with MFA enrolled.
    mfa: i64,
    /// Sessions established within the recent window.
    active_sessions: i64,
}

/// A `0..1` share of `numerator` over `denominator`, falling back to `empty` when the
/// population is empty (no users means nothing has failed, or nothing is enrolled).
fn share(numerator: i64, denominator: i64, empty: f64) -> f64 {
    if denominator == 0 {
        empty
    } else {
        numerator as f64 / denominator as f64
    }
}

/// Roll the raw counts and the resolved provider configuration into the wire aggregate.
fn compute_aggregate(
    counts: &AggregateCounts,
    email_provider: EmailProviderKind,
    oauth_google_enabled: bool,
) -> AuditAggregate {
    AuditAggregate {
        login_success_rate: share(counts.logged_in, counts.total, 1.0),
        verify_success_rate: share(counts.verified, counts.total, 1.0),
        active_sessions: counts.active_sessions,
        mfa_enrolled_share: share(counts.mfa, counts.total, 0.0),
        email_provider,
        oauth_google_enabled,
    }
}

/// `GET /audit/aggregate` — the auth-health roll-up backing the Overview cards.
///
/// Admin-only: the [`DashboardAdmin`] guard rejects an unauthenticated request with `401`
/// and a non-admin with `403` before the query runs. Development-only, mounted alongside
/// the rest of `/audit/*`. One parameterized aggregate query rolls the `users` table and
/// the recent-session window; the provider fields come from the resolved configuration.
///
/// # Errors
///
/// Returns [`AppError`] when the underlying aggregate query fails.
pub async fn aggregate(
    _admin: DashboardAdmin,
    State(state): State<AppState>,
) -> Result<Json<AuditAggregate>, AppError> {
    let cutoff = OffsetDateTime::now_utc() - TimeDuration::hours(AGGREGATE_WINDOW_HOURS);
    let row = sqlx::query!(
        "SELECT \
           (SELECT count(*) FROM users) AS total, \
           (SELECT count(*) FROM users WHERE last_login_at IS NOT NULL) AS logged_in, \
           (SELECT count(*) FROM users WHERE email_verified) AS verified, \
           (SELECT count(*) FROM users WHERE mfa_enabled) AS mfa, \
           (SELECT count(*) FROM audit_log WHERE event = 'on_new_session' \
              AND created_at >= $1) AS active_sessions",
        cutoff,
    )
    .fetch_one(&state.pool)
    .await?;

    let counts = AggregateCounts {
        total: row.total.unwrap_or(0),
        logged_in: row.logged_in.unwrap_or(0),
        verified: row.verified.unwrap_or(0),
        mfa: row.mfa.unwrap_or(0),
        active_sessions: row.active_sessions.unwrap_or(0),
    };
    let oauth_google_enabled = state.engine.oauth_providers().contains_key("google");
    Ok(Json(compute_aggregate(
        &counts,
        state.email_provider,
        oauth_google_enabled,
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rates_are_population_shares_when_users_exist() {
        // With a non-empty population the three rates are the exact shares, and the
        // session count and provider fields pass through unchanged.
        let counts = AggregateCounts {
            total: 10,
            logged_in: 9,
            verified: 8,
            mfa: 5,
            active_sessions: 3,
        };
        let agg = compute_aggregate(&counts, EmailProviderKind::Mailpit, true);
        assert!((agg.login_success_rate - 0.9).abs() < f64::EPSILON);
        assert!((agg.verify_success_rate - 0.8).abs() < f64::EPSILON);
        assert!((agg.mfa_enrolled_share - 0.5).abs() < f64::EPSILON);
        assert_eq!(agg.active_sessions, 3);
        assert_eq!(agg.email_provider, EmailProviderKind::Mailpit);
        assert!(agg.oauth_google_enabled);
    }

    #[test]
    fn empty_population_defaults_rates_without_dividing_by_zero() {
        // With no users the login/verify rates default to 1.0 (nothing has failed) and the
        // MFA share to 0.0 (nobody is enrolled), never a division by zero.
        let counts = AggregateCounts {
            total: 0,
            logged_in: 0,
            verified: 0,
            mfa: 0,
            active_sessions: 0,
        };
        let agg = compute_aggregate(&counts, EmailProviderKind::Resend, false);
        assert!((agg.login_success_rate - 1.0).abs() < f64::EPSILON);
        assert!((agg.verify_success_rate - 1.0).abs() < f64::EPSILON);
        assert!((agg.mfa_enrolled_share - 0.0).abs() < f64::EPSILON);
        assert_eq!(agg.active_sessions, 0);
        assert_eq!(agg.email_provider, EmailProviderKind::Resend);
        assert!(!agg.oauth_google_enabled);
    }

    #[test]
    fn actor_display_prefers_email_then_id_then_system() {
        // The display actor prefers the email, falls back to the id, then the sentinel.
        assert_eq!(
            actor_display(Some("a@b.co".to_owned()), Some("id-1".to_owned())),
            "a@b.co"
        );
        assert_eq!(actor_display(None, Some("id-1".to_owned())), "id-1");
        assert_eq!(actor_display(None, None), "system");
    }

    #[test]
    fn details_of_defaults_to_an_empty_object() {
        // Absent or unparseable metadata yields an empty object; valid JSON round-trips.
        assert_eq!(details_of(None), json!({}));
        assert_eq!(details_of(Some("not json".to_owned())), json!({}));
        assert_eq!(
            details_of(Some(r#"{"k":"v"}"#.to_owned())),
            json!({ "k": "v" })
        );
    }
}
