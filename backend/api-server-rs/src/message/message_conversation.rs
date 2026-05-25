use super::*;
use crate::error::AppError;
use crate::observability;
use im_rs_common::auth::Identity;
use im_rs_common::event::MessageDto;
use im_rs_common::keys;
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use sqlx::{MySqlPool, Row};
use std::collections::HashMap;
use std::time::Instant;

/// 查询当前用户的会话列表。
///
/// **鉴权要求**：通过 `identity` 参数传入已验证的调用者身份。
///
/// **业务流程**：
/// 1. 遍历所有私聊热 Redis 分片，读取用户会话索引（`ZREVRANGE` 前 100 条）
/// 2. 批量加载最后消息、未读计数、用户/群组元数据
/// 3. 从 MySQL 加载用户加入的群组会话作为补充
/// 4. 去重并按最后消息时间降序排序
///
/// **缓存策略**：热数据从 Redis 读取，缓存未命中时回退到 MySQL。
pub(crate) async fn conversations(
    private_redis_shards: &mut [ConnectionManager],
    group_redis_shards: &mut [ConnectionManager],
    db: &MySqlPool,
    identity: &Identity,
) -> Result<Vec<ConversationDto>, AppError> {
    let started = Instant::now();
    let mut hot_conversation_count = 0_usize;
    let mut all_conv_ids = Vec::new();
    for redis in private_redis_shards.iter_mut() {
        let conv_ids: Vec<String> = redis
            .zrevrange(keys::user_conversations_key(identity.user_id), 0, 99)
            .await
            .unwrap_or_default();
        hot_conversation_count = hot_conversation_count.saturating_add(conv_ids.len());
        for conversation_id in conv_ids {
            if !conversation_id.starts_with("g_") {
                all_conv_ids.push(conversation_id);
            }
        }
    }
    let mut result = Vec::new();
    if !all_conv_ids.is_empty() {
        let redis = private_redis_shards
            .get_mut(0)
            .ok_or_else(|| AppError::Upstream("private hot redis shard missing".to_string()))?;
        let last_messages = batch_load_last_messages(redis, &all_conv_ids).await;
        let unread_counts = batch_load_unread_counts(redis, identity.user_id, &all_conv_ids).await;
        let mut peer_ids = Vec::new();
        for message in last_messages.values() {
            if !message.is_group_chat {
                if let Some(peer_id) = extract_peer_id(identity.user_id, message) {
                    peer_ids.push(peer_id);
                }
            }
        }
        peer_ids.sort_unstable();
        peer_ids.dedup();
        let user_metadata = batch_load_user_metadata(db, &peer_ids).await?;
        for conversation_id in &all_conv_ids {
            let Some(message) = last_messages.get(conversation_id) else {
                continue;
            };
            let unread = unread_counts.get(conversation_id).copied().unwrap_or(0);
            if message.is_group_chat {
                let group_id = message
                    .group_id
                    .as_deref()
                    .and_then(|value| value.parse::<i64>().ok())
                    .unwrap_or_default();
                let group_metadata = batch_load_group_metadata(db, &[group_id]).await?;
                let (name, avatar) = group_metadata
                    .get(&group_id)
                    .cloned()
                    .unwrap_or((None, None));
                result.push(ConversationDto {
                    conversation_id: group_id.to_string(),
                    conversation_type: 2,
                    target_id: group_id.to_string(),
                    conversation_name: name.unwrap_or_else(|| group_id.to_string()),
                    conversation_avatar: avatar,
                    last_message: message.content.clone().unwrap_or_default(),
                    last_message_type: message.message_type.clone(),
                    last_message_sender_id: Some(message.sender_id.clone()),
                    last_message_sender_name: message.sender_name.clone(),
                    last_message_time: Some(message.created_time.clone()),
                    unread_count: unread,
                    is_online: false,
                    is_pinned: false,
                    is_muted: false,
                });
            } else {
                let Some(peer_id) = extract_peer_id(identity.user_id, message) else {
                    continue;
                };
                let (username, nickname, avatar) = user_metadata
                    .get(&peer_id)
                    .cloned()
                    .unwrap_or((None, None, None));
                result.push(ConversationDto {
                    conversation_id: peer_id.to_string(),
                    conversation_type: 1,
                    target_id: peer_id.to_string(),
                    conversation_name: nickname.or(username).unwrap_or_else(|| peer_id.to_string()),
                    conversation_avatar: avatar,
                    last_message: message.content.clone().unwrap_or_default(),
                    last_message_type: message.message_type.clone(),
                    last_message_sender_id: Some(message.sender_id.clone()),
                    last_message_sender_name: message.sender_name.clone(),
                    last_message_time: Some(message.created_time.clone()),
                    unread_count: unread,
                    is_online: false,
                    is_pinned: false,
                    is_muted: false,
                });
            }
        }
    }
    if result.is_empty() {
        observability::cache_fallback(
            "conversations",
            "empty_hot_conversations",
            None,
            hot_conversation_count,
            100,
        );
        result = load_private_conversations_from_db(db, identity.user_id).await?;
    }
    result.extend(load_group_conversations(group_redis_shards, db, identity.user_id).await?);
    dedup_conversations(&mut result);
    result.sort_by(|a, b| b.last_message_time.cmp(&a.last_message_time));
    tracing::debug!(
        target: "im_observe",
        kind = "conversations_query",
        elapsed_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX),
        private_count = result.iter().filter(|c| c.conversation_type == 1).count(),
        group_count = result.iter().filter(|c| c.conversation_type == 2).count(),
        "conversations query completed"
    );
    Ok(result)
}

