use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::message;
use crate::web::AppState;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::routing::{get, post};
use axum::{Json, Router};
use im_common::{api::ApiResponse, keys};
use redis::aio::ConnectionManager;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/message/config", get(message_config))
        .route("/api/message/send/private", post(send_private))
        .route("/api/message/send/group", post(send_group))
        .route("/api/message/read/:conversation_id", post(mark_read))
        .route("/api/message/recall/:message_id", post(recall_message))
        .route("/api/message/delete/:message_id", post(delete_message))
        .route("/api/message/conversations", get(conversations))
        .route("/api/message/private/:peer_id", get(private_history))
        .route("/api/message/private/:peer_id/cursor", get(private_history))
        .route("/api/message/group/:group_id", get(group_history))
        .route("/api/message/group/:group_id/cursor", get(group_history))
}

async fn message_config() -> Json<ApiResponse<message::MessageConfig>> {
    Json(ApiResponse::success(message::MessageConfig {
        text_enforce: true,
        text_max_length: 2000,
    }))
}

fn private_redis_shards(state: &AppState) -> Vec<ConnectionManager> {
    state.private_redis_managers.iter().cloned().collect()
}

fn group_redis_shards(state: &AppState) -> Vec<ConnectionManager> {
    state.group_redis_managers.iter().cloned().collect()
}

fn private_redis_for_conversation(
    state: &AppState,
    conversation_id: &str,
) -> Result<ConnectionManager, AppError> {
    let index = message::shard_index_for_key(conversation_id, state.private_redis_managers.len())
        .ok_or_else(|| AppError::Upstream("private hot redis shard missing".to_string()))?;
    redis_for_index(&state.private_redis_managers, index, "private")
}

fn group_redis_for_group(state: &AppState, group_id: i64) -> Result<ConnectionManager, AppError> {
    let index = message::shard_index_for_group_id(group_id, state.group_redis_managers.len())
        .ok_or_else(|| AppError::Upstream("group hot redis shard missing".to_string()))?;
    redis_for_index(&state.group_redis_managers, index, "group")
}

fn private_redis_for_read(
    state: &AppState,
    user_id: i64,
    raw_conversation_id: &str,
) -> Result<ConnectionManager, AppError> {
    if group_id_from_conversation(raw_conversation_id).is_some() {
        return first_redis(&state.private_redis_managers, "private");
    }
    let conversation_id = private_conversation_id_for_read(user_id, raw_conversation_id)?;
    private_redis_for_conversation(state, &conversation_id)
}

fn group_redis_for_read(
    state: &AppState,
    raw_conversation_id: &str,
) -> Result<ConnectionManager, AppError> {
    if let Some(group_id) = group_id_from_conversation(raw_conversation_id) {
        return group_redis_for_group(state, group_id);
    }
    first_redis(&state.group_redis_managers, "group")
}

fn first_redis(shards: &[ConnectionManager], label: &str) -> Result<ConnectionManager, AppError> {
    redis_for_index(shards, 0, label)
}

fn redis_for_index(
    shards: &[ConnectionManager],
    index: usize,
    label: &str,
) -> Result<ConnectionManager, AppError> {
    shards
        .get(index)
        .cloned()
        .ok_or_else(|| AppError::Upstream(format!("{label} hot redis shard missing")))
}

fn group_id_from_conversation(raw: &str) -> Option<i64> {
    let value = raw.trim();
    value
        .strip_prefix("group_")
        .or_else(|| value.strip_prefix("g_"))
        .and_then(|group_id| group_id.parse::<i64>().ok())
}

fn private_conversation_id_for_read(user_id: i64, raw: &str) -> Result<String, AppError> {
    let value = raw.trim();
    if value.starts_with("p_") {
        return Ok(value.to_string());
    }
    if value.contains('_') {
        let peer_id = value
            .split('_')
            .filter_map(|part| part.parse::<i64>().ok())
            .find(|id| *id != user_id)
            .ok_or_else(|| AppError::BadRequest("invalid private conversation".to_string()))?;
        return Ok(keys::private_conversation_id(user_id, peer_id));
    }
    let peer_id = value
        .parse::<i64>()
        .map_err(|_| AppError::BadRequest("invalid private conversation".to_string()))?;
    Ok(keys::private_conversation_id(user_id, peer_id))
}

