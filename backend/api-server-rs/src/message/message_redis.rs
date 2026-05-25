use crate::error::AppError;
use im_rs_common::event::{ImEvent, ImEventType, MessageDto};
use im_rs_common::{keys, time};
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use redis::Script;
use serde_json;
use super::{FNV_OFFSET_BASIS, FNV_PRIME};

/// 使用 FNV-1a 哈希计算给定 key 对应的热 Redis 分片索引。
///
/// `shard_count` 为 0 时返回 `None`。用于私聊消息的会话级分片路由。
pub(crate) fn shard_index_for_key(key: &str, shard_count: usize) -> Option<usize> {
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
pub(crate) fn shard_index_for_group_id(group_id: i64, shard_count: usize) -> Option<usize> {
    shard_index_for_key(&keys::group_conversation_id(group_id), shard_count)
}

pub(crate) fn build_message_created_event(conversation_id: &str, message: &MessageDto) -> ImEvent {
    let mut event = ImEvent::new(ImEventType::MessageCreated, conversation_id.to_string());
    event.message_id = Some(message.id.clone());
    event.sender_id = Some(message.sender_id.clone());
    event.receiver_id = message.receiver_id.clone();
    event.group_id = message.group_id.clone();
    event.group = message.is_group_chat;
    event.payload = Some(message.clone());
    event
}

pub(crate) fn pending_event_member(event_id: &str, conversation_id: &str) -> String {
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
pub(crate) async fn write_private_message_hot(
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

pub(crate) async fn write_group_message_hot(
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

pub(crate) async fn write_state_event(
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

