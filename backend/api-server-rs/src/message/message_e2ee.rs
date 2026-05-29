use super::*;
use crate::error::AppError;
use im_rs_common::event::E2eeEnvelopeDto;
use sqlx::MySqlPool;

pub(crate) fn decode_base64url(value: &str) -> Result<Vec<u8>, AppError> {
    let normalized = value.replace('-', "+").replace('_', "/");
    let padded = match normalized.len() % 4 {
        0 => normalized,
        2 => format!("{normalized}=="),
        3 => format!("{normalized}="),
        _ => {
            return Err(AppError::BadRequest(
                "invalid e2ee envelope encoding".to_string(),
            ))
        }
    };
    base64::Engine::decode(&base64::engine::general_purpose::STANDARD, padded)
        .map_err(|_| AppError::BadRequest("invalid e2ee envelope encoding".to_string()))
}

/// 校验 E2EE envelope 的结构完整性、会话归属和设备归属。
///
/// 强制要求：
/// - envelope.session_id 必须等于当前会话的 conversation_id
/// - sender_device_id 必须属于发送方用户且处于 active 状态
/// - 私聊时 recipient device 必须属于接收方用户且处于 active 状态
pub(crate) fn validate_e2ee_envelope_format(envelope: &E2eeEnvelopeDto) -> Result<(), AppError> {
    if envelope.version != 2 || envelope.alg != "rust-x25519-x3dh-dr-v1" {
        return Err(AppError::BadRequest(
            "unsupported e2ee envelope, only rust-x25519-x3dh-dr-v1 is supported".to_string(),
        ));
    }
    let wire = envelope
        .wire
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("rust e2ee wire required".to_string()))?;
    let wire_bytes = decode_base64url(wire)
        .map_err(|_| AppError::BadRequest("invalid rust e2ee wire encoding".to_string()))?;
    if wire_bytes.len() < 56 {
        return Err(AppError::BadRequest("rust e2ee wire too short".to_string()));
    }
    let header_bytes = wire_bytes
        .get(0..4)
        .ok_or_else(|| AppError::BadRequest("invalid rust e2ee wire header".to_string()))?;
    let header_array: [u8; 4] = header_bytes
        .try_into()
        .map_err(|_| AppError::BadRequest("invalid rust e2ee wire header".to_string()))?;
    let header_len = usize::try_from(u32::from_be_bytes(header_array))
        .map_err(|_| AppError::BadRequest("invalid rust e2ee wire header".to_string()))?;
    if header_len != 52 {
        return Err(AppError::BadRequest(
            "invalid rust e2ee wire header".to_string(),
        ));
    }
    if envelope.sender_device_id.trim().is_empty() {
        return Err(AppError::BadRequest(
            "rust e2ee sender_device_id required".to_string(),
        ));
    }
    Ok(())
}

pub(crate) fn private_e2ee_envelope_from_request(
    request: &SendPrivateRequest,
) -> Result<&E2eeEnvelopeDto, AppError> {
    let envelope = request
        .e2ee_envelope
        .as_ref()
        .ok_or_else(|| AppError::BadRequest("e2ee envelope required".to_string()))?;
    if request.e2ee_header.is_some()
        || request.e2ee_sender_identity_key.is_some()
        || request.e2ee_ephemeral_key.is_some()
    {
        return Err(AppError::BadRequest(
            "legacy e2ee payload is unsupported".to_string(),
        ));
    }
    if request
        .content
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty())
    {
        return Err(AppError::BadRequest(
            "plaintext content forbidden in e2ee session".to_string(),
        ));
    }
    Ok(envelope)
}

