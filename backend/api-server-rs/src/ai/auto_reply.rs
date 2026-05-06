use crate::ai::summary_handler::resolve_provider_and_key;
use crate::ai::task_bridge::{self, TaskPayload, TaskType};
use crate::config::AppConfig;
use crate::error::AppError;
use im_rs_common::event::MessageDto;
use im_rs_common::{ids, keys};
use redis::aio::ConnectionManager;
use serde_json::Value;
use sqlx::MySqlPool;
use std::time::Duration;

pub async fn maybe_trigger(
    redis: &mut ConnectionManager,
    msg_redis: &mut ConnectionManager,
    db: &MySqlPool,
    config: &AppConfig,
    target_user_id: i64,
    conversation_id: &str,
    original_message: &MessageDto,
) {
    tracing::info!(target = %target_user_id, "auto_reply: checking trigger");
    if let Err(e) = trigger_if_enabled(
        redis,
        msg_redis,
        db,
        config,
        target_user_id,
        conversation_id,
        original_message,
    )
    .await
    {
        tracing::warn!(error = %e, "auto-reply trigger failed");
    }
}

async fn trigger_if_enabled(
    redis: &mut ConnectionManager,
    msg_redis: &mut ConnectionManager,
    db: &MySqlPool,
    config: &AppConfig,
    target_user_id: i64,
    conversation_id: &str,
    original_message: &MessageDto,
) -> Result<(), AppError> {
    if !config.ai_enabled {
        return Ok(());
    }

    let enabled: Option<String> = redis::cmd("HGET")
        .arg(keys::ai_auto_reply_key(target_user_id))
        .arg("enabled")
        .query_async::<Option<String>>(redis)
        .await
        .map_err(|e| AppError::Upstream(format!("redis hget error: {e}")))?;

    let is_enabled = enabled.as_deref() == Some("1");
    if !is_enabled {
        let from_db = check_auto_reply_db(db, target_user_id)
            .await
            .unwrap_or(false);
        if !from_db {
            return Ok(());
        }
        let reply_key = keys::ai_auto_reply_key(target_user_id);
        let _ = redis::cmd("HSET")
            .arg(&reply_key)
            .arg("enabled")
            .arg("1")
            .query_async::<()>(redis)
            .await;
        let _ = redis::cmd("EXPIRE")
            .arg(&reply_key)
            .arg(config.ai_auto_reply_cache_ttl_sec)
            .query_async::<()>(redis)
            .await;
    }

    let anti_key = keys::ai_anti_reentry_key(target_user_id, conversation_id);
    let locked: Option<String> = redis::cmd("SET")
        .arg(&anti_key)
        .arg("1")
        .arg("PX")
        .arg(config.ai_anti_reentry_ms)
        .arg("NX")
        .query_async::<Option<String>>(redis)
        .await
        .map_err(|e| AppError::Upstream(format!("redis set nx error: {e}")))?;

    if locked.is_none() {
        return Ok(());
    }

    let context = build_reply_context(msg_redis, conversation_id, original_message).await?;
    let round_key = format!("im:ai:rounds:{conversation_id}");
    let current_rounds: Option<i64> = redis::cmd("GET")
        .arg(&round_key)
        .query_async::<Option<i64>>(redis)
        .await
        .unwrap_or(None);
    let rounds = current_rounds.unwrap_or(0);
    if rounds >= 20 {
        tracing::info!(conv = %conversation_id, rounds = %rounds, "auto_reply: round limit, pausing 20s then restart");
        tokio::time::sleep(Duration::from_secs(20)).await;
        let _: () = redis::cmd("DEL")
            .arg(&round_key)
            .query_async::<()>(redis)
            .await?;
    }

    let persona = get_persona_db(db, target_user_id).await?;

    let task_id = ids::next_id(config.ai_snowflake_node_id);
    let (provider, decrypted_key) = resolve_provider_and_key(db, config, target_user_id).await?;
    let messages_json = task_bridge::serialize_messages(&context);

    task_bridge::enqueue_task(
        redis,
        config,
        TaskPayload {
            task_type: TaskType::AutoReply,
            user_id: target_user_id,
            conversation_id: Some(conversation_id.to_string()),
            provider: Some(provider),
            decrypted_key: Some(decrypted_key),
            messages_json: Some(messages_json),
            persona: Some(persona),
            task_id: Some(task_id),
            ..Default::default()
        },
    )
    .await?;

    let _: () = redis::cmd("INCR")
        .arg(&round_key)
        .query_async::<()>(redis)
        .await?;
    let _: () = redis::cmd("EXPIRE")
        .arg(&round_key)
        .arg(20i64)
        .query_async::<()>(redis)
        .await?;

    Ok(())
}

async fn check_auto_reply_db(db: &MySqlPool, user_id: i64) -> Result<bool, AppError> {
    let row: Option<(i8,)> = sqlx::query_as(
        "SELECT auto_reply_enabled FROM service_user_service_db.user_ai_settings WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?;
    Ok(row.is_some_and(|r| r.0 != 0))
}

async fn get_persona_db(db: &MySqlPool, user_id: i64) -> Result<String, AppError> {
    let row: Option<(Option<String>,)> = sqlx::query_as(
        "SELECT auto_reply_persona FROM service_user_service_db.user_ai_settings WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?;
    Ok(row.map_or_else(String::new, |r| r.0.unwrap_or_default()))
}

async fn build_reply_context(
    redis: &mut ConnectionManager,
    conv_id: &str,
    _original: &MessageDto,
) -> Result<Vec<Value>, AppError> {
    let key = keys::conversation_messages_key(conv_id);
    tracing::info!(conv = %conv_id, key = %key, "auto_reply: fetching messages");
    let raw: Vec<String> = redis::cmd("ZREVRANGE")
        .arg(&key)
        .arg("0")
        .arg("19")
        .query_async(redis)
        .await
        .map_err(|_| AppError::Upstream("failed to read messages".to_string()))?;

    let mut messages = Vec::new();
    for msg_id in raw.iter().rev() {
        let msg_key = keys::message_key(
            msg_id
                .parse::<i64>()
                .map_err(|_| AppError::Upstream("bad message id".to_string()))?,
        );
        if let Ok(Some(json_str)) = redis::cmd("GET")
            .arg(&msg_key)
            .query_async::<Option<String>>(redis)
            .await
        {
            if let Ok(value) = serde_json::from_str::<Value>(&json_str) {
                messages.push(value);
            }
        }
    }
    Ok(messages)
}
