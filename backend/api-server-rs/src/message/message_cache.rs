use crate::error::AppError;
use crate::id_resolver::{resolve_active_group_id, resolve_active_user_id};
use crate::local_cache;
use crate::observability;
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use sqlx::MySqlPool;
use super::{VALIDATION_CACHE_TTL_SECONDS, VALIDATION_NEGATIVE_CACHE_TTL_SECONDS, MAX_FRIENDS_PRELOAD};

pub(crate) async fn cached_resolve_active_user_id(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    candidate_id: i64,
    operation: &'static str,
) -> Result<Option<i64>, AppError> {
    let key = format!("im:cache:active_user:{candidate_id}");
    if let Some(cached) = local_cache::get_i64_option(&key) {
        return Ok(cached);
    }
    let lock = local_cache::key_lock(&key);
    let _guard = lock.lock().await;
    if let Some(cached) = local_cache::get_i64_option(&key) {
        return Ok(cached);
    }
    if let Some(cached) = read_cached_i64_option(redis, &key).await {
        return Ok(cached);
    }
    let resolved =
        observability::db_query(operation, resolve_active_user_id(db, candidate_id)).await?;
    write_cached_i64_option(redis, &key, resolved).await;
    Ok(resolved)
}

pub(crate) async fn cached_resolve_active_group_id(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    candidate_id: i64,
    operation: &'static str,
) -> Result<Option<i64>, AppError> {
    let key = format!("im:cache:active_group:{candidate_id}");
    if let Some(cached) = local_cache::get_i64_option(&key) {
        return Ok(cached);
    }
    let lock = local_cache::key_lock(&key);
    let _guard = lock.lock().await;
    if let Some(cached) = local_cache::get_i64_option(&key) {
        return Ok(cached);
    }
    if let Some(cached) = read_cached_i64_option(redis, &key).await {
        return Ok(cached);
    }
    let resolved =
        observability::db_query(operation, resolve_active_group_id(db, candidate_id)).await?;
    write_cached_i64_option(redis, &key, resolved).await;
    Ok(resolved)
}

pub(crate) async fn read_cached_i64_option(redis: &mut ConnectionManager, key: &str) -> Option<Option<i64>> {
    let value: Option<String> = redis.get(key).await.ok().flatten();
    let parsed = value.map(|raw| {
        if raw == "none" {
            None
        } else {
            raw.parse::<i64>().ok()
        }
    });
    if let Some(value) = parsed {
        local_cache::set_i64_option(key, value);
    }
    parsed
}

pub(crate) async fn write_cached_i64_option(redis: &mut ConnectionManager, key: &str, value: Option<i64>) {
    let ttl = if value.is_some() {
        VALIDATION_CACHE_TTL_SECONDS
    } else {
        VALIDATION_NEGATIVE_CACHE_TTL_SECONDS
    };
    let raw = value
        .map(|id| id.to_string())
        .unwrap_or_else(|| "none".to_string());
    local_cache::set_i64_option(key, value);
    let result: redis::RedisResult<()> = redis.set_ex(key, raw, ttl).await;
    if let Err(error) = result {
        tracing::warn!(key, error = %error, "failed to cache active user id");
    }
}

pub(crate) async fn validate_friend(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    user_id: i64,
    friend_id: i64,
) -> Result<(), AppError> {
    let key = format!("im:cache:friend:{user_id}:{friend_id}");
    let preload_key = format!("im:cache:friend_preload:{user_id}");
    if let Some(allowed) = local_cache::get_bool(&key) {
        return if allowed {
            Ok(())
        } else {
            Err(AppError::Forbidden(
                "friend relationship not found".to_string(),
            ))
        };
    }
    let lock = local_cache::key_lock(&preload_key);
    let _guard = lock.lock().await;
    if let Some(allowed) = local_cache::get_bool(&key) {
        return if allowed {
            Ok(())
        } else {
            Err(AppError::Forbidden(
                "friend relationship not found".to_string(),
            ))
        };
    }
    if let Some(allowed) = read_cached_bool(redis, &key).await {
        return if allowed {
            Ok(())
        } else {
            Err(AppError::Forbidden(
                "friend relationship not found".to_string(),
            ))
        };
    }
    let allowed = preload_friend_relations(redis, db, user_id, friend_id).await?;
    if !allowed {
        return Err(AppError::Forbidden(
            "friend relationship not found".to_string(),
        ));
    }
    Ok(())
}

