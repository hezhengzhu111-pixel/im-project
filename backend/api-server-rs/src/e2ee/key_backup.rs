use super::*;
use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::Json;
use im_rs_common::api::ApiResponse;
use serde_json::Value;
use sqlx::Row;

/// X25519 公钥的字节长度（Signal/X3DH 协议标准）。

/// Ed25519 签名的字节长度。
///
/// 当前协议约定使用 Ed25519 对 signed pre-key 进行签名，签名固定为 64 字节。
/// 如果未来支持其他签名算法（如 ECDSA P-256 的 64–72 字节可变长度），
/// 需要将此处替换为范围校验。

/// 上传加密备份。
///
/// POST /api/keys/backup
///
/// 业务目的：保存客户端加密后的密钥备份数据，用于跨设备恢复。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：服务端仅保存客户端加密后的密文（encryptedBackup），
/// 不保存明文私钥，解密密钥仅在客户端持有。
/// 返回语义：成功返回 "ok"，幂等更新。
pub(crate) async fn upload_backup(
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
pub(crate) async fn get_backup(
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
pub(crate) async fn delete_device(
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
