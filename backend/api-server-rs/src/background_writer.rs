use crate::config::AppConfig;
use crate::observability;
use crate::redis_streams;
use chrono::{DateTime, NaiveDateTime, Utc};
use im_rs_common::event::{ImEvent, ImEventType, MessageDto, MessageStatus, MessageType};
use im_rs_common::{ids, keys};
use sqlx::{MySql, MySqlPool, QueryBuilder};
use std::collections::HashMap;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

const MYSQL_BIND_LIMIT: usize = 60_000;
const MESSAGE_INSERT_BINDS: usize = 18;
const READ_CURSOR_INSERT_BINDS: usize = 6;

pub fn spawn(config: Arc<AppConfig>, db: MySqlPool) {
    if !config.message_writer_enabled {
        tracing::info!("api-server embedded message writer disabled");
        return;
    }
    let handle = tokio::runtime::Handle::current();
    thread::spawn(move || run(config, db, handle));
}

fn run(config: Arc<AppConfig>, db: MySqlPool, handle: tokio::runtime::Handle) {
    tracing::info!(
        stream = %config.event_stream_key,
        group = %config.writer_group_id,
        "api-server embedded message writer started"
    );
    loop {
        match connect_and_consume(config.clone(), db.clone(), handle.clone()) {
            Ok(()) => {}
            Err(error) => {
                tracing::warn!(error = %error, "embedded message writer failed");
                thread::sleep(Duration::from_secs(2));
            }
        }
    }
}

fn connect_and_consume(
    config: Arc<AppConfig>,
    db: MySqlPool,
    handle: tokio::runtime::Handle,
) -> anyhow::Result<()> {
    let redis = redis::Client::open(config.redis_url.as_str())?.get_connection()?;
    let stream_key = config.event_stream_key.clone();
    let group_id = config.writer_group_id.clone();
    let consumer_name = redis_streams::consumer_name("writer");
    let mut processor = Processor {
        config,
        db,
        redis,
        message_batch: Vec::new(),
        private_read_batch: Vec::new(),
        group_read_batch: Vec::new(),
        last_flush: Instant::now(),
    };
    redis_streams::ensure_group(&mut processor.redis, &stream_key, &group_id)?;

    loop {
        let events = redis_streams::read_group_events(
            &mut processor.redis,
            &stream_key,
            &group_id,
            &consumer_name,
            processor.config.writer_batch_size,
            processor.config.stream_consumer_block_ms,
        )?;
        let mut ack_ids = Vec::with_capacity(events.len());
        for event_message in events {
            match serde_json::from_str::<ImEvent>(&event_message.payload) {
                Ok(event) => handle.block_on(processor.process(event))?,
                Err(error) => tracing::warn!(error = %error, "skip invalid event json"),
            }
            ack_ids.push(event_message.stream_id);
        }
        handle.block_on(processor.flush_if_due())?;
        redis_streams::ack(&mut processor.redis, &stream_key, &group_id, &ack_ids)?;
    }
}

struct Processor {
    config: Arc<AppConfig>,
    db: MySqlPool,
    redis: redis::Connection,
    message_batch: Vec<MessageDto>,
    private_read_batch: Vec<PrivateReadCursor>,
    group_read_batch: Vec<GroupReadCursor>,
    last_flush: Instant,
}

impl Processor {
    async fn process(&mut self, event: ImEvent) -> anyhow::Result<()> {
        match event.event_type {
            ImEventType::MessageCreated => {
                if let Some(message) = event.payload {
                    self.message_batch.push(message);
                    if self.message_batch.len() >= self.config.writer_batch_size {
                        if self.flush_messages().await? {
                            self.last_flush = Instant::now();
                        }
                    }
                }
            }
            ImEventType::MessageRead => {
                self.enqueue_read(event);
                if self.read_batch_len() >= self.config.writer_batch_size {
                    if self.flush_read_cursors().await? {
                        self.last_flush = Instant::now();
                    }
                }
            }
            ImEventType::MessageRecalled | ImEventType::MessageDeleted => {
                self.flush_pending().await?;
                self.apply_status(event).await?;
            }
        }
        Ok(())
    }

    async fn flush_if_due(&mut self) -> anyhow::Result<()> {
        if self.has_pending()
            && self.last_flush.elapsed()
                >= Duration::from_millis(self.config.writer_flush_interval_ms)
        {
            self.flush_pending().await?;
        }
        Ok(())
    }

    async fn flush_pending(&mut self) -> anyhow::Result<()> {
        let flushed_messages = self.flush_messages().await?;
        let flushed_reads = self.flush_read_cursors().await?;
        if flushed_messages || flushed_reads {
            self.last_flush = Instant::now();
        }
        Ok(())
    }

    fn has_pending(&self) -> bool {
        !self.message_batch.is_empty()
            || !self.private_read_batch.is_empty()
            || !self.group_read_batch.is_empty()
    }

    fn read_batch_len(&self) -> usize {
        self.private_read_batch.len() + self.group_read_batch.len()
    }

