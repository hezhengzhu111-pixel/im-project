use crate::ai::crypto;
use crate::ai::task_bridge::{self, TaskPayload, TaskType};
use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use im_rs_common::api::ApiResponse;
use im_rs_common::{ids, keys};
use redis::aio::ConnectionManager;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryRequest {
    pub conversation_id: String,
    pub mode: Option<String>,
    pub count: Option<u64>,
    pub hours: Option<u64>,
}

pub async fn create(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(body): Json<SummaryRequest>,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let conv_id = body.conversation_id.trim().to_string();
    if conv_id.is_empty() {
        return Err(AppError::BadRequest("conversationId is required".into()));
    }

    let count = body.count.unwrap_or(100).min(200);
    let messages = fetch_recent_messages(&mut state.redis_manager.clone(), &conv_id, count).await?;

    if messages.is_empty() {
        return Err(AppError::BadRequest("no messages to summarize".into()));
    }

    let filtered: Vec<Value> = messages
        .into_iter()
        .filter(|m| {
            m.get("messageType")
                .and_then(|v| v.as_str())
                .map(|t| t == "TEXT")
                .unwrap_or(false)
        })
        .collect();

    if filtered.is_empty() {
        return Err(AppError::BadRequest("no text messages to summarize".into()));
    }

    let truncated = truncate_messages(&filtered, state.config.ai_summary_max_tokens);

    let params_hash = hash_params(&conv_id, count);
    if let Ok(Some(cached)) =
        check_summary_cache(&mut state.redis_manager.clone(), &conv_id, &params_hash).await
    {
        return Ok(Json(ApiResponse::success(json!({
            "taskId": 0,
            "cached": true,
            "content": cached,
        }))));
    }

    let task_id = ids::next_id(state.config.ai_snowflake_node_id);
    let messages_json = task_bridge::serialize_messages(&truncated);

    let (provider, decrypted_key) =
        resolve_provider_and_key(&state.db, &state.config, identity.user_id).await?;

    let mut hot_redis = state.redis_manager.clone();
    task_bridge::enqueue_task(
        &mut hot_redis,
        &state.config,
        TaskPayload {
            task_type: TaskType::Summary,
            user_id: identity.user_id,
            conversation_id: Some(conv_id.clone()),
            provider: Some(provider),
            decrypted_key: Some(decrypted_key),
            messages_json: Some(messages_json),
            task_id: Some(task_id),
            ..Default::default()
        },
    )
    .await?;

    Ok(Json(ApiResponse::success(json!({
        "taskId": task_id,
        "cached": false,
        "streamUrl": format!("/api/ai/stream/{}", task_id),
    }))))
}

async fn fetch_recent_messages(
    redis: &mut ConnectionManager,
    conv_id: &str,
    count: u64,
) -> Result<Vec<Value>, AppError> {
    let key = keys::conversation_messages_key(conv_id);
    let raw: Vec<String> = redis::cmd("ZREVRANGE")
        .arg(&key)
        .arg("0")
        .arg((count.saturating_sub(1)).to_string())
        .query_async(redis)
        .await
        .map_err(|_| AppError::Upstream("failed to read messages from Redis".to_string()))?;

    let mut messages = Vec::new();
    for msg_id in &raw {
        let msg_key = keys::message_key(
            msg_id
                .parse::<i64>()
                .map_err(|_| AppError::Upstream("bad message id".to_string()))?,
        );
        let json_str: Option<String> = redis::cmd("GET")
            .arg(&msg_key)
            .query_async(redis)
            .await
            .map_err(|_| AppError::Upstream("failed to read message".to_string()))?;
        if let Some(json) = json_str {
            if let Ok(value) = serde_json::from_str::<Value>(&json) {
                messages.push(value);
            }
        }
    }
    messages.reverse();
    Ok(messages)
}

fn truncate_messages(messages: &[Value], max_tokens: usize) -> Vec<Value> {
    let mut kept: Vec<Value> = Vec::new();
    let mut total_chars = 0usize;
    let chars_per_token = 4usize;

    for msg in messages.iter().rev() {
        let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
        total_chars = total_chars.saturating_add(content.chars().count());
        kept.push(msg.clone());
        if total_chars / chars_per_token >= max_tokens {
            break;
        }
    }
    kept.reverse();
    kept
}

fn hash_params(conv_id: &str, count: u64) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    conv_id.hash(&mut hasher);
    count.hash(&mut hasher);
    hasher.finish().to_string()
}

async fn check_summary_cache(
    redis: &mut ConnectionManager,
    conv_id: &str,
    params_hash: &str,
) -> Result<Option<String>, AppError> {
    let cache_key = keys::ai_summary_cache_key(conv_id, params_hash);
    let result: Option<String> = redis::cmd("GET")
        .arg(&cache_key)
        .query_async(redis)
        .await
        .map_err(|_| AppError::Upstream("cache read failed".to_string()))?;
    Ok(result)
}

pub async fn resolve_provider_and_key(
    db: &sqlx::MySqlPool,
    config: &crate::config::AppConfig,
    user_id: i64,
) -> Result<(String, String), AppError> {
    let row = sqlx::query_as::<_, (String, String)>(
        "SELECT provider, encrypted_api_key \
         FROM service_user_service_db.user_ai_api_keys \
         WHERE user_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::BadRequest("no active API key configured".to_string()))?;

    let master_key = crypto::load_master_key(&config.ai_encryption_key_base64)?;
    let decrypted = crypto::decrypt(&row.1, &master_key)?;
    Ok((row.0, decrypted))
}
