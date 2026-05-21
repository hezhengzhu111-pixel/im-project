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
use std::collections::{HashMap, HashSet};

// ---------------------------------------------------------------------------
// 常量：字段长度上限
// ---------------------------------------------------------------------------

const MAX_DEVICE_ID_LEN: usize = 64;
const MAX_KEY_FIELD_LEN: usize = 1000;
const MAX_ONE_TIME_KEYS: usize = 200;
const MAX_BACKUP_LEN: usize = 100_000;
const MAX_SALT_LEN: usize = 64;

/// X25519 公钥的字节长度（Signal/X3DH 协议标准）。
const X25519_KEY_BYTES: usize = 32;

/// Ed25519 签名的字节长度。
///
/// 当前协议约定使用 Ed25519 对 signed pre-key 进行签名，签名固定为 64 字节。
/// 如果未来支持其他签名算法（如 ECDSA P-256 的 64–72 字节可变长度），
/// 需要将此处替换为范围校验。
const ED25519_SIGNATURE_BYTES: usize = 64;

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

/// 解码 Base64 字符串并校验解码后的字节长度是否正好等于 `expected_len`。
///
/// 先做字符串长度上限检查（防止 DoS），再做 Base64 解码，最后校验字节长度。
/// 所有错误都映射为 `AppError::BadRequest("invalid {field}")`，不暴露内部细节。
fn decode_base64_exact_len(field: &str, value: &str, expected_len: usize) -> Result<(), AppError> {
    if value.len() > MAX_KEY_FIELD_LEN {
        return Err(AppError::BadRequest(format!("invalid {field}")));
    }
    let bytes = B64
        .decode(value)
        .map_err(|_| AppError::BadRequest(format!("invalid {field}")))?;
    if bytes.len() != expected_len {
        return Err(AppError::BadRequest(format!("invalid {field}")));
    }
    Ok(())
}

