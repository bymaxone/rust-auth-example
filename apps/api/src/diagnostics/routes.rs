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

use crate::app::AppState;
use crate::audit::routes::{AuditRow, actor_display, details_of, format_ts};
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
    /// Seconds remaining on the lockout — the countdown a login form would surface. Zero
    /// when the identifier is not locked.
    pub remaining_lockout_secs: u64,
}

/// `POST /diagnostics/force-lockout` — records failures until the identifier locks.
///
/// Drives the engine's `BruteForceStore` with the configured max-attempts and
/// window, then reports the lockout state and the `remaining_lockout_secs` countdown.
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
    let remaining_lockout_secs = store.remaining_lockout_secs(&request.identifier).await?;
    Ok(Json(ForceLockoutResponse {
        locked,
        attempts,
        remaining_lockout_secs,
    }))
}

/// The state after clearing a lockout.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetLockoutResponse {
    /// Whether the identifier is locked after the reset (always `false`).
    pub locked: bool,
}

/// `POST /diagnostics/reset-lockout` — clears the failure counter for an identifier, so the
/// lockout countdown returns to zero (the operator-unlock path).
///
/// # Errors
///
/// Returns [`AppError`] when the store cannot be reached.
pub async fn reset_lockout(
    State(state): State<AppState>,
    Json(request): Json<ForceLockoutRequest>,
) -> Result<Json<ResetLockoutResponse>, AppError> {
    let store = state.engine.brute_force_store();
    store.reset(&request.identifier).await?;
    Ok(Json(ResetLockoutResponse { locked: false }))
}

/// The authenticated subject a guard resolved — the safe identity fields only, never a
/// token or secret.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhoAmI {
    /// The subject id from the verified claims.
    pub sub: String,
    /// The role carried by the verified claims.
    pub role: String,
}

/// `GET /diagnostics/whoami` — an authenticated-only route (the `AuthUser` guard demo).
/// Returns the caller's subject and role from the verified dashboard token; an
/// unauthenticated request is rejected with `401` before this handler runs.
pub async fn whoami(user: crate::guards::DashboardUser) -> Json<WhoAmI> {
    Json(WhoAmI {
        sub: user.0.sub,
        role: user.0.role,
    })
}

/// `GET /diagnostics/platform` — a platform-only route (the `PlatformUser` guard demo).
/// Visible solely to a valid platform admin; a dashboard token (or none) is rejected with
/// `401`/`403`, proving the two token families never cross over.
pub async fn platform_whoami(admin: crate::guards::PlatformAdmin) -> Json<WhoAmI> {
    Json(WhoAmI {
        sub: admin.0.sub,
        role: admin.0.role,
    })
}

/// `GET /diagnostics/hooks` — the most recent hook-event audit rows (a compact view).
///
/// # Errors
///
/// Returns [`AppError`] when the underlying query fails.
pub async fn recent_hooks(State(state): State<AppState>) -> Result<Json<Vec<AuditRow>>, AppError> {
    let rows = sqlx::query!(
        "SELECT id, event, actor_email, actor_id, tenant_id, ip, created_at, \
                metadata::text AS metadata \
         FROM audit_log \
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
            actor: actor_display(row.actor_email, row.actor_id),
            tenant_id: row.tenant_id,
            ip: row.ip,
            created_at: format_ts(row.created_at),
            details: details_of(row.metadata),
        })
        .collect();
    Ok(Json(data))
}