pub(crate) async fn load_group_conversations(
    redis_shards: &mut [ConnectionManager],
    db: &MySqlPool,
    user_id: i64,
) -> Result<Vec<ConversationDto>, AppError> {
    let rows = observability::db_query(
        "conversations.user_groups",
        sqlx::query(
            r#"SELECT g.id, g.name, g.avatar
               FROM service_group_service_db.im_group g
               JOIN service_group_service_db.im_group_member m ON m.group_id = g.id
               WHERE m.user_id = ? AND m.status = 1 AND g.status = 1
               ORDER BY g.updated_time DESC"#,
        )
        .bind(user_id)
        .fetch_all(db),
    )
    .await?;
    let group_ids: Vec<i64> = rows.iter().map(|row| row.get::<i64, _>("id")).collect();
    let conversation_ids: Vec<String> = group_ids
        .iter()
        .map(|id| keys::group_conversation_id(*id))
        .collect();
    let redis = redis_shards
        .get_mut(0)
        .ok_or_else(|| AppError::Upstream("group hot redis shard missing".to_string()))?;
    let mut last_messages = batch_load_last_messages(redis, &conversation_ids).await;
    let missing_conv_ids: Vec<String> = conversation_ids
        .iter()
        .filter(|id| !last_messages.contains_key(*id))
        .cloned()
        .collect();
    if !missing_conv_ids.is_empty() {
        let db_messages = batch_load_last_messages_from_db(db, &missing_conv_ids).await?;
        last_messages.extend(db_messages);
    }
    let group_sequences = batch_load_group_sequences(redis, db, &group_ids).await?;
    let read_sequences = batch_load_group_read_sequences(redis, db, user_id, &group_ids).await?;
    let mut result = Vec::new();
    for row in &rows {
        let group_id: i64 = row.get("id");
        let conversation_id = keys::group_conversation_id(group_id);
        let Some(last) = last_messages.get(&conversation_id) else {
            continue;
        };
        let group_seq = group_sequences
            .get(&group_id)
            .copied()
            .unwrap_or(0)
            .max(last.conversation_seq.unwrap_or_default());
        let read_seq = read_sequences.get(&group_id).copied().unwrap_or(0);
        let name = row
            .try_get::<String, _>("name")
            .unwrap_or_else(|_| "group".to_string());
        let avatar = row.try_get::<Option<String>, _>("avatar").ok().flatten();
        result.push(group_conversation_from_message(
            GroupConversationSource {
                group_id,
                name,
                avatar,
            },
            last.clone(),
            group_unread_count(group_seq, read_seq),
        ));
    }
    Ok(result)
}

