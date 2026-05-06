use crate::auth_api::validate_internal_signature;
use crate::error::AppError;
use crate::message;
use crate::web::AppState;
use axum::body::Bytes;
use axum::extract::{OriginalUri, State};
use axum::http::HeaderMap;
use axum::Json;
use im_rs_common::api::ApiResponse;
use im_rs_common::event::{MessageDto, MessageType};
use im_rs_common::{ids, time};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InternalReplyRequest {
    pub task_id: i64,
    pub conversation_id: String,
    pub content: String,
    pub persona_user_id: i64,
    pub provider: Option<String>,
    pub model: Option<String>,
}

pub async fn handle(
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    State(state): State<AppState>,
    body: Bytes,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, &state.config)?;
    let request: InternalReplyRequest = serde_json::from_slice(&body)?;

    let conv_id = request.conversation_id.trim().to_string();
    if conv_id.is_empty() || request.content.trim().is_empty() {
        return Err(AppError::BadRequest(
            "conversationId and content required".to_string(),
        ));
    }

    let receiver_id = extract_peer_id(&conv_id, request.persona_user_id)?;

    let msg_id = ids::next_id(state.config.ai_snowflake_node_id);
    let now = time::now_iso();
    let sender_name = sqlx::query_scalar::<_, Option<String>>(
        "SELECT nickname FROM service_user_service_db.users WHERE id = ?",
    )
    .bind(request.persona_user_id)
    .fetch_optional(&state.db)
    .await?
    .flatten()
    .or_else(|| Some(request.persona_user_id.to_string()));
    let ai_message = MessageDto {
        id: msg_id.to_string(),
        message_id: msg_id.to_string(),
        client_message_id: None,
        sender_id: request.persona_user_id.to_string(),
        sender_name: sender_name.clone(),
        sender_avatar: None,
        receiver_id: Some(receiver_id.to_string()),
        receiver_name: None,
        group_id: None,
        conversation_seq: None,
        group_name: None,
        group_avatar: None,
        is_group_chat: false,
        is_group: false,
        message_type: MessageType::AiReply.as_str().to_string(),
        content: Some(request.content.trim().to_string()),
        media_url: None,
        media_size: None,
        media_name: None,
        thumbnail_url: None,
        duration: None,
        location_info: None,
        status: "SENT".to_string(),
        reply_to_message_id: None,
        created_time: now.clone(),
        created_at: now,
        updated_time: None,
        updated_at: None,
        is_ai_generated: Some(true),
        ai_provider: request.provider,
        ai_model: request.model,
        encrypted: None,
        e2ee_header: None,
        e2ee_device_id: None,
    };

    let mut event = im_rs_common::event::ImEvent::new(
        im_rs_common::event::ImEventType::MessageCreated,
        conv_id.clone(),
    );
    event.message_id = Some(ai_message.id.clone());
    event.sender_id = Some(ai_message.sender_id.clone());
    event.receiver_id = ai_message.receiver_id.clone();
    event.group = false;
    event.payload = Some(ai_message.clone());

    let mut hot_redis = {
        let index =
            crate::message::shard_index_for_key(&conv_id, state.private_redis_managers.len())
                .ok_or_else(|| AppError::Upstream("private hot redis shard missing".to_string()))?;
        state
            .private_redis_managers
            .get(index)
            .ok_or_else(|| AppError::Upstream("private hot redis shard missing".to_string()))?
            .clone()
    };
    let msg_redis = hot_redis.clone();
    message::write_private_message_hot(&mut hot_redis, &conv_id, &ai_message, &event).await?;

    if state.config.ai_enabled {
        let auto_redis = state.redis_manager.clone();
        let auto_config = state.config.clone();
        let auto_db = state.db.clone();
        let auto_msg = ai_message.clone();
        let auto_conv = conv_id.clone();
        tracing::info!(target = %receiver_id, conv = %auto_conv, "internal_reply: triggering auto-reply for receiver");
        tokio::spawn(async move {
            let mut redis = auto_redis;
            let mut msg = msg_redis;
            crate::ai::auto_reply::maybe_trigger(
                &mut redis,
                &mut msg,
                &auto_db,
                &auto_config,
                receiver_id,
                &auto_conv,
                &auto_msg,
            )
            .await;
        });
    }

    Ok(Json(ApiResponse::success(json!({
        "messageId": msg_id,
        "status": "delivered",
    }))))
}

fn extract_peer_id(conv_id: &str, persona_user_id: i64) -> Result<i64, AppError> {
    let rest = conv_id
        .strip_prefix("p_")
        .ok_or_else(|| AppError::BadRequest("invalid conversation id format".to_string()))?;
    let (a_str, b_str) = rest
        .split_once('_')
        .ok_or_else(|| AppError::BadRequest("invalid conversation id format".to_string()))?;
    let a: i64 = a_str
        .parse()
        .map_err(|_| AppError::BadRequest("invalid conversation id".to_string()))?;
    let b: i64 = b_str
        .parse()
        .map_err(|_| AppError::BadRequest("invalid conversation id".to_string()))?;
    if a == persona_user_id {
        Ok(b)
    } else {
        Ok(a)
    }
}
