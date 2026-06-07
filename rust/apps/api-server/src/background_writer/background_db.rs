use super::*;

pub(crate) struct DbMessage {
    pub(crate) id: i64,
    pub(crate) sender_id: i64,
    pub(crate) receiver_id: Option<i64>,
    pub(crate) group_id: Option<i64>,
    pub(crate) conversation_seq: Option<i64>,
    pub(crate) client_message_id: Option<String>,
    pub(crate) message_type: i32,
    pub(crate) content: Option<String>,
    pub(crate) media_url: Option<String>,
    pub(crate) media_size: Option<i64>,
    pub(crate) media_name: Option<String>,
    pub(crate) thumbnail_url: Option<String>,
    pub(crate) duration: Option<i32>,
    pub(crate) location_info: Option<String>,
    pub(crate) encrypted: i8,
    pub(crate) e2ee_header: Option<String>,
    pub(crate) e2ee_device_id: Option<String>,
    pub(crate) e2ee_sender_identity_key: Option<String>,
    pub(crate) e2ee_ephemeral_key: Option<String>,
    pub(crate) e2ee_envelope_json: Option<String>,
    pub(crate) status: i32,
    pub(crate) is_group_chat: i8,
    pub(crate) reply_to_message_id: Option<i64>,
    pub(crate) created_time: NaiveDateTime,
    pub(crate) updated_time: NaiveDateTime,
}

impl DbMessage {
    fn from_message(message: &MessageDto) -> Option<Self> {
        let created = parse_datetime(&message.created_time);
        let updated = message
            .updated_time
            .as_deref()
            .map(parse_datetime)
            .unwrap_or(created);

        let message_id = match parse_i64(&message.id) {
            Some(id) if id > 0 => id,
            other => {
                tracing::warn!(id = %message.id, ?other, "skipping message with invalid id");
                return None;
            }
        };

        Some(Self {
            id: message_id,
            sender_id: parse_i64(&message.sender_id).unwrap_or(0),
            receiver_id: message.receiver_id.as_deref().and_then(parse_i64),
            group_id: message.group_id.as_deref().and_then(parse_i64),
            conversation_seq: message.conversation_seq,
            client_message_id: message.client_message_id.clone(),
            message_type: MessageType::from_text(&message.message_type).db_code(),
            content: message.content.clone(),
            media_url: message.media_url.clone(),
            media_size: message.media_size,
            media_name: message.media_name.clone(),
            thumbnail_url: message.thumbnail_url.clone(),
            duration: message.duration,
            location_info: message.location_info.clone(),
            encrypted: if message.encrypted.unwrap_or(false) {
                1_i8
            } else {
                0_i8
            },
            e2ee_header: message.e2ee_header.clone(),
            e2ee_device_id: message.e2ee_device_id.clone(),
            e2ee_sender_identity_key: message.e2ee_sender_identity_key.clone(),
            e2ee_ephemeral_key: message.e2ee_ephemeral_key.clone(),
            e2ee_envelope_json: message
                .e2ee_envelope
                .as_ref()
                .and_then(|envelope| serde_json::to_string(envelope).ok()),
            status: MessageStatus::from_text(&message.status).db_code(),
            is_group_chat: if message.is_group_chat { 1_i8 } else { 0_i8 },
            reply_to_message_id: message.reply_to_message_id.as_deref().and_then(parse_i64),
            created_time: created,
            updated_time: updated,
        })
    }
}

#[derive(Clone)]
pub(crate) struct PrivateReadCursor {
    pub(crate) cursor_id: i64,
    pub(crate) user_id: i64,
    pub(crate) peer_user_id: i64,
    pub(crate) read_at: NaiveDateTime,
}

#[derive(Clone)]
pub(crate) struct GroupReadCursor {
    pub(crate) cursor_id: i64,
    pub(crate) group_id: i64,
    pub(crate) user_id: i64,
    pub(crate) read_at: NaiveDateTime,
    pub(crate) last_read_seq: i64,
    pub(crate) last_read_message_id: Option<i64>,
}