async fn send_private(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<message::SendPrivateRequest>,
) -> Result<Json<ApiResponse<im_common::event::MessageDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let conversation_id = keys::private_conversation_id(identity.user_id, request.receiver_id);
    let mut cache_redis = state.redis_manager.clone();
    let mut hot_redis = private_redis_for_conversation(&state, &conversation_id)?;
    let dto = message::send_private(
        &state.config,
        &mut cache_redis,
        &mut hot_redis,
        &state.db,
        &identity,
        request,
    )
    .await?;
    Ok(Json(ApiResponse::success(dto)))
}

async fn send_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<message::SendGroupRequest>,
) -> Result<Json<ApiResponse<im_common::event::MessageDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let mut cache_redis = state.redis_manager.clone();
    let mut hot_redis = group_redis_for_group(&state, request.group_id)?;
    let dto = message::send_group(
        &state.config,
        &mut cache_redis,
        &mut hot_redis,
        &state.db,
        &identity,
        request,
    )
    .await?;
    Ok(Json(ApiResponse::success(dto)))
}

async fn mark_read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(conversation_id): Path<String>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let mut cache_redis = state.redis_manager.clone();
    let mut private_redis = private_redis_for_read(&state, identity.user_id, &conversation_id)?;
    let mut group_redis = group_redis_for_read(&state, &conversation_id)?;
    message::mark_read(
        &mut cache_redis,
        &mut private_redis,
        &mut group_redis,
        &state.db,
        &identity,
        &conversation_id,
    )
    .await?;
    Ok(Json(ApiResponse::success("ok".to_string())))
}

async fn recall_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(message_id): Path<i64>,
) -> Result<Json<ApiResponse<im_common::event::MessageDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let mut private_redis = private_redis_shards(&state);
    let mut group_redis = group_redis_shards(&state);
    let dto = message::recall_or_delete(
        &mut private_redis,
        &mut group_redis,
        &state.db,
        &identity,
        message_id,
        im_common::event::MessageStatus::Recalled,
    )
    .await?;
    Ok(Json(ApiResponse::success(dto)))
}

async fn delete_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(message_id): Path<i64>,
) -> Result<Json<ApiResponse<im_common::event::MessageDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let mut private_redis = private_redis_shards(&state);
    let mut group_redis = group_redis_shards(&state);
    let dto = message::recall_or_delete(
        &mut private_redis,
        &mut group_redis,
        &state.db,
        &identity,
        message_id,
        im_common::event::MessageStatus::Deleted,
    )
    .await?;
    Ok(Json(ApiResponse::success(dto)))
}

async fn conversations(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Vec<message::ConversationDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let mut private_redis = private_redis_shards(&state);
    let mut group_redis = group_redis_shards(&state);
    let list =
        message::conversations(&mut private_redis, &mut group_redis, &state.db, &identity).await?;
    Ok(Json(ApiResponse::success(list)))
}

async fn private_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(peer_id): Path<i64>,
    Query(query): Query<message::HistoryQuery>,
) -> Result<Json<ApiResponse<Vec<im_common::event::MessageDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let conversation_id = keys::private_conversation_id(identity.user_id, peer_id);
    let mut cache_redis = state.redis_manager.clone();
    let mut hot_redis = private_redis_for_conversation(&state, &conversation_id)?;
    let list = message::private_history(
        &mut cache_redis,
        &mut hot_redis,
        &state.db,
        &identity,
        peer_id,
        query,
    )
    .await?;
    Ok(Json(ApiResponse::success(list)))
}

async fn group_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
    Query(query): Query<message::HistoryQuery>,
) -> Result<Json<ApiResponse<Vec<im_common::event::MessageDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let mut cache_redis = state.redis_manager.clone();
    let mut hot_redis = group_redis_for_group(&state, group_id)?;
    let list = message::group_history(
        &mut cache_redis,
        &mut hot_redis,
        &state.db,
        &identity,
        group_id,
        query,
    )
    .await?;
    Ok(Json(ApiResponse::success(list)))
}
