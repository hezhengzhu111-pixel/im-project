use crate::auth::identity_from_headers;
use crate::auth_api;
use crate::error::AppError;
use crate::route::parse_user_routes;
use crate::web::AppState;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::Json;
use im_rs_common::api::ApiResponse;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;
use std::collections::{HashMap, HashSet};

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const MAX_SESSION_ID_LEN: usize = 64;
const MAX_KEY_FIELD_LEN: usize = 1000;
const MAX_PAYLOAD_LEN: usize = 50_000;

// ---------------------------------------------------------------------------
// 请求类型
// ---------------------------------------------------------------------------

/// E2EE 会话协商请求体。
///
/// 用于发起、接受或拒绝端到端加密会话。仅传递公钥/密文材料，
/// 服务端不保存任何私钥。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct E2eeSessionRequest {
    pub session_id: String,
    pub identity_key: Option<String>,
    pub signed_pre_key: Option<String>,
    pub request_payload_json: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingE2eeSessionDto {
    pub session_id: String,
    pub requester_id: String,
    pub requester_name: String,
    pub target_user_id: String,
    pub request_payload_json: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct E2eeNegotiationPush {
    pub action: String,
    pub session_id: String,
    pub requester_id: String,
    pub requester_name: String,
    pub target_user_id: String,
    pub request_payload_json: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InternalPushBatchRequest {
    pub user_ids: Vec<i64>,
    #[serde(rename = "type")]
    pub kind: String,
    pub data: Value,
}

// ---------------------------------------------------------------------------
// 辅助校验
// ---------------------------------------------------------------------------

fn validate_session_id(session_id: &str) -> Result<(), AppError> {
    if session_id.is_empty() || session_id.len() > MAX_SESSION_ID_LEN {
        return Err(AppError::BadRequest("invalid session_id".to_string()));
    }
    Ok(())
}

fn validate_optional_key(value: Option<&str>, field_name: &str) -> Result<(), AppError> {
    if let Some(v) = value {
        if v.is_empty() || v.len() > MAX_KEY_FIELD_LEN {
            return Err(AppError::BadRequest(format!("invalid {field_name}")));
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// 处理器
// ---------------------------------------------------------------------------

/// 发起端到端加密协商请求。
///
/// POST /api/e2ee/request
///
/// 业务目的：向目标用户发起 E2EE 会话协商，创建 pending 状态的会话记录。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：session_id 格式为 `{id_a}_{id_b}`，发起者必须是其中一方；
/// 仅保存公钥材料（identity_key、signed_pre_key、request_payload_json），
/// 不保存任何私钥。已加密的会话可以重新发起协商以完成换钥或恢复。
/// 返回语义：成功返回 "ok"，幂等更新；已有 encrypted 记录也允许重新发起，
/// 用于本地密钥丢失、换设备或主动轮换会话密钥后的恢复。
pub async fn request_encryption(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<E2eeSessionRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_session_id(&request.session_id)?;
    validate_optional_key(request.identity_key.as_deref(), "identity_key")?;
    validate_optional_key(request.signed_pre_key.as_deref(), "signed_pre_key")?;

    if let Some(ref payload) = request.request_payload_json {
        if payload.len() > MAX_PAYLOAD_LEN {
            return Err(AppError::BadRequest(
                "request_payload_json too large".to_string(),
            ));
        }
    }

    // 解析 session_id 中的两个 user_id，校验发起者必须是其中之一
    let (id_a, id_b) = parse_session_partners(&request.session_id)?;
    if identity.user_id != id_a && identity.user_id != id_b {
        return Err(AppError::Forbidden(
            "session_id does not include caller".to_string(),
        ));
    }
    let target_user_id = if identity.user_id == id_a { id_b } else { id_a };

    // 检查是否已存在
    let existing = sqlx::query(
        "SELECT status FROM service_user_service_db.e2ee_sessions WHERE session_id = ?",
    )
    .bind(&request.session_id)
    .fetch_optional(&state.db)
    .await?;

    if existing.is_some() {
        // 允许重新请求：更新记录并将服务端协商状态重置为 pending。
        sqlx::query(
            r#"UPDATE service_user_service_db.e2ee_sessions
               SET requester_id = ?, target_user_id = ?, status = 'pending',
                   request_payload_json = ?, updated_time = NOW()
               WHERE session_id = ?"#,
        )
        .bind(identity.user_id)
        .bind(target_user_id)
        .bind(&request.request_payload_json)
        .bind(&request.session_id)
        .execute(&state.db)
        .await?;
    } else {
        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_sessions
               (session_id, requester_id, target_user_id, status, request_payload_json)
               VALUES (?, ?, ?, 'pending', ?)"#,
        )
        .bind(&request.session_id)
        .bind(identity.user_id)
        .bind(target_user_id)
        .bind(&request.request_payload_json)
        .execute(&state.db)
        .await?;
    }

    let requester_name = resolve_user_display_name(&state, identity.user_id)
        .await?
        .unwrap_or_else(|| identity.username.clone());
    let push = E2eeNegotiationPush {
        action: "request".to_string(),
        session_id: request.session_id.clone(),
        requester_id: identity.user_id.to_string(),
        requester_name,
        target_user_id: target_user_id.to_string(),
        request_payload_json: request.request_payload_json.clone(),
    };
    if let Err(error) = push_negotiation_event(&state, target_user_id, &push).await {
        tracing::warn!(
            error = %error,
            session_id = %request.session_id,
            target_user_id = %target_user_id,
            "failed to push e2ee negotiation request"
        );
    }

    Ok(Json(ApiResponse::success("ok".to_string())))
}

/// 查询当前用户待确认的 E2EE 私聊协商请求。
pub async fn pending_encryption_requests(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Vec<PendingE2eeSessionDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let rows = sqlx::query(
        r#"SELECT s.session_id, s.requester_id, s.target_user_id, s.request_payload_json,
                  COALESCE(NULLIF(u.nickname, ''), u.username, CAST(s.requester_id AS CHAR)) AS requester_name
           FROM service_user_service_db.e2ee_sessions s
           LEFT JOIN service_user_service_db.users u ON u.id = s.requester_id
           WHERE s.target_user_id = ? AND s.status = 'pending'
           ORDER BY s.updated_time DESC
           LIMIT 20"#,
    )
    .bind(identity.user_id)
    .fetch_all(&state.db)
    .await?;

    let requests = rows
        .into_iter()
        .map(|row| PendingE2eeSessionDto {
            session_id: row.get::<String, _>("session_id"),
            requester_id: row.get::<i64, _>("requester_id").to_string(),
            requester_name: row.get::<String, _>("requester_name"),
            target_user_id: row.get::<i64, _>("target_user_id").to_string(),
            request_payload_json: row.get::<Option<String>, _>("request_payload_json"),
        })
        .collect();

    Ok(Json(ApiResponse::success(requests)))
}

/// 接受端到端加密协商。
///
/// POST /api/e2ee/accept
///
/// 业务目的：目标用户接受加密协商请求，将会话状态从 pending 更新为 encrypted。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：只有 target_user_id（被请求方）可以接受；
/// 仅传递公钥材料，不传递私钥。会话不存在返回 404，非 pending 状态返回 409。
/// 返回语义：成功返回 "ok"。
pub async fn accept_encryption(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<E2eeSessionRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_session_id(&request.session_id)?;
    validate_optional_key(request.signed_pre_key.as_deref(), "signed_pre_key")?;

    let row = sqlx::query(
        r#"SELECT requester_id, target_user_id, status
           FROM service_user_service_db.e2ee_sessions
           WHERE session_id = ?"#,
    )
    .bind(&request.session_id)
    .fetch_optional(&state.db)
    .await?;

    let Some(row) = row else {
        return Err(AppError::NotFound("session not found".to_string()));
    };

    let target_user_id: i64 = row.get("target_user_id");
    let status: String = row.get("status");

    if identity.user_id != target_user_id {
        return Err(AppError::Forbidden(
            "only target user can accept".to_string(),
        ));
    }
    if status != "pending" {
        return Err(AppError::Conflict(format!(
            "cannot accept session in '{status}' state"
        )));
    }

    sqlx::query(
        "UPDATE service_user_service_db.e2ee_sessions \
         SET status = 'encrypted', updated_time = NOW() \
         WHERE session_id = ?",
    )
    .bind(&request.session_id)
    .execute(&state.db)
    .await?;

    let push = E2eeNegotiationPush {
        action: "accepted".to_string(),
        session_id: request.session_id.clone(),
        requester_id: row.get::<i64, _>("requester_id").to_string(),
        requester_name: String::new(),
        target_user_id: target_user_id.to_string(),
        request_payload_json: None,
    };
    if let Err(error) =
        push_negotiation_event(&state, row.get::<i64, _>("requester_id"), &push).await
    {
        tracing::warn!(
            error = %error,
            session_id = %request.session_id,
            requester_id = %row.get::<i64, _>("requester_id"),
            "failed to push e2ee negotiation acceptance"
        );
    }

    Ok(Json(ApiResponse::success("ok".to_string())))
}

/// 拒绝端到端加密协商。
///
/// POST /api/e2ee/reject
///
/// 业务目的：目标用户拒绝加密协商请求，将会话状态从 pending 更新为 rejected。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：只有 target_user_id（被请求方）可以拒绝。
/// 会话不存在返回 404，非 pending 状态返回 409。
/// 返回语义：成功返回 "ok"。
pub async fn reject_encryption(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<E2eeSessionRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_session_id(&request.session_id)?;

    let row = sqlx::query(
        r#"SELECT requester_id, target_user_id, status
           FROM service_user_service_db.e2ee_sessions
           WHERE session_id = ?"#,
    )
    .bind(&request.session_id)
    .fetch_optional(&state.db)
    .await?;

    let Some(row) = row else {
        return Err(AppError::NotFound("session not found".to_string()));
    };

    let target_user_id: i64 = row.get("target_user_id");
    let status: String = row.get("status");

    if identity.user_id != target_user_id {
        return Err(AppError::Forbidden(
            "only target user can reject".to_string(),
        ));
    }
    if status != "pending" {
        return Err(AppError::Conflict(format!(
            "cannot reject session in '{status}' state"
        )));
    }

    sqlx::query(
        "UPDATE service_user_service_db.e2ee_sessions \
         SET status = 'rejected', updated_time = NOW() \
         WHERE session_id = ?",
    )
    .bind(&request.session_id)
    .execute(&state.db)
    .await?;

    let push = E2eeNegotiationPush {
        action: "rejected".to_string(),
        session_id: request.session_id.clone(),
        requester_id: row.get::<i64, _>("requester_id").to_string(),
        requester_name: String::new(),
        target_user_id: target_user_id.to_string(),
        request_payload_json: None,
    };
    if let Err(error) =
        push_negotiation_event(&state, row.get::<i64, _>("requester_id"), &push).await
    {
        tracing::warn!(
            error = %error,
            session_id = %request.session_id,
            requester_id = %row.get::<i64, _>("requester_id"),
            "failed to push e2ee negotiation rejection"
        );
    }

    Ok(Json(ApiResponse::success("ok".to_string())))
}

/// 退出端到端加密通道。
///
/// POST /api/e2ee/disable
///
/// 业务目的：任一会话参与方都可以主动退出私聊 E2EE，将服务端协商状态置为 plaintext，
/// 并通知另一端清理本地 ratchet state。操作保持幂等，便于本地密钥损坏时重置通道。
pub async fn disable_encryption(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<E2eeSessionRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_session_id(&request.session_id)?;

    let (id_a, id_b) = parse_session_partners(&request.session_id)?;
    if identity.user_id != id_a && identity.user_id != id_b {
        return Err(AppError::Forbidden(
            "session_id does not include caller".to_string(),
        ));
    }
    let peer_user_id = if identity.user_id == id_a { id_b } else { id_a };

    let result = sqlx::query(
        r#"UPDATE service_user_service_db.e2ee_sessions
           SET requester_id = ?, target_user_id = ?, status = 'plaintext',
               request_payload_json = NULL, updated_time = NOW()
           WHERE session_id = ?"#,
    )
    .bind(identity.user_id)
    .bind(peer_user_id)
    .bind(&request.session_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_sessions
               (session_id, requester_id, target_user_id, status, request_payload_json)
               VALUES (?, ?, ?, 'plaintext', NULL)"#,
        )
        .bind(&request.session_id)
        .bind(identity.user_id)
        .bind(peer_user_id)
        .execute(&state.db)
        .await?;
    }

    let requester_name = resolve_user_display_name(&state, identity.user_id)
        .await?
        .unwrap_or_else(|| identity.username.clone());
    let push = E2eeNegotiationPush {
        action: "disabled".to_string(),
        session_id: request.session_id.clone(),
        requester_id: identity.user_id.to_string(),
        requester_name,
        target_user_id: peer_user_id.to_string(),
        request_payload_json: None,
    };
    if let Err(error) = push_negotiation_event(&state, peer_user_id, &push).await {
        tracing::warn!(
            error = %error,
            session_id = %request.session_id,
            peer_user_id = %peer_user_id,
            "failed to push e2ee disable event"
        );
    }

    Ok(Json(ApiResponse::success("ok".to_string())))
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/// 解析 session_id（格式 `{id_a}_{id_b}`）为两个用户 ID。
fn parse_session_partners(session_id: &str) -> Result<(i64, i64), AppError> {
    let normalized = session_id.strip_prefix("p_").unwrap_or(session_id);
    let parts: Vec<&str> = normalized.split('_').collect();
    if parts.len() != 2 {
        return Err(AppError::BadRequest(
            "session_id must be in format '{id_a}_{id_b}' or 'p_{id_a}_{id_b}'".to_string(),
        ));
    }
    let Some(id_a_raw) = parts.first() else {
        return Err(AppError::BadRequest(
            "session_id must include left user id".to_string(),
        ));
    };
    let Some(id_b_raw) = parts.get(1) else {
        return Err(AppError::BadRequest(
            "session_id must include right user id".to_string(),
        ));
    };
    let id_a: i64 = id_a_raw
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user id in session_id".to_string()))?;
    let id_b: i64 = id_b_raw
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user id in session_id".to_string()))?;
    if id_a == id_b {
        return Err(AppError::BadRequest(
            "session_id must reference two different users".to_string(),
        ));
    }
    Ok((id_a, id_b))
}

async fn resolve_user_display_name(
    state: &AppState,
    user_id: i64,
) -> Result<Option<String>, AppError> {
    let row = sqlx::query(
        "SELECT COALESCE(NULLIF(nickname, ''), username) AS display_name \
         FROM service_user_service_db.users WHERE id = ?",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;
    Ok(row.map(|item| item.get::<String, _>("display_name")))
}

async fn push_negotiation_event(
    state: &AppState,
    user_id: i64,
    payload: &E2eeNegotiationPush,
) -> Result<(), AppError> {
    let mut redis = state.route_redis_manager.clone();
    let raw: Option<Vec<u8>> = redis
        .hget(&state.config.route_users_key, user_id.to_string())
        .await?;
    let routes = parse_user_routes(raw.as_deref(), &state.config);
    if routes.is_empty() {
        return Ok(());
    }

    let path = "/api/im/internal/push/batch";
    let body = serde_json::to_vec(&InternalPushBatchRequest {
        user_ids: vec![user_id],
        kind: "E2EE_NEGOTIATION".to_string(),
        data: serde_json::to_value(payload)?,
    })?;

    for route in routes {
        let response = state
            .http
            .post(format!(
                "{}{}",
                route.internal_http_url.trim_end_matches('/'),
                path
            ))
            .headers(auth_api::internal_signature_headers(
                "POST",
                path,
                &body,
                &state.config,
            )?)
            .header("Content-Type", "application/json")
            .body(body.clone())
            .send()
            .await?;
        if !response.status().is_success() {
            tracing::warn!(
                status = %response.status(),
                user_id = %user_id,
                "im-server rejected e2ee negotiation push"
            );
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::parse_session_partners;

    #[test]
    fn parse_session_partners_accepts_frontend_session_id() -> Result<(), &'static str> {
        let parsed = parse_session_partners("1_2").map_err(|_| "parse failed")?;
        if parsed != (1, 2) {
            return Err("unexpected partners");
        }
        Ok(())
    }

    #[test]
    fn parse_session_partners_accepts_backend_conversation_id() -> Result<(), &'static str> {
        let parsed = parse_session_partners("p_1_2").map_err(|_| "parse failed")?;
        if parsed != (1, 2) {
            return Err("unexpected partners");
        }
        Ok(())
    }

    #[test]
    fn parse_session_partners_rejects_same_user() -> Result<(), &'static str> {
        if parse_session_partners("7_7").is_ok() {
            return Err("same user session should be rejected");
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateE2eeSessionRequest {
    pub conversation_id: String,
    #[serde(default)]
    pub recipient_user_ids: Vec<String>,
    #[serde(default)]
    pub recipient_device_ids: Vec<String>,
    pub sender_device_id: String,
    #[serde(default)]
    pub initial_envelope_metadata: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RotateReason {
    MemberAdded,
    MemberRemoved,
    DeviceRevoked,
    Manual,
    KeyCompromised,
}

impl RotateReason {
    fn as_str(&self) -> &'static str {
        match self {
            Self::MemberAdded => "member_added",
            Self::MemberRemoved => "member_removed",
            Self::DeviceRevoked => "device_revoked",
            Self::Manual => "manual",
            Self::KeyCompromised => "key_compromised",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RotateE2eeSessionRequest {
    pub reason: RotateReason,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct E2eeSessionMetadataDto {
    pub conversation_id: String,
    pub session_id: String,
    pub key_id: String,
    pub key_version: i32,
    pub epoch: i32,
    pub sender_device_id: String,
    pub recipient_device_ids: Vec<String>,
    pub status: String,
    pub needs_rotation: bool,
}

fn validate_conversation_id(value: &str) -> Result<(), AppError> {
    if value.trim().is_empty() || value.len() > 128 {
        return Err(AppError::BadRequest("invalid conversationId".to_string()));
    }
    Ok(())
}

fn parse_private_conversation_members(conversation_id: &str) -> Option<(i64, i64)> {
    let raw = conversation_id
        .strip_prefix("p_")
        .unwrap_or(conversation_id);
    let mut parts = raw.split('_');
    let left = parts.next()?.parse::<i64>().ok()?;
    let right = parts.next()?.parse::<i64>().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((left, right))
}

async fn ensure_conversation_member(
    db: &sqlx::MySqlPool,
    user_id: i64,
    conversation_id: &str,
) -> Result<(), AppError> {
    if let Some((left, right)) = parse_private_conversation_members(conversation_id) {
        if user_id == left || user_id == right {
            return Ok(());
        }
        return Err(AppError::Forbidden("not a conversation member".to_string()));
    }
    if let Some(group_id_raw) = conversation_id.strip_prefix("g_") {
        let group_id = group_id_raw
            .parse::<i64>()
            .map_err(|_| AppError::BadRequest("invalid conversationId".to_string()))?;
        let count: Option<i64> = sqlx::query_scalar(
            "SELECT COUNT(*) FROM service_group_service_db.im_group_member WHERE group_id = ? AND user_id = ? AND status = 1",
        )
        .bind(group_id)
        .bind(user_id)
        .fetch_optional(db)
        .await?;
        if count.unwrap_or(0) > 0 {
            return Ok(());
        }
    }
    Err(AppError::Forbidden("not a conversation member".to_string()))
}

/// 批量查询 device_id → user_id 映射，仅返回 status='active' 的设备。
/// 若任意 device_id 不存在或非 active，返回 BadRequest。
async fn fetch_device_owners(
    db: &sqlx::MySqlPool,
    device_ids: &[String],
) -> Result<HashMap<String, i64>, AppError> {
    if device_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let placeholders: String = device_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT device_id, user_id FROM service_user_service_db.e2ee_devices \
         WHERE device_id IN ({placeholders}) AND status = 'active'"
    );
    let mut query = sqlx::query(&sql);
    for did in device_ids {
        query = query.bind(did);
    }
    let rows = query.fetch_all(db).await?;
    if rows.len() != device_ids.len() {
        let found: HashSet<&str> = rows.iter().map(|r| r.get::<&str, _>("device_id")).collect();
        let missing: Vec<&str> = device_ids
            .iter()
            .map(|s| s.as_str())
            .filter(|did| !found.contains(did))
            .collect();
        return Err(AppError::BadRequest(format!(
            "devices not found or not active: {}",
            missing.join(", ")
        )));
    }
    let owners: HashMap<String, i64> = rows
        .iter()
        .map(|r| (r.get("device_id"), r.get("user_id")))
        .collect();
    Ok(owners)
}

/// 校验 sender_device_id 属于当前登录用户且处于 active 状态。
async fn ensure_sender_device_belongs_to_user(
    db: &sqlx::MySqlPool,
    device_id: &str,
    user_id: i64,
) -> Result<(), AppError> {
    let exists: bool = sqlx::query_scalar(
        "SELECT COUNT(*) > 0 FROM service_user_service_db.e2ee_devices \
         WHERE device_id = ? AND user_id = ? AND status = 'active'",
    )
    .bind(device_id)
    .bind(user_id)
    .fetch_one(db)
    .await?;
    if !exists {
        return Err(AppError::Forbidden(
            "sender device does not belong to current user".to_string(),
        ));
    }
    Ok(())
}

/// 查询群组内所有有效成员的用户 ID。
async fn fetch_group_member_ids(
    db: &sqlx::MySqlPool,
    group_id: i64,
) -> Result<Vec<i64>, AppError> {
    let members = sqlx::query_scalar::<_, i64>(
        "SELECT user_id FROM service_group_service_db.im_group_member \
         WHERE group_id = ? AND status = 1",
    )
    .bind(group_id)
    .fetch_all(db)
    .await?;
    Ok(members)
}

/// 将 Vec<String> 解析为 Vec<i64>，跳过空字符串。
fn parse_user_ids(raw: &[String]) -> Result<Vec<i64>, AppError> {
    let mut ids = Vec::with_capacity(raw.len());
    for s in raw {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            continue;
        }
        let id: i64 = trimmed
            .parse()
            .map_err(|_| AppError::BadRequest(format!("invalid userId: {trimmed}")))?;
        ids.push(id);
    }
    Ok(ids)
}

/// 核心授权校验：确保所有 recipient_device_ids 都属于合法的会话成员。
///
/// - 私聊：recipient 设备必须全部属于另一方用户，不能属于当前用户或第三方。
/// - 群聊：recipient 设备必须全部属于群成员。
/// - 若 recipient_user_ids 非空，校验其均为合法成员且与 device 归属一致。
async fn ensure_recipient_devices_authorized(
    db: &sqlx::MySqlPool,
    conversation_id: &str,
    caller_user_id: i64,
    recipient_user_ids: &[String],
    device_owners: &HashMap<String, i64>,
) -> Result<(), AppError> {
    let parsed_recipient_user_ids = parse_user_ids(recipient_user_ids)?;

    if let Some((left, right)) = parse_private_conversation_members(conversation_id) {
        let other_user_id = if caller_user_id == left { right } else { left };

        // 校验 recipient_user_ids 只能包含另一方
        for uid in &parsed_recipient_user_ids {
            if *uid != other_user_id {
                return Err(AppError::Forbidden(format!(
                    "user {uid} is not a member of this private conversation"
                )));
            }
        }

        // 校验 recipient 设备归属
        for (device_id, owner_user_id) in device_owners {
            if *owner_user_id != other_user_id {
                if *owner_user_id == caller_user_id {
                    return Err(AppError::Forbidden(format!(
                        "cannot add own device {device_id} as recipient in private conversation"
                    )));
                }
                return Err(AppError::Forbidden(format!(
                    "device {device_id} belongs to user {owner_user_id} who is not a conversation member"
                )));
            }
        }

        // recipient_user_ids 与 device 归属一致性校验
        if !parsed_recipient_user_ids.is_empty() {
            let recipient_set: HashSet<i64> = parsed_recipient_user_ids.iter().copied().collect();
            for (device_id, owner_user_id) in device_owners {
                if !recipient_set.contains(owner_user_id) {
                    return Err(AppError::Forbidden(format!(
                        "device {device_id} belongs to user {owner_user_id} which is not in recipientUserIds"
                    )));
                }
            }
        }
    } else if let Some(group_id_raw) = conversation_id.strip_prefix("g_") {
        let group_id: i64 = group_id_raw
            .parse()
            .map_err(|_| AppError::BadRequest("invalid conversationId".to_string()))?;

        let group_members = fetch_group_member_ids(db, group_id).await?;
        let member_set: HashSet<i64> = group_members.iter().copied().collect();

        // 校验 recipient_user_ids 均为群成员
        for uid in &parsed_recipient_user_ids {
            if !member_set.contains(uid) {
                return Err(AppError::Forbidden(format!(
                    "user {uid} is not a member of group {group_id}"
                )));
            }
        }

        // 校验 recipient 设备归属
        for (device_id, owner_user_id) in device_owners {
            if !member_set.contains(owner_user_id) {
                return Err(AppError::Forbidden(format!(
                    "device {device_id} belongs to user {owner_user_id} who is not a member of group {group_id}"
                )));
            }
        }

        // recipient_user_ids 与 device 归属一致性校验
        if !parsed_recipient_user_ids.is_empty() {
            let recipient_set: HashSet<i64> = parsed_recipient_user_ids.iter().copied().collect();
            for (device_id, owner_user_id) in device_owners {
                if !recipient_set.contains(owner_user_id) {
                    return Err(AppError::Forbidden(format!(
                        "device {device_id} belongs to user {owner_user_id} which is not in recipientUserIds"
                    )));
                }
            }
        }
    } else {
        return Err(AppError::BadRequest("invalid conversationId".to_string()));
    }

    Ok(())
}

fn row_to_metadata(row: sqlx::mysql::MySqlRow) -> E2eeSessionMetadataDto {
    let recipient_json: String = row.get("recipient_device_ids_json");
    let recipient_device_ids = serde_json::from_str(&recipient_json).unwrap_or_else(|_| Vec::new());
    E2eeSessionMetadataDto {
        conversation_id: row.get("conversation_id"),
        session_id: row.get("session_id"),
        key_id: row.get("key_id"),
        key_version: row.get("key_version"),
        epoch: row.get("epoch"),
        sender_device_id: row.get("sender_device_id"),
        recipient_device_ids,
        status: row.get("status"),
        needs_rotation: row.get::<i8, _>("needs_rotation") != 0,
    }
}

pub async fn create_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateE2eeSessionRequest>,
) -> Result<Json<ApiResponse<E2eeSessionMetadataDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_conversation_id(&request.conversation_id)?;

    // 1. sender_device_id 基本校验
    if request.sender_device_id.trim().is_empty() || request.sender_device_id.len() > 64 {
        return Err(AppError::BadRequest("invalid senderDeviceId".to_string()));
    }

    // 2. recipient_device_ids 不能为空
    if request.recipient_device_ids.is_empty() {
        return Err(AppError::BadRequest(
            "recipientDeviceIds required".to_string(),
        ));
    }

    // 3. 当前用户必须是会话成员（同时校验 conversation_id 合法性）
    ensure_conversation_member(&state.db, identity.user_id, &request.conversation_id).await?;

    // 4. sender_device_id 必须属于当前用户且处于 active 状态
    ensure_sender_device_belongs_to_user(&state.db, &request.sender_device_id, identity.user_id)
        .await?;

    // 5. 查询所有 recipient 设备的归属
    let device_owners =
        fetch_device_owners(&state.db, &request.recipient_device_ids).await?;

    // 6. 核心授权：确保 recipient 设备全部属于合法会话成员
    ensure_recipient_devices_authorized(
        &state.db,
        &request.conversation_id,
        identity.user_id,
        &request.recipient_user_ids,
        &device_owners,
    )
    .await?;

    // 7. 写入 e2ee_conversation_sessions
    let session_id = uuid::Uuid::new_v4().to_string();
    let key_id = uuid::Uuid::new_v4().to_string();
    let recipient_json = serde_json::to_string(&request.recipient_device_ids)?;
    sqlx::query(
        r#"INSERT INTO service_user_service_db.e2ee_conversation_sessions
           (conversation_id, session_id, key_id, key_version, epoch, created_by_user_id,
            sender_device_id, recipient_device_ids_json, status, needs_rotation)
           VALUES (?, ?, ?, 1, 1, ?, ?, ?, 'active', 0)
           ON DUPLICATE KEY UPDATE session_id=VALUES(session_id), key_id=VALUES(key_id),
             key_version=key_version + 1, epoch=epoch + 1, sender_device_id=VALUES(sender_device_id),
             recipient_device_ids_json=VALUES(recipient_device_ids_json), status='active', needs_rotation=0"#,
    )
    .bind(&request.conversation_id)
    .bind(&session_id)
    .bind(&key_id)
    .bind(identity.user_id)
    .bind(&request.sender_device_id)
    .bind(&recipient_json)
    .execute(&state.db)
    .await?;

    get_conversation_session(State(state), headers, Path(request.conversation_id)).await
}

pub async fn get_conversation_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(conversation_id): Path<String>,
) -> Result<Json<ApiResponse<E2eeSessionMetadataDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_conversation_id(&conversation_id)?;
    ensure_conversation_member(&state.db, identity.user_id, &conversation_id).await?;
    let row = sqlx::query(
        r#"SELECT conversation_id, session_id, key_id, key_version, epoch, sender_device_id,
                  recipient_device_ids_json, status, needs_rotation
           FROM service_user_service_db.e2ee_conversation_sessions
           WHERE conversation_id = ? AND status = 'active'"#,
    )
    .bind(&conversation_id)
    .fetch_optional(&state.db)
    .await?;
    let Some(row) = row else {
        return Err(AppError::NotFound("e2ee session not found".to_string()));
    };
    Ok(Json(ApiResponse::success(row_to_metadata(row))))
}

pub async fn rotate_conversation_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(conversation_id): Path<String>,
    Json(request): Json<RotateE2eeSessionRequest>,
) -> Result<Json<ApiResponse<E2eeSessionMetadataDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_conversation_id(&conversation_id)?;
    ensure_conversation_member(&state.db, identity.user_id, &conversation_id).await?;
    let key_id = uuid::Uuid::new_v4().to_string();
    let affected = sqlx::query(
        r#"UPDATE service_user_service_db.e2ee_conversation_sessions
           SET key_id = ?, key_version = key_version + 1, epoch = epoch + 1,
               rotate_reason = ?, needs_rotation = 0, updated_at = NOW()
           WHERE conversation_id = ? AND status = 'active'"#,
    )
    .bind(&key_id)
    .bind(request.reason.as_str())
    .bind(&conversation_id)
    .execute(&state.db)
    .await?
    .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound("e2ee session not found".to_string()));
    }
    get_conversation_session(State(state), headers, Path(conversation_id)).await
}
