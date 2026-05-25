pub const MESSAGE_TTL_SECONDS: u64 = 7 * 24 * 60 * 60;
pub const EVENT_TTL_SECONDS: u64 = 7 * 24 * 60 * 60;
pub const CONVERSATION_TTL_SECONDS: u64 = 7 * 24 * 60 * 60;

pub fn message_key(message_id: i64) -> String {
    format!("im:msg:{message_id}")
}

pub fn conversation_messages_key(conversation_id: &str) -> String {
    format!("im:conv:{conversation_id}:msgs")
}

pub fn conversation_last_key(conversation_id: &str) -> String {
    format!("im:conv:{conversation_id}:last")
}

pub fn user_conversations_key(user_id: i64) -> String {
    format!("im:user:{user_id}:convs")
}

pub fn user_unread_key(user_id: i64) -> String {
    format!("im:user:{user_id}:unread")
}

pub fn read_cursor_key(user_id: i64, conversation_id: &str) -> String {
    format!("im:read:{user_id}:{conversation_id}")
}

pub fn group_sequence_key(group_id: i64) -> String {
    format!("im:conv:g_{group_id}:seq")
}

pub fn group_read_sequence_key(user_id: i64, group_id: i64) -> String {
    format!("im:readseq:{user_id}:g_{group_id}")
}

pub fn pending_events_key() -> &'static str {
    "im:pending:events"
}

pub fn event_key(event_id: &str) -> String {
    format!("im:event:{event_id}")
}

pub fn client_message_key(sender_id: i64, client_message_id: &str) -> String {
    format!("im:client:{sender_id}:{client_message_id}")
}

pub fn db_watermark_key(conversation_id: &str) -> String {
    format!("im:db:watermark:{conversation_id}")
}

pub fn private_conversation_id(a: i64, b: i64) -> String {
    let left = a.min(b);
    let right = a.max(b);
    format!("p_{left}_{right}")
}

pub fn group_conversation_id(group_id: i64) -> String {
    format!("g_{group_id}")
}

pub fn ai_auto_reply_key(user_id: i64) -> String {
    format!("im:ai:auto_reply:{user_id}")
}

pub fn ai_anti_reentry_key(user_id: i64, conv_id: &str) -> String {
    format!("im:ai:antireentry:{user_id}:{conv_id}")
}

pub fn ai_stream_channel(task_id: i64) -> String {
    format!("im:ai:stream:sub:{task_id}")
}

pub fn ai_summary_cache_key(conv_id: &str, params_hash: &str) -> String {
    format!("im:ai:summary:{conv_id}:{params_hash}")
}

// Moments keys
pub const MOMENTS_FEED_PREFIX: &str = "moments:feed:";
pub const MOMENTS_POST_PREFIX: &str = "moments:post:";
pub const MOMENTS_LIKES_PREFIX: &str = "moments:likes:";
pub const MOMENTS_NOTIFY_PREFIX: &str = "moments:notify:";

pub const MOMENTS_FEED_TTL: i64 = 7 * 24 * 3600; // 7 days
pub const MOMENTS_POST_TTL: i64 = 24 * 3600; // 24 hours
pub const MOMENTS_LIKES_TTL: i64 = 24 * 3600; // 24 hours
pub const MOMENTS_NOTIFY_TTL: i64 = 30 * 24 * 3600; // 30 days

pub fn moments_feed_key(user_id: i64) -> String {
    format!("{MOMENTS_FEED_PREFIX}{user_id}")
}

pub fn moments_post_key(post_id: i64) -> String {
    format!("{MOMENTS_POST_PREFIX}{post_id}")
}

pub fn moments_likes_key(post_id: i64) -> String {
    format!("{MOMENTS_LIKES_PREFIX}{post_id}")
}

pub fn moments_notify_key(user_id: i64) -> String {
    format!("{MOMENTS_NOTIFY_PREFIX}{user_id}")
}

