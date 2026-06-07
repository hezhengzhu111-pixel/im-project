use super::*;
use crate::error::AppError;
use crate::id_resolver::resolve_existing_message_id;
use crate::observability;
use im_common::auth::Identity;
use im_common::event::{ImEvent, ImEventType, MessageDto, MessageStatus, ReadReceipt};
use im_common::{keys, time};
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde_json;
use sqlx::MySqlPool;

/// 标记会话为已读。
///
/// **鉴权要求**：通过 `identity` 参数传入已验证的调用者身份。
///
/// **业务流程**：自动识别私聊/群聊会话，分别调用对应的已读处理逻辑。
/// 私聊会更新读游标并清除未读计数；群聊额外更新 `last_read_seq`。
/// 已读事件通过 `write_state_event` 写入待处理事件队列，由后台推送分发器异步投递。
pub(crate) async fn mark_read(
    cache_redis: &mut ConnectionManager,
    private_hot_redis: &mut ConnectionManager,
    group_hot_redis: &mut ConnectionManager,
    db: &MySqlPool,
    identity: &Identity,
    raw_conversation_id: &str,
) -> Result<(), AppError> {
    let mut target = parse_conversation_target(identity.user_id, raw_conversation_id)?;
    if let Some(group_id) = target.group_id {
        let group_id = cached_resolve_active_group_id(
            cache_redis,
            db,
            group_id,
            "mark_read.resolve_active_group",
        )
        .await?
        .ok_or_else(|| AppError::NotFound("group not found".to_string()))?;
        target.group_id = Some(group_id);
        target.conversation_id = keys::group_conversation_id(group_id);
        target.frontend_conversation_id = format!("group_{group_id}");
        mark_group_read(cache_redis, group_hot_redis, db, identity, target, group_id).await?;
    } else if let Some(peer_id) = target.peer_id {
        let peer_id = cached_resolve_active_user_id(
            cache_redis,
            db,
            peer_id,
            "mark_read.resolve_active_user",
        )
        .await?
        .ok_or_else(|| AppError::NotFound("user not found".to_string()))?;
        target.peer_id = Some(peer_id);
        target.conversation_id = keys::private_conversation_id(identity.user_id, peer_id);
        target.frontend_conversation_id =
            target.conversation_id.trim_start_matches("p_").to_string();
        mark_private_read(
            cache_redis,
            private_hot_redis,
            db,
            identity,
            target,
            peer_id,
        )
        .await?;
    }
    Ok(())
}

pub(crate) async fn mark_group_read(
    cache_redis: &mut ConnectionManager,
    hot_redis: &mut ConnectionManager,
    db: &MySqlPool,
    identity: &Identity,
    target: ConversationTarget,
    group_id: i64,
) -> Result<(), AppError> {
    validate_group_member(cache_redis, db, group_id, identity.user_id).await?;
    let last_read_message_id = latest_message_id(hot_redis, db, &target.conversation_id).await?;
    let last_read_seq = current_group_sequence(hot_redis, db, group_id).await?;
    let read_at = time::now_iso();
    let receipt = ReadReceipt {
        conversation_id: target.frontend_conversation_id.clone(),
        reader_id: identity.user_id.to_string(),
        to_user_id: None,
        read_at: read_at.clone(),
        last_read_message_id: last_read_message_id.map(|id| id.to_string()),
        last_read_seq: Some(last_read_seq),
    };
    let mut event = ImEvent::new(ImEventType::MessageRead, target.conversation_id.clone());
    event.group_id = Some(group_id.to_string());
    event.group = true;
    event.read_receipt = Some(receipt.clone());
    write_state_event(hot_redis, &target.conversation_id, &event).await?;
    hot_redis
        .set_ex::<_, _, ()>(
            keys::read_cursor_key(identity.user_id, &target.conversation_id),
            serde_json::to_string(&receipt)?,
            keys::CONVERSATION_TTL_SECONDS,
        )
        .await?;
    hot_redis
        .set::<_, _, ()>(
            keys::group_read_sequence_key(identity.user_id, group_id),
            last_read_seq,
        )
        .await?;
    Ok(())
}