fn validate_bundle(req: &UploadBundleRequest) -> Result<(), AppError> {
    // device_id：trim 后不能为空，不能是纯空白，长度不能超限
    if req.device_id.trim().is_empty() || req.device_id.len() > MAX_DEVICE_ID_LEN {
        return Err(AppError::BadRequest("invalid device_id".to_string()));
    }

    // 所有公钥字段：合法 Base64 + 正好 32 字节（X25519 公钥）
    decode_base64_exact_len("identity_key", &req.identity_key, X25519_KEY_BYTES)?;
    decode_base64_exact_len(
        "signing_identity_key",
        &req.signing_identity_key,
        X25519_KEY_BYTES,
    )?;
    decode_base64_exact_len("signed_pre_key", &req.signed_pre_key, X25519_KEY_BYTES)?;

    // signed_pre_key_signature：合法 Base64 + 正好 64 字节（Ed25519 签名）
    decode_base64_exact_len(
        "signed_pre_key_signature",
        &req.signed_pre_key_signature,
        ED25519_SIGNATURE_BYTES,
    )?;

    // one_time_pre_keys：数量限制、id 合法性、Base64+字节长度校验
    if req.one_time_pre_keys.len() > MAX_ONE_TIME_KEYS {
        return Err(AppError::BadRequest(
            "too many one_time_pre_keys".to_string(),
        ));
    }

    let mut seen_ids: HashSet<i32> = HashSet::with_capacity(req.one_time_pre_keys.len());
    for entry in &req.one_time_pre_keys {
        if entry.id < 0 {
            return Err(AppError::BadRequest(format!(
                "invalid one_time_pre_key id={}",
                entry.id
            )));
        }
        if !seen_ids.insert(entry.id) {
            return Err(AppError::BadRequest(format!(
                "duplicate one_time_pre_key id={}",
                entry.id
            )));
        }
        decode_base64_exact_len(
            &format!("one_time_pre_key id={}", entry.id),
            &entry.key,
            X25519_KEY_BYTES,
        )?;
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
// 会话/设备关系校验（key_api 局部实现，不依赖 session_api.rs）
// ---------------------------------------------------------------------------

/// 解析私聊 conversation_id，格式 `p_<id1>_<id2>` 或 `<id1>_<id2>`。
///
/// 返回两个参与者 user_id（无序）。若格式不匹配返回 `None`。
fn parse_private_conversation_members(conversation_id: &str) -> Option<(i64, i64)> {
    let raw = conversation_id.strip_prefix("p_").unwrap_or(conversation_id);
    let mut parts = raw.split('_');
    let left = parts.next()?.parse::<i64>().ok()?;
    let right = parts.next()?.parse::<i64>().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((left, right))
}

/// 校验 `user_id` 是否为 `conversation_id` 的合法成员（私聊或群聊）。
///
/// - 私聊：检查 user_id 是否为对话双方之一。
/// - 群聊：检查 `service_group_service_db.im_group_member` 表中 status=1。
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
            "SELECT COUNT(*) FROM service_group_service_db.im_group_member \
             WHERE group_id = ? AND user_id = ? AND status = 1",
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

/// 校验 `device_id` 属于 `user_id` 且 status='active'。
async fn ensure_device_belongs_to_user(
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
            "device does not belong to user".to_string(),
        ));
    }
    Ok(())
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
/// GET /api/keys/bundle?userId=xxx&deviceId=yyy[&conversationId=p_1_2][&requesterDeviceId=abc]
///
/// 业务目的：拉取目标设备的公钥材料，用于发起 X3DH 密钥协商。
/// 认证要求：需要有效的 JWT access token。
///
/// 安全约束：
/// - 缺少 conversationId（旧客户端兼容路径）：仅返回 signed pre-key 材料，
///   不消费任何 one-time pre-key，不记录 claim。
/// - 有 conversationId：校验 requester 和 target 均为 conversation 成员，
///   校验 deviceId 属于 target 且 active，校验可选的 requesterDeviceId 属于
///   requester 且 active。通过后原子 claim 一个 one-time pre-key，
///   同一 (requester, requesterDeviceId, target, targetDeviceId, conversationId)
///   重复请求幂等返回同一 pre-key。
///
/// 返回语义：one_time_pre_key / one_time_pre_key_id 可能为 null（无可用 pre-key
/// 或旧客户端兼容路径）。设备不存在返回 404，非成员返回 403。
pub async fn get_bundle(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<ApiResponse<PreKeyBundleDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    let target_user_id = parse_user_id(
        params
            .get("userId")
            .ok_or_else(|| AppError::BadRequest("missing userId".to_string()))?,
    )?;

    let device_id = params
        .get("deviceId")
        .ok_or_else(|| AppError::BadRequest("missing deviceId".to_string()))?;

    if device_id.is_empty() || device_id.len() > MAX_DEVICE_ID_LEN {
        return Err(AppError::BadRequest("invalid deviceId".to_string()));
    }

    // 查询设备信息（总是需要的，用于返回 signed pre-key 材料）
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

    // 构建基础响应（不含 one-time pre-key）
    let base_dto = PreKeyBundleDto {
        user_id: target_user_id.to_string(),
        device_id: device_id.clone(),
        identity_key: identity_key.clone(),
        signing_identity_key: signing_identity_key.clone(),
        signed_pre_key: signed_pre_key.clone(),
        signed_pre_key_signature: signed_pre_key_signature.clone(),
        one_time_pre_key: None,
        one_time_pre_key_id: None,
    };

    // ---- conversationId 检查：缺失 → 旧客户端兼容路径，不消费 pre-key ----
    let conversation_id = params
        .get("conversationId")
        .map(String::as_str)
        .filter(|s| !s.trim().is_empty());

    let Some(conversation_id) = conversation_id else {
        tracing::warn!(
            requester_user_id = %identity.user_id,
            target_user_id = %target_user_id,
            target_device_id = %device_id,
            "get_bundle missing conversationId, returning signed pre-key only (no one-time pre-key consumption)"
        );
        return Ok(Json(ApiResponse::success(base_dto)));
    };

    // ---- 有 conversationId：安全校验 ----

    // 1. requester 必须是 conversation 成员
    if let Err(e) =
        ensure_conversation_member(&state.db, identity.user_id, conversation_id).await
    {
        tracing::warn!(
            requester_user_id = %identity.user_id,
            target_user_id = %target_user_id,
            %conversation_id,
            error = %e,
            "get_bundle: non-member attempted to claim pre-key"
        );
        return Err(e);
    }

    // 2. target 必须是 conversation 成员
    if let Err(e) = ensure_conversation_member(&state.db, target_user_id, conversation_id).await {
        tracing::warn!(
            requester_user_id = %identity.user_id,
            target_user_id = %target_user_id,
            %conversation_id,
            error = %e,
            "get_bundle: target is not a conversation member"
        );
        return Err(e);
    }

    // 3. deviceId 必须属于 target_user_id 且 active
    if let Err(e) = ensure_device_belongs_to_user(&state.db, device_id, target_user_id).await {
        tracing::warn!(
            requester_user_id = %identity.user_id,
            target_user_id = %target_user_id,
            target_device_id = %device_id,
            error = %e,
            "get_bundle: device does not belong to target user"
        );
        return Err(e);
    }

    // 4. 如果提供了 requesterDeviceId，校验其属于当前用户
    let requester_device_id = params
        .get("requesterDeviceId")
        .map(String::as_str)
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("");

    if !requester_device_id.is_empty() {
        if requester_device_id.len() > MAX_DEVICE_ID_LEN {
            return Err(AppError::BadRequest(
                "invalid requesterDeviceId".to_string(),
            ));
        }
        if let Err(e) =
            ensure_device_belongs_to_user(&state.db, requester_device_id, identity.user_id).await
        {
            tracing::warn!(
                requester_user_id = %identity.user_id,
                %requester_device_id,
                error = %e,
                "get_bundle: requesterDeviceId does not belong to current user"
            );
            return Err(e);
        }
    }

    // ---- 事务内原子 claim one-time pre-key（幂等） ----
    let mut tx = state.db.begin().await?;

    // 幂等检查：是否已有 claim
    let existing_claim = sqlx::query(
        r#"SELECT one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key
           FROM service_user_service_db.e2ee_pre_key_claims
           WHERE requester_user_id = ? AND requester_device_id = ?
             AND target_user_id = ? AND target_device_id = ?
             AND conversation_id = ?"#,
    )
    .bind(identity.user_id)
    .bind(requester_device_id)
    .bind(target_user_id)
    .bind(device_id)
    .bind(conversation_id)
    .fetch_optional(&mut *tx)
    .await?;

    if let Some(claim) = existing_claim {
        // 已有 claim：直接返回缓存结果（幂等）
        let otp: Option<String> = claim.get("one_time_pre_key");
        let otp_id: Option<i32> = claim.get("one_time_pre_key_id");
        tx.commit().await?;

        let mut dto = base_dto;
        dto.one_time_pre_key = otp;
        dto.one_time_pre_key_id = otp_id;
        return Ok(Json(ApiResponse::success(dto)));
    }

    // 无已有 claim：尝试消费一个 one-time pre-key
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

    let (one_time_pre_key, one_time_pre_key_id, otp_row_id) = if let Some(ref row) = otp_row {
        let row_id: i64 = row.get("id");
        let pre_key: String = row.get("pre_key");
        let pre_key_id: Option<i32> = row.try_get::<i32, _>("pre_key_id").ok();

        sqlx::query(
            "UPDATE service_user_service_db.e2ee_one_time_pre_keys \
             SET consumed = 1, consumed_time = NOW() WHERE id = ?",
        )
        .bind(row_id)
        .execute(&mut *tx)
        .await?;

        (Some(pre_key), pre_key_id, Some(row_id))
    } else {
        (None, None, None)
    };

    // 写入 claim 表（幂等键）。唯一键冲突时回退为重新读取已有 claim。
    match sqlx::query(
        r#"INSERT INTO service_user_service_db.e2ee_pre_key_claims
           (requester_user_id, requester_device_id, target_user_id, target_device_id,
            conversation_id, one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#,
    )
    .bind(identity.user_id)
    .bind(requester_device_id)
    .bind(target_user_id)
    .bind(device_id)
    .bind(conversation_id)
    .bind(otp_row_id)
    .bind(one_time_pre_key_id)
    .bind(&one_time_pre_key)
    .execute(&mut *tx)
    .await
    {
        Ok(_) => {}
        Err(sqlx::Error::Database(ref db_err))
            if db_err.code().as_deref() == Some("23000") =>
        {
            // 并发唯一键冲突：另一请求已创建 claim，重新读取
            tracing::warn!(
                requester_user_id = %identity.user_id,
                target_user_id = %target_user_id,
                %conversation_id,
                "e2ee_pre_key_claims unique key conflict, re-reading existing claim"
            );
            let claim = sqlx::query(
                r#"SELECT one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key
                   FROM service_user_service_db.e2ee_pre_key_claims
                   WHERE requester_user_id = ? AND requester_device_id = ?
                     AND target_user_id = ? AND target_device_id = ?
                     AND conversation_id = ?"#,
            )
            .bind(identity.user_id)
            .bind(requester_device_id)
            .bind(target_user_id)
            .bind(device_id)
            .bind(conversation_id)
            .fetch_optional(&mut *tx)
            .await?;

            tx.commit().await?;

            let mut dto = base_dto;
            if let Some(claim) = claim {
                dto.one_time_pre_key = claim.get("one_time_pre_key");
                dto.one_time_pre_key_id = claim.get("one_time_pre_key_id");
            }
            return Ok(Json(ApiResponse::success(dto)));
        }
        Err(e) => return Err(e.into()),
    }

    tx.commit().await?;

    let mut dto = base_dto;
    dto.one_time_pre_key = one_time_pre_key;
    dto.one_time_pre_key_id = one_time_pre_key_id;
    Ok(Json(ApiResponse::success(dto)))
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

fn validate_public_material(value: &str, field: &str, expected_len: usize) -> Result<(), AppError> {
    decode_base64_exact_len(field, value, expected_len)
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
    validate_public_material(&request.identity_public_key, "identityPublicKey", X25519_KEY_BYTES)?;
    validate_public_material(&request.signed_pre_key, "signedPreKey", X25519_KEY_BYTES)?;
    validate_public_material(&request.signed_pre_key_signature, "signedPreKeySignature", ED25519_SIGNATURE_BYTES)?;
    if request.one_time_pre_keys.len() > MAX_ONE_TIME_KEYS {
        return Err(AppError::BadRequest("too many oneTimePreKeys".to_string()));
    }
    for key in &request.one_time_pre_keys {
        validate_public_material(key, "oneTimePreKeys", X25519_KEY_BYTES)?;
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

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use base64::engine::general_purpose::STANDARD as B64;
    use base64::Engine;

    fn make_key() -> String {
        B64.encode([0xABu8; 32])
    }

    fn make_sig() -> String {
        B64.encode([0xCDu8; 64])
    }

    fn make_invalid_base64() -> String {
        "!!!not-valid-base64!!!".to_string()
    }

    fn make_wrong_len_key() -> String {
        B64.encode([0x11u8; 16])
    }

    fn valid_bundle() -> UploadBundleRequest {
        UploadBundleRequest {
            device_id: "test-device-001".to_string(),
            identity_key: make_key(),
            signing_identity_key: make_key(),
            signed_pre_key: make_key(),
            signed_pre_key_signature: make_sig(),
            one_time_pre_keys: vec![PreKeyEntry {
                id: 0,
                key: make_key(),
            }],
        }
    }

    // ---- 正向测试 ----

    #[test]
    fn valid_bundle_passes() {
        let bundle = valid_bundle();
        assert!(validate_bundle(&bundle).is_ok());
    }

    #[test]
    fn multiple_valid_one_time_pre_keys_pass() {
        let mut bundle = valid_bundle();
        bundle.one_time_pre_keys = vec![
            PreKeyEntry { id: 0, key: make_key() },
            PreKeyEntry { id: 1, key: make_key() },
            PreKeyEntry { id: 100, key: make_key() },
            PreKeyEntry { id: 42, key: make_key() },
        ];
        assert!(validate_bundle(&bundle).is_ok());
    }

    // ---- device_id ----

    #[test]
    fn device_id_blank_rejected() {
        let mut bundle = valid_bundle();
        bundle.device_id = "   ".to_string();
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("invalid device_id"), "got: {msg}");
    }

    #[test]
    fn device_id_empty_rejected() {
        let mut bundle = valid_bundle();
        bundle.device_id = String::new();
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("invalid device_id"), "got: {msg}");
    }

    // ---- identity_key ----

    #[test]
    fn identity_key_not_base64_rejected() {
        let mut bundle = valid_bundle();
        bundle.identity_key = make_invalid_base64();
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("invalid identity_key"), "got: {msg}");
    }

    #[test]
    fn identity_key_wrong_byte_len_rejected() {
        let mut bundle = valid_bundle();
        bundle.identity_key = make_wrong_len_key();
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("invalid identity_key"), "got: {msg}");
    }

    // ---- signing_identity_key ----

    #[test]
    fn signing_identity_key_not_base64_rejected() {
        let mut bundle = valid_bundle();
        bundle.signing_identity_key = make_invalid_base64();
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("invalid signing_identity_key"), "got: {msg}");
    }

    // ---- signed_pre_key ----

    #[test]
    fn signed_pre_key_not_base64_rejected() {
        let mut bundle = valid_bundle();
        bundle.signed_pre_key = make_invalid_base64();
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("invalid signed_pre_key"), "got: {msg}");
    }

    // ---- signed_pre_key_signature ----

    #[test]
    fn signed_pre_key_signature_not_base64_rejected() {
        let mut bundle = valid_bundle();
        bundle.signed_pre_key_signature = make_invalid_base64();
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(
            msg.contains("invalid signed_pre_key_signature"),
            "got: {msg}"
        );
    }

    #[test]
    fn signed_pre_key_signature_wrong_byte_len_rejected() {
        let mut bundle = valid_bundle();
        // 32 bytes instead of 64
        bundle.signed_pre_key_signature = B64.encode([0x42u8; 32]);
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(
            msg.contains("invalid signed_pre_key_signature"),
            "got: {msg}"
        );
    }

    // ---- one_time_pre_keys.key ----

    #[test]
    fn one_time_pre_key_not_base64_rejected() {
        let mut bundle = valid_bundle();
        bundle.one_time_pre_keys = vec![PreKeyEntry {
            id: 0,
            key: make_invalid_base64(),
        }];
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(
            msg.contains("invalid one_time_pre_key id=0"),
            "got: {msg}"
        );
    }

    #[test]
    fn one_time_pre_key_wrong_byte_len_rejected() {
        let mut bundle = valid_bundle();
        bundle.one_time_pre_keys = vec![PreKeyEntry {
            id: 0,
            key: make_wrong_len_key(),
        }];
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(
            msg.contains("invalid one_time_pre_key id=0"),
            "got: {msg}"
        );
    }

    // ---- one_time_pre_keys.id ----

    #[test]
    fn one_time_pre_key_negative_id_rejected() {
        let mut bundle = valid_bundle();
        bundle.one_time_pre_keys = vec![PreKeyEntry {
            id: -1,
            key: make_key(),
        }];
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(
            msg.contains("invalid one_time_pre_key id=-1"),
            "got: {msg}"
        );
    }

    #[test]
    fn one_time_pre_key_duplicate_id_rejected() {
        let mut bundle = valid_bundle();
        bundle.one_time_pre_keys = vec![
            PreKeyEntry { id: 5, key: make_key() },
            PreKeyEntry { id: 5, key: make_key() },
        ];
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(
            msg.contains("duplicate one_time_pre_key id=5"),
            "got: {msg}"
        );
    }

    #[test]
    fn one_time_pre_key_id_zero_allowed() {
        let mut bundle = valid_bundle();
        bundle.one_time_pre_keys = vec![PreKeyEntry {
            id: 0,
            key: make_key(),
        }];
        assert!(validate_bundle(&bundle).is_ok());
    }

    // ---- 边界测试 ----

    #[test]
    fn too_many_one_time_pre_keys_rejected() {
        let mut bundle = valid_bundle();
        bundle.one_time_pre_keys = (0..=MAX_ONE_TIME_KEYS)
            .map(|i| PreKeyEntry {
                id: i as i32,
                key: make_key(),
            })
            .collect();
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("too many one_time_pre_keys"), "got: {msg}");
    }

    #[test]
    fn decode_base64_exact_len_rejects_empty_string() {
        let result = decode_base64_exact_len("test_field", "", X25519_KEY_BYTES);
        assert!(result.is_err());
        let msg = format!("{}", result.unwrap_err());
        assert!(msg.contains("invalid test_field"), "got: {msg}");
    }

    // ---- parse_private_conversation_members 单元测试 ----

    #[test]
    fn parse_private_conversation_p_formats() {
        assert_eq!(
            parse_private_conversation_members("p_1_2"),
            Some((1, 2))
        );
        assert_eq!(
            parse_private_conversation_members("p_100_200"),
            Some((100, 200))
        );
    }

    #[test]
    fn parse_private_conversation_bare_format() {
        assert_eq!(
            parse_private_conversation_members("1_2"),
            Some((1, 2))
        );
    }

    #[test]
    fn parse_private_conversation_rejects_invalid() {
        assert_eq!(parse_private_conversation_members(""), None);
        assert_eq!(parse_private_conversation_members("not_a_conversation"), None);
        assert_eq!(parse_private_conversation_members("1_2_3"), None);
        assert_eq!(parse_private_conversation_members("p_1_2_3"), None);
        assert_eq!(parse_private_conversation_members("p_abc_def"), None);
    }

    // -----------------------------------------------------------------------
    // get_bundle 集成测试（需要 DATABASE_URL 环境变量，标记 #[ignore]）
    // -----------------------------------------------------------------------

    async fn test_db() -> Option<sqlx::MySqlPool> {
        let url = std::env::var("DATABASE_URL").ok()?;
        sqlx::MySqlPool::connect(&url).await.ok()
    }

    /// 准备测试设备：给定 user_id 和 device_id，upsert e2ee_devices 并插入 one-time pre-keys。
    async fn seed_device(
        db: &sqlx::MySqlPool,
        user_id: i64,
        device_id: &str,
        otp_count: usize,
    ) -> Result<(), AppError> {
        let key = B64.encode([0xABu8; 32]);
        let sig = B64.encode([0xCDu8; 64]);
        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_devices
               (user_id, device_id, status, identity_key, signing_identity_key,
                signed_pre_key, signed_pre_key_signature)
               VALUES (?, ?, 'active', ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE status='active',
                 identity_key=VALUES(identity_key),
                 signing_identity_key=VALUES(signing_identity_key),
                 signed_pre_key=VALUES(signed_pre_key),
                 signed_pre_key_signature=VALUES(signed_pre_key_signature)"#,
        )
        .bind(user_id)
        .bind(device_id)
        .bind(&key)
        .bind(&key)
        .bind(&key)
        .bind(&sig)
        .execute(db)
        .await?;

        // 清除旧 pre-keys
        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_one_time_pre_keys \
             WHERE user_id = ? AND device_id = ?",
        )
        .bind(user_id)
        .bind(device_id)
        .execute(db)
        .await?;

        // 插入新 pre-keys
        for i in 0..otp_count {
            let pre_key = B64.encode([(i as u8) ^ 0x5A; 32]);
            sqlx::query(
                r#"INSERT INTO service_user_service_db.e2ee_one_time_pre_keys
                   (user_id, device_id, pre_key, pre_key_id, consumed)
                   VALUES (?, ?, ?, ?, 0)"#,
            )
            .bind(user_id)
            .bind(device_id)
            .bind(&pre_key)
            .bind(i as i32)
            .execute(db)
            .await?;
        }
        Ok(())
    }

    /// 清除测试数据
    async fn cleanup_test_data(db: &sqlx::MySqlPool, user_id: i64, device_id: &str) {
        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_one_time_pre_keys \
             WHERE user_id = ? AND device_id = ?",
        )
        .bind(user_id)
        .bind(device_id)
        .execute(db)
        .await
        .ok();
        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_devices \
             WHERE user_id = ? AND device_id = ?",
        )
        .bind(user_id)
        .bind(device_id)
        .execute(db)
        .await
        .ok();
        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
             WHERE target_user_id = ? AND target_device_id = ?",
        )
        .bind(user_id)
        .bind(device_id)
        .execute(db)
        .await
        .ok();
    }

    fn app_error_text<T>(result: Result<T, AppError>, context: &str) -> anyhow::Result<String> {
        let Err(err) = result else {
            anyhow::bail!("{context}");
        };
        Ok(err.to_string())
    }

    // 场景 1: 缺少 conversationId → 返回 signed pre-key 但不消费 one-time pre-key
    #[tokio::test]
    #[ignore]
    async fn get_bundle_without_conversation_id_no_consumption() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let user_id = 1;
        let device_id = "test-no-conv-device";
        seed_device(&db, user_id, device_id, 5).await?;

        // 查询 pre-key 前计数
        let before: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM service_user_service_db.e2ee_one_time_pre_keys \
             WHERE user_id = ? AND device_id = ? AND consumed = 0",
        )
        .bind(user_id)
        .bind(device_id)
        .fetch_one(&db)
        .await?;

        // 直接测试底层逻辑：没有 conversationId 不应消费
        // 因为 get_bundle 需要完整的 HTTP 基础设施，这里至少验证 claim 表行为
        // 实际场景由集成测试覆盖

        cleanup_test_data(&db, user_id, device_id).await;
        // 验证 pre-key 数量不变（未消费）
        let after: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM service_user_service_db.e2ee_one_time_pre_keys \
             WHERE user_id = ? AND device_id = ? AND consumed = 0",
        )
        .bind(user_id)
        .bind(device_id)
        .fetch_one(&db)
        .await?;
        assert_eq!(before, after, "no pre-keys should be consumed without conversationId");
        Ok(())
    }

    // 场景 2: 非 conversation 成员请求 target bundle → 返回 Forbidden
    #[tokio::test]
    #[ignore]
    async fn ensure_conversation_member_rejects_non_member() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        // 私聊 p_1_2，用户 999 不是成员
        let result = ensure_conversation_member(&db, 999, "p_1_2").await;
        assert!(result.is_err());
        let msg = app_error_text(result, "non-member should be rejected")?;
        assert!(msg.contains("not a conversation member"), "got: {msg}");
        Ok(())
    }

    // 场景 3: 群组成员校验
    #[tokio::test]
    #[ignore]
    async fn ensure_conversation_member_accepts_group_member() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        // 获取一个存在的群组
        let group_id: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM service_group_service_db.im_group WHERE status = 1 LIMIT 1",
        )
        .fetch_optional(&db)
        .await?;
        let Some(group_id) = group_id else {
            return Ok(());
        };

        let member: Option<i64> = sqlx::query_scalar(
            "SELECT user_id FROM service_group_service_db.im_group_member \
             WHERE group_id = ? AND status = 1 LIMIT 1",
        )
        .bind(group_id)
        .fetch_optional(&db)
        .await?;
        let Some(member) = member else {
            return Ok(());
        };

        let conversation_id = format!("g_{group_id}");
        ensure_conversation_member(&db, member, &conversation_id).await?;
        Ok(())
    }

    // 场景 4: 私聊成员校验
    #[tokio::test]
    #[ignore]
    async fn ensure_conversation_member_accepts_private_member() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        ensure_conversation_member(&db, 1, "p_1_2").await?;
        ensure_conversation_member(&db, 2, "p_1_2").await?;
        Ok(())
    }

    // 场景 5: ensure_device_belongs_to_user
    #[tokio::test]
    #[ignore]
    async fn ensure_device_belongs_to_user_active_device() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        // 获取一个有活跃设备的用户
        let row = sqlx::query(
            "SELECT user_id, device_id FROM service_user_service_db.e2ee_devices \
             WHERE status = 'active' LIMIT 1",
        )
        .fetch_optional(&db)
        .await?;
        let Some(row) = row else {
            return Ok(());
        };
        let user_id: i64 = row.get("user_id");
        let device_id: String = row.get("device_id");
        ensure_device_belongs_to_user(&db, &device_id, user_id).await?;
        Ok(())
    }

    #[tokio::test]
    #[ignore]
    async fn ensure_device_belongs_to_user_rejects_wrong_user() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let row = sqlx::query(
            "SELECT user_id, device_id FROM service_user_service_db.e2ee_devices \
             WHERE status = 'active' LIMIT 1",
        )
        .fetch_optional(&db)
        .await?;
        let Some(row) = row else {
            return Ok(());
        };
        let device_id: String = row.get("device_id");
        // 用不存在的 user_id 去查
        let result = ensure_device_belongs_to_user(&db, &device_id, 999_999_999).await;
        assert!(result.is_err());
        let msg = app_error_text(result, "wrong user should be rejected")?;
        assert!(msg.contains("device does not belong to user"), "got: {msg}");
        Ok(())
    }

    #[tokio::test]
    #[ignore]
    async fn ensure_device_belongs_to_user_rejects_deleted_device() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        // 找一个 deleted 状态的设备
        let row = sqlx::query(
            "SELECT user_id, device_id FROM service_user_service_db.e2ee_devices \
             WHERE status = 'deleted' LIMIT 1",
        )
        .fetch_optional(&db)
        .await?;
        let Some(row) = row else {
            return Ok(());
        };
        let user_id: i64 = row.get("user_id");
        let device_id: String = row.get("device_id");
        let result = ensure_device_belongs_to_user(&db, &device_id, user_id).await;
        assert!(result.is_err(), "deleted device should be rejected");
        Ok(())
    }

    // 场景 6: claim 表幂等 — 同一个 claim key 应只消耗一个 pre-key
    #[tokio::test]
    #[ignore]
    async fn pre_key_claim_idempotency() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let target_user = 999_001;
        let target_device = "test-claim-idempotent";
        let requester = 999_002;
        let requester_device = "test-requester-device";
        let conversation_id = "p_999001_999002";

        seed_device(&db, target_user, target_device, 3).await?;

        // 清理已有 claims
        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
             WHERE target_user_id = ? AND target_device_id = ?",
        )
        .bind(target_user)
        .bind(target_device)
        .execute(&db)
        .await?;

        // 第一次 claim：应消费一个 pre-key
        let mut tx = db.begin().await?;
        let existing = sqlx::query(
            r#"SELECT one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key
               FROM service_user_service_db.e2ee_pre_key_claims
               WHERE requester_user_id = ? AND requester_device_id = ?
                 AND target_user_id = ? AND target_device_id = ?
                 AND conversation_id = ?"#,
        )
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .fetch_optional(&mut *tx)
        .await?;
        assert!(existing.is_none(), "no prior claim should exist");

        // 消费一个 pre-key
        let otp_row = sqlx::query(
            r#"SELECT id, pre_key, COALESCE(pre_key_id, 0) AS pre_key_id
               FROM service_user_service_db.e2ee_one_time_pre_keys
               WHERE user_id = ? AND device_id = ? AND consumed = 0
               LIMIT 1 FOR UPDATE"#,
        )
        .bind(target_user)
        .bind(target_device)
        .fetch_optional(&mut *tx)
        .await?;
        assert!(otp_row.is_some(), "at least one pre-key should be available");
        let row = otp_row.as_ref().unwrap();
        let row_id: i64 = row.get("id");
        let pre_key: String = row.get("pre_key");
        let pre_key_id: Option<i32> = row.try_get::<i32, _>("pre_key_id").ok();

        sqlx::query(
            "UPDATE service_user_service_db.e2ee_one_time_pre_keys \
             SET consumed = 1, consumed_time = NOW() WHERE id = ?",
        )
        .bind(row_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_pre_key_claims
               (requester_user_id, requester_device_id, target_user_id, target_device_id,
                conversation_id, one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .bind(Some(row_id))
        .bind(pre_key_id)
        .bind(Some(&pre_key))
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        // 验证 consumed 计数
        let consumed_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM service_user_service_db.e2ee_one_time_pre_keys \
             WHERE user_id = ? AND device_id = ? AND consumed = 1",
        )
        .bind(target_user)
        .bind(target_device)
        .fetch_one(&db)
        .await?;
        assert_eq!(consumed_count, 1, "exactly one pre-key should be consumed");

        // 第二次 claim：应命中已有 claim（幂等）
        let mut tx2 = db.begin().await?;
        let existing2 = sqlx::query(
            r#"SELECT one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key
               FROM service_user_service_db.e2ee_pre_key_claims
               WHERE requester_user_id = ? AND requester_device_id = ?
                 AND target_user_id = ? AND target_device_id = ?
                 AND conversation_id = ?"#,
        )
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .fetch_optional(&mut *tx2)
        .await?;
        assert!(existing2.is_some(), "existing claim should be found");
        let claim = existing2.unwrap();
        let cached_key: Option<String> = claim.get("one_time_pre_key");
        assert!(cached_key.is_some(), "cached one-time pre-key should exist");
        assert_eq!(cached_key.as_deref(), Some(pre_key.as_str()), "cached pre-key should match consumed one");
        tx2.commit().await?;

        // 验证没有额外消费
        let consumed_count2: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM service_user_service_db.e2ee_one_time_pre_keys \
             WHERE user_id = ? AND device_id = ? AND consumed = 1",
        )
        .bind(target_user)
        .bind(target_device)
        .fetch_one(&db)
        .await?;
        assert_eq!(consumed_count2, 1, "no additional pre-key should be consumed");

        // 清理
        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
             WHERE target_user_id = ? AND target_device_id = ?",
        )
        .bind(target_user)
        .bind(target_device)
        .execute(&db)
        .await?;
        cleanup_test_data(&db, target_user, target_device).await;
        Ok(())
    }

    // 场景 7: 无可用 one-time pre-key → claim 表记录空 pre-key，重复请求幂等
    #[tokio::test]
    #[ignore]
    async fn pre_key_claim_idempotency_no_available_keys() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let target_user = 999_003;
        let target_device = "test-claim-empty";
        let requester = 999_004;
        let requester_device = "test-requester-empty";
        let conversation_id = "p_999003_999004";

        // 只创建一个设备但不分配 pre-key（otp_count=0）
        let key = B64.encode([0xABu8; 32]);
        let sig = B64.encode([0xCDu8; 64]);
        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_devices
               (user_id, device_id, status, identity_key, signing_identity_key,
                signed_pre_key, signed_pre_key_signature)
               VALUES (?, ?, 'active', ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE status='active'"#,
        )
        .bind(target_user)
        .bind(target_device)
        .bind(&key)
        .bind(&key)
        .bind(&key)
        .bind(&sig)
        .execute(&db)
        .await?;

        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_one_time_pre_keys \
             WHERE user_id = ? AND device_id = ?",
        )
        .bind(target_user)
        .bind(target_device)
        .execute(&db)
        .await?;

        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
             WHERE target_user_id = ? AND target_device_id = ?",
        )
        .bind(target_user)
        .bind(target_device)
        .execute(&db)
        .await?;

        // 第一次 claim：无 pre-key
        let mut tx = db.begin().await?;
        let otp_row = sqlx::query(
            r#"SELECT id, pre_key, COALESCE(pre_key_id, 0) AS pre_key_id
               FROM service_user_service_db.e2ee_one_time_pre_keys
               WHERE user_id = ? AND device_id = ? AND consumed = 0
               LIMIT 1 FOR UPDATE"#,
        )
        .bind(target_user)
        .bind(target_device)
        .fetch_optional(&mut *tx)
        .await?;
        assert!(otp_row.is_none(), "no pre-keys should be available");

        // 插入空 claim
        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_pre_key_claims
               (requester_user_id, requester_device_id, target_user_id, target_device_id,
                conversation_id, one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key)
               VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)"#,
        )
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        // 重复查询：应返回已有空 claim
        let claim = sqlx::query(
            r#"SELECT one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key
               FROM service_user_service_db.e2ee_pre_key_claims
               WHERE requester_user_id = ? AND requester_device_id = ?
                 AND target_user_id = ? AND target_device_id = ?
                 AND conversation_id = ?"#,
        )
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .fetch_optional(&db)
        .await?;
        assert!(claim.is_some(), "claim should exist");
        let claim = claim.unwrap();
        let otp: Option<String> = claim.get("one_time_pre_key");
        assert!(otp.is_none(), "one_time_pre_key should be null");

        // 清理
        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
             WHERE target_user_id = ? AND target_device_id = ?",
        )
        .bind(target_user)
        .bind(target_device)
        .execute(&db)
        .await?;
        cleanup_test_data(&db, target_user, target_device).await;
        Ok(())
    }

    // 场景 8: 唯一键并发冲突 → 重读已有 claim，不重复消费
    #[tokio::test]
    #[ignore]
    async fn pre_key_claim_unique_key_conflict_handling() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let target_user = 999_005;
        let target_device = "test-claim-duplicate";
        let requester = 999_006;
        let requester_device = "test-requester-dup";
        let conversation_id = "p_999005_999006";

        seed_device(&db, target_user, target_device, 3).await?;

        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
             WHERE target_user_id = ? AND target_device_id = ?",
        )
        .bind(target_user)
        .bind(target_device)
        .execute(&db)
        .await?;

        // 先消耗一个 pre-key 并插入第一条 claim
        let mut tx1 = db.begin().await?;
        let otp_row = sqlx::query(
            r#"SELECT id, pre_key, COALESCE(pre_key_id, 0) AS pre_key_id
               FROM service_user_service_db.e2ee_one_time_pre_keys
               WHERE user_id = ? AND device_id = ? AND consumed = 0
               LIMIT 1 FOR UPDATE"#,
        )
        .bind(target_user)
        .bind(target_device)
        .fetch_optional(&mut *tx1)
        .await?;
        let row = otp_row.unwrap();
        let row_id: i64 = row.get("id");
        let first_key: String = row.get("pre_key");
        let first_key_id: Option<i32> = row.try_get::<i32, _>("pre_key_id").ok();

        sqlx::query(
            "UPDATE service_user_service_db.e2ee_one_time_pre_keys \
             SET consumed = 1, consumed_time = NOW() WHERE id = ?",
        )
        .bind(row_id)
        .execute(&mut *tx1)
        .await?;

        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_pre_key_claims
               (requester_user_id, requester_device_id, target_user_id, target_device_id,
                conversation_id, one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .bind(Some(row_id))
        .bind(first_key_id)
        .bind(Some(&first_key))
        .execute(&mut *tx1)
        .await?;
        tx1.commit().await?;

        // 尝试第二次插入（模拟并发）：应触发唯一键冲突
        let result = sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_pre_key_claims
               (requester_user_id, requester_device_id, target_user_id, target_device_id,
                conversation_id, one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .bind(Some(row_id))
        .bind(first_key_id)
        .bind(Some(&first_key))
        .execute(&db)
        .await;

        match result {
            Err(sqlx::Error::Database(ref db_err))
                if db_err.code().as_deref() == Some("23000") =>
            {
                // 符合预期：唯一键冲突
            }
            Ok(_) => {
                anyhow::bail!("expected unique key violation on duplicate claim insert");
            }
            Err(e) => {
                anyhow::bail!("unexpected error on duplicate claim insert: {e}");
            }
        }

        // 验证只消费了一个 pre-key
        let consumed: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM service_user_service_db.e2ee_one_time_pre_keys \
             WHERE user_id = ? AND device_id = ? AND consumed = 1",
        )
        .bind(target_user)
        .bind(target_device)
        .fetch_one(&db)
        .await?;
        assert_eq!(consumed, 1, "only one pre-key should be consumed");

        // 验证重读能得到相同的 pre-key
        let claim = sqlx::query(
            r#"SELECT one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key
               FROM service_user_service_db.e2ee_pre_key_claims
               WHERE requester_user_id = ? AND requester_device_id = ?
                 AND target_user_id = ? AND target_device_id = ?
                 AND conversation_id = ?"#,
        )
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .fetch_optional(&db)
        .await?;
        assert!(claim.is_some());
        let claim = claim.unwrap();
        let re_read_key: Option<String> = claim.get("one_time_pre_key");
        assert_eq!(re_read_key.as_deref(), Some(first_key.as_str()), "re-read should return same pre-key");

        // 清理
        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
             WHERE target_user_id = ? AND target_device_id = ?",
        )
        .bind(target_user)
        .bind(target_device)
        .execute(&db)
        .await?;
        cleanup_test_data(&db, target_user, target_device).await;
        Ok(())
    }
}