pub(crate) async fn insert_messages(
    tx: &mut sqlx::Transaction<'_, sqlx::MySql>,
    messages: &[MessageDto],
) -> anyhow::Result<()> {
    if messages.is_empty() {
        return Ok(());
    }

    let records = messages
        .iter()
        .filter_map(DbMessage::from_message)
        .collect::<Vec<_>>();

    for chunk in records.chunks(max_rows_per_statement(MESSAGE_INSERT_BINDS)) {
        let mut query = QueryBuilder::<MySql>::new(
            "INSERT INTO service_message_service_db.messages \
             (id, sender_id, receiver_id, group_id, conversation_seq, client_message_id, message_type, content, \
              media_url, media_size, media_name, thumbnail_url, duration, location_info, encrypted, e2ee_header, \
              e2ee_device_id, e2ee_sender_identity_key, e2ee_ephemeral_key, e2ee_envelope_json, status, \
              is_group_chat, reply_to_message_id, created_time, updated_time) ",
        );
        query.push_values(chunk.iter(), |mut row, message| {
            row.push_bind(message.id)
                .push_bind(message.sender_id)
                .push_bind(message.receiver_id)
                .push_bind(message.group_id)
                .push_bind(message.conversation_seq)
                .push_bind(message.client_message_id.clone())
                .push_bind(message.message_type)
                .push_bind(message.content.clone())
                .push_bind(message.media_url.clone())
                .push_bind(message.media_size)
                .push_bind(message.media_name.clone())
                .push_bind(message.thumbnail_url.clone())
                .push_bind(message.duration)
                .push_bind(message.location_info.clone())
                .push_bind(message.encrypted)
                .push_bind(message.e2ee_header.clone())
                .push_bind(message.e2ee_device_id.clone())
                .push_bind(message.e2ee_sender_identity_key.clone())
                .push_bind(message.e2ee_ephemeral_key.clone())
                .push_bind(message.e2ee_envelope_json.clone())
                .push_bind(message.status)
                .push_bind(message.is_group_chat)
                .push_bind(message.reply_to_message_id)
                .push_bind(message.created_time)
                .push_bind(message.updated_time);
        });
        query.push(
            " ON DUPLICATE KEY UPDATE \
              status = GREATEST(status, VALUES(status)), \
              conversation_seq = COALESCE(VALUES(conversation_seq), conversation_seq), \
              updated_time = GREATEST(updated_time, VALUES(updated_time))",
        );
        query.build().persistent(false).execute(&mut **tx).await?;
    }
    Ok(())
}

pub(crate) async fn upsert_private_read_cursors(
    tx: &mut sqlx::Transaction<'_, sqlx::MySql>,
    cursors: &[PrivateReadCursor],
) -> anyhow::Result<()> {
    for chunk in cursors.chunks(max_rows_per_statement(PRIVATE_READ_CURSOR_INSERT_BINDS)) {
        let mut query = QueryBuilder::<MySql>::new(
            "INSERT INTO service_message_service_db.private_read_cursor \
             (id, user_id, peer_user_id, last_read_at, created_time, updated_time) ",
        );
        query.push_values(chunk.iter(), |mut row, cursor| {
            row.push_bind(cursor.cursor_id)
                .push_bind(cursor.user_id)
                .push_bind(cursor.peer_user_id)
                .push_bind(cursor.read_at)
                .push_bind(cursor.read_at)
                .push_bind(cursor.read_at);
        });
        query.push(
            " ON DUPLICATE KEY UPDATE \
               last_read_at = GREATEST(last_read_at, VALUES(last_read_at)), \
               updated_time = GREATEST(updated_time, VALUES(updated_time))",
        );
        query.build().persistent(false).execute(&mut **tx).await?;
    }
    Ok(())
}