    async fn flush_messages(&mut self) -> anyhow::Result<bool> {
        if self.message_batch.is_empty() {
            return Ok(false);
        }

        let messages = std::mem::take(&mut self.message_batch);
        let count = messages.len();
        let started = Instant::now();
        let mut tx = self.db.begin().await?;
        insert_messages(&mut tx, &messages).await?;
        tx.commit().await?;
        tracing::debug!(count, "batch inserted messages");
        observability::writer_flush(
            "messages",
            count,
            started.elapsed().as_millis() as u64,
            self.message_batch.len(),
            self.read_batch_len(),
        );

        let mut watermarks: HashMap<String, i64> = HashMap::new();
        for message in &messages {
            if let Ok(message_id) = message.id.parse::<i64>() {
                let conversation_id = conversation_id_from_message(message);
                watermarks
                    .entry(conversation_id)
                    .and_modify(|current| *current = (*current).max(message_id))
                    .or_insert(message_id);
            }
        }
        if !watermarks.is_empty() {
            let mut pipe = redis::pipe();
            for (conversation_id, message_id) in watermarks {
                pipe.set(
                    keys::db_watermark_key(&conversation_id),
                    message_id.to_string(),
                )
                .ignore();
            }
            let _: redis::RedisResult<()> = pipe.query(&mut self.redis);
        }
        Ok(true)
    }

    async fn flush_read_cursors(&mut self) -> anyhow::Result<bool> {
        if self.private_read_batch.is_empty() && self.group_read_batch.is_empty() {
            return Ok(false);
        }
        let started = Instant::now();
        let count = self.read_batch_len();

        let private = coalesce_private_read_cursors(std::mem::take(&mut self.private_read_batch));
        let group = coalesce_group_read_cursors(std::mem::take(&mut self.group_read_batch));
        let mut tx = self.db.begin().await?;
        upsert_private_read_cursors(&mut tx, &private).await?;
        upsert_group_read_cursors(&mut tx, &group).await?;
        tx.commit().await?;
        tracing::debug!(
            private_count = private.len(),
            group_count = group.len(),
            "batch upserted read cursors"
        );
        observability::writer_flush(
            "read_cursors",
            count,
            started.elapsed().as_millis() as u64,
            self.message_batch.len(),
            self.read_batch_len(),
        );
        Ok(true)
    }

    async fn apply_status(&mut self, event: ImEvent) -> anyhow::Result<()> {
        let Some(message_id) = event.message_id.as_deref().and_then(parse_i64) else {
            return Ok(());
        };
        let status = event
            .new_status
            .as_deref()
            .map(MessageStatus::from_text)
            .unwrap_or_else(|| match event.event_type {
                ImEventType::MessageDeleted => MessageStatus::Deleted,
                _ => MessageStatus::Recalled,
            });
        sqlx::query(
            "UPDATE service_message_service_db.messages \
             SET status = GREATEST(status, ?), updated_time = ? WHERE id = ?",
        )
        .bind(status.db_code())
        .bind(event.timestamp.naive_utc())
        .bind(message_id)
        .execute(&self.db)
        .await?;
        Ok(())
    }

    fn enqueue_read(&mut self, event: ImEvent) {
        let Some(receipt) = event.read_receipt else {
            return;
        };
        let Some(reader_id) = parse_i64(&receipt.reader_id) else {
            return;
        };
        let read_at = parse_datetime(&receipt.read_at);
        if let Some(group_id) = event.group_id.as_deref().and_then(parse_i64) {
            let cursor_id = ids::next_id(self.config.writer_snowflake_node_id);
            self.group_read_batch.push(GroupReadCursor {
                cursor_id,
                group_id,
                user_id: reader_id,
                read_at,
            });
            return;
        }

        let Some(peer_id) = event
            .target_user_id
            .as_deref()
            .and_then(parse_i64)
            .or_else(|| receipt.to_user_id.as_deref().and_then(parse_i64))
        else {
            return;
        };
        let cursor_id = ids::next_id(self.config.writer_snowflake_node_id);
        self.private_read_batch.push(PrivateReadCursor {
            cursor_id,
            user_id: reader_id,
            peer_user_id: peer_id,
            read_at,
        });
    }
}

struct DbMessage {
    id: i64,
    sender_id: i64,
    receiver_id: Option<i64>,
    group_id: Option<i64>,
    client_message_id: Option<String>,
    message_type: i32,
    content: Option<String>,
    media_url: Option<String>,
    media_size: Option<i64>,
    media_name: Option<String>,
    thumbnail_url: Option<String>,
    duration: Option<i32>,
    location_info: Option<String>,
    status: i32,
    is_group_chat: i8,
    reply_to_message_id: Option<i64>,
    created_time: NaiveDateTime,
    updated_time: NaiveDateTime,
}

