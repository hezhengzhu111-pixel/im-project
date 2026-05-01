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
        return Err(AppError::BadRequest("conversationId and content required".to_string()));
    }

    let receiver_id = extract_peer_id(&conv_id, request.persona_user_id)?;

    let msg_id = ids::next_id(state.config.ai_snowflake_node_id);
    let now = time::now_iso();
    let ai_message = MessageDto {
        id: msg_id.to_string(),
        message_id: msg_id.to_string(),
        client_message_id: None,
        sender_id: request.persona_user_id.to_string(),
        sender_name: None,
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
    };

    let mut hot_redis = state.redis_manager.clone();
    message::write_private_message_hot(&mut hot_redis, &conv_id, &ai_message, &im_rs_common::event::ImEvent::new(
        im_rs_common::event::ImEventType::MessageCreated,
        conv_id.clone(),
    ))
    .await?;

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
