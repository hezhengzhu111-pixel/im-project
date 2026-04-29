use crate::config::AppConfig;
use crate::error::AppError;
use crate::id_resolver::{
    resolve_active_group_id, resolve_active_user_id, resolve_existing_message_id,
};
use crate::local_cache;
use crate::observability;
use chrono::{DateTime, Utc};
use im_rs_common::auth::Identity;
use im_rs_common::event::{
    ImEvent, ImEventType, MessageDto, MessageStatus, MessageType, ReadReceipt,
};
use im_rs_common::{ids, keys, time};
use redis::aio::ConnectionManager;
use redis::{AsyncCommands, Script};
use serde::{de, Deserialize, Deserializer, Serialize};
use sqlx::{MySqlPool, Row};

const VALIDATION_CACHE_TTL_SECONDS: u64 = 5 * 60;
const VALIDATION_NEGATIVE_CACHE_TTL_SECONDS: u64 = 60;
const GROUP_MEMBERS_CACHE_TTL_SECONDS: u64 = 5 * 60;
const MAX_FRIENDS_PRELOAD: i64 = 10_000;
const FNV_OFFSET_BASIS: u64 = 14_695_981_039_346_656_037;
const FNV_PRIME: u64 = 1_099_511_628_211;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendPrivateRequest {
    #[serde(deserialize_with = "deserialize_i64")]
    pub receiver_id: i64,
    pub client_message_id: Option<String>,
    pub message_type: Option<String>,
    pub content: Option<String>,
    pub media_url: Option<String>,
    pub media_size: Option<i64>,
    pub media_name: Option<String>,
    pub thumbnail_url: Option<String>,
    pub duration: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendGroupRequest {
    #[serde(deserialize_with = "deserialize_i64")]
    pub group_id: i64,
    pub client_message_id: Option<String>,
    pub message_type: Option<String>,
    pub content: Option<String>,
    pub media_url: Option<String>,
    pub media_size: Option<i64>,
    pub media_name: Option<String>,
    pub thumbnail_url: Option<String>,
    pub duration: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    pub size: Option<i64>,
    pub limit: Option<i64>,
    pub last_message_id: Option<i64>,
    pub after_message_id: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageConfig {
    pub text_enforce: bool,
    pub text_max_length: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDto {
    pub conversation_id: String,
    pub conversation_type: i32,
    pub target_id: String,
    pub conversation_name: String,
    pub conversation_avatar: Option<String>,
    pub last_message: String,
    pub last_message_type: String,
    pub last_message_sender_id: Option<String>,
    pub last_message_sender_name: Option<String>,
    pub last_message_time: Option<String>,
    pub unread_count: i64,
    pub is_online: bool,
    pub is_pinned: bool,
    pub is_muted: bool,
}

pub fn shard_index_for_key(key: &str, shard_count: usize) -> Option<usize> {
    if shard_count == 0 {
        return None;
    }
    let shard_count_u64 = u64::try_from(shard_count).ok()?;
    let hash = key.bytes().fold(FNV_OFFSET_BASIS, |current, byte| {
        (current ^ u64::from(byte)).wrapping_mul(FNV_PRIME)
    });
    usize::try_from(hash % shard_count_u64).ok()
}

pub fn shard_index_for_group_id(group_id: i64, shard_count: usize) -> Option<usize> {
    shard_index_for_key(&keys::group_conversation_id(group_id), shard_count)
}

pub async fn send_private(
    config: &AppConfig,
    cache_redis: &mut ConnectionManager,
    hot_redis: &mut ConnectionManager,
    db: &MySqlPool,
    identity: &Identity,
    request: SendPrivateRequest,
) -> Result<MessageDto, AppError> {
    validate_send_input(
        request.message_type.as_deref(),
        request.content.as_deref(),
        request.media_url.as_deref(),
    )?;
    let receiver_id = cached_resolve_active_user_id(
        cache_redis,
        db,
        request.receiver_id,
        "send_private.resolve_active_user",
    )
    .await?
    .ok_or_else(|| AppError::NotFound("user not found".to_string()))?;
    if receiver_id == identity.user_id {
        return Err(AppError::BadRequest(
            "cannot send private message to self".to_string(),
        ));
    }
    validate_friend(cache_redis, db, identity.user_id, receiver_id).await?;
    let conversation_id = keys::private_conversation_id(identity.user_id, receiver_id);
    let message = build_message(
        config,
        identity,
        BuildMessageInput {
            receiver_id: Some(receiver_id),
            group_id: None,
            client_message_id: request.client_message_id,
            message_type: request.message_type,
            content: request.content,
            media_url: request.media_url,
            media_size: request.media_size,
            media_name: request.media_name,
            thumbnail_url: request.thumbnail_url,
            duration: request.duration,
        },
    );
    let event = build_message_created_event(&conversation_id, &message);
    write_private_message_hot(hot_redis, &conversation_id, &message, &event).await
}

pub async fn send_group(
    config: &AppConfig,
    cache_redis: &mut ConnectionManager,
    hot_redis: &mut ConnectionManager,
    db: &MySqlPool,
    identity: &Identity,
    request: SendGroupRequest,
) -> Result<MessageDto, AppError> {
    validate_send_input(
        request.message_type.as_deref(),
        request.content.as_deref(),
        request.media_url.as_deref(),
    )?;
    let group_id = cached_resolve_active_group_id(
        cache_redis,
        db,
        request.group_id,
        "send_group.resolve_active_group",
    )
    .await?
    .ok_or_else(|| AppError::NotFound("group not found".to_string()))?;
    validate_group_member(cache_redis, db, group_id, identity.user_id).await?;
    let conversation_id = keys::group_conversation_id(group_id);
    let message = build_message(
        config,
        identity,
        BuildMessageInput {
            receiver_id: None,
            group_id: Some(group_id),
            client_message_id: request.client_message_id,
            message_type: request.message_type,
            content: request.content,
            media_url: request.media_url,
            media_size: request.media_size,
            media_name: request.media_name,
            thumbnail_url: request.thumbnail_url,
            duration: request.duration,
        },
    );
    let event = build_message_created_event(&conversation_id, &message);
    write_group_message_hot(hot_redis, group_id, &conversation_id, &message, &event).await
}

pub async fn mark_read(
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

async fn mark_group_read(
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

async fn mark_private_read(
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

pub async fn recall_or_delete(
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

async fn apply_message_status(
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

pub async fn conversations(
    private_redis_shards: &mut [ConnectionManager],
    group_redis_shards: &mut [ConnectionManager],
    db: &MySqlPool,
    identity: &Identity,
) -> Result<Vec<ConversationDto>, AppError> {
    let mut hot_conversation_count = 0_usize;
    let mut result = Vec::new();
    for redis in private_redis_shards.iter_mut() {
        let conv_ids: Vec<String> = redis
            .zrevrange(keys::user_conversations_key(identity.user_id), 0, 99)
            .await
            .unwrap_or_default();
        hot_conversation_count = hot_conversation_count.saturating_add(conv_ids.len());
        for conversation_id in conv_ids {
            if conversation_id.starts_with("g_") {
                continue;
            }
            if let Some(last) = load_last_message(redis, &conversation_id).await {
                let unread = redis
                    .hget(keys::user_unread_key(identity.user_id), &conversation_id)
                    .await
                    .unwrap_or(0_i64);
                if let Some(dto) =
                    conversation_from_message(db, identity.user_id, &conversation_id, last, unread)
                        .await?
                {
                    result.push(dto);
                }
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
    Ok(result)
}

struct GroupConversationSource {
    group_id: i64,
    name: String,
    avatar: Option<String>,
}

async fn load_group_conversations(
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
    let mut result = Vec::new();
    for row in rows {
        let source = GroupConversationSource {
            group_id: row.get("id"),
            name: row
                .try_get::<String, _>("name")
                .unwrap_or_else(|_| "group".to_string()),
            avatar: row.try_get::<Option<String>, _>("avatar").ok().flatten(),
        };
        let conversation_id = keys::group_conversation_id(source.group_id);
        let index = shard_index_for_group_id(source.group_id, redis_shards.len())
            .ok_or_else(|| AppError::Upstream("group hot redis shard missing".to_string()))?;
        let Some(redis) = redis_shards.get_mut(index) else {
            return Err(AppError::Upstream(
                "group hot redis shard missing".to_string(),
            ));
        };
        let last = match load_last_message(redis, &conversation_id).await {
            Some(message) => message,
            None => {
                let history = load_history_from_db(
                    db,
                    &conversation_id,
                    &HistoryQuery {
                        size: None,
                        limit: Some(1),
                        last_message_id: None,
                        after_message_id: None,
                    },
                    1,
                )
                .await?;
                let Some(message) = history.into_iter().next() else {
                    continue;
                };
                message
            }
        };
        let group_seq = current_group_sequence(redis, db, source.group_id)
            .await?
            .max(last.conversation_seq.unwrap_or_default());
        let read_seq = current_group_read_sequence(redis, db, user_id, source.group_id).await?;
        result.push(group_conversation_from_message(
            source,
            last,
            group_unread_count(group_seq, read_seq),
        ));
    }
    Ok(result)
}

fn group_conversation_from_message(
    source: GroupConversationSource,
    message: MessageDto,
    unread: i64,
) -> ConversationDto {
    ConversationDto {
        conversation_id: source.group_id.to_string(),
        conversation_type: 2,
        target_id: source.group_id.to_string(),
        conversation_name: source.name,
        conversation_avatar: source.avatar,
        last_message: message.content.clone().unwrap_or_default(),
        last_message_type: message.message_type.clone(),
        last_message_sender_id: Some(message.sender_id.clone()),
        last_message_sender_name: message.sender_name.clone(),
        last_message_time: Some(message.created_time.clone()),
        unread_count: unread,
        is_online: false,
        is_pinned: false,
        is_muted: false,
    }
}

async fn current_group_sequence(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    group_id: i64,
) -> Result<i64, AppError> {
    let key = keys::group_sequence_key(group_id);
    if let Some(sequence) = redis.get::<_, Option<i64>>(&key).await.ok().flatten() {
        return Ok(sequence.max(0));
    }
    let sequence: i64 = observability::db_query(
        "group_sequence.from_db",
        sqlx::query_scalar(
            "SELECT COALESCE(MAX(conversation_seq), 0) \
             FROM service_message_service_db.messages \
             WHERE is_group_chat = 1 AND group_id = ? AND status <> 5",
        )
        .bind(group_id)
        .fetch_one(db),
    )
    .await?;
    if sequence > 0 {
        redis.set::<_, _, ()>(&key, sequence).await?;
    }
    Ok(sequence)
}

async fn current_group_read_sequence(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    user_id: i64,
    group_id: i64,
) -> Result<i64, AppError> {
    let key = keys::group_read_sequence_key(user_id, group_id);
    if let Some(sequence) = redis.get::<_, Option<i64>>(&key).await.ok().flatten() {
        return Ok(sequence.max(0));
    }
    let sequence: i64 = observability::db_query(
        "group_read_sequence.from_db",
        sqlx::query_scalar(
            "SELECT COALESCE(MAX(last_read_seq), 0) \
             FROM service_message_service_db.group_read_cursor \
             WHERE group_id = ? AND user_id = ?",
        )
        .bind(group_id)
        .bind(user_id)
        .fetch_one(db),
    )
    .await?;
    if sequence > 0 {
        redis.set::<_, _, ()>(&key, sequence).await?;
    }
    Ok(sequence)
}

fn group_unread_count(group_seq: i64, read_seq: i64) -> i64 {
    let normalized_group_seq = group_seq.max(0);
    let normalized_read_seq = read_seq.max(0);
    match normalized_group_seq.checked_sub(normalized_read_seq) {
        Some(value) if value > 0 => value,
        _ => 0,
    }
}

fn dedup_conversations(conversations: &mut Vec<ConversationDto>) {
    let mut seen = std::collections::HashSet::new();
    conversations.retain(|conversation| {
        seen.insert((
            conversation.conversation_type,
            conversation.conversation_id.clone(),
        ))
    });
}

pub async fn private_history(
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

pub async fn group_history(
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

fn validate_send_input(
    message_type: Option<&str>,
    content: Option<&str>,
    media_url: Option<&str>,
) -> Result<(), AppError> {
    let ty = MessageType::from_text(message_type.unwrap_or("TEXT"));
    if matches!(ty, MessageType::Text | MessageType::System) {
        if content.is_none_or(|value| value.trim().is_empty()) {
            return Err(AppError::BadRequest(
                "message content cannot be blank".to_string(),
            ));
        }
        if content.unwrap_or_default().chars().count() > 2000 {
            return Err(AppError::BadRequest(
                "message content cannot exceed 2000 characters".to_string(),
            ));
        }
    } else if media_url.is_none_or(|value| value.trim().is_empty()) {
        return Err(AppError::BadRequest("mediaUrl cannot be blank".to_string()));
    }
    Ok(())
}

struct BuildMessageInput {
    receiver_id: Option<i64>,
    group_id: Option<i64>,
    client_message_id: Option<String>,
    message_type: Option<String>,
    content: Option<String>,
    media_url: Option<String>,
    media_size: Option<i64>,
    media_name: Option<String>,
    thumbnail_url: Option<String>,
    duration: Option<i32>,
}

fn build_message(config: &AppConfig, identity: &Identity, input: BuildMessageInput) -> MessageDto {
    let id = ids::next_id(config.snowflake_node_id).to_string();
    let now = time::now_iso();
    let ty = MessageType::from_text(input.message_type.as_deref().unwrap_or("TEXT"));
    MessageDto {
        id: id.clone(),
        message_id: id,
        client_message_id: input
            .client_message_id
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        sender_id: identity.user_id.to_string(),
        sender_name: Some(identity.username.clone()),
        sender_avatar: None,
        receiver_id: input.receiver_id.map(|value| value.to_string()),
        receiver_name: None,
        group_id: input.group_id.map(|value| value.to_string()),
        conversation_seq: None,
        group_name: None,
        group_avatar: None,
        is_group_chat: input.group_id.is_some(),
        is_group: input.group_id.is_some(),
        message_type: ty.as_str().to_string(),
        content: input.content,
        media_url: input.media_url,
        media_size: input.media_size,
        media_name: input.media_name,
        thumbnail_url: input.thumbnail_url,
        duration: input.duration,
        location_info: None,
        status: MessageStatus::Sent.as_str().to_string(),
        reply_to_message_id: None,
        created_time: now.clone(),
        created_at: now,
        updated_time: None,
        updated_at: None,
    }
}

fn build_message_created_event(conversation_id: &str, message: &MessageDto) -> ImEvent {
    let mut event = ImEvent::new(ImEventType::MessageCreated, conversation_id.to_string());
    event.message_id = Some(message.id.clone());
    event.sender_id = Some(message.sender_id.clone());
    event.receiver_id = message.receiver_id.clone();
    event.group_id = message.group_id.clone();
    event.group = message.is_group_chat;
    event.payload = Some(message.clone());
    event
}

fn pending_event_member(event_id: &str, conversation_id: &str) -> String {
    format!("{event_id}|{conversation_id}")
}

async fn write_private_message_hot(
    redis: &mut ConnectionManager,
    conversation_id: &str,
    message: &MessageDto,
    event: &ImEvent,
) -> Result<MessageDto, AppError> {
    let message_id = message
        .id
        .parse::<i64>()
        .map_err(|_| AppError::BadRequest("invalid message id".to_string()))?;
    let sender_id = message
        .sender_id
        .parse::<i64>()
        .map_err(|_| AppError::BadRequest("invalid sender id".to_string()))?;
    let receiver_id = message
        .receiver_id
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("message receiverId missing".to_string()))?
        .parse::<i64>()
        .map_err(|_| AppError::BadRequest("invalid receiver id".to_string()))?;
    let event_json = serde_json::to_string(event)?;
    let message_json = serde_json::to_string(message)?;
    let client_key = message
        .client_message_id
        .as_deref()
        .map(|client_id| keys::client_message_key(sender_id, client_id))
        .unwrap_or_else(|| format!("im:client:none:{message_id}"));
    let pending_member = pending_event_member(&event.event_id, conversation_id);
    let script = Script::new(
        r#"
        local existing_id = redis.call('GET', KEYS[1])
        if existing_id then
          local existing_message = redis.call('GET', ARGV[13] .. existing_id)
          if existing_message then
            return existing_message
          end
        end
        redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
        redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
        redis.call('ZADD', KEYS[3], ARGV[5], ARGV[1])
        redis.call('EXPIRE', KEYS[3], ARGV[6])
        redis.call('SET', KEYS[4], ARGV[3], 'EX', ARGV[6])
        redis.call('ZADD', KEYS[5], ARGV[5], ARGV[15])
        redis.call('SET', KEYS[6], ARGV[8], 'EX', ARGV[9])
        redis.call('ZADD', ARGV[10], ARGV[5], ARGV[7])
        redis.call('EXPIRE', ARGV[10], ARGV[6])
        redis.call('ZADD', ARGV[11], ARGV[5], ARGV[7])
        redis.call('EXPIRE', ARGV[11], ARGV[6])
        redis.call('HINCRBY', ARGV[12], ARGV[7], 1)
        redis.call('EXPIRE', ARGV[12], ARGV[6])
        return ARGV[3]
        "#,
    );
    let result: String = script
        .key(client_key)
        .key(keys::message_key(message_id))
        .key(keys::conversation_messages_key(conversation_id))
        .key(keys::conversation_last_key(conversation_id))
        .key(keys::pending_events_key())
        .key(keys::event_key(&event.event_id))
        .arg(message.id.clone())
        .arg((keys::MESSAGE_TTL_SECONDS * 2).to_string())
        .arg(message_json)
        .arg(keys::MESSAGE_TTL_SECONDS.to_string())
        .arg(time::now_ms().to_string())
        .arg(keys::CONVERSATION_TTL_SECONDS.to_string())
        .arg(conversation_id)
        .arg(event_json)
        .arg(keys::EVENT_TTL_SECONDS.to_string())
        .arg(keys::user_conversations_key(sender_id))
        .arg(keys::user_conversations_key(receiver_id))
        .arg(keys::user_unread_key(receiver_id))
        .arg("im:msg:")
        .arg(event.event_id.clone())
        .arg(pending_member)
        .invoke_async(redis)
        .await?;
    Ok(serde_json::from_str(&result)?)
}

async fn write_group_message_hot(
    redis: &mut ConnectionManager,
    group_id: i64,
    conversation_id: &str,
    message: &MessageDto,
    event: &ImEvent,
) -> Result<MessageDto, AppError> {
    let message_id = message
        .id
        .parse::<i64>()
        .map_err(|_| AppError::BadRequest("invalid message id".to_string()))?;
    let sender_id = message
        .sender_id
        .parse::<i64>()
        .map_err(|_| AppError::BadRequest("invalid sender id".to_string()))?;
    let event_json = serde_json::to_string(event)?;
    let message_json = serde_json::to_string(message)?;
    let client_key = message
        .client_message_id
        .as_deref()
        .map(|client_id| keys::client_message_key(sender_id, client_id))
        .unwrap_or_else(|| format!("im:client:none:{message_id}"));
    let pending_member = pending_event_member(&event.event_id, conversation_id);
    let script = Script::new(
        r#"
        local existing_id = redis.call('GET', KEYS[1])
        if existing_id then
          local existing_message = redis.call('GET', ARGV[8] .. existing_id)
          if existing_message then
            return existing_message
          end
        end
        local seq = redis.call('INCR', KEYS[7])
        local encoded_message = string.gsub(ARGV[3], '"conversationSeq":null', '"conversationSeq":' .. seq)
        local encoded_event = string.gsub(ARGV[7], '"conversationSeq":null', '"conversationSeq":' .. seq)
        redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
        redis.call('SET', KEYS[2], encoded_message, 'EX', ARGV[4])
        redis.call('ZADD', KEYS[3], seq, ARGV[1])
        redis.call('EXPIRE', KEYS[3], ARGV[6])
        redis.call('SET', KEYS[4], encoded_message, 'EX', ARGV[6])
        redis.call('ZADD', KEYS[5], ARGV[5], ARGV[11])
        redis.call('SET', KEYS[6], encoded_event, 'EX', ARGV[10])
        return encoded_message
        "#,
    );
    let result: String = script
        .key(client_key)
        .key(keys::message_key(message_id))
        .key(keys::conversation_messages_key(conversation_id))
        .key(keys::conversation_last_key(conversation_id))
        .key(keys::pending_events_key())
        .key(keys::event_key(&event.event_id))
        .key(keys::group_sequence_key(group_id))
        .arg(message.id.clone())
        .arg((keys::MESSAGE_TTL_SECONDS * 2).to_string())
        .arg(message_json)
        .arg(keys::MESSAGE_TTL_SECONDS.to_string())
        .arg(time::now_ms().to_string())
        .arg(keys::CONVERSATION_TTL_SECONDS.to_string())
        .arg(event_json)
        .arg("im:msg:")
        .arg(event.event_id.clone())
        .arg(keys::EVENT_TTL_SECONDS.to_string())
        .arg(pending_member)
        .invoke_async(redis)
        .await?;
    Ok(serde_json::from_str(&result)?)
}

async fn write_state_event(
    redis: &mut ConnectionManager,
    conversation_id: &str,
    event: &ImEvent,
) -> Result<(), AppError> {
    let event_json = serde_json::to_string(event)?;
    let pending_member = pending_event_member(&event.event_id, conversation_id);
    redis
        .set_ex::<_, _, ()>(
            keys::event_key(&event.event_id),
            event_json,
            keys::EVENT_TTL_SECONDS,
        )
        .await?;
    redis
        .zadd::<_, _, _, ()>(keys::pending_events_key(), pending_member, time::now_ms())
        .await?;
    Ok(())
}

async fn load_message(
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

async fn load_message_from_all_hot(
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

async fn load_hot_message(
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

async fn load_message_from_db(db: &MySqlPool, message_id: i64) -> Result<MessageDto, AppError> {
    let row = observability::db_query(
        "load_message.by_id",
        sqlx::query(
        r#"SELECT id, sender_id, receiver_id, group_id, conversation_seq, client_message_id, message_type, content,
                  media_url, media_size, media_name, thumbnail_url, duration, location_info,
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

async fn load_last_message(
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

async fn load_history(
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
    messages.sort_by(|a, b| b.id.cmp(&a.id));
    messages.dedup_by(|a, b| a.id == b.id);
    messages.truncate(limit_usize);
    Ok(messages)
}

async fn load_history_from_db(
    db: &MySqlPool,
    conversation_id: &str,
    query: &HistoryQuery,
    limit: usize,
) -> Result<Vec<MessageDto>, AppError> {
    let scope = parse_db_scope(conversation_id)?;
    let mut sql = String::from(
        "SELECT id, sender_id, receiver_id, group_id, conversation_seq, client_message_id, message_type, content, \
         media_url, media_size, media_name, thumbnail_url, duration, location_info, status, \
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

async fn latest_message_id(
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

async fn cached_resolve_active_user_id(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    candidate_id: i64,
    operation: &'static str,
) -> Result<Option<i64>, AppError> {
    let key = format!("im:cache:active_user:{candidate_id}");
    if let Some(cached) = local_cache::get_i64_option(&key) {
        return Ok(cached);
    }
    let lock = local_cache::key_lock(&key);
    let _guard = lock.lock().await;
    if let Some(cached) = local_cache::get_i64_option(&key) {
        return Ok(cached);
    }
    if let Some(cached) = read_cached_i64_option(redis, &key).await {
        return Ok(cached);
    }
    let resolved =
        observability::db_query(operation, resolve_active_user_id(db, candidate_id)).await?;
    write_cached_i64_option(redis, &key, resolved).await;
    Ok(resolved)
}

async fn cached_resolve_active_group_id(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    candidate_id: i64,
    operation: &'static str,
) -> Result<Option<i64>, AppError> {
    let key = format!("im:cache:active_group:{candidate_id}");
    if let Some(cached) = local_cache::get_i64_option(&key) {
        return Ok(cached);
    }
    let lock = local_cache::key_lock(&key);
    let _guard = lock.lock().await;
    if let Some(cached) = local_cache::get_i64_option(&key) {
        return Ok(cached);
    }
    if let Some(cached) = read_cached_i64_option(redis, &key).await {
        return Ok(cached);
    }
    let resolved =
        observability::db_query(operation, resolve_active_group_id(db, candidate_id)).await?;
    write_cached_i64_option(redis, &key, resolved).await;
    Ok(resolved)
}

async fn read_cached_i64_option(redis: &mut ConnectionManager, key: &str) -> Option<Option<i64>> {
    let value: Option<String> = redis.get(key).await.ok().flatten();
    let parsed = value.map(|raw| {
        if raw == "none" {
            None
        } else {
            raw.parse::<i64>().ok()
        }
    });
    if let Some(value) = parsed {
        local_cache::set_i64_option(key, value);
    }
    parsed
}

async fn write_cached_i64_option(redis: &mut ConnectionManager, key: &str, value: Option<i64>) {
    let ttl = if value.is_some() {
        VALIDATION_CACHE_TTL_SECONDS
    } else {
        VALIDATION_NEGATIVE_CACHE_TTL_SECONDS
    };
    let raw = value
        .map(|id| id.to_string())
        .unwrap_or_else(|| "none".to_string());
    local_cache::set_i64_option(key, value);
    let result: redis::RedisResult<()> = redis.set_ex(key, raw, ttl).await;
    if let Err(error) = result {
        tracing::warn!(key, error = %error, "failed to cache active user id");
    }
}

async fn validate_friend(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    user_id: i64,
    friend_id: i64,
) -> Result<(), AppError> {
    let key = format!("im:cache:friend:{user_id}:{friend_id}");
    let preload_key = format!("im:cache:friend_preload:{user_id}");
    if let Some(allowed) = local_cache::get_bool(&key) {
        return if allowed {
            Ok(())
        } else {
            Err(AppError::Forbidden(
                "friend relationship not found".to_string(),
            ))
        };
    }
    let lock = local_cache::key_lock(&preload_key);
    let _guard = lock.lock().await;
    if let Some(allowed) = local_cache::get_bool(&key) {
        return if allowed {
            Ok(())
        } else {
            Err(AppError::Forbidden(
                "friend relationship not found".to_string(),
            ))
        };
    }
    if let Some(allowed) = read_cached_bool(redis, &key).await {
        return if allowed {
            Ok(())
        } else {
            Err(AppError::Forbidden(
                "friend relationship not found".to_string(),
            ))
        };
    }
    let allowed = preload_friend_relations(redis, db, user_id, friend_id).await?;
    if !allowed {
        return Err(AppError::Forbidden(
            "friend relationship not found".to_string(),
        ));
    }
    Ok(())
}

async fn preload_friend_relations(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    user_id: i64,
    requested_friend_id: i64,
) -> Result<bool, AppError> {
    let preload_key = format!("im:cache:friend_preload:{user_id}");
    if let Some(preloaded) = local_cache::get_bool(&preload_key) {
        if preloaded {
            let requested_key = format!("im:cache:friend:{user_id}:{requested_friend_id}");
            let allowed = read_cached_bool(redis, &requested_key)
                .await
                .unwrap_or(false);
            if !allowed {
                write_cached_bool(redis, &requested_key, false).await;
            }
            return Ok(allowed);
        }
    }

    let friend_ids: Vec<i64> = observability::db_query(
        "preload_friend_relations",
        sqlx::query_scalar(
            "SELECT friend_id FROM service_user_service_db.im_friend WHERE user_id = ? AND status = 1 LIMIT ?",
        )
        .bind(user_id)
        .bind(MAX_FRIENDS_PRELOAD)
        .fetch_all(db),
    )
    .await?;

    let mut allowed = false;
    let mut pipe = redis::pipe();
    for friend_id in &friend_ids {
        if *friend_id == requested_friend_id {
            allowed = true;
        }
        let relation_key = format!("im:cache:friend:{user_id}:{friend_id}");
        local_cache::set_bool(&relation_key, true);
        pipe.set_ex(relation_key, "1", VALIDATION_CACHE_TTL_SECONDS)
            .ignore();
    }
    let pipe_result: redis::RedisResult<()> = pipe.query_async(redis).await;
    if let Err(error) = pipe_result {
        tracing::warn!(error = %error, "failed to cache friend preload rows");
    }

    local_cache::set_bool(&preload_key, true);
    let preload_result: redis::RedisResult<()> = redis
        .set_ex(&preload_key, "1", VALIDATION_CACHE_TTL_SECONDS)
        .await;
    if let Err(error) = preload_result {
        tracing::warn!(key = %preload_key, error = %error, "failed to cache friend preload marker");
    }

    if !allowed {
        let requested_key = format!("im:cache:friend:{user_id}:{requested_friend_id}");
        write_cached_bool(redis, &requested_key, false).await;
    }
    Ok(allowed)
}

async fn validate_group_member(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    group_id: i64,
    user_id: i64,
) -> Result<(), AppError> {
    let key = format!("im:cache:group_member:{group_id}:{user_id}");
    if let Some(allowed) = local_cache::get_bool(&key) {
        return if allowed {
            Ok(())
        } else {
            Err(AppError::Forbidden(
                "group membership not found".to_string(),
            ))
        };
    }
    let lock = local_cache::key_lock(&key);
    let _guard = lock.lock().await;
    if let Some(allowed) = local_cache::get_bool(&key) {
        return if allowed {
            Ok(())
        } else {
            Err(AppError::Forbidden(
                "group membership not found".to_string(),
            ))
        };
    }
    if let Some(allowed) = read_cached_bool(redis, &key).await {
        return if allowed {
            Ok(())
        } else {
            Err(AppError::Forbidden(
                "group membership not found".to_string(),
            ))
        };
    }
    let members = load_group_members(redis, db, group_id).await?;
    let allowed = members.contains(&user_id);
    write_cached_bool(redis, &key, allowed).await;
    if !allowed {
        return Err(AppError::Forbidden(
            "group membership not found".to_string(),
        ));
    }
    Ok(())
}

async fn read_cached_bool(redis: &mut ConnectionManager, key: &str) -> Option<bool> {
    let value: Option<String> = redis.get(key).await.ok().flatten();
    let parsed = value.and_then(|raw| match raw.as_str() {
        "1" => Some(true),
        "0" => Some(false),
        _ => None,
    });
    if let Some(value) = parsed {
        local_cache::set_bool(key, value);
    }
    parsed
}

async fn write_cached_bool(redis: &mut ConnectionManager, key: &str, value: bool) {
    let ttl = if value {
        VALIDATION_CACHE_TTL_SECONDS
    } else {
        VALIDATION_NEGATIVE_CACHE_TTL_SECONDS
    };
    let raw = if value { "1" } else { "0" };
    local_cache::set_bool(key, value);
    let result: redis::RedisResult<()> = redis.set_ex(key, raw, ttl).await;
    if let Err(error) = result {
        tracing::warn!(key, error = %error, "failed to cache boolean validation result");
    }
}

async fn load_group_members(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    group_id: i64,
) -> Result<Vec<i64>, AppError> {
    let key = format!("im:cache:group_members:{group_id}");
    if let Some(members) = local_cache::get_i64_vec(&key) {
        return Ok(members);
    }
    let lock = local_cache::key_lock(&key);
    let _guard = lock.lock().await;
    if let Some(members) = local_cache::get_i64_vec(&key) {
        return Ok(members);
    }
    let cached: Option<String> = redis.get(&key).await.ok().flatten();
    if let Some(raw) = cached {
        if let Ok(members) = serde_json::from_str::<Vec<i64>>(&raw) {
            local_cache::set_i64_vec(&key, members.clone());
            return Ok(members);
        }
    }
    let rows: Vec<i64> = observability::db_query(
        "load_group_members",
        sqlx::query_scalar(
            "SELECT user_id FROM service_group_service_db.im_group_member WHERE group_id = ? AND status = 1",
        )
        .bind(group_id)
        .fetch_all(db),
    )
    .await?;
    local_cache::set_i64_vec(&key, rows.clone());
    if let Ok(raw) = serde_json::to_string(&rows) {
        let result: redis::RedisResult<()> = redis
            .set_ex(&key, raw, GROUP_MEMBERS_CACHE_TTL_SECONDS)
            .await;
        if let Err(error) = result {
            tracing::warn!(key = %key, error = %error, "failed to cache group members");
        }
    }
    Ok(rows)
}

fn conversation_id_from_message(message: &MessageDto) -> Result<String, AppError> {
    if message.is_group_chat {
        let group_id = message
            .group_id
            .as_deref()
            .ok_or_else(|| AppError::BadRequest("message groupId missing".to_string()))?;
        Ok(keys::group_conversation_id(group_id.parse().map_err(
            |_| AppError::BadRequest("invalid groupId".to_string()),
        )?))
    } else {
        let receiver_id = message
            .receiver_id
            .as_deref()
            .ok_or_else(|| AppError::BadRequest("message receiverId missing".to_string()))?;
        Ok(keys::private_conversation_id(
            message
                .sender_id
                .parse()
                .map_err(|_| AppError::BadRequest("invalid senderId".to_string()))?,
            receiver_id
                .parse()
                .map_err(|_| AppError::BadRequest("invalid receiverId".to_string()))?,
        ))
    }
}

fn within_recall_window(message: &MessageDto) -> bool {
    DateTime::parse_from_rfc3339(&message.created_time)
        .map(|created| {
            Utc::now()
                .signed_duration_since(created.with_timezone(&Utc))
                .num_seconds()
                <= 120
        })
        .unwrap_or(true)
}

fn deserialize_i64<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::Number(number) => number
            .as_i64()
            .or_else(|| number.as_u64().and_then(|item| i64::try_from(item).ok()))
            .ok_or_else(|| de::Error::custom("invalid integer")),
        serde_json::Value::String(text) => text
            .trim()
            .parse()
            .map_err(|_| de::Error::custom("invalid integer")),
        _ => Err(de::Error::custom("invalid integer")),
    }
}

struct ConversationTarget {
    conversation_id: String,
    frontend_conversation_id: String,
    peer_id: Option<i64>,
    group_id: Option<i64>,
}

fn parse_conversation_target(user_id: i64, raw: &str) -> Result<ConversationTarget, AppError> {
    let value = raw.trim();
    if let Some(group) = value.strip_prefix("group_") {
        let group_id = group
            .parse()
            .map_err(|_| AppError::BadRequest("invalid group conversation".to_string()))?;
        return Ok(ConversationTarget {
            conversation_id: keys::group_conversation_id(group_id),
            frontend_conversation_id: format!("group_{group_id}"),
            peer_id: None,
            group_id: Some(group_id),
        });
    }
    if let Some(group) = value.strip_prefix("g_") {
        let group_id = group
            .parse()
            .map_err(|_| AppError::BadRequest("invalid group conversation".to_string()))?;
        return Ok(ConversationTarget {
            conversation_id: keys::group_conversation_id(group_id),
            frontend_conversation_id: format!("group_{group_id}"),
            peer_id: None,
            group_id: Some(group_id),
        });
    }
    let peer_id = if value.contains('_') {
        value
            .split('_')
            .filter_map(|part| part.parse::<i64>().ok())
            .find(|id| *id != user_id)
            .ok_or_else(|| AppError::BadRequest("invalid private conversation".to_string()))?
    } else {
        value
            .parse()
            .map_err(|_| AppError::BadRequest("invalid private conversation".to_string()))?
    };
    Ok(ConversationTarget {
        conversation_id: keys::private_conversation_id(user_id, peer_id),
        frontend_conversation_id: keys::private_conversation_id(user_id, peer_id)
            .trim_start_matches("p_")
            .to_string(),
        peer_id: Some(peer_id),
        group_id: None,
    })
}

struct DbScope {
    left_id: i64,
    right_id: i64,
    group_id: Option<i64>,
}

fn parse_db_scope(conversation_id: &str) -> Result<DbScope, AppError> {
    if let Some(group) = conversation_id.strip_prefix("g_") {
        return Ok(DbScope {
            left_id: 0,
            right_id: 0,
            group_id: Some(
                group
                    .parse()
                    .map_err(|_| AppError::BadRequest("invalid group conversation".to_string()))?,
            ),
        });
    }
    let mut parts = conversation_id
        .strip_prefix("p_")
        .unwrap_or(conversation_id)
        .split('_');
    let Some(left_id) = parts.next() else {
        return Err(AppError::BadRequest(
            "invalid private conversation".to_string(),
        ));
    };
    let Some(right_id) = parts.next() else {
        return Err(AppError::BadRequest(
            "invalid private conversation".to_string(),
        ));
    };
    if parts.next().is_some() {
        return Err(AppError::BadRequest(
            "invalid private conversation".to_string(),
        ));
    }
    Ok(DbScope {
        left_id: left_id
            .parse()
            .map_err(|_| AppError::BadRequest("invalid private conversation".to_string()))?,
        right_id: right_id
            .parse()
            .map_err(|_| AppError::BadRequest("invalid private conversation".to_string()))?,
        group_id: None,
    })
}

fn message_from_row(row: &sqlx::mysql::MySqlRow) -> MessageDto {
    let id: i64 = row.get("id");
    let sender_id: i64 = row.get("sender_id");
    let receiver_id: Option<i64> = row.try_get("receiver_id").ok().flatten();
    let group_id: Option<i64> = row.try_get("group_id").ok().flatten();
    let message_type: i32 = row.get("message_type");
    let status: i32 = row.get("status");
    let created: chrono::NaiveDateTime = row.get("created_time");
    let updated: chrono::NaiveDateTime = row.get("updated_time");
    MessageDto {
        id: id.to_string(),
        message_id: id.to_string(),
        client_message_id: row
            .try_get::<Option<String>, _>("client_message_id")
            .ok()
            .flatten(),
        sender_id: sender_id.to_string(),
        sender_name: None,
        sender_avatar: None,
        receiver_id: receiver_id.map(|value| value.to_string()),
        receiver_name: None,
        group_id: group_id.map(|value| value.to_string()),
        conversation_seq: row
            .try_get::<Option<i64>, _>("conversation_seq")
            .ok()
            .flatten(),
        group_name: None,
        group_avatar: None,
        is_group_chat: row.try_get::<i8, _>("is_group_chat").unwrap_or(0) != 0,
        is_group: row.try_get::<i8, _>("is_group_chat").unwrap_or(0) != 0,
        message_type: match message_type {
            2 => "IMAGE",
            3 => "FILE",
            4 => "VOICE",
            5 => "VIDEO",
            7 => "SYSTEM",
            _ => "TEXT",
        }
        .to_string(),
        content: row.try_get::<Option<String>, _>("content").ok().flatten(),
        media_url: row.try_get::<Option<String>, _>("media_url").ok().flatten(),
        media_size: row.try_get::<Option<i64>, _>("media_size").ok().flatten(),
        media_name: row
            .try_get::<Option<String>, _>("media_name")
            .ok()
            .flatten(),
        thumbnail_url: row
            .try_get::<Option<String>, _>("thumbnail_url")
            .ok()
            .flatten(),
        duration: row.try_get::<Option<i32>, _>("duration").ok().flatten(),
        location_info: row
            .try_get::<Option<String>, _>("location_info")
            .ok()
            .flatten(),
        status: match status {
            2 => "DELIVERED",
            3 => "READ",
            4 => "RECALLED",
            5 => "DELETED",
            _ => "SENT",
        }
        .to_string(),
        reply_to_message_id: row
            .try_get::<Option<i64>, _>("reply_to_message_id")
            .ok()
            .flatten()
            .map(|value| value.to_string()),
        created_time: created.and_utc().to_rfc3339(),
        created_at: created.and_utc().to_rfc3339(),
        updated_time: Some(updated.and_utc().to_rfc3339()),
        updated_at: Some(updated.and_utc().to_rfc3339()),
    }
}

async fn conversation_from_message(
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

async fn load_private_conversations_from_db(
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
    let mut result = Vec::new();
    for row in rows {
        let message = message_from_row(&row);
        let conversation_id = conversation_id_from_message(&message)?;
        if !seen.insert(conversation_id.clone()) {
            continue;
        }
        if let Some(conversation) =
            conversation_from_message(db, user_id, &conversation_id, message, 0).await?
        {
            result.push(conversation);
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn group_message_payload_should_keep_sequence_placeholder(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let message = MessageDto {
            id: "1".to_string(),
            message_id: "1".to_string(),
            client_message_id: None,
            sender_id: "10".to_string(),
            sender_name: None,
            sender_avatar: None,
            receiver_id: None,
            receiver_name: None,
            group_id: Some("20".to_string()),
            conversation_seq: None,
            group_name: None,
            group_avatar: None,
            is_group_chat: true,
            is_group: true,
            message_type: "TEXT".to_string(),
            content: Some("hello".to_string()),
            media_url: None,
            media_size: None,
            media_name: None,
            thumbnail_url: None,
            duration: None,
            location_info: None,
            status: "SENT".to_string(),
            reply_to_message_id: None,
            created_time: "2026-04-28T00:00:00Z".to_string(),
            created_at: "2026-04-28T00:00:00Z".to_string(),
            updated_time: None,
            updated_at: None,
        };
        let event = build_message_created_event("g_20", &message);
        let message_json = serde_json::to_string(&message)?;
        let event_json = serde_json::to_string(&event)?;

        if !message_json.contains("\"conversationSeq\":null") {
            return Err("message JSON must expose the sequence placeholder".into());
        }
        if !event_json.contains("\"conversationSeq\":null") {
            return Err("event payload JSON must expose the sequence placeholder".into());
        }
        Ok(())
    }

    #[test]
    fn group_unread_count_should_saturate() -> Result<(), &'static str> {
        if group_unread_count(10, 3) != 7 {
            return Err("group unread should be group sequence minus read sequence");
        }
        if group_unread_count(3, 10) != 0 {
            return Err("group unread should not be negative");
        }
        if group_unread_count(-1, 10) != 0 {
            return Err("negative group sequence should be treated as zero");
        }
        Ok(())
    }

    #[test]
    fn pending_event_member_should_include_conversation_id() -> Result<(), &'static str> {
        if pending_event_member("100", "g_20") != "100|g_20" {
            return Err("pending event member should encode event and conversation ids");
        }
        Ok(())
    }
}