pub(crate) async fn mark_private_read(
    cache_redis: &mut ConnectionManager,
    hot_redis: &mut ConnectionManager,
    db: &MySqlPool,
    identity: &Identity,
    target: ConversationTarget,
    peer_id: i64,
) -> Result<(), AppError> {
    validate_friend(cache_redis, db, identity.user_id, peer_id).await?;
    let last_read_message_id = latest_message_id(hot_redis, db, &target.conversation_id).await?;
    let read_at = time::now_iso();
    let receipt = ReadReceipt {
        conversation_id: target.frontend_conversation_id.clone(),
        reader_id: identity.user_id.to_string(),
        to_user_id: Some(peer_id.to_string()),
        read_at: read_at.clone(),
        last_read_message_id: last_read_message_id.map(|id| id.to_string()),
        last_read_seq: None,
    };
    let mut event = ImEvent::new(ImEventType::MessageRead, target.conversation_id.clone());
    event.target_user_id = Some(peer_id.to_string());
    event.read_receipt = Some(receipt.clone());
    write_state_event(hot_redis, &target.conversation_id, &event).await?;
    hot_redis
        .set_ex::<_, _, ()>(
            keys::read_cursor_key(identity.user_id, &target.conversation_id),
            serde_json::to_string(&receipt)?,
            keys::CONVERSATION_TTL_SECONDS,
        )
        .await?;
    hot_redis
        .hset::<_, _, _, ()>(
            keys::user_unread_key(identity.user_id),
            &target.conversation_id,
            0_i64,
        )
        .await?;
    Ok(())
}

/// 撤回或删除消息。
///
/// **鉴权要求**：仅消息发送者可以操作，否则返回 403。
///
/// **安全约束**：撤回操作（`MessageStatus::Recalled`）限制在消息发送后 2 分钟内。
/// 删除操作（`MessageStatus::Deleted`）无时间限制。
///
/// **业务流程**：从所有热 Redis 分片中查找消息（缓存未命中时回退到 MySQL），
/// 更新消息状态并写入状态变更事件到待处理队列。
pub(crate) async fn recall_or_delete(
    private_redis_shards: &mut [ConnectionManager],
    group_redis_shards: &mut [ConnectionManager],
    db: &MySqlPool,
    identity: &Identity,
    message_id: i64,
    status: MessageStatus,
) -> Result<MessageDto, AppError> {
    let message_id = resolve_existing_message_id(db, message_id)
        .await?
        .unwrap_or(message_id);
    let message =
        load_message_from_all_hot(private_redis_shards, group_redis_shards, db, message_id).await?;
    if message.is_group_chat {
        let group_id = message
            .group_id
            .as_deref()
            .ok_or_else(|| AppError::BadRequest("message groupId missing".to_string()))?
            .parse::<i64>()
            .map_err(|_| AppError::BadRequest("invalid groupId".to_string()))?;
        let index = shard_index_for_group_id(group_id, group_redis_shards.len())
            .ok_or_else(|| AppError::Upstream("group hot redis shard missing".to_string()))?;
        let Some(redis) = group_redis_shards.get_mut(index) else {
            return Err(AppError::Upstream(
                "group hot redis shard missing".to_string(),
            ));
        };
        apply_message_status(redis, identity, message, status).await
    } else {
        let conversation_id = conversation_id_from_message(&message)?;
        let index = shard_index_for_key(&conversation_id, private_redis_shards.len())
            .ok_or_else(|| AppError::Upstream("private hot redis shard missing".to_string()))?;
        let Some(redis) = private_redis_shards.get_mut(index) else {
            return Err(AppError::Upstream(
                "private hot redis shard missing".to_string(),
            ));
        };
        apply_message_status(redis, identity, message, status).await
    }
}

