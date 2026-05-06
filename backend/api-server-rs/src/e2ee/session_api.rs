use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use im_rs_common::api::ApiResponse;
use serde::Deserialize;
use sqlx::Row;

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

    Ok(Json(ApiResponse::success("ok".to_string())))
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
