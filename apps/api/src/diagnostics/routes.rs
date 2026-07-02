//! Dev-facing diagnostics that make the engine's server-only primitives observable:
//! password rehash strength, brute-force lockout, and the recent hook-event stream.
//!
//! These surfaces never reveal a secret — hash strength reads a caller-supplied PHC,
//! lockout drives the `BruteForceStore` by identifier, and the hook view reads the
//! already-masked `audit_log` rows.

use axum::Json;
use axum::extract::State;
use bymax_auth_crypto::password::{PasswordParams, needs_rehash};
use serde::{Deserialize, Serialize};
use time::format_description::well_known::Rfc3339;

use crate::app::AppState;
use crate::audit::routes::AuditRow;
use crate::error::AppError;

/// How many recent hook-event rows the diagnostics view returns.
const RECENT_HOOKS: i64 = 20;

/// Request body for the password-hash strength check.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashStrengthRequest {
    /// The stored PHC string to evaluate against the current parameters.
    pub phc: String,
}

/// Whether a stored hash should be rehashed with the current parameters.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashStrengthResponse {
    /// `true` when the hash is stale (weaker params, a different algorithm, or legacy).
    pub needs_rehash: bool,
}

/// `POST /diagnostics/hash-strength` — reports whether a PHC needs rehashing.
pub async fn hash_strength(Json(request): Json<HashStrengthRequest>) -> Json<HashStrengthResponse> {
    let needs_rehash = needs_rehash(&request.phc, &PasswordParams::default());
    Json(HashStrengthResponse { needs_rehash })
}

/// Request body for the brute-force lockout driver.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForceLockoutRequest {
    /// The lockout identifier to drive to its threshold.
    pub identifier: String,
}

/// The resulting lockout state after driving the store.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForceLockoutResponse {
    /// Whether the identifier is now locked.
    pub locked: bool,
    /// The failure count recorded on the final attempt.
    pub attempts: i64,
}

/// `POST /diagnostics/force-lockout` — records failures until the identifier locks.
///
/// Drives the engine's [`BruteForceStore`] with the configured max-attempts and
/// window, then reports the lockout state.
///
/// # Errors
///
/// Returns [`AppError`] when the store cannot be reached.
pub async fn force_lockout(
    State(state): State<AppState>,
    Json(request): Json<ForceLockoutRequest>,
) -> Result<Json<ForceLockoutResponse>, AppError> {
    let brute_force = state.engine.config().config().brute_force;
    let max_attempts = brute_force.max_attempts;
    let window_secs = brute_force.window.as_secs();
    let store = state.engine.brute_force_store();

    let mut attempts = 0_i64;
    for _ in 0..max_attempts {
        attempts = store
            .record_failure(&request.identifier, window_secs)
            .await?;
        if store.is_locked(&request.identifier, max_attempts).await? {
            break;
        }
    }
    let locked = store.is_locked(&request.identifier, max_attempts).await?;
    Ok(Json(ForceLockoutResponse { locked, attempts }))
}

/// `GET /diagnostics/hooks` — the most recent hook-event audit rows (a compact view).
///
/// # Errors
///
/// Returns [`AppError`] when the underlying query fails.
pub async fn recent_hooks(State(state): State<AppState>) -> Result<Json<Vec<AuditRow>>, AppError> {
    let rows = sqlx::query!(
        "SELECT id, event, actor_email, tenant_id, ip, created_at FROM audit_log \
         ORDER BY id DESC LIMIT $1",
        RECENT_HOOKS,
    )
    .fetch_all(&state.pool)
    .await?;

    let data = rows
        .into_iter()
        .map(|row| AuditRow {
            id: row.id,
            event: row.event,
            actor_email: row.actor_email,
            tenant_id: row.tenant_id,
            ip: row.ip,
            created_at: row.created_at.format(&Rfc3339).unwrap_or_default(),
        })
        .collect();
    Ok(Json(data))
}