pub(crate) async fn apply_message_status(
    redis: &mut ConnectionManager,
    identity: &Identity,
    mut message: MessageDto,
    status: MessageStatus,
) -> Result<MessageDto, AppError> {
    let message_id = message
        .id
        .parse::<i64>()
        .map_err(|_| AppError::BadRequest("invalid message id".to_string()))?;
    if message.sender_id != identity.user_id.to_string() {
        return Err(AppError::Forbidden(
            "only sender can change message status".to_string(),
        ));
    }
    if status == MessageStatus::Recalled && !within_recall_window(&message) {
        return Err(AppError::BadRequest(
            "only messages within 2 minutes can be recalled".to_string(),
        ));
    }
    message.status = status.as_str().to_string();
    message.updated_time = Some(time::now_iso());
    message.updated_at = message.updated_time.clone();
    let conversation_id = conversation_id_from_message(&message)?;
    let mut event = ImEvent::new(
        if status == MessageStatus::Recalled {
            ImEventType::MessageRecalled
        } else {
            ImEventType::MessageDeleted
        },
        conversation_id.clone(),
    );
    event.message_id = Some(message.id.clone());
    event.sender_id = Some(message.sender_id.clone());
    event.receiver_id = message.receiver_id.clone();
    event.group_id = message.group_id.clone();
    event.group = message.is_group_chat;
    event.new_status = Some(message.status.clone());
    event.payload = Some(message.clone());
    let message_json = serde_json::to_string(&message)?;
    redis
        .set_ex::<_, _, ()>(
            keys::message_key(message_id),
            message_json.clone(),
            keys::MESSAGE_TTL_SECONDS,
        )
        .await?;
    let last: Option<String> = redis
        .get(keys::conversation_last_key(&conversation_id))
        .await
        .ok()
        .flatten();
    if last
        .as_deref()
        .and_then(|value| serde_json::from_str::<MessageDto>(value).ok())
        .is_some_and(|last_message| last_message.id == message.id)
    {
        redis
            .set_ex::<_, _, ()>(
                keys::conversation_last_key(&conversation_id),
                message_json,
                keys::CONVERSATION_TTL_SECONDS,
            )
            .await?;
    }
    write_state_event(redis, &conversation_id, &event).await?;
    Ok(message)
}

/// 查询私聊历史消息。
///
/// **鉴权要求**：需要有效的身份，且与对方存在好友关系。
///
/// **返回**：按消息 ID 降序排列的消息列表（最新在前），已删除的消息自动过滤。
pub(crate) async fn private_history(
    cache_redis: &mut ConnectionManager,
    hot_redis: &mut ConnectionManager,
    db: &MySqlPool,
    identity: &Identity,
    peer_id: i64,
    query: HistoryQuery,
) -> Result<Vec<MessageDto>, AppError> {
    let peer_id = cached_resolve_active_user_id(
        cache_redis,
        db,
        peer_id,
        "private_history.resolve_active_user",
    )
    .await?
    .ok_or_else(|| AppError::NotFound("user not found".to_string()))?;
    validate_friend(cache_redis, db, identity.user_id, peer_id).await?;
    let conversation_id = keys::private_conversation_id(identity.user_id, peer_id);
    load_history(hot_redis, db, &conversation_id, query).await
}

/// 查询群聊历史消息。
///
/// **鉴权要求**：需要有效的身份，且为群组有效成员。
///
/// **返回**：按消息 ID 降序排列的消息列表，已删除的消息自动过滤。
pub(crate) async fn group_history(
    cache_redis: &mut ConnectionManager,
    hot_redis: &mut ConnectionManager,
    db: &MySqlPool,
    identity: &Identity,
    group_id: i64,
    query: HistoryQuery,
) -> Result<Vec<MessageDto>, AppError> {
    let group_id = cached_resolve_active_group_id(
        cache_redis,
        db,
        group_id,
        "group_history.resolve_active_group",
    )
    .await?
    .ok_or_else(|| AppError::NotFound("group not found".to_string()))?;
    validate_group_member(cache_redis, db, group_id, identity.user_id).await?;
    let conversation_id = keys::group_conversation_id(group_id);
    load_history(hot_redis, db, &conversation_id, query).await
}

