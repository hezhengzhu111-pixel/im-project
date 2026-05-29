use super::*;
use crate::access_control;
use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::Json;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use im_rs_common::api::ApiResponse;
use serde_json::Value;
use sqlx::Row;
use std::collections::HashMap;

/// X25519 公钥的字节长度（Signal/X3DH 协议标准）。

/// Ed25519 签名的字节长度。
///
/// 当前协议约定使用 Ed25519 对 signed pre-key 进行签名，签名固定为 64 字节。
/// 如果未来支持其他签名算法（如 ECDSA P-256 的 64–72 字节可变长度），
/// 需要将此处替换为范围校验。

/// 获取目标用户的公开设备信息。
///
/// GET /api/keys/devices?userId=xxx
/// GET /api/e2ee/devices/:user_id
/// GET /api/e2ee/groups/:group_id/devices
///
/// 业务目的：查询目标用户所有活跃设备的公钥材料和最后活跃时间。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：仅返回公钥数据（identity_key、signed_pre_key），不返回私钥。
/// 返回语义：按 last_active_at 降序返回设备列表。
pub(crate) async fn get_devices(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<ApiResponse<Vec<DeviceDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let target_user_id = target_user_id_from_query(&identity, &params)?;
    let devices = fetch_user_devices(&state.db, target_user_id).await?;

    Ok(Json(ApiResponse::success(devices)))
}

/// 获取路径中指定用户的公开设备信息。
///
/// GET /api/e2ee/devices/:user_id
pub(crate) async fn get_devices_by_user_path(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<i64>,
) -> Result<Json<ApiResponse<Vec<DeviceDto>>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    if user_id <= 0 {
        return Err(AppError::BadRequest("invalid userId".to_string()));
    }
    let devices = fetch_user_devices(&state.db, user_id).await?;

    Ok(Json(ApiResponse::success(devices)))
}

/// 获取指定群组内所有成员的公开设备信息。
///
/// GET /api/e2ee/groups/:group_id/devices
pub(crate) async fn get_group_devices(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
) -> Result<Json<ApiResponse<Vec<DeviceDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    access_control::ensure_group_member(&state.db, group_id, identity.user_id).await?;

    let rows = sqlx::query(
        r#"SELECT m.user_id, d.device_id, d.identity_key, d.signed_pre_key, d.last_active_at
           FROM service_group_service_db.im_group_member m
           JOIN service_user_service_db.e2ee_devices d
             ON d.user_id = m.user_id AND d.status = 'active'
           WHERE m.group_id = ? AND m.status = 1
           ORDER BY m.user_id ASC, d.last_active_at DESC"#,
    )
    .bind(group_id)
    .fetch_all(&state.db)
    .await?;

    let devices: Vec<DeviceDto> = rows
        .iter()
        .map(|row| {
            let user_id: i64 = row.get("user_id");
            let last_active_at: chrono::NaiveDateTime = row.get("last_active_at");
            DeviceDto {
                user_id: user_id.to_string(),
                device_id: row.get("device_id"),
                identity_key: row.get("identity_key"),
                signed_pre_key: row.get("signed_pre_key"),
                last_active_at: format_datetime(last_active_at),
            }
        })
        .collect();

    Ok(Json(ApiResponse::success(devices)))
}

/// 更新设备心跳。
///
/// POST /api/keys/heartbeat
///
/// 业务目的：刷新当前设备的 last_active_at 时间戳，保持设备活跃状态。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：只能更新自己的设备，设备不存在返回 404。
/// 返回语义：成功返回 "ok"。
pub(crate) async fn heartbeat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    let device_id = body
        .get("deviceId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("missing deviceId".to_string()))?;

    if device_id.is_empty() || device_id.len() > MAX_DEVICE_ID_LEN {
        return Err(AppError::BadRequest("invalid deviceId".to_string()));
    }

    let affected = sqlx::query(
        "UPDATE service_user_service_db.e2ee_devices \
         SET last_active_at = NOW() \
         WHERE user_id = ? AND device_id = ? AND status = 'active'",
    )
    .bind(identity.user_id)
    .bind(device_id)
    .execute(&state.db)
    .await?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::NotFound("device not found".to_string()));
    }

    Ok(Json(ApiResponse::success("ok".to_string())))
}

/// 获取当前用户的 backup salt。
///
/// GET /api/keys/salt
///
/// 业务目的：获取或生成用于密钥备份加密的 salt 值。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：salt 由服务端生成（32 字节随机 Base64），用于客户端派生加密密钥。
/// 返回语义：已存在则返回现有 salt，不存在则生成新的随机 salt 并持久化后返回。
pub(crate) async fn get_salt(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    let row =
        sqlx::query("SELECT salt FROM service_user_service_db.e2ee_key_backups WHERE user_id = ?")
            .bind(identity.user_id)
            .fetch_optional(&state.db)
            .await?;

    if let Some(row) = row {
        let salt: String = row.get("salt");
        return Ok(Json(ApiResponse::success(
            serde_json::json!({ "salt": salt }),
        )));
    }

    // 生成 32 字节随机 salt 并 Base64 编码
    let mut buf = [0u8; 32];
    getrandom::getrandom(&mut buf)
        .map_err(|e| AppError::Upstream(format!("random generation failed: {e}")))?;
    let salt = B64.encode(buf);

    // 持久化（UPSERT：备份可能已存在但没有 salt 的情况不会发生，因为是同一张表）
    sqlx::query(
        r#"INSERT INTO service_user_service_db.e2ee_key_backups (user_id, encrypted_backup_json, salt)
           VALUES (?, '', ?)
           ON DUPLICATE KEY UPDATE salt = VALUES(salt)"#,
    )
    .bind(identity.user_id)
    .bind(&salt)
    .execute(&state.db)
    .await?;

    Ok(Json(ApiResponse::success(
        serde_json::json!({ "salt": salt }),
    )))
}
