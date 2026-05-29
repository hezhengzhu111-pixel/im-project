use super::*;
use crate::access_control;
use crate::auth::identity_from_headers;
use crate::auth_api;
use crate::error::AppError;
use crate::id_resolver::{resolve_active_group_id, resolve_active_user_id};
use crate::local_cache;
use crate::social_helpers::normalize_optional;
use crate::web::AppState;
use axum::body::Bytes;
use axum::extract::{OriginalUri, Path, Query, State};
use axum::http::HeaderMap;
use axum::Json;
use chrono::NaiveDateTime;
use im_rs_common::api::ApiResponse;
use im_rs_common::event::{ImEvent, ImEventType};
use im_rs_common::{ids, keys, time};
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde::{de, Deserialize, Deserializer, Serialize};
use serde_json::Value;
use sqlx::{MySqlPool, Row};
use std::collections::{BTreeSet, HashMap};

const FRIEND_CACHE_TTL_SECONDS: u64 = 5 * 60;

pub(crate) async fn friend_list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Vec<FriendshipDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let rows = sqlx::query(
        r#"SELECT f.id, f.friend_id, f.remark, f.created_time,
                  u.username, u.nickname, u.avatar
           FROM service_user_service_db.im_friend f
           JOIN service_user_service_db.users u ON u.id = f.friend_id
           WHERE f.user_id = ? AND f.status = 1 AND u.status = 1
           ORDER BY f.created_time DESC"#,
    )
    .bind(identity.user_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(ApiResponse::success(
        rows.iter().map(friendship_from_row).collect(),
    )))
}

pub(crate) async fn friend_requests(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Vec<FriendRequestDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let rows = sqlx::query(
        r#"SELECT r.id, r.applicant_id, r.target_user_id, r.status, r.apply_reason,
                  r.apply_time, r.handle_time,
                  au.username AS applicant_username, au.nickname AS applicant_nickname, au.avatar AS applicant_avatar,
                  tu.username AS target_username, tu.nickname AS target_nickname, tu.avatar AS target_avatar
           FROM service_user_service_db.friend_request r
           JOIN service_user_service_db.users au ON au.id = r.applicant_id
           JOIN service_user_service_db.users tu ON tu.id = r.target_user_id
           WHERE r.target_user_id = ? OR r.applicant_id = ?
           ORDER BY r.apply_time DESC
           LIMIT 100"#,
    )
    .bind(identity.user_id)
    .bind(identity.user_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(ApiResponse::success(
        rows.iter().map(friend_request_from_row).collect(),
    )))
}

pub(crate) async fn add_friend(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<AddFriendRequest>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let target_user_id = resolve_user_id_or_not_found(&state.db, request.target_user_id).await?;
    if target_user_id == identity.user_id {
        return Err(AppError::BadRequest("cannot add yourself".to_string()));
    }
    if are_friends(&state.db, identity.user_id, target_user_id).await? {
        let mut redis = state.redis_manager.clone();
        cache_friendship(&mut redis, identity.user_id, target_user_id, true).await;
        return Ok(Json(ApiResponse::success(true)));
    }
    let request_id = ids::next_id(state.config.snowflake_node_id);
    sqlx::query(
        r#"INSERT INTO service_user_service_db.friend_request
           (id, applicant_id, target_user_id, status, apply_reason)
           VALUES (?, ?, ?, 0, ?)"#,
    )
    .bind(request_id)
    .bind(identity.user_id)
    .bind(target_user_id)
    .bind(normalize_optional(request.reason.as_deref()))
    .execute(&state.db)
    .await?;
    {
        let mut event = ImEvent::new(
            ImEventType::FriendRequestCreated,
            format!("friend_req:{}", request_id),
        );
        event.sender_id = Some(identity.user_id.to_string());
        event.target_user_id = Some(target_user_id.to_string());
        write_social_event(&state, &event).await;
    }
    Ok(Json(ApiResponse::success(true)))
}