pub(crate) async fn batch_load_last_messages(
    redis: &mut ConnectionManager,
    conversation_ids: &[String],
) -> HashMap<String, MessageDto> {
    if conversation_ids.is_empty() {
        return HashMap::new();
    }
    let last_keys: Vec<String> = conversation_ids
        .iter()
        .map(|id| keys::conversation_last_key(id))
        .collect();
    let values: Vec<Option<String>> = redis.mget(&last_keys).await.unwrap_or_default();
    let mut result = HashMap::new();
    for (conv_id, value) in conversation_ids.iter().zip(values) {
        if let Some(raw) = value {
            if let Ok(message) = serde_json::from_str::<MessageDto>(&raw) {
                result.insert(conv_id.clone(), message);
            }
        }
    }
    result
}

pub(crate) async fn batch_load_unread_counts(
    redis: &mut ConnectionManager,
    user_id: i64,
    conversation_ids: &[String],
) -> HashMap<String, i64> {
    if conversation_ids.is_empty() {
        return HashMap::new();
    }
    let unread_key = keys::user_unread_key(user_id);
    let mut pipe = redis::pipe();
    for conv_id in conversation_ids {
        pipe.hget(&unread_key, conv_id);
    }
    let values: Vec<i64> = pipe.query_async(redis).await.unwrap_or_default();
    conversation_ids
        .iter()
        .zip(values)
        .map(|(id, count)| (id.clone(), count))
        .collect()
}

pub(crate) async fn batch_load_user_metadata(
    db: &MySqlPool,
    peer_ids: &[i64],
) -> Result<HashMap<i64, (Option<String>, Option<String>, Option<String>)>, AppError> {
    if peer_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let placeholders = peer_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT id, username, nickname, avatar FROM service_user_service_db.users WHERE id IN ({placeholders})"
    );
    let mut query = sqlx::query(&sql);
    for peer_id in peer_ids {
        query = query.bind(peer_id);
    }
    let rows = observability::db_query("batch_user_metadata", query.fetch_all(db)).await?;
    let mut result = HashMap::new();
    for row in rows {
        let id: i64 = row.get("id");
        let username: Option<String> = row.try_get("username").ok().flatten();
        let nickname: Option<String> = row.try_get("nickname").ok().flatten();
        let avatar: Option<String> = row.try_get("avatar").ok().flatten();
        result.insert(id, (username, nickname, avatar));
    }
    Ok(result)
}

pub(crate) async fn batch_load_group_metadata(
    db: &MySqlPool,
    group_ids: &[i64],
) -> Result<HashMap<i64, (Option<String>, Option<String>)>, AppError> {
    if group_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let placeholders = group_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT id, name, avatar FROM service_group_service_db.im_group WHERE id IN ({placeholders})"
    );
    let mut query = sqlx::query(&sql);
    for group_id in group_ids {
        query = query.bind(group_id);
    }
    let rows = observability::db_query("batch_group_metadata", query.fetch_all(db)).await?;
    let mut result = HashMap::new();
    for row in rows {
        let id: i64 = row.get("id");
        let name: Option<String> = row.try_get("name").ok().flatten();
        let avatar: Option<String> = row.try_get("avatar").ok().flatten();
        result.insert(id, (name, avatar));
    }
    Ok(result)
}

