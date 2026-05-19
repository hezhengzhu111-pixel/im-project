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
use im_rs_common::auth::Identity;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
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

/// 上传 PreKey Bundle 的请求体。
///
/// 包含设备公钥材料（identity key、signed pre-key、one-time pre-keys），
/// 客户端上传的一次性预密钥条目（含 ID）。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreKeyEntry {
    pub id: i32,
    pub key: String,
}

/// 服务端仅保存公钥/密文材料，不保存任何私钥。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadBundleRequest {
    pub device_id: String,
    pub identity_key: String,
    pub signing_identity_key: String,
    pub signed_pre_key: String,
    pub signed_pre_key_signature: String,
    pub one_time_pre_keys: Vec<PreKeyEntry>,
}

/// PreKey Bundle 响应 DTO。
///
/// 返回目标用户的公钥材料，用于发起 E2EE 会话协商。
/// 仅包含公钥/签名数据，不包含任何私钥。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreKeyBundleDto {
    pub user_id: String,
    pub device_id: String,
    pub identity_key: String,
    pub signing_identity_key: String,
    pub signed_pre_key: String,
    pub signed_pre_key_signature: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub one_time_pre_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub one_time_pre_key_id: Option<i32>,
}

/// 设备公开信息 DTO。
///
/// 返回设备的公钥材料和最后活跃时间，供其他用户查询可用设备。
/// 仅包含公钥数据，不包含私钥。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDto {
    pub user_id: String,
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
    if req.signing_identity_key.is_empty() || req.signing_identity_key.len() > MAX_KEY_FIELD_LEN {
        return Err(AppError::BadRequest(
            "invalid signing_identity_key".to_string(),
        ));
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
    for entry in req.one_time_pre_keys.iter() {
        if entry.key.is_empty() || entry.key.len() > MAX_KEY_FIELD_LEN {
            return Err(AppError::BadRequest(format!(
                "invalid one_time_pre_key id={}", entry.id
            )));
        }
    }
    Ok(())
}