pub(crate) async fn validate_e2ee_envelope(
    envelope: &E2eeEnvelopeDto,
    conversation_id: &str,
    sender_user_id: i64,
    receiver_user_id: Option<i64>,
    db: &MySqlPool,
) -> Result<(), AppError> {
    // Rust WASM E2EE: alg = "rust-x25519-x3dh-dr-v1", 加密数据在 wire 字段中
    validate_e2ee_envelope_format(envelope)?;

    // 校验 envelope.session_id 与 conversation_id 一致
    // 前端 sessionId 格式为 {idA}_{idB}，后端 conversation_id 格式为 p_{idA}_{idB}
    // 两种情况都应接受
    e2ee_session_id_matches(&envelope.session_id, conversation_id)?;

    // 校验 sender_device_id 属于发送方
    validate_device_ownership(db, &envelope.sender_device_id, sender_user_id)
        .await
        .map_err(|_| {
            AppError::BadRequest(format!(
                "e2ee sender device '{}' does not belong to user {} or is not active",
                envelope.sender_device_id, sender_user_id
            ))
        })?;

    // 私聊时校验 recipient device 必须属于 receiver_user_id 且 active。
    // 只有私钥持有者才能解密：任何不属于 receiver 的设备无法解密消息。
    // revoked/inactive 设备一律拒绝。
    if let Some(receiver_id) = receiver_user_id {
        let recipient_ids = resolve_recipient_device_ids(envelope);
        if recipient_ids.is_empty() {
            return Err(AppError::BadRequest(
                "e2ee recipient device id required for private chat".to_string(),
            ));
        }
        for device_id in &recipient_ids {
            validate_device_ownership(db, device_id, receiver_id)
                .await
                .map_err(|_| {
                    AppError::BadRequest(format!(
                        "e2ee recipient device '{}' does not belong to user {} or is not active",
                        device_id, receiver_id
                    ))
                })?;
        }
    }

    Ok(())
}

/// 校验 envelope.session_id 与 conversation_id 匹配。
///
/// 前后端统一使用 `{idA}_{idB}` 格式作为 session 标识。
/// 后端 conversation_id 带有 `p_` 前缀（由 keys::private_conversation_id 生成），
/// 比较时去掉前缀后必须与前端 session_id 一致。
pub(crate) fn e2ee_session_id_matches(
    session_id: &str,
    conversation_id: &str,
) -> Result<(), AppError> {
    if session_id.trim().is_empty() {
        return Err(AppError::BadRequest(
            "e2ee envelope session_id required".to_string(),
        ));
    }
    let normalized_conv = conversation_id
        .strip_prefix("p_")
        .unwrap_or(conversation_id);
    let normalized_session = session_id.strip_prefix("p_").unwrap_or(session_id);
    if normalized_session != normalized_conv {
        return Err(AppError::BadRequest(format!(
            "e2ee envelope session_id '{}' does not match conversation_id '{}'",
            session_id, conversation_id
        )));
    }
    Ok(())
}

/// 校验 device_id 存在且处于 active 状态（不检查 user_id 归属）。
/// 仅在 group 场景或额外防御层使用。私聊 recipient 校验必须走 validate_device_ownership。
pub(crate) async fn validate_device_active(
    db: &MySqlPool,
    device_id: &str,
) -> Result<(), AppError> {
    let trimmed = device_id.trim();
    if trimmed.is_empty() || trimmed == "unknown" {
        return Err(AppError::BadRequest("invalid device id".to_string()));
    }
    let count: Option<i64> = sqlx::query_scalar(
        "SELECT COUNT(*) FROM service_user_service_db.e2ee_devices \
         WHERE device_id = ? AND status = 'active'",
    )
    .bind(trimmed)
    .fetch_optional(db)
    .await?;
    if count.unwrap_or(0) == 0 {
        return Err(AppError::BadRequest(format!(
            "device '{}' not found or not active",
            trimmed
        )));
    }
    Ok(())
}

