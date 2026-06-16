use super::*;
use crate::access_control;
use crate::auth::identity_from_headers;
use crate::auth_api;
use crate::error::AppError;
use crate::id_resolver::resolve_active_user_id;
use crate::web::AppState;
use axum::body::Bytes;
use axum::extract::{OriginalUri, Path, Query, State};
use axum::http::HeaderMap;
use axum::Json;
use im_common::api::ApiResponse;
use im_common::{ids, keys};
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde_json::Value;
use sqlx::MySqlPool;

#[allow(dead_code)]
const FRIEND_CACHE_TTL_SECONDS: u64 = 5 * 60;

pub(crate) async fn create_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Result<Json<ApiResponse<GroupDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let name = string_field(&payload, "groupName")
        .or_else(|| string_field(&payload, "name"))
        .ok_or_else(|| AppError::BadRequest("group name is required".to_string()))?;
    let announcement =
        string_field(&payload, "announcement").or_else(|| string_field(&payload, "description"));
    let avatar = string_field(&payload, "avatar");
    let group_id = ids::next_id(state.config.snowflake_node_id);
    let mut member_ids = vec![identity.user_id];
    if let Some(values) = payload.get("memberIds").and_then(Value::as_array) {
        for member_id in values.iter().filter_map(value_to_i64) {
            if let Some(member_id) = resolve_active_user_id(&state.db, member_id).await? {
                member_ids.push(member_id);
            }
        }
    }
    member_ids = distinct(member_ids);
    sqlx::query(
        r#"INSERT INTO service_group_service_db.im_group
           (id, name, avatar, announcement, owner_id, type, max_members, member_count, status)
           VALUES (?, ?, ?, ?, ?, 1, 500, ?, 1)"#,
    )
    .bind(group_id)
    .bind(&name)
    .bind(avatar.as_deref())
    .bind(announcement.as_deref())
    .bind(identity.user_id)
    .bind(
        i32::try_from(member_ids.len())
            .map_err(|_| AppError::BadRequest("group member count is too large".to_string()))?,
    )
    .execute(&state.db)
    .await?;
    for member_id in &member_ids {
        add_group_member(
            &state.db,
            state.config.snowflake_node_id,
            group_id,
            *member_id,
            if *member_id == identity.user_id { 3 } else { 1 },
        )
        .await?;
    }
    let mut redis = group_redis_for_group(&state, group_id)?;
    initialize_group_read_sequences(
        &mut redis,
        &state.db,
        state.config.snowflake_node_id,
        group_id,
        &member_ids,
    )
    .await?;
    let group = load_group(&state.db, group_id).await?;
    Ok(Json(ApiResponse::success(group)))
}

pub(crate) async fn user_groups(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<i64>,
) -> Result<Json<ApiResponse<Vec<GroupDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let effective_user_id = if user_id == identity.user_id {
        user_id
    } else {
        identity.user_id
    };
    let rows = sqlx::query(
        r#"SELECT g.id, g.name, g.avatar, g.announcement, g.owner_id, g.type,
                  g.max_members, g.member_count, g.status, g.created_time
           FROM service_group_service_db.im_group g
           JOIN service_group_service_db.im_group_member m ON m.group_id = g.id
           WHERE m.user_id = ? AND m.status = 1 AND g.status = 1
           ORDER BY g.updated_time DESC"#,
    )
    .bind(effective_user_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(ApiResponse::success(
        rows.iter().map(group_from_row).collect(),
    )))
}

pub(crate) async fn search_groups(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<ApiResponse<Vec<GroupDto>>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    let keyword = params
        .get("q")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::BadRequest("search keyword is required".to_string()))?;
    let like_pattern = format!("%{}%", keyword);
    let rows = sqlx::query(
        r#"SELECT id, name, avatar, announcement, owner_id, type, max_members, member_count, status, created_time
           FROM service_group_service_db.im_group
           WHERE status = 1 AND name LIKE ?
           ORDER BY member_count DESC
           LIMIT 20"#,
    )
    .bind(&like_pattern)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(ApiResponse::success(
        rows.iter().map(group_from_row).collect(),
    )))
}

pub(crate) async fn group_members(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<ApiResponse<GroupMembersResponse>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let payload: Value = serde_json::from_slice(&body)?;
    let group_id = value_to_i64(payload.get("groupId").unwrap_or(&Value::Null))
        .ok_or_else(|| AppError::BadRequest("groupId is required".to_string()))?;
    let group_id = resolve_group_id_or_not_found(&state.db, group_id).await?;
    access_control::ensure_group_member(&state.db, group_id, identity.user_id).await?;
    let members = load_group_members(&state.db, group_id).await?;
    Ok(Json(ApiResponse::success(GroupMembersResponse { members })))
}

