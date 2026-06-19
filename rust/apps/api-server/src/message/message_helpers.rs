use super::*;
use crate::error::AppError;
use crate::observability;
use chrono::{DateTime, Utc};
use im_common::event::MessageDto;
use im_common::keys;
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde_json;
use sqlx::{MySqlPool, Row};

pub(crate) fn group_conversation_from_message(
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

pub(crate) async fn current_group_sequence(
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
pub(crate) async fn current_group_read_sequence(
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

pub(crate) fn group_unread_count(group_seq: i64, read_seq: i64) -> i64 {
    let normalized_group_seq = group_seq.max(0);
    let normalized_read_seq = read_seq.max(0);
    match normalized_group_seq.checked_sub(normalized_read_seq) {
        Some(value) if value > 0 => value,
        _ => 0,
    }
}

pub(crate) fn dedup_conversations(conversations: &mut Vec<ConversationDto>) {
    let mut seen = std::collections::HashSet::new();
    conversations.retain(|conversation| {
        seen.insert((
            conversation.conversation_type,
            conversation.conversation_id.clone(),
        ))
    });
}

pub(crate) fn extract_peer_id(user_id: i64, message: &MessageDto) -> Option<i64> {
    if message.is_group_chat {
        return None;
    }
    if message.sender_id == user_id.to_string() {
        message
            .receiver_id
            .as_deref()
            .and_then(|v| v.parse::<i64>().ok())
    } else {
        message.sender_id.parse::<i64>().ok()
    }
}

pub(crate) fn conversation_id_from_message(message: &MessageDto) -> Result<String, AppError> {
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

pub(crate) fn within_recall_window(message: &MessageDto) -> bool {
    DateTime::parse_from_rfc3339(&message.created_time)
        .map(|created| {
            Utc::now()
                .signed_duration_since(created.with_timezone(&Utc))
                .num_seconds()
                <= 120
        })
        .unwrap_or(false)
}

pub(crate) fn parse_conversation_target(
    user_id: i64,
    raw: &str,
) -> Result<ConversationTarget, AppError> {
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
    if peer_id == user_id {
        return Err(AppError::BadRequest(
            "cannot create conversation with yourself".to_string(),
        ));
    }
    Ok(ConversationTarget {
        conversation_id: keys::private_conversation_id(user_id, peer_id),
        frontend_conversation_id: keys::private_conversation_id(user_id, peer_id)
            .trim_start_matches("p_")
            .to_string(),
        peer_id: Some(peer_id),
        group_id: None,
    })
}

pub(crate) fn parse_db_scope(conversation_id: &str) -> Result<DbScope, AppError> {
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

pub(crate) fn message_from_row(row: &sqlx::mysql::MySqlRow) -> MessageDto {
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