/// 校验 device_id 属于指定 user_id 且设备处于 active 状态。
/// 用于发送方 device 校验：必须确保发送方 device 真实属于该用户。
pub(crate) async fn validate_device_ownership(
    db: &MySqlPool,
    device_id: &str,
    user_id: i64,
) -> Result<(), AppError> {
    let trimmed = device_id.trim();
    if trimmed.is_empty() || trimmed == "unknown" {
        return Err(AppError::BadRequest("invalid device id".to_string()));
    }
    let count: Option<i64> = sqlx::query_scalar(
        "SELECT COUNT(*) FROM service_user_service_db.e2ee_devices \
         WHERE user_id = ? AND device_id = ? AND status = 'active'",
    )
    .bind(user_id)
    .bind(trimmed)
    .fetch_optional(db)
    .await?;
    if count.unwrap_or(0) == 0 {
        return Err(AppError::BadRequest(format!(
            "device '{}' not found or not active for user {}",
            trimmed, user_id
        )));
    }
    Ok(())
}

/// 从 v2 信封中解析接收方设备 ID 列表。
/// Rust E2EE 发送单个 `recipientDeviceId`，这里合并到 Vec 中供验证使用。
pub(crate) fn resolve_recipient_device_ids(envelope: &E2eeEnvelopeDto) -> Vec<String> {
    let mut ids = envelope.recipient_device_ids.clone();
    if ids.is_empty() {
        if let Some(ref id) = envelope.recipient_device_id {
            ids.push(id.clone());
        }
    }
    ids
}

/// 查询私聊是否已启用端到端加密。
///
/// 双读 e2ee_sessions（协商状态表）和 e2ee_conversation_sessions（会话元数据表），
/// 确保协商流程和消息发送使用一致的状态来源。
///
/// conversation_id 格式为 `p_{idA}_{idB}`（由 keys::private_conversation_id 生成）。
/// e2ee_sessions.session_id 可能为前端格式 `{idA}_{idB}` 或后端格式 `p_{idA}_{idB}`，
/// 因此需要双格式查询。
pub(crate) async fn private_e2ee_enabled(
    db: &MySqlPool,
    conversation_id: &str,
) -> Result<bool, AppError> {
    // 去掉 "p_" 前缀得到前端格式的 session_id
    let short_id = conversation_id
        .strip_prefix("p_")
        .unwrap_or(conversation_id);

    // 主查询：协商表（session_api.rs 的 accept_encryption 写入的状态）
    let negotiated: Option<String> = sqlx::query_scalar(
        "SELECT status FROM service_user_service_db.e2ee_sessions \
         WHERE (session_id = ? OR session_id = ?) AND status = 'encrypted' \
         LIMIT 1",
    )
    .bind(conversation_id)
    .bind(short_id)
    .fetch_optional(db)
    .await?;
    if negotiated.is_some() {
        return Ok(true);
    }
    // 次查询：会话元数据表（create_session 等 API 写入）
    let active: Option<i64> = sqlx::query_scalar(
        "SELECT COUNT(*) FROM service_user_service_db.e2ee_conversation_sessions \
         WHERE conversation_id = ? AND status = 'active'",
    )
    .bind(conversation_id)
    .fetch_optional(db)
    .await?;
    Ok(active.unwrap_or(0) > 0)
}

pub(crate) async fn group_e2ee_enabled(db: &MySqlPool, group_id: i64) -> Result<bool, AppError> {
    let enabled: Option<String> = sqlx::query_scalar(
        "SELECT status FROM service_user_service_db.e2ee_groups WHERE group_id = ?",
    )
    .bind(group_id)
    .fetch_optional(db)
    .await?;
    Ok(enabled.as_deref() == Some("encrypted"))
}

pub(crate) async fn validate_recipient_devices_not_revoked(
    db: &MySqlPool,
    device_ids: &[String],
) -> Result<(), AppError> {
    for device_id in device_ids {
        let trimmed = device_id.trim();
        if trimmed.is_empty() || trimmed == "unknown" {
            continue;
        }
        validate_device_active(db, trimmed)
            .await
            .map_err(|_| AppError::BadRequest("revoked e2ee recipient device".to_string()))?;
    }
    Ok(())
}
