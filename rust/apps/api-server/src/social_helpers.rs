use super::*;
use crate::error::AppError;
use crate::id_resolver::{resolve_active_group_id, resolve_active_user_id};
use crate::local_cache;
use crate::web::AppState;
use chrono::NaiveDateTime;
use im_common::event::ImEvent;
use im_common::{ids, keys, time};
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde::{de, Deserialize, Deserializer};
use serde_json::Value;
use sqlx::{MySqlPool, Row};
use std::collections::{BTreeSet, HashMap};

const FRIEND_CACHE_TTL_SECONDS: u64 = 5 * 60;

pub(crate) fn group_redis_for_group(
    state: &AppState,
    group_id: i64,
) -> Result<ConnectionManager, AppError> {
    let index =
        crate::message::shard_index_for_group_id(group_id, state.group_redis_managers.len())
            .ok_or_else(|| AppError::Upstream("group hot redis shard missing".to_string()))?;
    state
        .group_redis_managers
        .get(index)
        .cloned()
        .ok_or_else(|| AppError::Upstream("group hot redis shard missing".to_string()))
}

pub(crate) fn friendship_from_row(row: &sqlx::mysql::MySqlRow) -> FriendshipDto {
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

pub(crate) fn friend_request_status_str(status: i32) -> &'static str {
    match status {
        1 => "ACCEPTED",
        2 => "REJECTED",
        _ => "PENDING",
    }
}

pub(crate) fn friend_request_from_row(row: &sqlx::mysql::MySqlRow) -> FriendRequestDto {
    let id: i64 = row.get("id");
    let applicant_id: i64 = row.get("applicant_id");
    let target_user_id: i64 = row
        .try_get("target_user_id")
        .ok()
        .flatten()
        .unwrap_or_default();
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
        status: friend_request_status_str(status).to_string(),
        create_time: apply_time.and_utc().to_rfc3339(),
        update_time: handle_time.map(|value| value.and_utc().to_rfc3339()),
    }
}

pub(crate) fn group_from_row(row: &sqlx::mysql::MySqlRow) -> GroupDto {
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

pub(crate) fn group_member_from_row(row: &sqlx::mysql::MySqlRow) -> GroupMemberDto {
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

pub(crate) fn row_i32(row: &sqlx::mysql::MySqlRow, column: &str) -> i32 {
    row.try_get::<i32, _>(column)
        .or_else(|_| row.try_get::<i8, _>(column).map(i32::from))
        .or_else(|_| row.try_get::<i16, _>(column).map(i32::from))
        .unwrap_or_default()
}

pub(crate) async fn resolve_user_id_or_not_found(
    db: &MySqlPool,
    user_id: i64,
) -> Result<i64, AppError> {
    resolve_active_user_id(db, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("user not found".to_string()))
}

pub(crate) async fn resolve_group_id_or_not_found(
    db: &MySqlPool,
    group_id: i64,
) -> Result<i64, AppError> {
    resolve_active_group_id(db, group_id)
        .await?
        .ok_or_else(|| AppError::NotFound("group not found".to_string()))
}

pub(crate) async fn are_friends(
    db: &MySqlPool,
    user_id: i64,
    friend_id: i64,
) -> Result<bool, AppError> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM service_user_service_db.im_friend WHERE user_id = ? AND friend_id = ? AND status = 1",
    )
    .bind(user_id)
    .bind(friend_id)
    .fetch_one(db)
    .await?;
    Ok(count > 0)
}

pub(crate) async fn load_friend_request(
    db: &MySqlPool,
    request_id: i64,
) -> Result<sqlx::mysql::MySqlRow, AppError> {
    sqlx::query("SELECT applicant_id, target_user_id FROM service_user_service_db.friend_request WHERE id = ?")
        .bind(request_id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| AppError::NotFound("friend request not found".to_string()))
}

pub(crate) async fn upsert_friendship(
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

pub(crate) async fn cache_friendship(
    redis: &mut ConnectionManager,
    user_id: i64,
    friend_id: i64,
    allowed: bool,
) {
    let key = format!("im:cache:friend:{user_id}:{friend_id}");
    local_cache::set_bool(&key, allowed);
    let value = if allowed { "1" } else { "0" };
    let result: redis::RedisResult<()> = redis.set_ex(&key, value, FRIEND_CACHE_TTL_SECONDS).await;
    if let Err(error) = result {
        tracing::warn!(
            key = %key,
            error = %error,
            "failed to cache friendship validation"
        );
    }
}

pub(crate) fn normalize_optional(raw: Option<&str>) -> Option<String> {
    raw.map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub(crate) fn query_i64(params: &HashMap<String, String>, key: &str) -> Option<i64> {
    params.get(key)?.trim().parse().ok()
}

pub(crate) fn string_field(value: &Value, key: &str) -> Option<String> {
    normalize_optional(value.get(key)?.as_str())
}

pub(crate) fn value_to_i64(value: &Value) -> Option<i64> {
    match value {
        Value::Number(number) => number
            .as_i64()
            .or_else(|| number.as_u64().and_then(|item| i64::try_from(item).ok())),
        Value::String(text) => text.trim().parse().ok(),
        _ => None,
    }
}

pub(crate) fn deserialize_i64<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    value_to_i64(&value).ok_or_else(|| de::Error::custom("invalid integer"))
}

pub(crate) fn distinct(values: Vec<i64>) -> Vec<i64> {
    let mut seen = BTreeSet::new();
    values
        .into_iter()
        .filter(|value| seen.insert(*value))
        .collect()
}

pub(crate) async fn write_social_event(state: &AppState, event: &ImEvent) {
    let event_json = match serde_json::to_string(event) {
        Ok(json) => json,
        Err(error) => {
            tracing::warn!(error = %error, event_id = %event.event_id, "failed to serialize social event");
            return;
        }
    };
    if let Some(private_hot) = state.private_redis_managers.first() {
        let mut redis = private_hot.clone();
        let member = format!("{}|{}", event.event_id, event.conversation_id);
        let event_key = keys::event_key(&event.event_id);
        let ttl_seconds = match i64::try_from(keys::EVENT_TTL_SECONDS) {
            Ok(ttl) => ttl,
            Err(error) => {
                tracing::warn!(error = %error, "invalid event ttl seconds");
                604_800
            }
        };
        let score = time::now_ms();
        let result: redis::RedisResult<()> = redis::pipe()
            .atomic()
            .set(&event_key, &event_json)
            .ignore()
            .expire(&event_key, ttl_seconds)
            .ignore()
            .zadd(keys::pending_events_key(), &member, score)
            .ignore()
            .expire(keys::pending_events_key(), ttl_seconds)
            .ignore()
            .query_async(&mut redis)
            .await;
        if let Err(error) = result {
            tracing::warn!(error = %error, event_id = %event.event_id, "failed to write social event to redis");
        }
    }
}
