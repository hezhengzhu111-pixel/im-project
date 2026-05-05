use crate::access_control;
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

/// 启用群聊加密的请求体（新版，group_id 在 URL 路径中）。
///
/// 包含为每个群成员设备加密后的 Sender Key 密文。
/// 服务端仅保存密文材料，不保存明文 Sender Key 或私钥。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnableGroupEncryptionRequest {
    pub sender_keys: Vec<EncryptedSenderKeyEntry>,
}

/// 旧版启用群聊加密请求体（group_id 在请求体中，向后兼容）。
///
/// 功能与 `EnableGroupEncryptionRequest` 相同，仅参数位置不同。
/// 服务端仅保存密文材料，不保存私钥。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyEnableGroupEncryptionRequest {
    pub group_id: i64,
    pub encrypted_sender_keys: Vec<EncryptedSenderKeyEntry>,
}

/// 加密 Sender Key 条目。
///
/// 包含接收者 ID、设备 ID 和对应的加密后 Sender Key 密文。
/// 服务端仅存储密文，不持有明文密钥。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedSenderKeyEntry {
    pub recipient_id: i64,
    pub device_id: String,
    pub encrypted_sender_key: String,
}

/// 向单个群成员推送 Sender Key 的请求体。
///
/// 包含接收者信息和加密后的 Sender Key 密文。
/// 服务端仅保存密文，不保存私钥。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushSenderKeyRequest {
    pub recipient_id: i64,
    pub device_id: String,
    pub encrypted_sender_key: String,
}

/// Sender Key 响应 DTO。
///
/// 返回发送者的加密 Sender Key 密文及其计数器。
/// 仅包含密文材料，不包含明文密钥或私钥。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SenderKeyDto {
    pub sender_id: String,
    pub device_id: String,
    pub encrypted_sender_key: String,
    pub counter: i32,
}

/// 群聊加密状态 DTO。
///
/// 返回群组当前的加密状态（encrypted/plaintext）及启用者 ID。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupEncryptionStatusDto {
    pub status: String,
    pub enabled_by: Option<String>,
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 处理器
// ---------------------------------------------------------------------------