pub(crate) async fn batch_load_group_sequences(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    group_ids: &[i64],
) -> Result<HashMap<i64, i64>, AppError> {
    if group_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let seq_keys: Vec<String> = group_ids
        .iter()
        .map(|id| keys::group_sequence_key(*id))
        .collect();
    let values: Vec<Option<i64>> = redis.mget(&seq_keys).await.unwrap_or_default();
    let mut result = HashMap::new();
    let mut missing = Vec::new();
    for (group_id, value) in group_ids.iter().zip(values) {
        if let Some(seq) = value {
            result.insert(*group_id, seq.max(0));
        } else {
            missing.push(*group_id);
        }
    }
    if !missing.is_empty() {
        let placeholders = missing.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT group_id, COALESCE(MAX(conversation_seq), 0) AS max_seq \
             FROM service_message_service_db.messages \
             WHERE is_group_chat = 1 AND group_id IN ({placeholders}) AND status <> 5 \
             GROUP BY group_id"
        );
        let mut query = sqlx::query(&sql);
        for group_id in &missing {
            query = query.bind(group_id);
        }
        let rows = observability::db_query("batch_group_sequences", query.fetch_all(db)).await?;
        let mut pipe = redis::pipe();
        let mut has_pipe = false;
        for row in rows {
            let group_id: i64 = row.get("group_id");
            let seq: i64 = row.get("max_seq");
            if seq > 0 {
                result.insert(group_id, seq);
                pipe.set(keys::group_sequence_key(group_id), seq).ignore();
                has_pipe = true;
            }
        }
        if has_pipe {
            let _: redis::RedisResult<()> = pipe.query_async(redis).await;
        }
    }
    Ok(result)
}

pub(crate) async fn batch_load_group_read_sequences(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    user_id: i64,
    group_ids: &[i64],
) -> Result<HashMap<i64, i64>, AppError> {
    if group_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let read_keys: Vec<String> = group_ids
        .iter()
        .map(|id| keys::group_read_sequence_key(user_id, *id))
        .collect();
    let values: Vec<Option<i64>> = redis.mget(&read_keys).await.unwrap_or_default();
    let mut result = HashMap::new();
    let mut missing = Vec::new();
    for (group_id, value) in group_ids.iter().zip(values) {
        if let Some(seq) = value {
            result.insert(*group_id, seq.max(0));
        } else {
            missing.push(*group_id);
        }
    }
    if !missing.is_empty() {
        let placeholders = missing.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT group_id, COALESCE(MAX(last_read_seq), 0) AS max_seq \
             FROM service_message_service_db.group_read_cursor \
             WHERE user_id = ? AND group_id IN ({placeholders}) \
             GROUP BY group_id"
        );
        let mut query = sqlx::query(&sql).bind(user_id);
        for group_id in &missing {
            query = query.bind(group_id);
        }
        let rows =
            observability::db_query("batch_group_read_sequences", query.fetch_all(db)).await?;
        let mut pipe = redis::pipe();
        let mut has_pipe = false;
        for row in rows {
            let group_id: i64 = row.get("group_id");
            let seq: i64 = row.get("max_seq");
            if seq > 0 {
                result.insert(group_id, seq);
                pipe.set(keys::group_read_sequence_key(user_id, group_id), seq)
                    .ignore();
                has_pipe = true;
            }
        }
        if has_pipe {
            let _: redis::RedisResult<()> = pipe.query_async(redis).await;
        }
    }
    Ok(result)
}

