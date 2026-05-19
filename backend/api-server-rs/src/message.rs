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
    E2eeEnvelopeDto, ImEvent, ImEventType, MessageDto, MessageStatus, MessageType, ReadReceipt,
};
use im_rs_common::{ids, keys, time};
use redis::aio::ConnectionManager;
use redis::{AsyncCommands, Script};
use serde::{de, Deserialize, Deserializer, Serialize};
use sqlx::{MySqlPool, Row};
use std::collections::HashMap;
use std::time::Instant;

const VALIDATION_CACHE_TTL_SECONDS: u64 = 5 * 60;
const VALIDATION_NEGATIVE_CACHE_TTL_SECONDS: u64 = 60;
const MAX_FRIENDS_PRELOAD: i64 = 10_000;
const FNV_OFFSET_BASIS: u64 = 14_695_981_039_346_656_037;
const FNV_PRIME: u64 = 1_099_511_628_211;

/// 私聊消息发送请求体。
///
/// `receiver_id` 支持数字和字符串两种 JSON 格式（通过 `deserialize_i64` 兼容）。
/// E2EE messages must use the Rust v2 envelope. Legacy header/ciphertext
/// payloads are rejected for new messages.
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
    pub encrypted: Option<bool>,
    pub e2ee_header: Option<String>,
    pub e2ee_device_id: Option<String>,
    pub e2ee_sender_identity_key: Option<String>,
    pub e2ee_ephemeral_key: Option<String>,
    pub e2ee_envelope: Option<E2eeEnvelopeDto>,
}

/// 群聊消息发送请求体。
///
/// `mentioned_user_ids` 为可选的 @提及列表，服务端会校验被提及用户是否为群成员。
/// 发送者自身会被自动排除在 @提及列表之外。
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
    pub mentioned_user_ids: Option<Vec<String>>,
    pub encrypted: Option<bool>,
    pub e2ee_envelope: Option<E2eeEnvelopeDto>,
}

/// 历史消息查询参数，支持游标分页和数量限制。
///
/// `last_message_id`：返回此 ID 之前的消息（向前翻页）；
/// `after_message_id`：返回此 ID 之后的消息（向后翻页）；
/// `limit`/`size`：每页数量，取值范围 [1, 100]，默认 20。
#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    pub size: Option<i64>,
    pub limit: Option<i64>,
    pub last_message_id: Option<i64>,
    pub after_message_id: Option<i64>,
}

/// 消息客户端配置，告知前端当前的消息约束。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageConfig {
    pub text_enforce: bool,
    pub text_max_length: i32,
}

/// 会话摘要 DTO，用于会话列表展示。
///
/// `conversation_type`：1=私聊，2=群聊。
/// `unread_count` 从 Redis Hash（`im:user:{uid}:unread`）中读取，
/// 群聊未读数通过 `group_seq - read_seq` 计算。
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

/// 使用 FNV-1a 哈希计算给定 key 对应的热 Redis 分片索引。
///
/// `shard_count` 为 0 时返回 `None`。用于私聊消息的会话级分片路由。
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

/// 计算群聊消息对应的热 Redis 分片索引。
///
/// 内部将 `group_id` 转换为 `g_{group_id}` 格式的会话 ID 后调用 [`shard_index_for_key`]。
pub fn shard_index_for_group_id(group_id: i64, shard_count: usize) -> Option<usize> {
    shard_index_for_key(&keys::group_conversation_id(group_id), shard_count)
}