pub(crate) async fn upsert_group_read_cursors(
    tx: &mut sqlx::Transaction<'_, sqlx::MySql>,
    cursors: &[GroupReadCursor],
) -> anyhow::Result<()> {
    for chunk in cursors.chunks(max_rows_per_statement(GROUP_READ_CURSOR_INSERT_BINDS)) {
        let mut query = QueryBuilder::<MySql>::new(
            "INSERT INTO service_message_service_db.group_read_cursor \
             (id, group_id, user_id, last_read_at, last_read_seq, last_read_message_id, created_time, updated_time) ",
        );
        query.push_values(chunk.iter(), |mut row, cursor| {
            row.push_bind(cursor.cursor_id)
                .push_bind(cursor.group_id)
                .push_bind(cursor.user_id)
                .push_bind(cursor.read_at)
                .push_bind(cursor.last_read_seq)
                .push_bind(cursor.last_read_message_id)
                .push_bind(cursor.read_at)
                .push_bind(cursor.read_at);
        });
        query.push(
            " ON DUPLICATE KEY UPDATE \
               last_read_at = GREATEST(last_read_at, VALUES(last_read_at)), \
               last_read_seq = GREATEST(last_read_seq, VALUES(last_read_seq)), \
               last_read_message_id = NULLIF(GREATEST(COALESCE(last_read_message_id, 0), COALESCE(VALUES(last_read_message_id), 0)), 0), \
               updated_time = GREATEST(updated_time, VALUES(updated_time))",
        );
        query.build().persistent(false).execute(&mut **tx).await?;
    }
    Ok(())
}

pub(crate) fn coalesce_private_read_cursors(
    cursors: Vec<PrivateReadCursor>,
) -> Vec<PrivateReadCursor> {
    let mut latest_by_key: HashMap<(i64, i64), PrivateReadCursor> = HashMap::new();
    for cursor in cursors {
        match latest_by_key.entry((cursor.user_id, cursor.peer_user_id)) {
            std::collections::hash_map::Entry::Occupied(mut entry) => {
                if cursor.read_at > entry.get().read_at {
                    entry.insert(cursor);
                }
            }
            std::collections::hash_map::Entry::Vacant(entry) => {
                entry.insert(cursor);
            }
        }
    }
    latest_by_key.into_values().collect()
}

pub(crate) fn coalesce_group_read_cursors(cursors: Vec<GroupReadCursor>) -> Vec<GroupReadCursor> {
    let mut latest_by_key: HashMap<(i64, i64), GroupReadCursor> = HashMap::new();
    for cursor in cursors {
        match latest_by_key.entry((cursor.group_id, cursor.user_id)) {
            std::collections::hash_map::Entry::Occupied(mut entry) => {
                if group_cursor_is_newer(&cursor, entry.get()) {
                    entry.insert(cursor);
                }
            }
            std::collections::hash_map::Entry::Vacant(entry) => {
                entry.insert(cursor);
            }
        }
    }
    latest_by_key.into_values().collect()
}

pub(crate) fn group_cursor_is_newer(
    candidate: &GroupReadCursor,
    current: &GroupReadCursor,
) -> bool {
    candidate.last_read_seq > current.last_read_seq
        || (candidate.last_read_seq == current.last_read_seq && candidate.read_at > current.read_at)
}

pub(crate) fn max_rows_per_statement(bind_count_per_row: usize) -> usize {
    (MYSQL_BIND_LIMIT / bind_count_per_row).max(1)
}

pub(crate) fn conversation_id_from_message(message: &MessageDto) -> String {
    if message.is_group_chat {
        return message
            .group_id
            .as_deref()
            .and_then(parse_i64)
            .map(keys::group_conversation_id)
            .unwrap_or_else(|| "g_0".to_string());
    }
    let sender_id = parse_i64(&message.sender_id).unwrap_or_default();
    let receiver_id = message
        .receiver_id
        .as_deref()
        .and_then(parse_i64)
        .unwrap_or_default();
    keys::private_conversation_id(sender_id, receiver_id)
}

pub(crate) fn parse_i64(value: &str) -> Option<i64> {
    value.trim().parse::<i64>().ok()
}

pub(crate) fn parse_datetime(value: &str) -> NaiveDateTime {
    DateTime::parse_from_rfc3339(value)
        .map(|value| value.naive_utc())
        .unwrap_or_else(|_| Utc::now().naive_utc())
}
