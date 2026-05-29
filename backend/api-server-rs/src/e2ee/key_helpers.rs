use super::*;
use crate::error::AppError;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use im_rs_common::auth::Identity;
use sqlx::Row;
use std::collections::{HashMap, HashSet};

/// X25519 公钥的字节长度（Signal/X3DH 协议标准）。

/// Ed25519 签名的字节长度。
///
/// 当前协议约定使用 Ed25519 对 signed pre-key 进行签名，签名固定为 64 字节。
/// 如果未来支持其他签名算法（如 ECDSA P-256 的 64–72 字节可变长度），
/// 需要将此处替换为范围校验。

/// 解码 Base64 字符串并校验解码后的字节长度是否正好等于 `expected_len`。
///
/// 先做字符串长度上限检查（防止 DoS），再做 Base64 解码，最后校验字节长度。
/// 所有错误都映射为 `AppError::BadRequest("invalid {field}")`，不暴露内部细节。
pub(crate) fn decode_base64_exact_len(
    field: &str,
    value: &str,
    expected_len: usize,
) -> Result<(), AppError> {
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

pub(crate) fn validate_bundle(req: &UploadBundleRequest) -> Result<(), AppError> {
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

pub(crate) fn format_datetime(dt: chrono::NaiveDateTime) -> String {
    dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

pub(crate) fn parse_user_id(value: &str) -> Result<i64, AppError> {
    let user_id = value
        .parse::<i64>()
        .map_err(|_| AppError::BadRequest("invalid userId".to_string()))?;
    if user_id <= 0 {
        return Err(AppError::BadRequest("invalid userId".to_string()));
    }
    Ok(user_id)
}

pub(crate) fn target_user_id_from_query(
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

pub(crate) async fn fetch_user_devices(
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

/// 解析私聊 conversation_id，格式 `p_<id1>_<id2>` 或 `<id1>_<id2>`。
///
/// 返回两个参与者 user_id（无序）。若格式不匹配返回 `None`。
pub(crate) fn parse_private_conversation_members(conversation_id: &str) -> Option<(i64, i64)> {
    let raw = conversation_id
        .strip_prefix("p_")
        .unwrap_or(conversation_id);
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
pub(crate) async fn ensure_conversation_member(
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
pub(crate) async fn ensure_device_belongs_to_user(
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