impl DbMessage {
    fn from_message(message: &MessageDto) -> Self {
        let created = parse_datetime(&message.created_time);
        let updated = message
            .updated_time
            .as_deref()
            .map(parse_datetime)
            .unwrap_or(created);

        Self {
            id: parse_i64(&message.id).unwrap_or_default(),
            sender_id: parse_i64(&message.sender_id).unwrap_or_default(),
            receiver_id: message.receiver_id.as_deref().and_then(parse_i64),
            group_id: message.group_id.as_deref().and_then(parse_i64),
            client_message_id: message.client_message_id.clone(),
            message_type: MessageType::from_text(&message.message_type).db_code(),
            content: message.content.clone(),
            media_url: message.media_url.clone(),
            media_size: message.media_size,
            media_name: message.media_name.clone(),
            thumbnail_url: message.thumbnail_url.clone(),
            duration: message.duration,
            location_info: message.location_info.clone(),
            status: MessageStatus::from_text(&message.status).db_code(),
            is_group_chat: if message.is_group_chat { 1_i8 } else { 0_i8 },
            reply_to_message_id: message.reply_to_message_id.as_deref().and_then(parse_i64),
            created_time: created,
            updated_time: updated,
        }
    }
}

#[derive(Clone)]
struct PrivateReadCursor {
    cursor_id: i64,
    user_id: i64,
    peer_user_id: i64,
    read_at: NaiveDateTime,
}

#[derive(Clone)]
struct GroupReadCursor {
    cursor_id: i64,
    group_id: i64,
    user_id: i64,
    read_at: NaiveDateTime,
}

async fn insert_messages(
    tx: &mut sqlx::Transaction<'_, sqlx::MySql>,
    messages: &[MessageDto],
) -> anyhow::Result<()> {
    if messages.is_empty() {
        return Ok(());
    }

    let records = messages
        .iter()
        .map(DbMessage::from_message)
        .collect::<Vec<_>>();

    for chunk in records.chunks(max_rows_per_statement(MESSAGE_INSERT_BINDS)) {
        let mut query = QueryBuilder::<MySql>::new(
            "INSERT INTO service_message_service_db.messages \
             (id, sender_id, receiver_id, group_id, client_message_id, message_type, content, \
              media_url, media_size, media_name, thumbnail_url, duration, location_info, status, \
              is_group_chat, reply_to_message_id, created_time, updated_time) ",
        );
        query.push_values(chunk.iter(), |mut row, message| {
            row.push_bind(message.id)
                .push_bind(message.sender_id)
                .push_bind(message.receiver_id)
                .push_bind(message.group_id)
                .push_bind(message.client_message_id.clone())
                .push_bind(message.message_type)
                .push_bind(message.content.clone())
                .push_bind(message.media_url.clone())
                .push_bind(message.media_size)
                .push_bind(message.media_name.clone())
                .push_bind(message.thumbnail_url.clone())
                .push_bind(message.duration)
                .push_bind(message.location_info.clone())
                .push_bind(message.status)
                .push_bind(message.is_group_chat)
                .push_bind(message.reply_to_message_id)
                .push_bind(message.created_time)
                .push_bind(message.updated_time);
        });
        query.push(
            " ON DUPLICATE KEY UPDATE \
              status = GREATEST(status, VALUES(status)), \
              updated_time = GREATEST(updated_time, VALUES(updated_time))",
        );
        query.build().persistent(false).execute(&mut **tx).await?;
    }
    Ok(())
}

async fn upsert_private_read_cursors(
    tx: &mut sqlx::Transaction<'_, sqlx::MySql>,
    cursors: &[PrivateReadCursor],
) -> anyhow::Result<()> {
    for chunk in cursors.chunks(max_rows_per_statement(READ_CURSOR_INSERT_BINDS)) {
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

async fn upsert_group_read_cursors(
    tx: &mut sqlx::Transaction<'_, sqlx::MySql>,
    cursors: &[GroupReadCursor],
) -> anyhow::Result<()> {
    for chunk in cursors.chunks(max_rows_per_statement(READ_CURSOR_INSERT_BINDS)) {
        let mut query = QueryBuilder::<MySql>::new(
            "INSERT INTO service_message_service_db.group_read_cursor \
             (id, group_id, user_id, last_read_at, created_time, updated_time) ",
        );
        query.push_values(chunk.iter(), |mut row, cursor| {
            row.push_bind(cursor.cursor_id)
                .push_bind(cursor.group_id)
                .push_bind(cursor.user_id)
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

fn coalesce_private_read_cursors(cursors: Vec<PrivateReadCursor>) -> Vec<PrivateReadCursor> {
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

fn coalesce_group_read_cursors(cursors: Vec<GroupReadCursor>) -> Vec<GroupReadCursor> {
    let mut latest_by_key: HashMap<(i64, i64), GroupReadCursor> = HashMap::new();
    for cursor in cursors {
        match latest_by_key.entry((cursor.group_id, cursor.user_id)) {
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

fn max_rows_per_statement(bind_count_per_row: usize) -> usize {
    (MYSQL_BIND_LIMIT / bind_count_per_row).max(1)
}

fn conversation_id_from_message(message: &MessageDto) -> String {
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

fn parse_i64(value: &str) -> Option<i64> {
    value.trim().parse::<i64>().ok()
}

fn parse_datetime(value: &str) -> NaiveDateTime {
    DateTime::parse_from_rfc3339(value)
        .map(|value| value.naive_utc())
        .unwrap_or_else(|_| Utc::now().naive_utc())
}