pub(crate) async fn join_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let group_id = resolve_group_id_or_not_found(&state.db, group_id).await?;
    ensure_group_exists(&state.db, group_id).await?;
    add_group_member(
        &state.db,
        state.config.snowflake_node_id,
        group_id,
        identity.user_id,
        1,
    )
    .await?;
    let mut redis = group_redis_for_group(&state, group_id)?;
    initialize_group_read_sequences(
        &mut redis,
        &state.db,
        state.config.snowflake_node_id,
        group_id,
        &[identity.user_id],
    )
    .await?;
    refresh_group_member_count(&state.db, group_id).await?;
    Ok(Json(ApiResponse::success(true)))
}

pub(crate) async fn add_group_members(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
    Json(payload): Json<Value>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let group_id = resolve_group_id_or_not_found(&state.db, group_id).await?;
    access_control::ensure_group_member(&state.db, group_id, identity.user_id).await?;
    let member_ids_raw: Vec<i64> = payload
        .get("memberIds")
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(value_to_i64).collect())
        .unwrap_or_default();
    if member_ids_raw.is_empty() {
        return Err(AppError::BadRequest("memberIds is required".to_string()));
    }
    let mut added_ids = Vec::new();
    for member_id in member_ids_raw {
        if let Some(resolved) = resolve_active_user_id(&state.db, member_id).await? {
            add_group_member(
                &state.db,
                state.config.snowflake_node_id,
                group_id,
                resolved,
                1,
            )
            .await?;
            added_ids.push(resolved);
        }
    }
    if !added_ids.is_empty() {
        let mut redis = group_redis_for_group(&state, group_id)?;
        initialize_group_read_sequences(
            &mut redis,
            &state.db,
            state.config.snowflake_node_id,
            group_id,
            &added_ids,
        )
        .await?;
        refresh_group_member_count(&state.db, group_id).await?;
    }
    Ok(Json(ApiResponse::success(true)))
}

pub(crate) async fn leave_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let group_id = resolve_group_id_or_not_found(&state.db, group_id).await?;

    let mut tx = state.db.begin().await?;

    // 更新成员状态为退出
    sqlx::query(
        "UPDATE service_group_service_db.im_group_member SET status = 0 WHERE group_id = ? AND user_id = ?",
    )
    .bind(group_id)
    .bind(identity.user_id)
    .execute(&mut *tx)
    .await?;

    // 清理该用户相关的 sender keys（作为发送者和接收者）
    sqlx::query(
        "DELETE FROM service_user_service_db.e2ee_sender_keys \
         WHERE group_id = ? AND sender_id = ?",
    )
    .bind(group_id)
    .bind(identity.user_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "DELETE FROM service_user_service_db.e2ee_sender_keys \
         WHERE group_id = ? AND recipient_id = ?",
    )
    .bind(group_id)
    .bind(identity.user_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let _ = crate::e2ee::group_api::rotate_group_epoch_if_encrypted(
        &state.db,
        group_id,
        identity.user_id,
        "member_remove",
    )
    .await?;
    refresh_group_member_count(&state.db, group_id).await?;
    Ok(Json(ApiResponse::success(true)))
}

pub(crate) async fn dismiss_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let group_id = resolve_group_id_or_not_found(&state.db, group_id).await?;
    ensure_group_owner(&state.db, group_id, identity.user_id).await?;

    sqlx::query("UPDATE service_group_service_db.im_group SET status = 0 WHERE id = ?")
        .bind(group_id)
        .execute(&state.db)
        .await?;

    // 清理该群的所有 sender keys
    sqlx::query("DELETE FROM service_user_service_db.e2ee_sender_keys WHERE group_id = ?")
        .bind(group_id)
        .execute(&state.db)
        .await?;

    Ok(Json(ApiResponse::success(true)))
}

pub(crate) async fn update_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
    Json(payload): Json<Value>,
) -> Result<Json<ApiResponse<GroupDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let group_id = resolve_group_id_or_not_found(&state.db, group_id).await?;
    ensure_group_owner(&state.db, group_id, identity.user_id).await?;
    let name = string_field(&payload, "groupName").or_else(|| string_field(&payload, "name"));
    let announcement =
        string_field(&payload, "description").or_else(|| string_field(&payload, "announcement"));
    let avatar = string_field(&payload, "avatar");
    sqlx::query(
        r#"UPDATE service_group_service_db.im_group
           SET name = COALESCE(?, name),
               announcement = COALESCE(?, announcement),
               avatar = COALESCE(?, avatar)
           WHERE id = ?"#,
    )
    .bind(name.as_deref())
    .bind(announcement.as_deref())
    .bind(avatar.as_deref())
    .bind(group_id)
    .execute(&state.db)
    .await?;
    Ok(Json(ApiResponse::success(
        load_group(&state.db, group_id).await?,
    )))
}

pub(crate) async fn internal_group_member_ids(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    Path(group_id): Path<i64>,
) -> Result<Json<ApiResponse<Vec<i64>>>, AppError> {
    auth_api::validate_internal_signature(&headers, "GET", uri.path(), &[], &state.config)?;
    let group_id = resolve_group_id_or_not_found(&state.db, group_id).await?;
    let rows: Vec<i64> = sqlx::query_scalar(
        "SELECT user_id FROM service_group_service_db.im_group_member WHERE group_id = ? AND status = 1",
    )
    .bind(group_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(ApiResponse::success(rows)))
}