/// 启用群聊端到端加密。
///
/// POST /api/e2ee/groups/:group_id/enable
///
/// 业务目的：为指定群组启用 E2EE，批量分发加密后的 Sender Key 给所有群成员设备。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：仅群管理员或群主可操作；所有接收者必须是群成员且设备已注册；
/// 仅保存加密后的 Sender Key 密文，不保存明文密钥或私钥。
/// 事务内原子写入群组加密状态和 Sender Key 记录。
/// 返回语义：成功返回 "ok"，幂等更新。
pub async fn enable_group_encryption(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
    Json(request): Json<EnableGroupEncryptionRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    // 验证管理员权限
    access_control::ensure_group_admin(&state.db, group_id, identity.user_id).await?;

    // 批量校验所有 recipient 必须是群成员
    let recipient_ids: Vec<i64> = request.sender_keys.iter().map(|e| e.recipient_id).collect();
    access_control::ensure_group_members_batch(&state.db, group_id, &recipient_ids).await?;

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

/// 禁用群聊端到端加密。
///
/// POST /api/e2ee/groups/:group_id/disable
///
/// 业务目的：将群组加密状态回退为明文，清除所有已分发的 Sender Key。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：仅群管理员或群主可操作。
/// 返回语义：成功返回 "ok"。
pub async fn disable_group_encryption(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    // 验证管理员权限
    access_control::ensure_group_admin(&state.db, group_id, identity.user_id).await?;

    // 更新群聊加密状态为明文
    sqlx::query(
        "UPDATE service_user_service_db.e2ee_groups SET status = 'plaintext' WHERE group_id = ?",
    )
    .bind(group_id)
    .execute(&state.db)
    .await?;

    // 清理该群的所有 Sender Key
    sqlx::query("DELETE FROM service_user_service_db.e2ee_sender_keys WHERE group_id = ?")
        .bind(group_id)
        .execute(&state.db)
        .await?;

    Ok(Json(ApiResponse::success("ok".to_string())))
}

/// 向单个群成员推送加密 Sender Key。
///
/// POST /api/e2ee/groups/:group_id/sender-key
///
/// 业务目的：向指定群成员的指定设备推送加密后的 Sender Key，用于新成员加入或密钥轮换。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：调用者和接收者都必须是群成员，接收者设备必须已注册；
/// 仅保存加密后的密文，不保存明文密钥或私钥。
/// 返回语义：成功返回 "ok"，幂等更新。
pub async fn push_sender_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
    Json(request): Json<PushSenderKeyRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    // 验证调用者是群成员
    access_control::ensure_group_member(&state.db, group_id, identity.user_id).await?;

    // 校验接收方也是群成员
    access_control::ensure_group_member(&state.db, group_id, request.recipient_id).await?;

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

/// 获取当前用户在群组中收到的所有 Sender Key。
///
/// GET /api/e2ee/groups/:group_id/sender-keys
///
/// 业务目的：拉取当前用户在指定群组中收到的所有加密 Sender Key，用于解密群消息。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：仅群成员可查询；返回的是加密后的密文，不包含明文密钥或私钥。
/// 返回语义：按 sender_id 升序返回 SenderKeyDto 列表。
pub async fn get_my_sender_keys(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
) -> Result<Json<ApiResponse<Vec<SenderKeyDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    // 校验当前用户是群组有效成员
    access_control::ensure_group_member(&state.db, group_id, identity.user_id).await?;

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

/// 删除指定成员的 Sender Key。
///
/// DELETE /api/e2ee/groups/:group_id/sender-keys/:user_id
///
/// 业务目的：移除指定成员的 Sender Key（退出群聊或管理员清理时调用）。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：用户可以删除自己的 Sender Key，管理员/群主可以删除他人的。
/// 返回语义：成功返回 "ok"。
pub async fn remove_member_sender_keys(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((group_id, user_id)): Path<(i64, i64)>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    // 允许自己删除自己的 sender key，或管理员/群主删除他人的
    if identity.user_id != user_id {
        access_control::ensure_group_admin(&state.db, group_id, identity.user_id).await?;
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

/// 获取群聊加密状态。
///
/// GET /api/e2ee/groups/:group_id/status
///
/// 业务目的：查询指定群组当前的加密状态（encrypted/plaintext）。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：仅群成员可查询（防止对不存在的群组泄露状态）。
/// 返回语义：未启用过加密的群组返回 status="plaintext"、enabled_by=null。
pub async fn get_group_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
) -> Result<Json<ApiResponse<GroupEncryptionStatusDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    // 非成员不可查询（也防止对不存在的 group 泄露状态）
    access_control::ensure_group_member(&state.db, group_id, identity.user_id).await?;

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

/// 旧版启用群聊加密（group_id 在请求体中，向后兼容）。
///
/// POST /api/e2ee/group/enable
///
/// 业务目的：与 `enable_group_encryption` 相同，仅 group_id 参数在请求体中。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：仅群管理员或群主可操作；仅保存密文，不保存私钥。
/// 返回语义：成功返回 "ok"。
pub async fn enable_group_encryption_legacy(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<LegacyEnableGroupEncryptionRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    // 验证管理员权限
    access_control::ensure_group_admin(&state.db, request.group_id, identity.user_id).await?;

    // 批量校验所有 recipient 必须是群成员
    let recipient_ids: Vec<i64> = request
        .encrypted_sender_keys
        .iter()
        .map(|e| e.recipient_id)
        .collect();
    access_control::ensure_group_members_batch(&state.db, request.group_id, &recipient_ids).await?;

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

/// 旧版禁用群聊加密（group_id 在请求体中，向后兼容）。
///
/// POST /api/e2ee/group/disable
///
/// 业务目的：与 `disable_group_encryption` 相同，仅 group_id 参数在请求体中。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：仅群管理员或群主可操作。
/// 返回语义：成功返回 "ok"。
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
    access_control::ensure_group_admin(&state.db, group_id, identity.user_id).await?;

    // 更新群聊加密状态为明文
    sqlx::query(
        "UPDATE service_user_service_db.e2ee_groups SET status = 'plaintext' WHERE group_id = ?",
    )
    .bind(group_id)
    .execute(&state.db)
    .await?;

    // 清理该群的所有 Sender Key
    sqlx::query("DELETE FROM service_user_service_db.e2ee_sender_keys WHERE group_id = ?")
        .bind(group_id)
        .execute(&state.db)
        .await?;

    Ok(Json(ApiResponse::success("ok".to_string())))
}
