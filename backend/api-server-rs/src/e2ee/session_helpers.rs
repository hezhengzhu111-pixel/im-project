use super::*;
use crate::auth_api;
use crate::error::AppError;
use crate::route::parse_user_routes;
use crate::web::AppState;
use redis::AsyncCommands;
use sqlx::Row;
use std::collections::{HashMap, HashSet};

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

#[allow(dead_code)]
const MAX_SESSION_ID_LEN: usize = 64;
#[allow(dead_code)]
const MAX_KEY_FIELD_LEN: usize = 1000;
#[allow(dead_code)]
const MAX_PAYLOAD_LEN: usize = 50_000;

// ---------------------------------------------------------------------------
// 请求类型
// ---------------------------------------------------------------------------

/// E2EE 会话协商请求体。

/// 解析 session_id（格式 `{id_a}_{id_b}`）为两个用户 ID。
pub(crate) fn parse_session_partners(session_id: &str) -> Result<(i64, i64), AppError> {
    let Some(normalized) = session_id.strip_prefix("p_") else {
        return Err(AppError::BadRequest(
            "session_id must be in format 'p_{id_a}_{id_b}'".to_string(),
        ));
    };
    let parts: Vec<&str> = normalized.split('_').collect();
    if parts.len() != 2 {
        return Err(AppError::BadRequest(
            "session_id must be in format 'p_{id_a}_{id_b}'".to_string(),
        ));
    }
    let Some(id_a_raw) = parts.first() else {
        return Err(AppError::BadRequest(
            "session_id must include left user id".to_string(),
        ));
    };
    let Some(id_b_raw) = parts.get(1) else {
        return Err(AppError::BadRequest(
            "session_id must include right user id".to_string(),
        ));
    };
    let id_a: i64 = id_a_raw
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user id in session_id".to_string()))?;
    let id_b: i64 = id_b_raw
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user id in session_id".to_string()))?;
    if id_a == id_b {
        return Err(AppError::BadRequest(
            "session_id must reference two different users".to_string(),
        ));
    }
    Ok((id_a, id_b))
}

/// 验证双向好友关系是否存在且正常（status=1）。
///
/// 查询 im_friend 表，双向均需存在正常好友关系。
/// 若任一方把对方拉黑（status=3）或删除（status=2），均视为不合法。
pub(crate) async fn ensure_friendship_exists(
    db: &sqlx::MySqlPool,
    user_id: i64,
    peer_user_id: i64,
) -> Result<(), AppError> {
    let count: Option<i64> = sqlx::query_scalar(
        "SELECT COUNT(*) FROM service_user_service_db.im_friend \
         WHERE status = 1 \
           AND ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))",
    )
    .bind(user_id)
    .bind(peer_user_id)
    .bind(peer_user_id)
    .bind(user_id)
    .fetch_optional(db)
    .await?;

    if count.unwrap_or(0) >= 2 {
        return Ok(());
    }
    Err(AppError::Forbidden(
        "not a friend or private conversation does not exist".to_string(),
    ))
}

/// 验证调用者是 E2EE 会话的合法参与者。
///
/// 1. 解析 session_id 确认调用者是其中之一
/// 2. 验证双方存在真实好友关系（通过 im_friend 表）
///
/// 返回对方的 user_id。
pub(crate) async fn ensure_e2ee_session_participant(
    db: &sqlx::MySqlPool,
    caller_user_id: i64,
    session_id: &str,
) -> Result<i64, AppError> {
    let (id_a, id_b) = parse_session_partners(session_id)?;
    if caller_user_id != id_a && caller_user_id != id_b {
        return Err(AppError::Forbidden("not a session participant".to_string()));
    }
    let peer_user_id = if caller_user_id == id_a { id_b } else { id_a };
    ensure_friendship_exists(db, caller_user_id, peer_user_id).await?;
    Ok(peer_user_id)
}

/// 从 e2ee_sessions 表加载当前协商状态。
///
/// 返回 (status, requester_id, target_user_id, state_version, updated_time)，
/// 若记录不存在返回 None。
pub(crate) async fn load_negotiation_state(
    db: &sqlx::MySqlPool,
    session_id: &str,
) -> Result<Option<(String, i64, i64, i32, chrono::NaiveDateTime)>, AppError> {
    let row = sqlx::query(
        "SELECT status, requester_id, target_user_id, \
                COALESCE(state_version, 1) AS state_version, \
                updated_time \
         FROM service_user_service_db.e2ee_sessions \
         WHERE session_id = ?",
    )
    .bind(session_id)
    .fetch_optional(db)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    let status: String = row.get("status");
    let requester_id: i64 = row.get("requester_id");
    let target_user_id: i64 = row.get("target_user_id");
    let state_version: i32 = row.get("state_version");
    let updated_time: chrono::NaiveDateTime = row.get("updated_time");

    Ok(Some((
        status,
        requester_id,
        target_user_id,
        state_version,
        updated_time,
    )))
}

