use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::Json;
use im_rs_common::api::ApiResponse;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;

// ---------------------------------------------------------------------------
// 请求 / 响应类型
// ---------------------------------------------------------------------------

/// 新版请求（group_id 在 URL 路径中）
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnableGroupEncryptionRequest {
    pub sender_keys: Vec<EncryptedSenderKeyEntry>,
}

/// 旧版请求（group_id 在请求体中，向后兼容）
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyEnableGroupEncryptionRequest {
    pub group_id: i64,
    pub encrypted_sender_keys: Vec<EncryptedSenderKeyEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedSenderKeyEntry {
    pub recipient_id: i64,
    pub device_id: String,
    pub encrypted_sender_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushSenderKeyRequest {
    pub recipient_id: i64,
    pub device_id: String,
    pub encrypted_sender_key: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SenderKeyDto {
    pub sender_id: String,
    pub device_id: String,
    pub encrypted_sender_key: String,
    pub counter: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupEncryptionStatusDto {
    pub status: String,
    pub enabled_by: Option<String>,
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/// 验证用户是否为群管理员或群主（role >= 2）
async fn ensure_group_admin(db: &sqlx::MySqlPool, group_id: i64, user_id: i64) -> Result<(), AppError> {
    let role: i32 = sqlx::query_scalar(
        "SELECT COALESCE(role, 0) FROM service_group_service_db.im_group_member \
         WHERE group_id = ? AND user_id = ? AND status = 1",
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_optional(db)
    .await?
    .unwrap_or(0);

    if role < 2 {
        return Err(AppError::Forbidden(
            "only group admin or owner can enable encryption".to_string(),
        ));
    }
    Ok(())
}

/// 校验单个用户是否为群组有效成员（status=1）
async fn ensure_group_member(
    db: &sqlx::MySqlPool,
    group_id: i64,
    user_id: i64,
) -> Result<(), AppError> {
    let exists: bool = sqlx::query_scalar(
        "SELECT COUNT(*) > 0 FROM service_group_service_db.im_group_member \
         WHERE group_id = ? AND user_id = ? AND status = 1",
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_one(db)
    .await?;

    if !exists {
        return Err(AppError::Forbidden(
            "recipient is not a group member".to_string(),
        ));
    }
    Ok(())
}

/// 校验单个设备属于指定用户且处于有效状态
async fn ensure_device_exists(
    db: &sqlx::MySqlPool,
    recipient_id: i64,
    device_id: &str,
) -> Result<(), AppError> {
    let exists: bool = sqlx::query_scalar(
        "SELECT COUNT(*) > 0 FROM service_user_service_db.e2ee_devices \
         WHERE user_id = ? AND device_id = ? AND status = 'active'",
    )
    .bind(recipient_id)
    .bind(device_id)
    .fetch_one(db)
    .await?;

    if !exists {
        return Err(AppError::Forbidden(
            "recipient device is not registered".to_string(),
        ));
    }
    Ok(())
}

/// 批量校验所有 (recipient_id, device_id) 对属于对应用户且处于有效状态
async fn ensure_all_devices_belong_to_recipients(
    db: &sqlx::MySqlPool,
    entries: &[(i64, String)],
) -> Result<(), AppError> {
    if entries.is_empty() {
        return Ok(());
    }

    // 用 OR 条件逐对校验（兼容 MySQL + sqlx 参数绑定）
    let or_clauses: String = entries
        .iter()
        .map(|_| "(user_id = ? AND device_id = ?)")
        .collect::<Vec<_>>()
        .join(" OR ");
    let sql = format!(
        "SELECT COUNT(*) FROM service_user_service_db.e2ee_devices \
         WHERE status = 'active' AND ({or_clauses})"
    );

    let mut query = sqlx::query_scalar::<_, i64>(&sql);
    for (rid, did) in entries {
        query = query.bind(*rid).bind(did);
    }
    let found_count: i64 = query.fetch_one(db).await?;

    if found_count as usize != entries.len() {
        return Err(AppError::Forbidden(
            "recipient device is not registered".to_string(),
        ));
    }
    Ok(())
}

/// 批量校验所有 recipient_id 是否为群组有效成员（一条 IN (...) SQL）
///
/// 若存在任一非成员，返回 403 错误；全部合法则返回 Ok。
async fn ensure_all_recipients_are_members(
    db: &sqlx::MySqlPool,
    group_id: i64,
    recipient_ids: &[i64],
) -> Result<(), AppError> {
    if recipient_ids.is_empty() {
        return Ok(());
    }

    // 构造 SELECT user_id WHERE status=1 AND group_id=? AND user_id IN (?,?,…)
    let placeholders: String = recipient_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT user_id FROM service_group_service_db.im_group_member \
         WHERE group_id = ? AND status = 1 AND user_id IN ({placeholders})"
    );

    let mut query = sqlx::query_scalar::<_, i64>(&sql).bind(group_id);
    for &rid in recipient_ids {
        query = query.bind(rid);
    }
    let found: Vec<i64> = query.fetch_all(db).await?;

    if found.len() != recipient_ids.len() {
        return Err(AppError::Forbidden(
            "recipient is not a group member".to_string(),
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// 处理器
// ---------------------------------------------------------------------------

/// 启用群聊加密
///
/// POST /api/e2ee/groups/:group_id/enable
///
/// 流程:
/// 1. 验证调用者为群管理员或群主
/// 2. 插入 e2ee_groups 记录
/// 3. 批量插入加密后的 Sender Key
pub async fn enable_group_encryption(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
    Json(request): Json<EnableGroupEncryptionRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    // 验证管理员权限
    ensure_group_admin(&state.db, group_id, identity.user_id).await?;

    // 批量校验所有 recipient 必须是群成员
    let recipient_ids: Vec<i64> = request.sender_keys.iter().map(|e| e.recipient_id).collect();
    ensure_all_recipients_are_members(&state.db, group_id, &recipient_ids).await?;

    // 批量校验所有 device 属于对应 recipient 且处于有效状态
    let device_entries: Vec<(i64, String)> = request
        .sender_keys
        .iter()
        .map(|e| (e.recipient_id, e.device_id.clone()))
        .collect();
    ensure_all_devices_belong_to_recipients(&state.db, &device_entries).await?;

    // 开启事务，保证 e2ee_groups 和 e2ee_sender_keys 的原子写入
    let mut tx = state.db.begin().await?;

    // 插入群聊加密状态记录（幂等：已存在则更新）
    sqlx::query(
        r#"INSERT INTO service_user_service_db.e2ee_groups (group_id, status, enabled_by)
           VALUES (?, 'encrypted', ?)
           ON DUPLICATE KEY UPDATE status = 'encrypted', enabled_by = VALUES(enabled_by)"#,
    )
    .bind(group_id)
    .bind(identity.user_id)
    .execute(&mut *tx)
    .await?;

    // 批量插入加密后的 Sender Key
    for entry in &request.sender_keys {
        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_sender_keys
               (group_id, sender_id, device_id, recipient_id, encrypted_sender_key, counter)
               VALUES (?, ?, ?, ?, ?, 0)
               ON DUPLICATE KEY UPDATE
                 encrypted_sender_key = VALUES(encrypted_sender_key),
                 counter = 0"#,
        )
        .bind(group_id)
        .bind(identity.user_id)
        .bind(&entry.device_id)
        .bind(entry.recipient_id)
        .bind(&entry.encrypted_sender_key)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(Json(ApiResponse::success("ok".to_string())))
}

/// 禁用群聊加密
///
/// POST /api/e2ee/groups/:group_id/disable
pub async fn disable_group_encryption(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    // 验证管理员权限
    ensure_group_admin(&state.db, group_id, identity.user_id).await?;

    // 更新群聊加密状态为明文
    sqlx::query(
        "UPDATE service_user_service_db.e2ee_groups SET status = 'plaintext' WHERE group_id = ?",
    )
    .bind(group_id)
    .execute(&state.db)
    .await?;

    // 清理该群的所有 Sender Key
    sqlx::query(
        "DELETE FROM service_user_service_db.e2ee_sender_keys WHERE group_id = ?",
    )
    .bind(group_id)
    .execute(&state.db)
    .await?;

    Ok(Json(ApiResponse::success("ok".to_string())))
}

/// 向单个群成员推送 Sender Key
///
/// POST /api/e2ee/groups/:group_id/sender-key
pub async fn push_sender_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
    Json(request): Json<PushSenderKeyRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    // 验证调用者是群成员
    let member_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM service_group_service_db.im_group_member \
         WHERE group_id = ? AND user_id = ? AND status = 1",
    )
    .bind(group_id)
    .bind(identity.user_id)
    .fetch_one(&state.db)
    .await?;

    if member_count == 0 {
        return Err(AppError::Forbidden("not a group member".to_string()));
    }

    // 校验接收方也是群成员
    ensure_group_member(&state.db, group_id, request.recipient_id).await?;

    // 校验设备属于接收方且处于有效状态
    ensure_device_exists(&state.db, request.recipient_id, &request.device_id).await?;

    // 插入 Sender Key
    sqlx::query(
        r#"INSERT INTO service_user_service_db.e2ee_sender_keys
           (group_id, sender_id, device_id, recipient_id, encrypted_sender_key, counter)
           VALUES (?, ?, ?, ?, ?, 0)
           ON DUPLICATE KEY UPDATE
             encrypted_sender_key = VALUES(encrypted_sender_key),
             counter = 0"#,
    )
    .bind(group_id)
    .bind(identity.user_id)
    .bind(&request.device_id)
    .bind(request.recipient_id)
    .bind(&request.encrypted_sender_key)
    .execute(&state.db)
    .await?;

    Ok(Json(ApiResponse::success("ok".to_string())))
}

/// 获取当前用户在群组中收到的所有 Sender Key
///
/// GET /api/e2ee/groups/:group_id/sender-keys
pub async fn get_my_sender_keys(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
) -> Result<Json<ApiResponse<Vec<SenderKeyDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    // 校验当前用户是群组有效成员
    ensure_group_member(&state.db, group_id, identity.user_id).await?;

    let rows = sqlx::query(
        r#"SELECT sender_id, device_id, encrypted_sender_key, counter
           FROM service_user_service_db.e2ee_sender_keys
           WHERE group_id = ? AND recipient_id = ?
           ORDER BY sender_id ASC"#,
    )
    .bind(group_id)
    .bind(identity.user_id)
    .fetch_all(&state.db)
    .await?;

    let keys: Vec<SenderKeyDto> = rows
        .iter()
        .map(|row| {
            let sender_id: i64 = row.get("sender_id");
            let counter: i32 = row.get("counter");
            let encrypted_sender_key: String = row
                .try_get::<Vec<u8>, _>("encrypted_sender_key")
                .map(|v| String::from_utf8_lossy(&v).into_owned())
                .unwrap_or_else(|_| row.get::<String, _>("encrypted_sender_key"));
            SenderKeyDto {
                sender_id: sender_id.to_string(),
                device_id: row.get("device_id"),
                encrypted_sender_key,
                counter,
            }
        })
        .collect();

    Ok(Json(ApiResponse::success(keys)))
}

/// 删除指定成员的 Sender Key
///
/// DELETE /api/e2ee/groups/:group_id/sender-keys/:user_id
pub async fn remove_member_sender_keys(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((group_id, user_id)): Path<(i64, i64)>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    // 允许自己删除自己的 sender key，或管理员/群主删除他人的
    if identity.user_id != user_id {
        ensure_group_admin(&state.db, group_id, identity.user_id).await?;
    }

    sqlx::query(
        "DELETE FROM service_user_service_db.e2ee_sender_keys \
         WHERE group_id = ? AND (sender_id = ? OR recipient_id = ?)",
    )
    .bind(group_id)
    .bind(user_id)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    Ok(Json(ApiResponse::success("ok".to_string())))
}

/// 获取群聊加密状态
///
/// GET /api/e2ee/groups/:group_id/status
pub async fn get_group_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
) -> Result<Json<ApiResponse<GroupEncryptionStatusDto>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;

    let row = sqlx::query(
        r#"SELECT status, enabled_by
           FROM service_user_service_db.e2ee_groups
           WHERE group_id = ?"#,
    )
    .bind(group_id)
    .fetch_optional(&state.db)
    .await?;

    let dto = match row {
        Some(row) => {
            let enabled_by: i64 = row.get("enabled_by");
            GroupEncryptionStatusDto {
                status: row.get("status"),
                enabled_by: Some(enabled_by.to_string()),
            }
        }
        None => GroupEncryptionStatusDto {
            status: "plaintext".to_string(),
            enabled_by: None,
        },
    };

    Ok(Json(ApiResponse::success(dto)))
}

// ---------------------------------------------------------------------------
// 旧版处理器（向后兼容，group_id 在请求体中）
// ---------------------------------------------------------------------------

/// 旧版启用群聊加密（group_id 在请求体中）
///
/// POST /api/e2ee/group/enable
pub async fn enable_group_encryption_legacy(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<LegacyEnableGroupEncryptionRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    // 验证管理员权限
    ensure_group_admin(&state.db, request.group_id, identity.user_id).await?;

    // 批量校验所有 recipient 必须是群成员
    let recipient_ids: Vec<i64> = request.encrypted_sender_keys.iter().map(|e| e.recipient_id).collect();
    ensure_all_recipients_are_members(&state.db, request.group_id, &recipient_ids).await?;

    // 批量校验所有 device 属于对应 recipient 且处于有效状态
    let device_entries: Vec<(i64, String)> = request
        .encrypted_sender_keys
        .iter()
        .map(|e| (e.recipient_id, e.device_id.clone()))
        .collect();
    ensure_all_devices_belong_to_recipients(&state.db, &device_entries).await?;

    // 开启事务，保证 e2ee_groups 和 e2ee_sender_keys 的原子写入
    let mut tx = state.db.begin().await?;

    // 插入群聊加密状态记录（幂等：已存在则更新）
    sqlx::query(
        r#"INSERT INTO service_user_service_db.e2ee_groups (group_id, status, enabled_by)
           VALUES (?, 'encrypted', ?)
           ON DUPLICATE KEY UPDATE status = 'encrypted', enabled_by = VALUES(enabled_by)"#,
    )
    .bind(request.group_id)
    .bind(identity.user_id)
    .execute(&mut *tx)
    .await?;

    // 批量插入加密后的 Sender Key
    for entry in &request.encrypted_sender_keys {
        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_sender_keys
               (group_id, sender_id, device_id, recipient_id, encrypted_sender_key, counter)
               VALUES (?, ?, ?, ?, ?, 0)
               ON DUPLICATE KEY UPDATE
                 encrypted_sender_key = VALUES(encrypted_sender_key),
                 counter = 0"#,
        )
        .bind(request.group_id)
        .bind(identity.user_id)
        .bind(&entry.device_id)
        .bind(entry.recipient_id)
        .bind(&entry.encrypted_sender_key)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(Json(ApiResponse::success("ok".to_string())))
}

/// 旧版禁用群聊加密（group_id 在请求体中）
///
/// POST /api/e2ee/group/disable
pub async fn disable_group_encryption_legacy(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    let group_id = body
        .get("groupId")
        .and_then(|v| v.as_i64())
        .or_else(|| body.get("group_id").and_then(|v| v.as_i64()))
        .ok_or_else(|| AppError::BadRequest("missing groupId".to_string()))?;

    // 验证管理员权限
    ensure_group_admin(&state.db, group_id, identity.user_id).await?;

    // 更新群聊加密状态为明文
    sqlx::query(
        "UPDATE service_user_service_db.e2ee_groups SET status = 'plaintext' WHERE group_id = ?",
    )
    .bind(group_id)
    .execute(&state.db)
    .await?;

    // 清理该群的所有 Sender Key
    sqlx::query(
        "DELETE FROM service_user_service_db.e2ee_sender_keys WHERE group_id = ?",
    )
    .bind(group_id)
    .execute(&state.db)
    .await?;

    Ok(Json(ApiResponse::success("ok".to_string())))
}