fn format_datetime(dt: chrono::NaiveDateTime) -> String {
    dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

fn parse_user_id(value: &str) -> Result<i64, AppError> {
    let user_id = value
        .parse::<i64>()
        .map_err(|_| AppError::BadRequest("invalid userId".to_string()))?;
    if user_id <= 0 {
        return Err(AppError::BadRequest("invalid userId".to_string()));
    }
    Ok(user_id)
}

fn target_user_id_from_query(
    identity: &Identity,
    params: &HashMap<String, String>,
) -> Result<i64, AppError> {
    params
        .get("userId")
        .map(String::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(parse_user_id)
        .unwrap_or(Ok(identity.user_id))
}

async fn fetch_user_devices(
    db: &sqlx::MySqlPool,
    target_user_id: i64,
) -> Result<Vec<DeviceDto>, AppError> {
    let rows = sqlx::query(
        r#"SELECT device_id, identity_key, signed_pre_key, last_active_at
           FROM service_user_service_db.e2ee_devices
           WHERE user_id = ? AND status = 'active'
           ORDER BY last_active_at DESC"#,
    )
    .bind(target_user_id)
    .fetch_all(db)
    .await?;

    let devices: Vec<DeviceDto> = rows
        .iter()
        .map(|row| {
            let last_active_at: chrono::NaiveDateTime = row.get("last_active_at");
            DeviceDto {
                user_id: target_user_id.to_string(),
                device_id: row.get("device_id"),
                identity_key: row.get("identity_key"),
                signed_pre_key: row.get("signed_pre_key"),
                last_active_at: format_datetime(last_active_at),
            }
        })
        .collect();

    Ok(devices)
}

// ---------------------------------------------------------------------------
// 处理器
// ---------------------------------------------------------------------------

/// 上传当前设备的 PreKey Bundle。
///
/// POST /api/keys/bundle
///
/// 业务目的：注册或更新当前设备的 E2EE 公钥材料，供其他用户发起会话协商时拉取。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：仅保存公钥（identity_key、signed_pre_key、one_time_pre_keys）及签名，
/// 不保存任何私钥。幂等操作——同一 (user_id, device_id) 会更新设备记录，
/// 删除旧的一次性预密钥后重新插入。
/// 返回语义：成功返回 "ok"。
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
           (user_id, device_id, status, identity_key, signing_identity_key, signed_pre_key, signed_pre_key_signature)
           VALUES (?, ?, 'active', ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             status = 'active',
             identity_key = VALUES(identity_key),
             signing_identity_key = VALUES(signing_identity_key),
             signed_pre_key = VALUES(signed_pre_key),
             signed_pre_key_signature = VALUES(signed_pre_key_signature),
             last_active_at = NOW()"#,
    )
    .bind(user_id)
    .bind(device_id)
    .bind(&request.identity_key)
    .bind(&request.signing_identity_key)
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
    for entry in &request.one_time_pre_keys {
        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_one_time_pre_keys
               (user_id, device_id, pre_key, pre_key_id, consumed)
               VALUES (?, ?, ?, ?, 0)"#,
        )
        .bind(user_id)
        .bind(device_id)
        .bind(&entry.key)
        .bind(entry.id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(Json(ApiResponse::success("ok".to_string())))
}

/// 获取目标用户的 PreKey Bundle。
///
/// GET /api/keys/bundle?userId=xxx&deviceId=yyy
///
/// 业务目的：拉取目标设备的公钥材料，用于发起 X3DH 密钥协商。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：仅返回公钥/签名数据，不返回任何私钥。
/// 返回语义：如果存在未消费的 one-time pre-key，事务内原子标记 consumed 并返回一个；
/// 没有 one-time pre-key 时返回 signed pre key（one_time_pre_key 为 null）。
/// 设备不存在返回 404。
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
        r#"SELECT identity_key, COALESCE(signing_identity_key, identity_key) AS signing_identity_key,
                  signed_pre_key, signed_pre_key_signature
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
    let signing_identity_key: String = device_row.get("signing_identity_key");
    let signed_pre_key: String = device_row.get("signed_pre_key");
    let signed_pre_key_signature: String = device_row.get("signed_pre_key_signature");

    // 事务内原子消费一个 one-time pre-key
    let mut tx = state.db.begin().await?;

    let otp_row = sqlx::query(
        r#"SELECT id, pre_key, COALESCE(pre_key_id, 0) AS pre_key_id
           FROM service_user_service_db.e2ee_one_time_pre_keys
           WHERE user_id = ? AND device_id = ? AND consumed = 0
           LIMIT 1
           FOR UPDATE"#,
    )
    .bind(target_user_id)
    .bind(device_id)
    .fetch_optional(&mut *tx)
    .await?;

    let (one_time_pre_key, one_time_pre_key_id) = if let Some(ref row) = otp_row {
        let otp_id: i64 = row.get("id");
        let pre_key: String = row.get("pre_key");
        let pre_key_id: Option<i32> = row.try_get::<i32, _>("pre_key_id").ok();
        sqlx::query(
            "UPDATE service_user_service_db.e2ee_one_time_pre_keys \
             SET consumed = 1, consumed_time = NOW() WHERE id = ?",
        )
        .bind(otp_id)
        .execute(&mut *tx)
        .await?;
        (Some(pre_key), pre_key_id)
    } else {
        (None, None)
    };

    tx.commit().await?;

    Ok(Json(ApiResponse::success(PreKeyBundleDto {
        user_id: target_user_id.to_string(),
        device_id: device_id.clone(),
        identity_key,
        signing_identity_key,
        signed_pre_key,
        signed_pre_key_signature,
        one_time_pre_key,
        one_time_pre_key_id,
    })))
}

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
pub async fn get_devices(
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
pub async fn get_devices_by_user_path(
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
pub async fn get_group_devices(
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

/// 获取当前用户的 backup salt。
///
/// GET /api/keys/salt
///
/// 业务目的：获取或生成用于密钥备份加密的 salt 值。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：salt 由服务端生成（32 字节随机 Base64），用于客户端派生加密密钥。
/// 返回语义：已存在则返回现有 salt，不存在则生成新的随机 salt 并持久化后返回。
pub async fn get_salt(
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

/// 上传加密备份。
///
/// POST /api/keys/backup
///
/// 业务目的：保存客户端加密后的密钥备份数据，用于跨设备恢复。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：服务端仅保存客户端加密后的密文（encryptedBackup），
/// 不保存明文私钥，解密密钥仅在客户端持有。
/// 返回语义：成功返回 "ok"，幂等更新。
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

/// 获取当前用户的加密备份。
///
/// GET /api/keys/backup
///
/// 业务目的：拉取之前上传的加密密钥备份，用于跨设备恢复密钥。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：返回的是客户端加密后的密文，服务端不持有解密能力。
/// 返回语义：返回 encryptedBackup 和 salt，不存在返回 404。
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

/// 删除当前用户的指定设备。
///
/// DELETE /api/keys/device/:id
///
/// 业务目的：软删除指定设备及其关联的一次性预密钥，使其不再被其他用户发现。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：只能删除自己的设备（user_id 匹配），事务内操作。
/// 返回语义：成功返回 "ok"，设备不存在返回 404。
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterDeviceRequest {
    pub device_id: String,
    pub identity_public_key: String,
    pub signed_pre_key: String,
    pub signed_pre_key_signature: String,
    #[serde(default)]
    pub one_time_pre_keys: Vec<String>,
    pub key_version: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterDeviceResponse {
    pub device_id: String,
    pub fingerprint: String,
    pub key_version: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicDeviceDto {
    pub user_id: String,
    pub device_id: String,
    pub identity_public_key: String,
    pub signed_pre_key: String,
    pub fingerprint: String,
    pub key_version: i32,
    pub revoked_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimPreKeyRequest {
    pub user_id: String,
    pub device_id: String,
    pub claimant_device_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimPreKeyResponse {
    pub user_id: String,
    pub device_id: String,
    pub pre_key_id: i64,
    pub public_key: String,
}

fn fingerprint_for_key(key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    let digest = hasher.finalize();
    digest
        .iter()
        .take(16)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn validate_public_material(value: &str, field: &str) -> Result<(), AppError> {
    if value.trim().is_empty() || value.len() > MAX_KEY_FIELD_LEN {
        return Err(AppError::BadRequest(format!("invalid {field}")));
    }
    Ok(())
}

pub async fn register_device(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<RegisterDeviceRequest>,
) -> Result<Json<ApiResponse<RegisterDeviceResponse>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    if request.device_id.trim().is_empty() || request.device_id.len() > MAX_DEVICE_ID_LEN {
        return Err(AppError::BadRequest("invalid deviceId".to_string()));
    }
    validate_public_material(&request.identity_public_key, "identityPublicKey")?;
    validate_public_material(&request.signed_pre_key, "signedPreKey")?;
    validate_public_material(&request.signed_pre_key_signature, "signedPreKeySignature")?;
    if request.one_time_pre_keys.len() > MAX_ONE_TIME_KEYS {
        return Err(AppError::BadRequest("too many oneTimePreKeys".to_string()));
    }
    for key in &request.one_time_pre_keys {
        validate_public_material(key, "oneTimePreKeys")?;
    }

    let fingerprint = fingerprint_for_key(&request.identity_public_key);
    let key_version = request.key_version.max(1);
    let mut tx = state.db.begin().await?;
    let existing: Option<i32> = sqlx::query_scalar(
        "SELECT key_version FROM service_user_service_db.e2ee_devices WHERE user_id = ? AND device_id = ?",
    )
    .bind(identity.user_id)
    .bind(&request.device_id)
    .fetch_optional(&mut *tx)
    .await?;
    let next_version = existing.map_or(key_version, |current| current.saturating_add(1));

    sqlx::query(
        r#"INSERT INTO service_user_service_db.e2ee_devices
           (user_id, device_id, status, identity_key, identity_public_key, fingerprint,
            key_version, signing_identity_key, signed_pre_key, signed_pre_key_signature,
            revoked_at, last_active_at)
           VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, NULL, NOW())
           ON DUPLICATE KEY UPDATE status='active', identity_key=VALUES(identity_key),
             identity_public_key=VALUES(identity_public_key), fingerprint=VALUES(fingerprint),
             key_version=VALUES(key_version), signed_pre_key=VALUES(signed_pre_key),
             signed_pre_key_signature=VALUES(signed_pre_key_signature), revoked_at=NULL,
             last_active_at=NOW()"#,
    )
    .bind(identity.user_id)
    .bind(&request.device_id)
    .bind(&request.identity_public_key)
    .bind(&request.identity_public_key)
    .bind(&fingerprint)
    .bind(next_version)
    .bind(&request.identity_public_key)
    .bind(&request.signed_pre_key)
    .bind(&request.signed_pre_key_signature)
    .execute(&mut *tx)
    .await?;

    sqlx::query("DELETE FROM service_user_service_db.e2ee_one_time_pre_keys WHERE user_id = ? AND device_id = ?")
        .bind(identity.user_id)
        .bind(&request.device_id)
        .execute(&mut *tx)
        .await?;
    for (idx, key) in request.one_time_pre_keys.iter().enumerate() {
        let pre_key_id = i64::try_from(idx.saturating_add(1))
            .map_err(|_| AppError::BadRequest("invalid preKeyId".to_string()))?;
        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_one_time_pre_keys
               (user_id, device_id, pre_key_id, pre_key, public_key, consumed)
               VALUES (?, ?, ?, ?, ?, 0)"#,
        )
        .bind(identity.user_id)
        .bind(&request.device_id)
        .bind(pre_key_id)
        .bind(key)
        .bind(key)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    Ok(Json(ApiResponse::success(RegisterDeviceResponse {
        device_id: request.device_id,
        fingerprint,
        key_version: next_version,
    })))
}

pub async fn get_user_devices(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<i64>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<ApiResponse<Vec<PublicDeviceDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let include_revoked = params
        .get("includeRevoked")
        .is_some_and(|value| value == "true");
    if include_revoked && identity.user_id != user_id {
        return Err(AppError::Forbidden(
            "includeRevoked is restricted".to_string(),
        ));
    }
    let rows = sqlx::query(
        r#"SELECT user_id, device_id, COALESCE(identity_public_key, identity_key) AS identity_public_key,
                  signed_pre_key, fingerprint, key_version, revoked_at
           FROM service_user_service_db.e2ee_devices
           WHERE user_id = ? AND (? OR revoked_at IS NULL) AND status = 'active'
           ORDER BY device_id ASC"#,
    )
    .bind(user_id)
    .bind(include_revoked)
    .fetch_all(&state.db)
    .await?;
    let devices = rows
        .into_iter()
        .map(|row| PublicDeviceDto {
            user_id: row.get::<i64, _>("user_id").to_string(),
            device_id: row.get("device_id"),
            identity_public_key: row.get("identity_public_key"),
            signed_pre_key: row.get("signed_pre_key"),
            fingerprint: row.get("fingerprint"),
            key_version: row.get("key_version"),
            revoked_at: row
                .try_get::<Option<chrono::NaiveDateTime>, _>("revoked_at")
                .ok()
                .flatten()
                .map(format_datetime),
        })
        .collect();
    Ok(Json(ApiResponse::success(devices)))
}

pub async fn revoke_device(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(device_id): Path<String>,
) -> Result<Json<ApiResponse<PublicDeviceDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    if device_id.trim().is_empty() || device_id.len() > MAX_DEVICE_ID_LEN {
        return Err(AppError::BadRequest("invalid deviceId".to_string()));
    }
    let affected = sqlx::query(
        "UPDATE service_user_service_db.e2ee_devices SET revoked_at = NOW(), status = 'active' WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL",
    )
    .bind(identity.user_id)
    .bind(&device_id)
    .execute(&state.db)
    .await?
    .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound("device not found".to_string()));
    }
    sqlx::query("UPDATE service_user_service_db.e2ee_conversation_sessions SET needs_rotation = 1 WHERE status = 'active' AND JSON_CONTAINS(recipient_device_ids_json, JSON_QUOTE(?))")
        .bind(&device_id)
        .execute(&state.db)
        .await?;
    let devices = get_user_devices(
        State(state),
        headers,
        Path(identity.user_id),
        Query(HashMap::from([(
            "includeRevoked".to_string(),
            "true".to_string(),
        )])),
    )
    .await?
    .0
    .data;
    let device = devices
        .into_iter()
        .find(|item| item.device_id == device_id)
        .ok_or_else(|| AppError::NotFound("device not found".to_string()))?;
    Ok(Json(ApiResponse::success(device)))
}

pub async fn claim_prekey(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ClaimPreKeyRequest>,
) -> Result<Json<ApiResponse<ClaimPreKeyResponse>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let target_user_id = parse_user_id(&request.user_id)?;
    let mut tx = state.db.begin().await?;
    let row = sqlx::query(
        r#"SELECT id, COALESCE(pre_key_id, id) AS pre_key_id, COALESCE(public_key, pre_key) AS public_key
           FROM service_user_service_db.e2ee_one_time_pre_keys
           WHERE user_id = ? AND device_id = ? AND claimed_at IS NULL AND consumed = 0
           ORDER BY id ASC LIMIT 1 FOR UPDATE"#,
    )
    .bind(target_user_id)
    .bind(&request.device_id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(row) = row else {
        tx.rollback().await.ok();
        return Err(AppError::NotFound("one-time prekey not found".to_string()));
    };
    let id: i64 = row.get("id");
    let pre_key_id: i64 = row.get("pre_key_id");
    let public_key: String = row.get("public_key");
    let affected = sqlx::query(
        r#"UPDATE service_user_service_db.e2ee_one_time_pre_keys
           SET consumed = 1, consumed_time = NOW(), claimed_at = NOW(),
               claimed_by_user_id = ?, claimed_by_device_id = ?
           WHERE id = ? AND claimed_at IS NULL AND consumed = 0"#,
    )
    .bind(identity.user_id)
    .bind(&request.claimant_device_id)
    .bind(id)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if affected != 1 {
        tx.rollback().await.ok();
        return Err(AppError::Conflict(
            "one-time prekey already claimed".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(Json(ApiResponse::success(ClaimPreKeyResponse {
        user_id: request.user_id,
        device_id: request.device_id,
        pre_key_id,
        public_key,
    })))
}
