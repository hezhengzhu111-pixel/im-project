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

/// 发起加密协商请求
///
/// POST /api/e2ee/request
///
/// 校验调用者身份，创建 e2ee_sessions 记录（pending 状态）。
/// session_id 格式应为 `{smaller_id}_{larger_id}`，由客户端生成。
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

    if let Some(row) = existing {
        let status: String = row.get("status");
        if status == "encrypted" {
            return Err(AppError::Conflict(
                "session already encrypted".to_string(),
            ));
        }
        // 如果是 rejected 或 pending，允许重新请求：更新记录
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

/// 接受加密协商
///
/// POST /api/e2ee/accept
///
/// 只有 target_user_id 可以接受。将状态更新为 encrypted。
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

/// 拒绝加密协商
///
/// POST /api/e2ee/reject
///
/// 只有 target_user_id 可以拒绝。将状态更新为 rejected。
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
    let parts: Vec<&str> = session_id.split('_').collect();
    if parts.len() != 2 {
        return Err(AppError::BadRequest(
            "session_id must be in format '{id_a}_{id_b}'".to_string(),
        ));
    }
    let id_a: i64 = parts[0]
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user id in session_id".to_string()))?;
    let id_b: i64 = parts[1]
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user id in session_id".to_string()))?;
    if id_a == id_b {
        return Err(AppError::BadRequest(
            "session_id must reference two different users".to_string(),
        ));
    }
    Ok((id_a, id_b))
}
