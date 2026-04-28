use crate::auth::identity_from_headers;
use crate::auth_api;
use crate::error::AppError;
use crate::id_resolver::{resolve_active_group_id, resolve_active_user_id};
use crate::web::AppState;
use axum::body::Bytes;
use axum::extract::{OriginalUri, Path, Query, State};
use axum::http::HeaderMap;
use axum::Json;
use chrono::NaiveDateTime;
use im_rs_common::api::ApiResponse;
use im_rs_common::{ids, keys};
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde::{de, Deserialize, Deserializer, Serialize};
use serde_json::Value;
use sqlx::{MySqlPool, Row};
use std::collections::{BTreeSet, HashMap};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendshipDto {
    pub id: String,
    pub friend_id: String,
    pub username: String,
    pub nickname: Option<String>,
    pub avatar: Option<String>,
    pub remark: Option<String>,
    pub is_online: bool,
    pub created_at: String,
    pub create_time: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendRequestDto {
    pub id: String,
    pub applicant_id: String,
    pub applicant_username: String,
    pub applicant_nickname: Option<String>,
    pub applicant_avatar: Option<String>,
    pub target_user_id: String,
    pub target_username: String,
    pub target_nickname: Option<String>,
    pub target_avatar: Option<String>,
    pub reason: Option<String>,
    pub status: String,
    pub create_time: String,
    pub update_time: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddFriendRequest {
    #[serde(deserialize_with = "deserialize_i64")]
    pub target_user_id: i64,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandleFriendRequest {
    #[serde(deserialize_with = "deserialize_i64")]
    pub request_id: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupDto {
    pub id: String,
    pub name: String,
    pub group_name: String,
    pub description: Option<String>,
    pub announcement: Option<String>,
    pub avatar: Option<String>,
    pub owner_id: String,
    pub r#type: i32,
    pub max_members: i32,
    pub member_count: i32,
    pub status: i32,
    pub create_time: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupMemberDto {
    pub id: String,
    pub group_id: String,
    pub user_id: String,
    pub username: String,
    pub nickname: Option<String>,
    pub avatar: Option<String>,
    pub role: i32,
    pub join_time: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupMembersResponse {
    pub members: Vec<GroupMemberDto>,
}

pub async fn friend_list(
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

pub async fn friend_requests(
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

pub async fn add_friend(
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
    .bind(normalize_optional(request.reason))
    .execute(&state.db)
    .await?;
    Ok(Json(ApiResponse::success(true)))
}

pub async fn accept_friend(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<HandleFriendRequest>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let row = load_friend_request(&state.db, request.request_id).await?;
    let target_user_id: i64 = row.get("target_user_id");
    if target_user_id != identity.user_id {
        return Err(AppError::Forbidden("not request target user".to_string()));
    }
    let applicant_id: i64 = row.get("applicant_id");
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
    Ok(Json(ApiResponse::success(true)))
}

pub async fn reject_friend(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<HandleFriendRequest>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let row = load_friend_request(&state.db, request.request_id).await?;
    let target_user_id: i64 = row.get("target_user_id");
    if target_user_id != identity.user_id {
        return Err(AppError::Forbidden("not request target user".to_string()));
    }
    sqlx::query("UPDATE service_user_service_db.friend_request SET status = 2, handle_time = NOW() WHERE id = ?")
        .bind(request.request_id)
        .execute(&state.db)
        .await?;
    Ok(Json(ApiResponse::success(true)))
}

pub async fn remove_friend(
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
    Ok(Json(ApiResponse::success(true)))
}

pub async fn update_friend_remark(
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
    .bind(normalize_optional(remark))
    .bind(identity.user_id)
    .bind(friend_id)
    .execute(&state.db)
    .await?;
    Ok(Json(ApiResponse::success(true)))
}

pub async fn create_group(
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
    let mut redis = state.redis_manager.clone();
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

pub async fn user_groups(
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

pub async fn group_members(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<ApiResponse<GroupMembersResponse>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let payload: Value = serde_json::from_slice(&body)?;
    let group_id = value_to_i64(payload.get("groupId").unwrap_or(&Value::Null))
        .ok_or_else(|| AppError::BadRequest("groupId is required".to_string()))?;
    let group_id = resolve_group_id_or_not_found(&state.db, group_id).await?;
    ensure_group_member(&state.db, group_id, identity.user_id).await?;
    let members = load_group_members(&state.db, group_id).await?;
    Ok(Json(ApiResponse::success(GroupMembersResponse { members })))
}

pub async fn join_group(
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
    let mut redis = state.redis_manager.clone();
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

pub async fn leave_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let group_id = resolve_group_id_or_not_found(&state.db, group_id).await?;
    sqlx::query(
        "UPDATE service_group_service_db.im_group_member SET status = 0 WHERE group_id = ? AND user_id = ?",
    )
    .bind(group_id)
    .bind(identity.user_id)
    .execute(&state.db)
    .await?;
    refresh_group_member_count(&state.db, group_id).await?;
    Ok(Json(ApiResponse::success(true)))
}

pub async fn dismiss_group(
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
    Ok(Json(ApiResponse::success(true)))
}

pub async fn update_group(
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

pub async fn internal_group_member_ids(
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

fn friendship_from_row(row: &sqlx::mysql::MySqlRow) -> FriendshipDto {
    let id: i64 = row.get("id");
    let friend_id: i64 = row.get("friend_id");
    let created: NaiveDateTime = row.get("created_time");
    FriendshipDto {
        id: id.to_string(),
        friend_id: friend_id.to_string(),
        username: row.get("username"),
        nickname: row.try_get("nickname").ok().flatten(),
        avatar: row.try_get("avatar").ok().flatten(),
        remark: row.try_get("remark").ok().flatten(),
        is_online: false,
        created_at: created.and_utc().to_rfc3339(),
        create_time: created.and_utc().to_rfc3339(),
    }
}

fn friend_request_from_row(row: &sqlx::mysql::MySqlRow) -> FriendRequestDto {
    let id: i64 = row.get("id");
    let applicant_id: i64 = row.get("applicant_id");
    let target_user_id: i64 = row.get("target_user_id");
    let status: i32 = row.get("status");
    let apply_time: NaiveDateTime = row.get("apply_time");
    let handle_time: Option<NaiveDateTime> = row.try_get("handle_time").ok().flatten();
    FriendRequestDto {
        id: id.to_string(),
        applicant_id: applicant_id.to_string(),
        applicant_username: row.get("applicant_username"),
        applicant_nickname: row.try_get("applicant_nickname").ok().flatten(),
        applicant_avatar: row.try_get("applicant_avatar").ok().flatten(),
        target_user_id: target_user_id.to_string(),
        target_username: row.get("target_username"),
        target_nickname: row.try_get("target_nickname").ok().flatten(),
        target_avatar: row.try_get("target_avatar").ok().flatten(),
        reason: row.try_get("apply_reason").ok().flatten(),
        status: match status {
            1 => "ACCEPTED",
            2 => "REJECTED",
            _ => "PENDING",
        }
        .to_string(),
        create_time: apply_time.and_utc().to_rfc3339(),
        update_time: handle_time.map(|value| value.and_utc().to_rfc3339()),
    }
}

fn group_from_row(row: &sqlx::mysql::MySqlRow) -> GroupDto {
    let id: i64 = row.get("id");
    let name: String = row.get("name");
    let owner_id: i64 = row.get("owner_id");
    let created: NaiveDateTime = row.get("created_time");
    GroupDto {
        id: id.to_string(),
        name: name.clone(),
        group_name: name,
        description: row.try_get("announcement").ok().flatten(),
        announcement: row.try_get("announcement").ok().flatten(),
        avatar: row.try_get("avatar").ok().flatten(),
        owner_id: owner_id.to_string(),
        r#type: row_i32(row, "type"),
        max_members: row_i32(row, "max_members"),
        member_count: row_i32(row, "member_count"),
        status: row_i32(row, "status"),
        create_time: created.and_utc().to_rfc3339(),
    }
}

fn group_member_from_row(row: &sqlx::mysql::MySqlRow) -> GroupMemberDto {
    let id: i64 = row.get("id");
    let group_id: i64 = row.get("group_id");
    let user_id: i64 = row.get("user_id");
    let join_time: NaiveDateTime = row.get("join_time");
    GroupMemberDto {
        id: id.to_string(),
        group_id: group_id.to_string(),
        user_id: user_id.to_string(),
        username: row.get("username"),
        nickname: row.try_get("nickname").ok().flatten(),
        avatar: row.try_get("avatar").ok().flatten(),
        role: row_i32(row, "role"),
        join_time: join_time.and_utc().to_rfc3339(),
    }
}

fn row_i32(row: &sqlx::mysql::MySqlRow, column: &str) -> i32 {
    row.try_get::<i32, _>(column)
        .or_else(|_| row.try_get::<i8, _>(column).map(i32::from))
        .or_else(|_| row.try_get::<i16, _>(column).map(i32::from))
        .unwrap_or_default()
}

async fn resolve_user_id_or_not_found(db: &MySqlPool, user_id: i64) -> Result<i64, AppError> {
    resolve_active_user_id(db, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("user not found".to_string()))
}

async fn resolve_group_id_or_not_found(db: &MySqlPool, group_id: i64) -> Result<i64, AppError> {
    resolve_active_group_id(db, group_id)
        .await?
        .ok_or_else(|| AppError::NotFound("group not found".to_string()))
}

async fn are_friends(db: &MySqlPool, user_id: i64, friend_id: i64) -> Result<bool, AppError> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM service_user_service_db.im_friend WHERE user_id = ? AND friend_id = ? AND status = 1",
    )
    .bind(user_id)
    .bind(friend_id)
    .fetch_one(db)
    .await?;
    Ok(count > 0)
}

async fn load_friend_request(
    db: &MySqlPool,
    request_id: i64,
) -> Result<sqlx::mysql::MySqlRow, AppError> {
    sqlx::query("SELECT applicant_id, target_user_id FROM service_user_service_db.friend_request WHERE id = ?")
        .bind(request_id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| AppError::NotFound("friend request not found".to_string()))
}

async fn upsert_friendship(
    db: &MySqlPool,
    node_id: u16,
    user_id: i64,
    friend_id: i64,
    remark: Option<String>,
) -> Result<(), AppError> {
    sqlx::query(
        r#"INSERT INTO service_user_service_db.im_friend (id, user_id, friend_id, remark, status)
           VALUES (?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE status = 1, remark = COALESCE(VALUES(remark), remark)"#,
    )
    .bind(ids::next_id(node_id))
    .bind(user_id)
    .bind(friend_id)
    .bind(remark)
    .execute(db)
    .await?;
    Ok(())
}

async fn ensure_group_exists(db: &MySqlPool, group_id: i64) -> Result<(), AppError> {
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

async fn ensure_group_member(db: &MySqlPool, group_id: i64, user_id: i64) -> Result<(), AppError> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM service_group_service_db.im_group_member WHERE group_id = ? AND user_id = ? AND status = 1",
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_one(db)
    .await?;
    if count <= 0 {
        return Err(AppError::Forbidden("not group member".to_string()));
    }
    Ok(())
}

async fn ensure_group_owner(db: &MySqlPool, group_id: i64, user_id: i64) -> Result<(), AppError> {
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

async fn add_group_member(
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
    Ok(())
}

async fn initialize_group_read_sequences(
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

async fn current_group_sequence(
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

async fn refresh_group_member_count(db: &MySqlPool, group_id: i64) -> Result<(), AppError> {
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

async fn load_group(db: &MySqlPool, group_id: i64) -> Result<GroupDto, AppError> {
    let row = sqlx::query(
        "SELECT id, name, avatar, announcement, owner_id, type, max_members, member_count, status, created_time FROM service_group_service_db.im_group WHERE id = ?",
    )
    .bind(group_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("group not found".to_string()))?;
    Ok(group_from_row(&row))
}

async fn load_group_members(
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

fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

fn query_i64(params: &HashMap<String, String>, key: &str) -> Option<i64> {
    params.get(key)?.trim().parse().ok()
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    normalize_optional(value.get(key)?.as_str().map(ToOwned::to_owned))
}

fn value_to_i64(value: &Value) -> Option<i64> {
    match value {
        Value::Number(number) => number
            .as_i64()
            .or_else(|| number.as_u64().and_then(|item| i64::try_from(item).ok())),
        Value::String(text) => text.trim().parse().ok(),
        _ => None,
    }
}

fn deserialize_i64<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    value_to_i64(&value).ok_or_else(|| de::Error::custom("invalid integer"))
}

fn distinct(values: Vec<i64>) -> Vec<i64> {
    let mut seen = BTreeSet::new();
    values
        .into_iter()
        .filter(|value| seen.insert(*value))
        .collect()
}
