use super::*;
use crate::config::AppConfig;
use crate::error::AppError;
use im_rs_common::auth::Identity;
use im_rs_common::event::{MessageDto, MessageStatus, MessageType};
use im_rs_common::{ids, keys, time};
use redis::aio::ConnectionManager;
use sqlx::MySqlPool;

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
pub(crate) async fn send_private(
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
pub(crate) async fn send_group(
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
        validate_e2ee_envelope(envelope, &conversation_id, identity.user_id, None, db).await?;
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

pub(crate) fn validate_send_input(
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

pub(crate) fn build_message(config: &AppConfig, identity: &Identity, input: BuildMessageInput) -> MessageDto {
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