pub(crate) async fn preload_friend_relations(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    user_id: i64,
    requested_friend_id: i64,
) -> Result<bool, AppError> {
    let preload_key = format!("im:cache:friend_preload:{user_id}");
    if let Some(preloaded) = local_cache::get_bool(&preload_key) {
        if preloaded {
            let requested_key = format!("im:cache:friend:{user_id}:{requested_friend_id}");
            let allowed = read_cached_bool(redis, &requested_key)
                .await
                .unwrap_or(false);
            if !allowed {
                write_cached_bool(redis, &requested_key, false).await;
            }
            return Ok(allowed);
        }
    }

    let friend_ids: Vec<i64> = observability::db_query(
        "preload_friend_relations",
        sqlx::query_scalar(
            "SELECT friend_id FROM service_user_service_db.im_friend WHERE user_id = ? AND status = 1 LIMIT ?",
        )
        .bind(user_id)
        .bind(MAX_FRIENDS_PRELOAD)
        .fetch_all(db),
    )
    .await?;

    let mut allowed = false;
    let mut pipe = redis::pipe();
    for friend_id in &friend_ids {
        if *friend_id == requested_friend_id {
            allowed = true;
        }
        let relation_key = format!("im:cache:friend:{user_id}:{friend_id}");
        local_cache::set_bool(&relation_key, true);
        pipe.set_ex(relation_key, "1", VALIDATION_CACHE_TTL_SECONDS)
            .ignore();
    }
    let pipe_result: redis::RedisResult<()> = pipe.query_async(redis).await;
    if let Err(error) = pipe_result {
        tracing::warn!(error = %error, "failed to cache friend preload rows");
    }

    local_cache::set_bool(&preload_key, true);
    let preload_result: redis::RedisResult<()> = redis
        .set_ex(&preload_key, "1", VALIDATION_CACHE_TTL_SECONDS)
        .await;
    if let Err(error) = preload_result {
        tracing::warn!(key = %preload_key, error = %error, "failed to cache friend preload marker");
    }

    if !allowed {
        let requested_key = format!("im:cache:friend:{user_id}:{requested_friend_id}");
        write_cached_bool(redis, &requested_key, false).await;
    }
    Ok(allowed)
}

pub(crate) async fn validate_group_member(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    group_id: i64,
    user_id: i64,
) -> Result<(), AppError> {
    let key = format!("im:cache:group_member:{group_id}:{user_id}");
    if let Some(allowed) = local_cache::get_bool(&key) {
        return if allowed {
            Ok(())
        } else {
            Err(AppError::Forbidden(
                "group membership not found".to_string(),
            ))
        };
    }
    let lock = local_cache::key_lock(&key);
    let _guard = lock.lock().await;
    if let Some(allowed) = local_cache::get_bool(&key) {
        return if allowed {
            Ok(())
        } else {
            Err(AppError::Forbidden(
                "group membership not found".to_string(),
            ))
        };
    }
    if let Some(allowed) = read_cached_bool(redis, &key).await {
        return if allowed {
            Ok(())
        } else {
            Err(AppError::Forbidden(
                "group membership not found".to_string(),
            ))
        };
    }
    let result = crate::access_control::ensure_group_member(db, group_id, user_id).await;
    let allowed = result.is_ok();
    write_cached_bool(redis, &key, allowed).await;
    if !allowed {
        return Err(AppError::Forbidden(
            "group membership not found".to_string(),
        ));
    }
    Ok(())
}

pub(crate) async fn read_cached_bool(redis: &mut ConnectionManager, key: &str) -> Option<bool> {
    let value: Option<String> = redis.get(key).await.ok().flatten();
    let parsed = value.and_then(|raw| match raw.as_str() {
        "1" => Some(true),
        "0" => Some(false),
        _ => None,
    });
    if let Some(value) = parsed {
        local_cache::set_bool(key, value);
    }
    parsed
}

pub(crate) async fn write_cached_bool(redis: &mut ConnectionManager, key: &str, value: bool) {
    let ttl = if value {
        VALIDATION_CACHE_TTL_SECONDS
    } else {
        VALIDATION_NEGATIVE_CACHE_TTL_SECONDS
    };
    let raw = if value { "1" } else { "0" };
    local_cache::set_bool(key, value);
    let result: redis::RedisResult<()> = redis.set_ex(key, raw, ttl).await;
    if let Err(error) = result {
        tracing::warn!(key, error = %error, "failed to cache boolean validation result");
    }
}

pub(crate) fn validate_mentioned_user_ids(mentioned: &[String], sender_id: i64) -> Result<Vec<i64>, AppError> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for raw in mentioned {
        let uid: i64 = raw
            .trim()
            .parse()
            .map_err(|_| AppError::BadRequest("invalid mentioned user id".to_string()))?;
        if uid != sender_id && seen.insert(uid) {
            result.push(uid);
        }
    }
    Ok(result)
}

pub(crate) async fn batch_validate_mentioned_members(
    redis: &mut ConnectionManager,
    db: &MySqlPool,
    group_id: i64,
    sender_id: i64,
    mentioned: Option<&[String]>,
) -> Result<Vec<i64>, AppError> {
    let Some(mentioned) = mentioned else {
        return Ok(Vec::new());
    };
    let user_ids = validate_mentioned_user_ids(mentioned, sender_id)?;
    if user_ids.is_empty() {
        return Ok(user_ids);
    }
    let valid_ids =
        crate::access_control::ensure_group_members_batch(db, group_id, &user_ids).await?;
    for uid in &valid_ids {
        let key = format!("im:cache:group_member:{group_id}:{uid}");
        local_cache::set_bool(&key, true);
        let result: redis::RedisResult<()> =
            redis.set_ex(&key, "1", VALIDATION_CACHE_TTL_SECONDS).await;
        if let Err(error) = result {
            tracing::warn!(key = %key, error = %error, "failed to cache group member validation");
        }
    }
    Ok(valid_ids)
}