pub(crate) async fn load_message(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    message_id: i64,
) -> Result<MessageDto, AppError> {
    if let Some(message) = load_hot_message(redis, message_id).await? {
        return Ok(message);
    }
    observability::cache_fallback("load_message", "message_cache_miss", None, 0, 1);
    load_message_from_db(db, message_id).await
}

pub(crate) async fn load_message_from_all_hot(
    private_redis_shards: &mut [ConnectionManager],
    group_redis_shards: &mut [ConnectionManager],
    db: &MySqlPool,
    message_id: i64,
) -> Result<MessageDto, AppError> {
    for redis in private_redis_shards.iter_mut() {
        if let Some(message) = load_hot_message(redis, message_id).await? {
            return Ok(message);
        }
    }
    for redis in group_redis_shards.iter_mut() {
        if let Some(message) = load_hot_message(redis, message_id).await? {
            return Ok(message);
        }
    }
    observability::cache_fallback("load_message", "message_cache_miss", None, 0, 1);
    load_message_from_db(db, message_id).await
}

pub(crate) async fn load_hot_message(
    redis: &mut ConnectionManager,
    message_id: i64,
) -> Result<Option<MessageDto>, AppError> {
    let raw = redis
        .get::<_, Option<String>>(keys::message_key(message_id))
        .await
        .ok()
        .flatten();
    match raw {
        Some(raw) => Ok(Some(serde_json::from_str(&raw)?)),
        None => Ok(None),
    }
}

pub(crate) async fn load_message_from_db(
    db: &MySqlPool,
    message_id: i64,
) -> Result<MessageDto, AppError> {
    let row = observability::db_query(
        "load_message.by_id",
        sqlx::query(
        r#"SELECT id, sender_id, receiver_id, group_id, conversation_seq, client_message_id, message_type, content,
                  media_url, media_size, media_name, thumbnail_url, duration, location_info,
                  encrypted, e2ee_header, e2ee_device_id, e2ee_sender_identity_key, e2ee_ephemeral_key, e2ee_envelope_json,
                  status, is_group_chat, reply_to_message_id, created_time, updated_time
           FROM service_message_service_db.messages WHERE id = ?"#,
        )
        .bind(message_id)
        .fetch_optional(db),
    )
    .await?;
    let Some(row) = row else {
        return Err(AppError::NotFound("message not found".to_string()));
    };
    Ok(message_from_row(&row))
}

#[allow(dead_code)]
pub(crate) async fn load_last_message(
    redis: &mut ConnectionManager,
    conversation_id: &str,
) -> Option<MessageDto> {
    redis
        .get::<_, Option<String>>(keys::conversation_last_key(conversation_id))
        .await
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str::<MessageDto>(&raw).ok())
}

pub(crate) async fn load_history(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    conversation_id: &str,
    query: HistoryQuery,
) -> Result<Vec<MessageDto>, AppError> {
    let limit = query.limit.or(query.size).unwrap_or(20).clamp(1, 100);
    let limit_usize = usize::try_from(limit)
        .map_err(|_| AppError::BadRequest("invalid history limit".to_string()))?;
    let hot_ids: Vec<String> = redis
        .zrevrange(keys::conversation_messages_key(conversation_id), 0, 499)
        .await
        .unwrap_or_default();
    let mut messages = Vec::new();
    for id in hot_ids {
        let Ok(message_id) = id.parse::<i64>() else {
            continue;
        };
        let message = match load_message(redis, db, message_id).await {
            Ok(message) => message,
            Err(_) => continue,
        };
        if message.status == MessageStatus::Deleted.as_str() {
            continue;
        }
        if let Some(after) = query.after_message_id {
            if message_id <= after {
                continue;
            }
        }
        if let Some(before) = query.last_message_id {
            if message_id >= before {
                continue;
            }
        }
        messages.push(message);
        if messages.len() >= limit_usize {
            break;
        }
    }
    if messages.len() < limit_usize {
        observability::cache_fallback(
            "history",
            "insufficient_hot_messages",
            Some(conversation_id),
            messages.len(),
            limit_usize,
        );
        let db_limit = limit_usize
            .checked_add(messages.len())
            .ok_or_else(|| AppError::BadRequest("history limit overflow".to_string()))?;
        messages.extend(load_history_from_db(db, conversation_id, &query, db_limit).await?);
    }
    messages.sort_by(|a, b| {
        let aid = a.id.parse::<i64>().unwrap_or(0);
        let bid = b.id.parse::<i64>().unwrap_or(0);
        bid.cmp(&aid)
    });
    messages.dedup_by(|a, b| a.id == b.id);
    messages.truncate(limit_usize);
    Ok(messages)
}

