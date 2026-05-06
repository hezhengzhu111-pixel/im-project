use im_rs_common::keys;
use redis::aio::ConnectionManager;
use redis::RedisResult;

/// Add a post_id to the user's feed sorted set (score = post_id for time ordering).
pub async fn add_to_feed(
    redis: &mut ConnectionManager,
    user_id: i64,
    post_id: i64,
) -> RedisResult<()> {
    let key = keys::moments_feed_key(user_id);
    redis::cmd("ZADD")
        .arg(&key)
        .arg(post_id)
        .arg(post_id)
        .query_async::<()>(redis)
        .await?;
    redis::cmd("EXPIRE")
        .arg(&key)
        .arg(keys::MOMENTS_FEED_TTL)
        .query_async::<()>(redis)
        .await?;
    Ok(())
}

/// Get feed post_ids from cache, using cursor-based pagination.
/// Returns a list of post_ids in descending order (newest first).
pub async fn get_feed(
    redis: &mut ConnectionManager,
    user_id: i64,
    cursor: i64,
    limit: i64,
) -> RedisResult<Vec<i64>> {
    let key = keys::moments_feed_key(user_id);
    // ZREVRANGEBYSCORE key (cursor] -inf LIMIT 0 count
    let max = if cursor <= 0 {
        "+inf"
    } else {
        &cursor.to_string()
    };
    let results: Vec<i64> = redis::cmd("ZREVRANGEBYSCORE")
        .arg(&key)
        .arg(max)
        .arg("-inf")
        .arg("LIMIT")
        .arg(0)
        .arg(limit)
        .query_async(redis)
        .await?;
    Ok(results)
}

/// Cache a post's JSON representation as a string.
pub async fn cache_post(
    redis: &mut ConnectionManager,
    post_id: i64,
    post_json: &str,
) -> RedisResult<()> {
    let key = keys::moments_post_key(post_id);
    redis::cmd("SET")
        .arg(&key)
        .arg(post_json)
        .arg("EX")
        .arg(keys::MOMENTS_POST_TTL)
        .query_async::<()>(redis)
        .await?;
    Ok(())
}

/// Get a cached post JSON string.
pub async fn get_cached_post(
    redis: &mut ConnectionManager,
    post_id: i64,
) -> RedisResult<Option<String>> {
    let key = keys::moments_post_key(post_id);
    redis::cmd("GET").arg(&key).query_async(redis).await
}

/// Remove a post from the cache.
pub async fn invalidate_post(redis: &mut ConnectionManager, post_id: i64) -> RedisResult<()> {
    let post_key = keys::moments_post_key(post_id);
    let likes_key = keys::moments_likes_key(post_id);
    redis::cmd("DEL")
        .arg(&post_key)
        .arg(&likes_key)
        .query_async::<()>(redis)
        .await?;
    Ok(())
}

/// Add a user_id to the post's likes set.
pub async fn add_like(
    redis: &mut ConnectionManager,
    post_id: i64,
    user_id: i64,
) -> RedisResult<()> {
    let key = keys::moments_likes_key(post_id);
    redis::cmd("SADD")
        .arg(&key)
        .arg(user_id)
        .query_async::<()>(redis)
        .await?;
    redis::cmd("EXPIRE")
        .arg(&key)
        .arg(keys::MOMENTS_LIKES_TTL)
        .query_async::<()>(redis)
        .await?;
    Ok(())
}

/// Remove a user_id from the post's likes set.
pub async fn remove_like(
    redis: &mut ConnectionManager,
    post_id: i64,
    user_id: i64,
) -> RedisResult<()> {
    let key = keys::moments_likes_key(post_id);
    redis::cmd("SREM")
        .arg(&key)
        .arg(user_id)
        .query_async::<()>(redis)
        .await?;
    Ok(())
}

/// Add a notification_id to the user's notification sorted set (score = notification_id).
pub async fn add_notification(
    redis: &mut ConnectionManager,
    user_id: i64,
    notification_id: i64,
) -> RedisResult<()> {
    let key = keys::moments_notify_key(user_id);
    redis::cmd("ZADD")
        .arg(&key)
        .arg(notification_id)
        .arg(notification_id)
        .query_async::<()>(redis)
        .await?;
    redis::cmd("EXPIRE")
        .arg(&key)
        .arg(keys::MOMENTS_NOTIFY_TTL)
        .query_async::<()>(redis)
        .await?;
    Ok(())
}

/// Get the count of notifications newer than the given cursor (unread count proxy).
/// If cursor is 0, returns the total count.
pub async fn get_unread_count(
    redis: &mut ConnectionManager,
    user_id: i64,
    last_read_id: i64,
) -> RedisResult<i64> {
    let key = keys::moments_notify_key(user_id);
    // ZCOUNT key (last_read_id + 1) +inf
    let min = last_read_id.saturating_add(1);
    let count: i64 = redis::cmd("ZCOUNT")
        .arg(&key)
        .arg(min)
        .arg("+inf")
        .query_async(redis)
        .await?;
    Ok(count)
}