pub(crate) async fn batch_load_last_messages_from_db(
    db: &MySqlPool,
    conversation_ids: &[String],
) -> Result<HashMap<String, MessageDto>, AppError> {
    if conversation_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let mut result = HashMap::new();
    for conversation_id in conversation_ids {
        let messages = load_history_from_db(
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
        if let Some(message) = messages.into_iter().next() {
            result.insert(conversation_id.clone(), message);
        }
    }
    Ok(result)
}

#[allow(dead_code)]
pub(crate) async fn conversation_from_message(
    db: &MySqlPool,
    user_id: i64,
    _conversation_id: &str,
    message: MessageDto,
    unread: i64,
) -> Result<Option<ConversationDto>, AppError> {
    if message.is_group_chat {
        let group_id = message
            .group_id
            .as_deref()
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or_default();
        let row = observability::db_query(
            "conversation.group_metadata",
            sqlx::query("SELECT name, avatar FROM service_group_service_db.im_group WHERE id = ?")
                .bind(group_id)
                .fetch_optional(db),
        )
        .await?;
        let name: Option<String> = row.as_ref().and_then(|row| row.try_get("name").ok());
        let avatar: Option<String> = row.as_ref().and_then(|row| row.try_get("avatar").ok());
        return Ok(Some(ConversationDto {
            conversation_id: group_id.to_string(),
            conversation_type: 2,
            target_id: group_id.to_string(),
            conversation_name: name.unwrap_or_else(|| group_id.to_string()),
            conversation_avatar: avatar,
            last_message: message.content.clone().unwrap_or_default(),
            last_message_type: message.message_type.clone(),
            last_message_sender_id: Some(message.sender_id.clone()),
            last_message_sender_name: message.sender_name.clone(),
            last_message_time: Some(message.created_time.clone()),
            unread_count: unread,
            is_online: false,
            is_pinned: false,
            is_muted: false,
        }));
    }
    let peer = if message.sender_id == user_id.to_string() {
        message.receiver_id.clone()
    } else {
        Some(message.sender_id.clone())
    };
    let Some(peer) = peer else { return Ok(None) };
    let peer_id = peer.parse::<i64>().unwrap_or_default();
    let row = observability::db_query(
        "conversation.user_metadata",
        sqlx::query(
            "SELECT username, nickname, avatar FROM service_user_service_db.users WHERE id = ?",
        )
        .bind(peer_id)
        .fetch_optional(db),
    )
    .await?;
    let username: Option<String> = row.as_ref().and_then(|row| row.try_get("username").ok());
    let nickname: Option<String> = row.as_ref().and_then(|row| row.try_get("nickname").ok());
    let avatar: Option<String> = row.as_ref().and_then(|row| row.try_get("avatar").ok());
    Ok(Some(ConversationDto {
        conversation_id: peer.clone(),
        conversation_type: 1,
        target_id: peer.clone(),
        conversation_name: nickname.or(username).unwrap_or(peer),
        conversation_avatar: avatar,
        last_message: message.content.clone().unwrap_or_default(),
        last_message_type: message.message_type.clone(),
        last_message_sender_id: Some(message.sender_id.clone()),
        last_message_sender_name: message.sender_name.clone(),
        last_message_time: Some(message.created_time.clone()),
        unread_count: unread,
        is_online: false,
        is_pinned: false,
        is_muted: false,
    }))
}

pub(crate) async fn load_private_conversations_from_db(
    db: &MySqlPool,
    user_id: i64,
) -> Result<Vec<ConversationDto>, AppError> {
    let rows = observability::db_query(
        "private_conversations.from_db",
        sqlx::query(
            r#"SELECT * FROM service_message_service_db.messages
           WHERE status <> 5 AND is_group_chat = 0 AND (sender_id = ? OR receiver_id = ?)
           ORDER BY id DESC LIMIT 300"#,
        )
        .bind(user_id)
        .bind(user_id)
        .fetch_all(db),
    )
    .await?;
    let mut seen = std::collections::HashSet::new();
    let mut messages = Vec::new();
    for row in rows {
        let message = message_from_row(&row);
        let conversation_id = conversation_id_from_message(&message)?;
        if seen.insert(conversation_id) {
            messages.push(message);
        }
    }
    let mut peer_ids: Vec<i64> = messages
        .iter()
        .filter_map(|m| extract_peer_id(user_id, m))
        .collect();
    peer_ids.sort_unstable();
    peer_ids.dedup();
    let user_metadata = batch_load_user_metadata(db, &peer_ids).await?;
    let mut result = Vec::new();
    for message in messages {
        let Some(peer_id) = extract_peer_id(user_id, &message) else {
            continue;
        };
        let (username, nickname, avatar) = user_metadata
            .get(&peer_id)
            .cloned()
            .unwrap_or((None, None, None));
        result.push(ConversationDto {
            conversation_id: peer_id.to_string(),
            conversation_type: 1,
            target_id: peer_id.to_string(),
            conversation_name: nickname.or(username).unwrap_or_else(|| peer_id.to_string()),
            conversation_avatar: avatar,
            last_message: message.content.clone().unwrap_or_default(),
            last_message_type: message.message_type.clone(),
            last_message_sender_id: Some(message.sender_id.clone()),
            last_message_sender_name: message.sender_name.clone(),
            last_message_time: Some(message.created_time.clone()),
            unread_count: 0,
            is_online: false,
            is_pinned: false,
            is_muted: false,
        });
    }
    Ok(result)
}