pub(crate) async fn load_history_from_db(
    db: &MySqlPool,
    conversation_id: &str,
    query: &HistoryQuery,
    limit: usize,
) -> Result<Vec<MessageDto>, AppError> {
    let scope = parse_db_scope(conversation_id)?;
    let mut sql = String::from(
        "SELECT id, sender_id, receiver_id, group_id, conversation_seq, client_message_id, message_type, content, \
         media_url, media_size, media_name, thumbnail_url, duration, location_info, encrypted, e2ee_header, \
         e2ee_device_id, e2ee_sender_identity_key, e2ee_ephemeral_key, e2ee_envelope_json, status, \
         is_group_chat, reply_to_message_id, created_time, updated_time \
         FROM service_message_service_db.messages WHERE status <> 5 AND ",
    );
    if let Some(group_id) = scope.group_id {
        sql.push_str("is_group_chat = 1 AND group_id = ");
        sql.push_str(&group_id.to_string());
    } else {
        sql.push_str("is_group_chat = 0 AND ((sender_id = ");
        sql.push_str(&scope.left_id.to_string());
        sql.push_str(" AND receiver_id = ");
        sql.push_str(&scope.right_id.to_string());
        sql.push_str(") OR (sender_id = ");
        sql.push_str(&scope.right_id.to_string());
        sql.push_str(" AND receiver_id = ");
        sql.push_str(&scope.left_id.to_string());
        sql.push_str("))");
    }
    if let Some(after) = query.after_message_id {
        sql.push_str(" AND id > ");
        sql.push_str(&after.to_string());
        sql.push_str(" ORDER BY id ASC");
    } else {
        if let Some(before) = query.last_message_id {
            sql.push_str(" AND id < ");
            sql.push_str(&before.to_string());
        }
        sql.push_str(" ORDER BY id DESC");
    }
    sql.push_str(" LIMIT ");
    sql.push_str(&limit.max(1).to_string());
    let rows = observability::db_query("history.from_db", sqlx::query(&sql).fetch_all(db)).await?;
    Ok(rows.iter().map(message_from_row).collect())
}

pub(crate) async fn latest_message_id(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    conversation_id: &str,
) -> Result<Option<i64>, AppError> {
    let ids: Vec<String> = redis
        .zrevrange(keys::conversation_messages_key(conversation_id), 0, 0)
        .await
        .unwrap_or_default();
    if let Some(id) = ids.first().and_then(|value| value.parse::<i64>().ok()) {
        return Ok(Some(id));
    }
    observability::cache_fallback(
        "latest_message_id",
        "empty_hot_conversation",
        Some(conversation_id),
        0,
        1,
    );
    let history = load_history_from_db(
        db,
        conversation_id,
        &HistoryQuery {
            size: None,
            limit: Some(1),
            last_message_id: None,
            after_message_id: None,
        },
        1,
    )
    .await?;
    Ok(history
        .first()
        .and_then(|message| message.id.parse::<i64>().ok()))
}