pub(crate) async fn resolve_user_display_name(
    state: &AppState,
    user_id: i64,
) -> Result<Option<String>, AppError> {
    let row = sqlx::query(
        "SELECT COALESCE(NULLIF(nickname, ''), username) AS display_name \
         FROM service_user_service_db.users WHERE id = ?",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;
    Ok(row.map(|item| item.get::<String, _>("display_name")))
}

pub(crate) async fn push_negotiation_event(
    state: &AppState,
    user_id: i64,
    payload: &E2eeNegotiationPush,
) -> Result<(), AppError> {
    let mut redis = state.route_redis_manager.clone();
    let raw: Option<Vec<u8>> = redis
        .hget(&state.config.route_users_key, user_id.to_string())
        .await?;
    let routes = parse_user_routes(raw.as_deref(), &state.config);
    if routes.is_empty() {
        return Ok(());
    }

    let path = "/api/im/internal/push/batch";
    let body = serde_json::to_vec(&InternalPushBatchRequest {
        user_ids: vec![user_id],
        kind: "E2EE_NEGOTIATION".to_string(),
        data: serde_json::to_value(payload)?,
    })?;

    for route in routes {
        let response = state
            .http
            .post(format!(
                "{}{}",
                route.internal_http_url.trim_end_matches('/'),
                path
            ))
            .headers(auth_api::internal_signature_headers(
                "POST",
                path,
                &body,
                &state.config,
            )?)
            .header("Content-Type", "application/json")
            .body(body.clone())
            .send()
            .await?;
        if !response.status().is_success() {
            tracing::warn!(
                status = %response.status(),
                user_id = %user_id,
                "im-server rejected e2ee negotiation push"
            );
        }
    }

    Ok(())
}

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

/// 批量查询 device_id → user_id 映射，仅返回 status='active' 的设备。
/// 若任意 device_id 不存在或非 active，返回 BadRequest。
pub(crate) async fn fetch_device_owners(
    db: &sqlx::MySqlPool,
    device_ids: &[String],
) -> Result<HashMap<String, i64>, AppError> {
    if device_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let placeholders: String = device_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT device_id, user_id FROM service_user_service_db.e2ee_devices \
         WHERE device_id IN ({placeholders}) AND status = 'active'"
    );
    let mut query = sqlx::query(&sql);
    for did in device_ids {
        query = query.bind(did);
    }
    let rows = query.fetch_all(db).await?;
    if rows.len() != device_ids.len() {
        let found: HashSet<&str> = rows.iter().map(|r| r.get::<&str, _>("device_id")).collect();
        let missing: Vec<&str> = device_ids
            .iter()
            .map(|s| s.as_str())
            .filter(|did| !found.contains(did))
            .collect();
        return Err(AppError::BadRequest(format!(
            "devices not found or not active: {}",
            missing.join(", ")
        )));
    }
    let owners: HashMap<String, i64> = rows
        .iter()
        .map(|r| (r.get("device_id"), r.get("user_id")))
        .collect();
    Ok(owners)
}

/// 校验 sender_device_id 属于当前登录用户且处于 active 状态。
pub(crate) async fn ensure_sender_device_belongs_to_user(
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
            "sender device does not belong to current user".to_string(),
        ));
    }
    Ok(())
}

/// 查询群组内所有有效成员的用户 ID。
pub(crate) async fn fetch_group_member_ids(
    db: &sqlx::MySqlPool,
    group_id: i64,
) -> Result<Vec<i64>, AppError> {
    let members = sqlx::query_scalar::<_, i64>(
        "SELECT user_id FROM service_group_service_db.im_group_member \
         WHERE group_id = ? AND status = 1",
    )
    .bind(group_id)
    .fetch_all(db)
    .await?;
    Ok(members)
}

/// 将 Vec<String> 解析为 Vec<i64>，跳过空字符串。
pub(crate) fn parse_user_ids(raw: &[String]) -> Result<Vec<i64>, AppError> {
    let mut ids = Vec::with_capacity(raw.len());
    for s in raw {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            continue;
        }
        let id: i64 = trimmed
            .parse()
            .map_err(|_| AppError::BadRequest(format!("invalid userId: {trimmed}")))?;
        ids.push(id);
    }
    Ok(ids)
}