/// 发送私聊消息。
///
/// **鉴权要求**：通过 `identity` 参数传入已验证的调用者身份。
///
/// **业务流程**：
/// 1. 校验输入（消息类型、内容长度、E2EE 加密消息跳过 2000 字符限制）
/// 2. 解析并缓存校验接收方用户是否有效
/// 3. 校验双方好友关系（三级缓存：本地 LRU → Redis → MySQL，含批量预加载）
/// 4. 构建 `MessageDto`，通过 Lua 脚本**原子热写入 Redis**（客户端去重 + 消息体 +
///    会话索引 + 最后消息 + 未读计数 + 待处理事件队列）
/// 5. 异步触发 AI 自动回复（`ai::auto_reply::maybe_trigger`，通过 `tokio::spawn`）
///
/// **返回**：写入成功后的完整 `MessageDto`（含服务端生成的 Snowflake ID）。
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
        request.encrypted,
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
    let e2ee_enabled = private_e2ee_enabled(db, &conversation_id).await?;
    if e2ee_enabled || request.encrypted.unwrap_or(false) || request.e2ee_envelope.is_some() {
        let envelope = private_e2ee_envelope_from_request(&request)?;
        validate_e2ee_envelope(
            envelope,
            &conversation_id,
            identity.user_id,
            Some(receiver_id),
            db,
        )
        .await?;
        let device_ids = resolve_recipient_device_ids(envelope);
        validate_recipient_devices_not_revoked(db, &device_ids).await?;
    }
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
            encrypted: request.encrypted,
            e2ee_header: None,
            e2ee_device_id: request
                .e2ee_envelope
                .as_ref()
                .map(|envelope| envelope.sender_device_id.clone())
                .or(request.e2ee_device_id),
            e2ee_sender_identity_key: None,
            e2ee_ephemeral_key: None,
            e2ee_envelope: request.e2ee_envelope,
        },
    );
    let event = build_message_created_event(&conversation_id, &message);
    let hot_redis_clone = hot_redis.clone();
    let result = write_private_message_hot(hot_redis, &conversation_id, &message, &event).await;

    if config.ai_enabled && result.is_ok() {
        let sender_id = identity.user_id;
        let sender_is_human = !message.is_ai_generated.unwrap_or(false);
        if sender_is_human {
            let round_key = format!("im:ai:rounds:{conversation_id}");
            let has_active_conversation: Option<i64> = {
                let mut check_redis = cache_redis.clone();
                redis::cmd("GET")
                    .arg(&round_key)
                    .query_async::<Option<i64>>(&mut check_redis)
                    .await
                    .unwrap_or(None)
            };
            if has_active_conversation.unwrap_or(0) > 0 {
                let disable_db = db.clone();
                let mut disable_redis = cache_redis.clone();
                tokio::spawn(async move {
                    let _ = sqlx::query(
                        "UPDATE service_user_service_db.user_ai_settings SET auto_reply_enabled=0, updated_time=NOW() WHERE user_id=? AND auto_reply_enabled=1",
                    )
                    .bind(sender_id)
                    .execute(&disable_db)
                    .await;
                    let _ = redis::cmd("DEL")
                        .arg(keys::ai_auto_reply_key(sender_id))
                        .query_async::<()>(&mut disable_redis)
                        .await;
                    tracing::info!(sender = %sender_id, "human intervened in active AI conversation, disabled sender auto-reply");
                });
            }
        }

        let auto_redis = cache_redis.clone();
        let auto_msg_redis = hot_redis_clone;
        let auto_config = config.clone();
        let auto_db = db.clone();
        let auto_msg = message.clone();
        let auto_conv = conversation_id;
        let target = receiver_id;
        tokio::spawn(async move {
            let mut redis = auto_redis;
            let mut msg_redis = auto_msg_redis;
            crate::ai::auto_reply::maybe_trigger(
                &mut redis,
                &mut msg_redis,
                &auto_db,
                &auto_config,
                target,
                &auto_conv,
                &auto_msg,
            )
            .await;
        });
    }

    result
}

/// 发送群聊消息。
///
/// **鉴权要求**：通过 `identity` 参数传入已验证的调用者身份。
///
/// **业务流程**：
/// 1. 校验输入、解析并缓存校验群组是否有效
/// 2. 校验发送者是否为群成员
/// 3. 批量校验 @提及的用户是否为群成员（非成员直接拒绝）
/// 4. 通过 Lua 脚本原子热写入 Redis，群聊消息额外生成 `conversation_seq`
///    （Lua 内 `INCR`，并通过 `string.gsub` 替换 JSON 中的 `null` 占位符）
///
/// **返回**：写入成功后的完整 `MessageDto`。
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
        request.encrypted,
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
    let validated_mentioned_ids = batch_validate_mentioned_members(
        cache_redis,
        db,
        group_id,
        identity.user_id,
        request.mentioned_user_ids.as_deref(),
    )
    .await?;
    let conversation_id = keys::group_conversation_id(group_id);
    let e2ee_enabled = group_e2ee_enabled(db, group_id).await?;
    if e2ee_enabled || request.encrypted.unwrap_or(false) || request.e2ee_envelope.is_some() {
        let envelope = request
            .e2ee_envelope
            .as_ref()
            .ok_or_else(|| AppError::BadRequest("e2ee envelope required".to_string()))?;
        if request
            .content
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
        {
            return Err(AppError::BadRequest(
                "plaintext content forbidden in e2ee session".to_string(),
            ));
        }
        validate_e2ee_envelope(envelope, &conversation_id, identity.user_id, None, db)
            .await?;
        let device_ids = resolve_recipient_device_ids(envelope);
        validate_recipient_devices_not_revoked(db, &device_ids).await?;
    }
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
            encrypted: request.encrypted,
            e2ee_header: None,
            e2ee_device_id: request
                .e2ee_envelope
                .as_ref()
                .map(|envelope| envelope.sender_device_id.clone()),
            e2ee_sender_identity_key: None,
            e2ee_ephemeral_key: None,
            e2ee_envelope: request.e2ee_envelope,
        },
    );
    let mut event = build_message_created_event(&conversation_id, &message);
    if request.mentioned_user_ids.is_some() {
        let mut mentioned_ids = validated_mentioned_ids;
        mentioned_ids.push(identity.user_id);
        mentioned_ids.sort_unstable();
        mentioned_ids.dedup();
        event.mentioned_user_ids = Some(mentioned_ids);
    }
    write_group_message_hot(hot_redis, group_id, &conversation_id, &message, &event).await
}

