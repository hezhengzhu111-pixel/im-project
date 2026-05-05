use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::Json;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use im_rs_common::api::ApiResponse;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// 常量：字段长度上限
// ---------------------------------------------------------------------------

const MAX_DEVICE_ID_LEN: usize = 64;
const MAX_KEY_FIELD_LEN: usize = 1000;
const MAX_ONE_TIME_KEYS: usize = 200;
const MAX_BACKUP_LEN: usize = 100_000;
const MAX_SALT_LEN: usize = 64;

// ---------------------------------------------------------------------------
// 请求 / 响应类型
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadBundleRequest {
    pub device_id: String,
    pub identity_key: String,
    pub signed_pre_key: String,
    pub signed_pre_key_signature: String,
    pub one_time_pre_keys: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreKeyBundleDto {
    pub user_id: String,
    pub device_id: String,
    pub identity_key: String,
    pub signed_pre_key: String,
    pub signed_pre_key_signature: String,
    pub one_time_pre_key: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDto {
    pub device_id: String,
    pub identity_key: String,
    pub signed_pre_key: String,
    pub last_active_at: String,
}

// ---------------------------------------------------------------------------
// 辅助校验
// ---------------------------------------------------------------------------

fn validate_bundle(req: &UploadBundleRequest) -> Result<(), AppError> {
    if req.device_id.is_empty() || req.device_id.len() > MAX_DEVICE_ID_LEN {
        return Err(AppError::BadRequest("invalid device_id".to_string()));
    }
    if req.identity_key.is_empty() || req.identity_key.len() > MAX_KEY_FIELD_LEN {
        return Err(AppError::BadRequest("invalid identity_key".to_string()));
    }
    if req.signed_pre_key.is_empty() || req.signed_pre_key.len() > MAX_KEY_FIELD_LEN {
        return Err(AppError::BadRequest("invalid signed_pre_key".to_string()));
    }
    if req.signed_pre_key_signature.is_empty()
        || req.signed_pre_key_signature.len() > MAX_KEY_FIELD_LEN
    {
        return Err(AppError::BadRequest(
            "invalid signed_pre_key_signature".to_string(),
        ));
    }
    if req.one_time_pre_keys.len() > MAX_ONE_TIME_KEYS {
        return Err(AppError::BadRequest(
            "too many one_time_pre_keys".to_string(),
        ));
    }
    for (i, key) in req.one_time_pre_keys.iter().enumerate() {
        if key.is_empty() || key.len() > MAX_KEY_FIELD_LEN {
            return Err(AppError::BadRequest(format!(
                "invalid one_time_pre_keys[{i}]"
            )));
        }
    }
    Ok(())
}

fn format_datetime(dt: chrono::NaiveDateTime) -> String {
    dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

// ---------------------------------------------------------------------------
// 处理器
// ---------------------------------------------------------------------------

/// 上传当前设备的 PreKey Bundle
///
/// POST /api/keys/bundle
///
/// 幂等：同一 (user_id, device_id) 则更新设备记录，删除旧的一次性预密钥后重新插入。
pub async fn upload_bundle(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<UploadBundleRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_bundle(&request)?;

    let user_id = identity.user_id;
    let device_id = &request.device_id;

    let mut tx = state.db.begin().await?;

    // 幂等 upsert 设备记录
    sqlx::query(
        r#"INSERT INTO service_user_service_db.e2ee_devices
           (user_id, device_id, status, identity_key, signed_pre_key, signed_pre_key_signature)
           VALUES (?, ?, 'active', ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             status = 'active',
             identity_key = VALUES(identity_key),
             signed_pre_key = VALUES(signed_pre_key),
             signed_pre_key_signature = VALUES(signed_pre_key_signature),
             last_active_at = NOW()"#,
    )
    .bind(user_id)
    .bind(device_id)
    .bind(&request.identity_key)
    .bind(&request.signed_pre_key)
    .bind(&request.signed_pre_key_signature)
    .execute(&mut *tx)
    .await?;

    // 删除该设备旧的一次性预密钥
    sqlx::query(
        "DELETE FROM service_user_service_db.e2ee_one_time_pre_keys \
         WHERE user_id = ? AND device_id = ?",
    )
    .bind(user_id)
    .bind(device_id)
    .execute(&mut *tx)
    .await?;

    // 批量插入新的一次性预密钥
    for key in &request.one_time_pre_keys {
        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_one_time_pre_keys
               (user_id, device_id, pre_key, consumed)
               VALUES (?, ?, ?, 0)"#,
        )
        .bind(user_id)
        .bind(device_id)
        .bind(key)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(Json(ApiResponse::success("ok".to_string())))
}

/// 获取目标用户的 PreKey Bundle
///
/// GET /api/keys/bundle?userId=xxx&deviceId=yyy
///
/// 如果存在 one-time pre-key，事务内原子标记 consumed 并返回一个；
/// 没有 one-time pre-key 时返回 signed pre key（one_time_pre_key 为 null）。
pub async fn get_bundle(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<ApiResponse<PreKeyBundleDto>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;

    let target_user_id: i64 = params
        .get("userId")
        .ok_or_else(|| AppError::BadRequest("missing userId".to_string()))?
        .parse()
        .map_err(|_| AppError::BadRequest("invalid userId".to_string()))?;

    let device_id = params
        .get("deviceId")
        .ok_or_else(|| AppError::BadRequest("missing deviceId".to_string()))?;

    if device_id.is_empty() || device_id.len() > MAX_DEVICE_ID_LEN {
        return Err(AppError::BadRequest("invalid deviceId".to_string()));
    }

    // 查询设备信息
    let device_row = sqlx::query(
        r#"SELECT identity_key, signed_pre_key, signed_pre_key_signature
           FROM service_user_service_db.e2ee_devices
           WHERE user_id = ? AND device_id = ? AND status = 'active'"#,
    )
    .bind(target_user_id)
    .bind(device_id)
    .fetch_optional(&state.db)
    .await?;

    let Some(device_row) = device_row else {
        return Err(AppError::NotFound("device not found".to_string()));
    };

    let identity_key: String = device_row.get("identity_key");
    let signed_pre_key: String = device_row.get("signed_pre_key");
    let signed_pre_key_signature: String = device_row.get("signed_pre_key_signature");

    // 事务内原子消费一个 one-time pre-key
    let mut tx = state.db.begin().await?;

    let otp_row = sqlx::query(
        r#"SELECT id, pre_key FROM service_user_service_db.e2ee_one_time_pre_keys
           WHERE user_id = ? AND device_id = ? AND consumed = 0
           LIMIT 1
           FOR UPDATE"#,
    )
    .bind(target_user_id)
    .bind(device_id)
    .fetch_optional(&mut *tx)
    .await?;

    let one_time_pre_key = if let Some(ref row) = otp_row {
        let otp_id: i64 = row.get("id");
        let pre_key: String = row.get("pre_key");
        sqlx::query(
            "UPDATE service_user_service_db.e2ee_one_time_pre_keys \
             SET consumed = 1, consumed_time = NOW() WHERE id = ?",
        )
        .bind(otp_id)
        .execute(&mut *tx)
        .await?;
        Some(pre_key)
    } else {
        None
    };

    tx.commit().await?;

    Ok(Json(ApiResponse::success(PreKeyBundleDto {
        user_id: target_user_id.to_string(),
        device_id: device_id.clone(),
        identity_key,
        signed_pre_key,
        signed_pre_key_signature,
        one_time_pre_key,
    })))
}

/// 获取目标用户的公开设备信息
///
/// GET /api/keys/devices?userId=xxx
/// GET /api/e2ee/devices/:user_id
/// GET /api/e2ee/groups/:group_id/devices
pub async fn get_devices(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<ApiResponse<Vec<DeviceDto>>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;

    let target_user_id: i64 = params
        .get("userId")
        .ok_or_else(|| AppError::BadRequest("missing userId".to_string()))?
        .parse()
        .map_err(|_| AppError::BadRequest("invalid userId".to_string()))?;

    let rows = sqlx::query(
        r#"SELECT device_id, identity_key, signed_pre_key, last_active_at
           FROM service_user_service_db.e2ee_devices
           WHERE user_id = ? AND status = 'active'
           ORDER BY last_active_at DESC"#,
    )
    .bind(target_user_id)
    .fetch_all(&state.db)
    .await?;

    let devices: Vec<DeviceDto> = rows
        .iter()
        .map(|row| {
            let last_active_at: chrono::NaiveDateTime = row.get("last_active_at");
            DeviceDto {
                device_id: row.get("device_id"),
                identity_key: row.get("identity_key"),
                signed_pre_key: row.get("signed_pre_key"),
                last_active_at: format_datetime(last_active_at),
            }
        })
        .collect();

    Ok(Json(ApiResponse::success(devices)))
}

/// 更新设备心跳
///
/// POST /api/keys/heartbeat
pub async fn heartbeat(
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

/// 获取当前用户的 backup salt
///
/// GET /api/keys/salt
///
/// 不存在则生成随机 salt 并持久化。
pub async fn get_salt(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    let row = sqlx::query(
        "SELECT salt FROM service_user_service_db.e2ee_key_backups WHERE user_id = ?",
    )
    .bind(identity.user_id)
    .fetch_optional(&state.db)
    .await?;

    if let Some(row) = row {
        let salt: String = row.get("salt");
        return Ok(Json(ApiResponse::success(serde_json::json!({ "salt": salt }))));
    }

    // 生成 32 字节随机 salt 并 Base64 编码
    let mut buf = [0u8; 32];
    getrandom::getrandom(&mut buf)
        .map_err(|e| AppError::Upstream(format!("random generation failed: {e}")))?;
    let salt = B64.encode(&buf);

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

    Ok(Json(ApiResponse::success(serde_json::json!({ "salt": salt }))))
}

/// 上传加密备份
///
/// POST /api/keys/backup
pub async fn upload_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    let encrypted_backup = body
        .get("encryptedBackup")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("missing encryptedBackup".to_string()))?;

    let salt = body
        .get("salt")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("missing salt".to_string()))?;

    if encrypted_backup.is_empty() || encrypted_backup.len() > MAX_BACKUP_LEN {
        return Err(AppError::BadRequest("invalid encryptedBackup".to_string()));
    }
    if salt.is_empty() || salt.len() > MAX_SALT_LEN {
        return Err(AppError::BadRequest("invalid salt".to_string()));
    }

    sqlx::query(
        r#"INSERT INTO service_user_service_db.e2ee_key_backups
           (user_id, encrypted_backup_json, salt)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE
             encrypted_backup_json = VALUES(encrypted_backup_json),
             salt = VALUES(salt)"#,
    )
    .bind(identity.user_id)
    .bind(encrypted_backup)
    .bind(salt)
    .execute(&state.db)
    .await?;

    Ok(Json(ApiResponse::success("ok".to_string())))
}

/// 获取当前用户的加密备份
///
/// GET /api/keys/backup
pub async fn get_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    let row = sqlx::query(
        r#"SELECT encrypted_backup_json, salt
           FROM service_user_service_db.e2ee_key_backups
           WHERE user_id = ?"#,
    )
    .bind(identity.user_id)
    .fetch_optional(&state.db)
    .await?;

    match row {
        Some(row) => {
            let encrypted_backup_json: String = row.get("encrypted_backup_json");
            let salt: String = row.get("salt");
            Ok(Json(ApiResponse::success(serde_json::json!({
                "encryptedBackup": encrypted_backup_json,
                "salt": salt,
            }))))
        }
        None => Err(AppError::NotFound("backup not found".to_string())),
    }
}

/// 删除当前用户的指定设备
///
/// DELETE /api/keys/device/:id
///
/// 同时删除该设备的一次性预密钥。
pub async fn delete_device(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(device_id): Path<String>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    if device_id.is_empty() || device_id.len() > MAX_DEVICE_ID_LEN {
        return Err(AppError::BadRequest("invalid device_id".to_string()));
    }

    let mut tx = state.db.begin().await?;

    // 软删除设备记录（只能删自己的）
    let affected = sqlx::query(
        "UPDATE service_user_service_db.e2ee_devices \
         SET status = 'deleted' \
         WHERE user_id = ? AND device_id = ? AND status = 'active'",
    )
    .bind(identity.user_id)
    .bind(&device_id)
    .execute(&mut *tx)
    .await?
    .rows_affected();

    if affected == 0 {
        tx.rollback().await.ok();
        return Err(AppError::NotFound("device not found".to_string()));
    }

    // 级联删除该设备的一次性预密钥
    sqlx::query(
        "DELETE FROM service_user_service_db.e2ee_one_time_pre_keys \
         WHERE user_id = ? AND device_id = ?",
    )
    .bind(identity.user_id)
    .bind(&device_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Json(ApiResponse::success("ok".to_string())))
}
