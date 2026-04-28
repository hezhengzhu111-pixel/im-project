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