pub(crate) async fn ensure_group_exists(db: &MySqlPool, group_id: i64) -> Result<(), AppError> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM service_group_service_db.im_group WHERE id = ? AND status = 1",
    )
    .bind(group_id)
    .fetch_one(db)
    .await?;
    if count <= 0 {
        return Err(AppError::NotFound("group not found".to_string()));
    }
    Ok(())
}

pub(crate) async fn ensure_group_owner(
    db: &MySqlPool,
    group_id: i64,
    user_id: i64,
) -> Result<(), AppError> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM service_group_service_db.im_group WHERE id = ? AND owner_id = ? AND status = 1",
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_one(db)
    .await?;
    if count <= 0 {
        return Err(AppError::Forbidden(
            "only group owner can operate".to_string(),
        ));
    }
    Ok(())
}

pub(crate) async fn add_group_member(
    db: &MySqlPool,
    node_id: u16,
    group_id: i64,
    user_id: i64,
    role: i32,
) -> Result<(), AppError> {
    sqlx::query(
        r#"INSERT INTO service_group_service_db.im_group_member
           (id, group_id, user_id, nickname, role, status)
           VALUES (?, ?, ?, NULL, ?, 1)
           ON DUPLICATE KEY UPDATE status = 1, role = GREATEST(role, VALUES(role))"#,
    )
    .bind(ids::next_id(node_id))
    .bind(group_id)
    .bind(user_id)
    .bind(role)
    .execute(db)
    .await?;
    let _ = crate::e2ee::group_api::rotate_group_epoch_if_encrypted(
        db,
        group_id,
        user_id,
        "member_add",
    )
    .await?;
    Ok(())
}

pub(crate) async fn initialize_group_read_sequences(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    node_id: u16,
    group_id: i64,
    user_ids: &[i64],
) -> Result<(), AppError> {
    if user_ids.is_empty() {
        return Ok(());
    }
    let sequence = current_group_sequence(redis, db, group_id).await?;
    for user_id in user_ids {
        sqlx::query(
            r#"INSERT INTO service_message_service_db.group_read_cursor
               (id, group_id, user_id, last_read_seq)
               VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 last_read_seq = GREATEST(last_read_seq, VALUES(last_read_seq)),
                 last_read_at = CURRENT_TIMESTAMP,
                 updated_time = CURRENT_TIMESTAMP"#,
        )
        .bind(ids::next_id(node_id))
        .bind(group_id)
        .bind(*user_id)
        .bind(sequence)
        .execute(db)
        .await?;
    }
    let mut pipe = redis::pipe();
    for user_id in user_ids {
        pipe.set(keys::group_read_sequence_key(*user_id, group_id), sequence)
            .ignore();
    }
    let result: redis::RedisResult<()> = pipe.query_async(redis).await;
    result?;
    Ok(())
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
    let sequence: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(conversation_seq), 0) \
         FROM service_message_service_db.messages \
         WHERE is_group_chat = 1 AND group_id = ? AND status <> 5",
    )
    .bind(group_id)
    .fetch_one(db)
    .await?;
    if sequence > 0 {
        redis.set::<_, _, ()>(&key, sequence).await?;
    }
    Ok(sequence)
}

pub(crate) async fn refresh_group_member_count(
    db: &MySqlPool,
    group_id: i64,
) -> Result<(), AppError> {
    sqlx::query(
        r#"UPDATE service_group_service_db.im_group
           SET member_count = (
             SELECT COUNT(*) FROM service_group_service_db.im_group_member
             WHERE group_id = ? AND status = 1
           )
           WHERE id = ?"#,
    )
    .bind(group_id)
    .bind(group_id)
    .execute(db)
    .await?;
    Ok(())
}

pub(crate) async fn load_group(db: &MySqlPool, group_id: i64) -> Result<GroupDto, AppError> {
    let row = sqlx::query(
        "SELECT id, name, avatar, announcement, owner_id, type, max_members, member_count, status, created_time FROM service_group_service_db.im_group WHERE id = ?",
    )
    .bind(group_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("group not found".to_string()))?;
    Ok(group_from_row(&row))
}

pub(crate) async fn load_group_members(
    db: &MySqlPool,
    group_id: i64,
) -> Result<Vec<GroupMemberDto>, AppError> {
    let rows = sqlx::query(
        r#"SELECT m.id, m.group_id, m.user_id, COALESCE(m.nickname, u.nickname) AS nickname, m.role, m.join_time,
                  u.username, u.avatar
           FROM service_group_service_db.im_group_member m
           JOIN service_user_service_db.users u ON u.id = m.user_id
           WHERE m.group_id = ? AND m.status = 1
           ORDER BY m.role DESC, m.join_time ASC"#,
    )
    .bind(group_id)
    .fetch_all(db)
    .await?;
    Ok(rows.iter().map(group_member_from_row).collect())
}
