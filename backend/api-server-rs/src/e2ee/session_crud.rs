use super::*;
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

pub(crate) async fn create_session(
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
    let device_owners = fetch_device_owners(&state.db, &request.recipient_device_ids).await?;

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

pub(crate) async fn get_conversation_session(
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

pub(crate) async fn rotate_conversation_session(
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