pub(crate) async fn accept_friend(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<HandleFriendRequest>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let row = load_friend_request(&state.db, request.request_id).await?;
    let target_user_id: i64 = row
        .try_get("target_user_id")
        .ok()
        .flatten()
        .unwrap_or_default();
    if target_user_id != identity.user_id {
        return Err(AppError::Forbidden("not request target user".to_string()));
    }
    let applicant_id: i64 = row
        .try_get("applicant_id")
        .ok()
        .flatten()
        .unwrap_or_default();
    sqlx::query("UPDATE service_user_service_db.friend_request SET status = 1, handle_time = NOW() WHERE id = ?")
        .bind(request.request_id)
        .execute(&state.db)
        .await?;
    upsert_friendship(
        &state.db,
        state.config.snowflake_node_id,
        identity.user_id,
        applicant_id,
        None,
    )
    .await?;
    upsert_friendship(
        &state.db,
        state.config.snowflake_node_id,
        applicant_id,
        identity.user_id,
        None,
    )
    .await?;
    let mut redis = state.redis_manager.clone();
    cache_friendship(&mut redis, identity.user_id, applicant_id, true).await;
    cache_friendship(&mut redis, applicant_id, identity.user_id, true).await;
    {
        let mut event = ImEvent::new(
            ImEventType::FriendRequestAccepted,
            format!("friend_acc:{}", request.request_id),
        );
        event.sender_id = Some(identity.user_id.to_string());
        event.target_user_id = Some(applicant_id.to_string());
        write_social_event(&state, &event).await;
    }
    Ok(Json(ApiResponse::success(true)))
}

pub(crate) async fn reject_friend(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<HandleFriendRequest>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let row = load_friend_request(&state.db, request.request_id).await?;
    let target_user_id: i64 = row
        .try_get("target_user_id")
        .ok()
        .flatten()
        .unwrap_or_default();
    if target_user_id != identity.user_id {
        return Err(AppError::Forbidden("not request target user".to_string()));
    }
    sqlx::query("UPDATE service_user_service_db.friend_request SET status = 2, handle_time = NOW() WHERE id = ?")
        .bind(request.request_id)
        .execute(&state.db)
        .await?;
    Ok(Json(ApiResponse::success(true)))
}

pub(crate) async fn remove_friend(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let friend_id = query_i64(&params, "friendUserId")
        .or_else(|| query_i64(&params, "friendId"))
        .ok_or_else(|| AppError::BadRequest("friendUserId is required".to_string()))?;
    let friend_id = resolve_user_id_or_not_found(&state.db, friend_id).await?;
    sqlx::query(
        "UPDATE service_user_service_db.im_friend SET status = 2 WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
    )
    .bind(identity.user_id)
    .bind(friend_id)
    .bind(friend_id)
    .bind(identity.user_id)
    .execute(&state.db)
    .await?;
    let mut redis = state.redis_manager.clone();
    cache_friendship(&mut redis, identity.user_id, friend_id, false).await;
    cache_friendship(&mut redis, friend_id, identity.user_id, false).await;
    Ok(Json(ApiResponse::success(true)))
}

pub(crate) async fn update_friend_remark(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let friend_id = query_i64(&params, "friendUserId")
        .or_else(|| query_i64(&params, "friendId"))
        .ok_or_else(|| AppError::BadRequest("friendUserId is required".to_string()))?;
    let friend_id = resolve_user_id_or_not_found(&state.db, friend_id).await?;
    let remark = params.get("remark").cloned();
    sqlx::query(
        "UPDATE service_user_service_db.im_friend SET remark = ? WHERE user_id = ? AND friend_id = ? AND status = 1",
    )
    .bind(normalize_optional(remark.as_deref()))
    .bind(identity.user_id)
    .bind(friend_id)
    .execute(&state.db)
    .await?;
    Ok(Json(ApiResponse::success(true)))
}