/// 标记会话为已读。
///
/// **鉴权要求**：通过 `identity` 参数传入已验证的调用者身份。
///
/// **业务流程**：自动识别私聊/群聊会话，分别调用对应的已读处理逻辑。
/// 私聊会更新读游标并清除未读计数；群聊额外更新 `last_read_seq`。
/// 已读事件通过 `write_state_event` 写入待处理事件队列，由后台推送分发器异步投递。
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

/// 撤回或删除消息。
///
/// **鉴权要求**：仅消息发送者可以操作，否则返回 403。
///
/// **安全约束**：撤回操作（`MessageStatus::Recalled`）限制在消息发送后 2 分钟内。
/// 删除操作（`MessageStatus::Deleted`）无时间限制。
///
/// **业务流程**：从所有热 Redis 分片中查找消息（缓存未命中时回退到 MySQL），
/// 更新消息状态并写入状态变更事件到待处理队列。
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
pub async fn conversations(
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

#[allow(dead_code)]
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

fn extract_peer_id(user_id: i64, message: &MessageDto) -> Option<i64> {
    if message.sender_id == user_id.to_string() {
        message
            .receiver_id
            .as_deref()
            .and_then(|v| v.parse::<i64>().ok())
    } else {
        message.sender_id.parse::<i64>().ok()
    }
}

async fn batch_load_last_messages(
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

async fn batch_load_unread_counts(
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

async fn batch_load_user_metadata(
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

async fn batch_load_group_metadata(
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

async fn batch_load_group_sequences(
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

async fn batch_load_group_read_sequences(
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

async fn batch_load_last_messages_from_db(
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

/// 查询私聊历史消息。
///
/// **鉴权要求**：需要有效的身份，且与对方存在好友关系。
///
/// **返回**：按消息 ID 降序排列的消息列表（最新在前），已删除的消息自动过滤。
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

/// 查询群聊历史消息。
///
/// **鉴权要求**：需要有效的身份，且为群组有效成员。
///
/// **返回**：按消息 ID 降序排列的消息列表，已删除的消息自动过滤。
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
    encrypted: Option<bool>,
) -> Result<(), AppError> {
    let ty = MessageType::from_text(message_type.unwrap_or("TEXT"));
    if matches!(ty, MessageType::Text | MessageType::System) {
        if !encrypted.unwrap_or(false) && content.is_none_or(|value| value.trim().is_empty()) {
            return Err(AppError::BadRequest(
                "message content cannot be blank".to_string(),
            ));
        }
        if !encrypted.unwrap_or(false) && content.unwrap_or_default().chars().count() > 2000 {
            return Err(AppError::BadRequest(
                "message content cannot exceed 2000 characters".to_string(),
            ));
        }
    } else if media_url.is_none_or(|value| value.trim().is_empty()) {
        return Err(AppError::BadRequest("mediaUrl cannot be blank".to_string()));
    }
    Ok(())
}

fn decode_base64url(value: &str) -> Result<Vec<u8>, AppError> {
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
fn validate_e2ee_envelope_format(envelope: &E2eeEnvelopeDto) -> Result<(), AppError> {
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
        return Err(AppError::BadRequest("invalid rust e2ee wire header".to_string()));
    }
    if envelope.sender_device_id.trim().is_empty() {
        return Err(AppError::BadRequest(
            "rust e2ee sender_device_id required".to_string(),
        ));
    }
    Ok(())
}

fn private_e2ee_envelope_from_request(
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

async fn validate_e2ee_envelope(
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
fn e2ee_session_id_matches(session_id: &str, conversation_id: &str) -> Result<(), AppError> {
    if session_id.trim().is_empty() {
        return Err(AppError::BadRequest(
            "e2ee envelope session_id required".to_string(),
        ));
    }
    let normalized_conv = conversation_id.strip_prefix("p_").unwrap_or(conversation_id);
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
async fn validate_device_active(db: &MySqlPool, device_id: &str) -> Result<(), AppError> {
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
async fn validate_device_ownership(
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
fn resolve_recipient_device_ids(envelope: &E2eeEnvelopeDto) -> Vec<String> {
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
async fn private_e2ee_enabled(db: &MySqlPool, conversation_id: &str) -> Result<bool, AppError> {
    // 去掉 "p_" 前缀得到前端格式的 session_id
    let short_id = conversation_id.strip_prefix("p_").unwrap_or(conversation_id);

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

async fn group_e2ee_enabled(db: &MySqlPool, group_id: i64) -> Result<bool, AppError> {
    let enabled: Option<String> = sqlx::query_scalar(
        "SELECT status FROM service_user_service_db.e2ee_groups WHERE group_id = ?",
    )
    .bind(group_id)
    .fetch_optional(db)
    .await?;
    Ok(enabled.as_deref() == Some("encrypted"))
}

async fn validate_recipient_devices_not_revoked(
    db: &MySqlPool,
    device_ids: &[String],
) -> Result<(), AppError> {
    for device_id in device_ids {
        let trimmed = device_id.trim();
        if trimmed.is_empty() || trimmed == "unknown" {
            continue;
        }
        validate_device_active(db, trimmed).await.map_err(|_| {
            AppError::BadRequest("revoked e2ee recipient device".to_string())
        })?;
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
    encrypted: Option<bool>,
    e2ee_header: Option<String>,
    e2ee_device_id: Option<String>,
    e2ee_sender_identity_key: Option<String>,
    e2ee_ephemeral_key: Option<String>,
    e2ee_envelope: Option<E2eeEnvelopeDto>,
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
        is_ai_generated: None,
        ai_provider: None,
        ai_model: None,
        encrypted: input.encrypted,
        e2ee_header: input.e2ee_header,
        e2ee_device_id: input.e2ee_device_id,
        e2ee_sender_identity_key: input.e2ee_sender_identity_key,
        e2ee_ephemeral_key: input.e2ee_ephemeral_key,
        e2ee_envelope: input.e2ee_envelope,
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

/// 通过 Lua 脚本原子写入私聊消息到热 Redis。
///
/// **原子操作**（单次 Lua 调用）：
/// - 客户端去重（`im:client:{sid}:{cid}`）
/// - 消息体存储（`im:msg:{id}`，TTL 14 天）
/// - 会话消息索引（`ZADD im:conv:{conv}:msgs`）
/// - 最后消息更新（`im:conv:{conv}:last`）
/// - 双方用户会话索引（`ZADD im:user:{uid}:convs`）
/// - 接收方未读计数递增（`HINCRBY im:user:{uid}:unread`）
/// - 待处理事件队列（`ZADD im:pending:events` + 事件体缓存）
///
/// **返回**：写入后的 `MessageDto`（如果客户端去重命中，返回已有消息）。
pub async fn write_private_message_hot(
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
    messages.sort_by(|a, b| {
        let aid = a.id.parse::<i64>().unwrap_or(0);
        let bid = b.id.parse::<i64>().unwrap_or(0);
        bid.cmp(&aid)
    });
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
    let result = crate::access_control::ensure_group_member(db, group_id, user_id).await;
    let allowed = result.is_ok();
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
        .unwrap_or(false)
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
    let updated: chrono::NaiveDateTime = row
        .try_get::<Option<chrono::NaiveDateTime>, _>("updated_time")
        .ok()
        .flatten()
        .unwrap_or(created);
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
            6 => "AI_REPLY",
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
        is_ai_generated: None,
        ai_provider: None,
        ai_model: None,
        encrypted: row
            .try_get::<i8, _>("encrypted")
            .ok()
            .map(|value| value != 0),
        e2ee_header: row
            .try_get::<Option<String>, _>("e2ee_header")
            .ok()
            .flatten(),
        e2ee_device_id: row
            .try_get::<Option<String>, _>("e2ee_device_id")
            .ok()
            .flatten(),
        e2ee_sender_identity_key: row
            .try_get::<Option<String>, _>("e2ee_sender_identity_key")
            .ok()
            .flatten(),
        e2ee_ephemeral_key: row
            .try_get::<Option<String>, _>("e2ee_ephemeral_key")
            .ok()
            .flatten(),
        e2ee_envelope: row
            .try_get::<Option<String>, _>("e2ee_envelope_json")
            .ok()
            .flatten()
            .and_then(|value| serde_json::from_str(&value).ok()),
    }
}

#[allow(dead_code)]
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

fn validate_mentioned_user_ids(mentioned: &[String], sender_id: i64) -> Result<Vec<i64>, AppError> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for raw in mentioned {
        let uid: i64 = raw
            .trim()
            .parse()
            .map_err(|_| AppError::BadRequest("invalid mentioned user id".to_string()))?;
        if uid != sender_id && seen.insert(uid) {
            result.push(uid);
        }
    }
    Ok(result)
}

async fn batch_validate_mentioned_members(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    group_id: i64,
    sender_id: i64,
    mentioned: Option<&[String]>,
) -> Result<Vec<i64>, AppError> {
    let Some(mentioned) = mentioned else {
        return Ok(Vec::new());
    };
    let user_ids = validate_mentioned_user_ids(mentioned, sender_id)?;
    if user_ids.is_empty() {
        return Ok(user_ids);
    }
    let valid_ids =
        crate::access_control::ensure_group_members_batch(db, group_id, &user_ids).await?;
    for uid in &valid_ids {
        let key = format!("im:cache:group_member:{group_id}:{uid}");
        local_cache::set_bool(&key, true);
        let result: redis::RedisResult<()> =
            redis.set_ex(&key, "1", VALIDATION_CACHE_TTL_SECONDS).await;
        if let Err(error) = result {
            tracing::warn!(key = %key, error = %error, "failed to cache group member validation");
        }
    }
    Ok(valid_ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rust_wire_base64_for_tests() -> String {
        let mut wire = vec![0_u8, 0_u8, 0_u8, 52_u8];
        wire.extend(std::iter::repeat(1_u8).take(52));
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, wire)
    }

    fn rust_e2ee_envelope_for_tests() -> E2eeEnvelopeDto {
        E2eeEnvelopeDto {
            version: 2,
            alg: "rust-x25519-x3dh-dr-v1".to_string(),
            conversation_id: String::new(),
            client_msg_id: "cm-mobile".to_string(),
            server_message_id: None,
            sender_user_id: "1".to_string(),
            sender_device_id: "mobile-sender".to_string(),
            recipient_user_id: Some("2".to_string()),
            recipient_device_ids: Vec::new(),
            session_id: "1_2".to_string(),
            key_id: String::new(),
            key_version: 0,
            iv: String::new(),
            aad: String::new(),
            ciphertext: String::new(),
            created_at: 0,
            wire: Some(rust_wire_base64_for_tests()),
            handshake: Some("aGFuZHNoYWtl".to_string()),
            recipient_device_id: Some("mobile-recipient".to_string()),
        }
    }

    fn private_request_with_e2ee_envelope(envelope: E2eeEnvelopeDto) -> SendPrivateRequest {
        SendPrivateRequest {
            receiver_id: 2,
            client_message_id: Some("cm-mobile".to_string()),
            message_type: Some("TEXT".to_string()),
            content: None,
            media_url: None,
            media_size: None,
            media_name: None,
            thumbnail_url: None,
            duration: None,
            encrypted: Some(true),
            e2ee_header: None,
            e2ee_device_id: Some("mobile-sender".to_string()),
            e2ee_sender_identity_key: None,
            e2ee_ephemeral_key: None,
            e2ee_envelope: Some(envelope),
        }
    }

    #[test]
    fn mobile_rust_v2_envelope_format_is_accepted() {
        let envelope = rust_e2ee_envelope_for_tests();
        assert!(validate_e2ee_envelope_format(&envelope).is_ok());
    }

    #[test]
    fn legacy_e2ee_envelope_format_is_rejected() {
        let mut envelope = rust_e2ee_envelope_for_tests();
        envelope.version = 1;
        envelope.alg = "legacy-e2ee".to_string();
        assert!(validate_e2ee_envelope_format(&envelope).is_err());
    }

    #[test]
    fn mobile_rust_v2_private_request_shape_is_accepted() {
        let request = private_request_with_e2ee_envelope(rust_e2ee_envelope_for_tests());
        assert!(private_e2ee_envelope_from_request(&request).is_ok());
    }

    #[test]
    fn private_e2ee_request_with_plaintext_content_is_rejected() {
        let mut request = private_request_with_e2ee_envelope(rust_e2ee_envelope_for_tests());
        request.content = Some("plaintext secret".to_string());
        assert!(private_e2ee_envelope_from_request(&request).is_err());
    }

    #[test]
    fn private_e2ee_request_with_legacy_header_is_rejected() {
        let mut request = private_request_with_e2ee_envelope(rust_e2ee_envelope_for_tests());
        request.e2ee_header = Some("legacy-header".to_string());
        assert!(private_e2ee_envelope_from_request(&request).is_err());
    }

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
            is_ai_generated: None,
            ai_provider: None,
            ai_model: None,
            encrypted: None,
            e2ee_header: None,
            e2ee_device_id: None,
            e2ee_sender_identity_key: None,
            e2ee_ephemeral_key: None,
            e2ee_envelope: None,
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

    #[test]
    fn validate_mentioned_user_ids_deduplicates() -> Result<(), Box<dyn std::error::Error>> {
        let input = vec!["100".to_string(), "200".to_string(), "100".to_string()];
        let result = validate_mentioned_user_ids(&input, 1)?;
        assert_eq!(result, vec![100, 200]);
        Ok(())
    }

    #[test]
    fn validate_mentioned_user_ids_excludes_sender() -> Result<(), Box<dyn std::error::Error>> {
        let input = vec!["100".to_string(), "200".to_string()];
        let result = validate_mentioned_user_ids(&input, 100)?;
        assert_eq!(result, vec![200]);
        Ok(())
    }

    #[test]
    fn validate_mentioned_user_ids_rejects_invalid_string() {
        let input = vec!["abc".to_string()];
        let result = validate_mentioned_user_ids(&input, 1);
        assert!(result.is_err());
    }

    #[test]
    fn validate_mentioned_user_ids_trims_whitespace() -> Result<(), Box<dyn std::error::Error>> {
        let input = vec![" 100 ".to_string(), "\t200\t".to_string()];
        let result = validate_mentioned_user_ids(&input, 1)?;
        assert_eq!(result, vec![100, 200]);
        Ok(())
    }

    #[test]
    fn validate_mentioned_user_ids_empty_input() -> Result<(), Box<dyn std::error::Error>> {
        let input: Vec<String> = vec![];
        let result = validate_mentioned_user_ids(&input, 1)?;
        assert!(result.is_empty());
        Ok(())
    }

    #[test]
    fn validate_mentioned_user_ids_all_sender_excluded() -> Result<(), Box<dyn std::error::Error>> {
        let input = vec!["50".to_string(), "50".to_string()];
        let result = validate_mentioned_user_ids(&input, 50)?;
        assert!(result.is_empty());
        Ok(())
    }

    // ---------- e2ee_session_id_matches ----------

    #[test]
    fn e2ee_session_id_without_prefix_matches() -> Result<(), &'static str> {
        e2ee_session_id_matches("1_2", "p_1_2").map_err(|_| "should match")?;
        Ok(())
    }

    #[test]
    fn e2ee_session_id_with_p_prefix_when_conv_has_p() -> Result<(), &'static str> {
        // conversation_id 本就不带 p_ 时也应匹配
        e2ee_session_id_matches("1_2", "1_2").map_err(|_| "should match")?;
        Ok(())
    }

    #[test]
    fn e2ee_session_id_mismatch_rejected() {
        let result = e2ee_session_id_matches("1_3", "p_1_2");
        assert!(result.is_err());
    }

    #[test]
    fn e2ee_session_id_empty_rejected() {
        let result = e2ee_session_id_matches("", "p_1_2");
        assert!(result.is_err());
    }

    #[test]
    fn e2ee_session_id_whitespace_only_rejected() {
        let result = e2ee_session_id_matches("  ", "p_1_2");
        assert!(result.is_err());
    }
}