/// 核心授权校验：确保所有 recipient_device_ids 都属于合法的会话成员。
///
/// - 私聊：recipient 设备必须全部属于另一方用户，不能属于当前用户或第三方。
/// - 群聊：recipient 设备必须全部属于群成员。
/// - 若 recipient_user_ids 非空，校验其均为合法成员且与 device 归属一致。
pub(crate) async fn ensure_recipient_devices_authorized(
    db: &sqlx::MySqlPool,
    conversation_id: &str,
    caller_user_id: i64,
    recipient_user_ids: &[String],
    device_owners: &HashMap<String, i64>,
) -> Result<(), AppError> {
    let parsed_recipient_user_ids = parse_user_ids(recipient_user_ids)?;

    if let Some((left, right)) = parse_private_conversation_members(conversation_id) {
        let other_user_id = if caller_user_id == left { right } else { left };

        // 校验 recipient_user_ids 只能包含另一方
        for uid in &parsed_recipient_user_ids {
            if *uid != other_user_id {
                return Err(AppError::Forbidden(format!(
                    "user {uid} is not a member of this private conversation"
                )));
            }
        }

        // 校验 recipient 设备归属
        for (device_id, owner_user_id) in device_owners {
            if *owner_user_id != other_user_id {
                if *owner_user_id == caller_user_id {
                    return Err(AppError::Forbidden(format!(
                        "cannot add own device {device_id} as recipient in private conversation"
                    )));
                }
                return Err(AppError::Forbidden(format!(
                    "device {device_id} belongs to user {owner_user_id} who is not a conversation member"
                )));
            }
        }

        // recipient_user_ids 与 device 归属一致性校验
        if !parsed_recipient_user_ids.is_empty() {
            let recipient_set: HashSet<i64> = parsed_recipient_user_ids.iter().copied().collect();
            for (device_id, owner_user_id) in device_owners {
                if !recipient_set.contains(owner_user_id) {
                    return Err(AppError::Forbidden(format!(
                        "device {device_id} belongs to user {owner_user_id} which is not in recipientUserIds"
                    )));
                }
            }
        }
    } else if let Some(group_id_raw) = conversation_id.strip_prefix("g_") {
        let group_id: i64 = group_id_raw
            .parse()
            .map_err(|_| AppError::BadRequest("invalid conversationId".to_string()))?;

        let group_members = fetch_group_member_ids(db, group_id).await?;
        let member_set: HashSet<i64> = group_members.iter().copied().collect();

        // 校验 recipient_user_ids 均为群成员
        for uid in &parsed_recipient_user_ids {
            if !member_set.contains(uid) {
                return Err(AppError::Forbidden(format!(
                    "user {uid} is not a member of group {group_id}"
                )));
            }
        }

        // 校验 recipient 设备归属
        for (device_id, owner_user_id) in device_owners {
            if !member_set.contains(owner_user_id) {
                return Err(AppError::Forbidden(format!(
                    "device {device_id} belongs to user {owner_user_id} who is not a member of group {group_id}"
                )));
            }
        }

        // recipient_user_ids 与 device 归属一致性校验
        if !parsed_recipient_user_ids.is_empty() {
            let recipient_set: HashSet<i64> = parsed_recipient_user_ids.iter().copied().collect();
            for (device_id, owner_user_id) in device_owners {
                if !recipient_set.contains(owner_user_id) {
                    return Err(AppError::Forbidden(format!(
                        "device {device_id} belongs to user {owner_user_id} which is not in recipientUserIds"
                    )));
                }
            }
        }
    } else {
        return Err(AppError::BadRequest("invalid conversationId".to_string()));
    }

    Ok(())
}

pub(crate) fn row_to_metadata(row: sqlx::mysql::MySqlRow) -> E2eeSessionMetadataDto {
    let recipient_json: String = row.get("recipient_device_ids_json");
    let recipient_device_ids = serde_json::from_str(&recipient_json).unwrap_or_else(|_| Vec::new());
    E2eeSessionMetadataDto {
        conversation_id: row.get("conversation_id"),
        session_id: row.get("session_id"),
        key_id: row.get("key_id"),
        key_version: row.get("key_version"),
        epoch: row.get("epoch"),
        sender_device_id: row.get("sender_device_id"),
        recipient_device_ids,
        status: row.get("status"),
        needs_rotation: row.get::<i8, _>("needs_rotation") != 0,
    }
}
