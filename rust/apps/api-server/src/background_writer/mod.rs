pub mod background_db;
pub(crate) use background_db::*;

use crate::background_task;
use crate::config::{AppConfig, EventStreamConfig, EventStreamKind};
use crate::observability;
use crate::redis_streams;
use chrono::{DateTime, NaiveDateTime, Utc};
use im_common::event::{
    ImEvent, ImEventType, MessageDeviceEnvelopeDto, MessageDto, MessageStatus, MessageType,
};
use im_common::{ids, keys};
use sqlx::{MySql, MySqlPool, QueryBuilder};
use std::collections::HashMap;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

const MYSQL_BIND_LIMIT: usize = 60_000;
const MESSAGE_INSERT_BINDS: usize = 25;
const MESSAGE_DEVICE_ENVELOPE_INSERT_BINDS: usize = 4;
const PRIVATE_READ_CURSOR_INSERT_BINDS: usize = 6;
const GROUP_READ_CURSOR_INSERT_BINDS: usize = 8;

pub fn spawn(config: Arc<AppConfig>, db: MySqlPool) {
    if !config.message_writer_enabled {
        tracing::info!("api-server embedded message writer disabled");
        return;
    }
    for stream in config.event_streams() {
        let task_config = config.clone();
        let task_db = db.clone();
        let handle = tokio::runtime::Handle::current();
        let task_name = match stream.kind {
            EventStreamKind::Private => "message-writer-private",
            EventStreamKind::Group => "message-writer-group",
        };
        background_task::spawn(task_name, move || run(task_config, stream, task_db, handle));
    }
}

fn run(
    config: Arc<AppConfig>,
    stream: EventStreamConfig,
    db: MySqlPool,
    handle: tokio::runtime::Handle,
) {
    let group_id = stream_group_id(&config.writer_group_id, &stream);
    tracing::info!(
        kind = stream.kind.as_str(),
        stream = %stream.stream_key,
        group = %group_id,
        "api-server embedded message writer started"
    );
    loop {
        match connect_and_consume(config.clone(), stream.clone(), db.clone(), handle.clone()) {
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
    stream: EventStreamConfig,
    db: MySqlPool,
    handle: tokio::runtime::Handle,
) -> anyhow::Result<()> {
    let event_redis = redis::Client::open(stream.redis_url.as_str())?.get_connection()?;
    let hot_redis = connect_hot_redis_connections(config.hot_redis_urls_for(stream.kind))?;
    let stream_key = stream.stream_key.clone();
    let group_id = stream_group_id(&config.writer_group_id, &stream);
    let consumer_name = redis_streams::consumer_name(&format!("writer-{}", stream.kind.as_str()));
    let mut processor = Processor {
        config,
        db,
        event_redis,
        hot_redis,
        message_batch: Vec::new(),
        private_read_batch: Vec::new(),
        group_read_batch: Vec::new(),
        message_ack_ids: Vec::new(),
        private_read_ack_ids: Vec::new(),
        group_read_ack_ids: Vec::new(),
        flushed_ack_ids: Vec::new(),
        last_flush: Instant::now(),
    };
    redis_streams::ensure_group(&mut processor.event_redis, &stream_key, &group_id)?;

    loop {
        let events = redis_streams::read_group_events(
            &mut processor.event_redis,
            &stream_key,
            &group_id,
            &consumer_name,
            processor.config.writer_batch_size,
            processor.config.stream_consumer_block_ms,
        )?;
        let mut immediate_ack_ids = Vec::with_capacity(events.len());
        for event_message in events {
            match serde_json::from_str::<ImEvent>(&event_message.payload) {
                Ok(event) => {
                    let batched = handle.block_on(processor.process(event, event_message.stream_id.clone()))?;
                    if batched {
                        // ACK deferred until successful flush to DB
                    } else {
                        immediate_ack_ids.push(event_message.stream_id);
                    }
                }
                Err(error) => tracing::warn!(error = %error, "skip invalid event json"),
            }
        }
        handle.block_on(processor.flush_if_due())?;
        // ACK immediately-processed events (recalls/deletes)
        if !immediate_ack_ids.is_empty() {
            redis_streams::ack(
                &mut processor.event_redis,
                &stream_key,
                &group_id,
                &immediate_ack_ids,
            )?;
        }
        // ACK events whose batches were successfully flushed to DB
        let flushed_ack_ids = processor.take_flushed_ack_ids();
        if !flushed_ack_ids.is_empty() {
            redis_streams::ack(
                &mut processor.event_redis,
                &stream_key,
                &group_id,
                &flushed_ack_ids,
            )?;
        }
    }
}

struct Processor {
    config: Arc<AppConfig>,
    db: MySqlPool,
    event_redis: redis::Connection,
    hot_redis: Vec<redis::Connection>,
    message_batch: Vec<PendingMessageWrite>,
    private_read_batch: Vec<PrivateReadCursor>,
    group_read_batch: Vec<GroupReadCursor>,
    message_ack_ids: Vec<String>,
    private_read_ack_ids: Vec<String>,
    group_read_ack_ids: Vec<String>,
    flushed_ack_ids: Vec<String>,
    last_flush: Instant,
}

fn stream_group_id(base_group_id: &str, stream: &EventStreamConfig) -> String {
    format!("{base_group_id}-{}", stream.kind.as_str())
}

fn connect_hot_redis_connections(urls: &[String]) -> anyhow::Result<Vec<redis::Connection>> {
    let mut connections = Vec::with_capacity(urls.len());
    for url in urls {
        connections.push(redis::Client::open(url.as_str())?.get_connection()?);
    }
    Ok(connections)
}

impl Processor {
    fn take_flushed_ack_ids(&mut self) -> Vec<String> {
        std::mem::take(&mut self.flushed_ack_ids)
    }

    /// Returns `true` if the event was batched (ACK deferred until flush).
    async fn process(&mut self, event: ImEvent, stream_id: String) -> anyhow::Result<bool> {
        match event.event_type {
            ImEventType::MessageCreated => {
                if let Some(message) = event.payload {
                    self.message_batch.push(PendingMessageWrite {
                        message,
                        device_envelopes: event.device_envelopes.unwrap_or_default(),
                    });
                    self.message_ack_ids.push(stream_id);
                    if self.message_batch.len() >= self.config.writer_batch_size
                        && self.flush_messages().await?
                    {
                        self.last_flush = Instant::now();
                    }
                    return Ok(true);
                }
            }
            ImEventType::MessageRead => {
                self.enqueue_read(event, stream_id);
                if self.read_batch_len() >= self.config.writer_batch_size
                    && self.flush_read_cursors().await?
                {
                    self.last_flush = Instant::now();
                }
                return Ok(true);
            }
            ImEventType::MessageRecalled | ImEventType::MessageDeleted => {
                self.flush_pending().await?;
                self.apply_status(event).await?;
            }
            ImEventType::FriendRequestCreated | ImEventType::FriendRequestAccepted => {}
            ImEventType::MomentNew | ImEventType::MomentLike | ImEventType::MomentComment => {}
        }
        Ok(false)
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

        let count = self.message_batch.len();
        let started = Instant::now();
        let mut tx = self.db.begin().await?;
        let messages = self
            .message_batch
            .iter()
            .map(|item| item.message.clone())
            .collect::<Vec<_>>();
        let device_envelopes = self
            .message_batch
            .iter()
            .flat_map(|item| {
                item.device_envelopes
                    .iter()
                    .map(|envelope| (item.message.id.clone(), envelope.clone()))
            })
            .collect::<Vec<_>>();
        insert_messages(&mut tx, &messages).await?;
        insert_message_device_envelopes(&mut tx, &device_envelopes).await?;
        tx.commit().await?;
        self.message_batch.clear();
        self.flushed_ack_ids.append(&mut self.message_ack_ids);
        tracing::debug!(count, "batch inserted messages");
        observability::writer_flush(
            "messages",
            count,
            u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX),
            self.message_batch.len(),
            self.read_batch_len(),
        );

        let mut watermarks_by_shard: HashMap<usize, HashMap<String, i64>> = HashMap::new();
        for message in &messages {
            if let Ok(message_id) = message.id.parse::<i64>() {
                let conversation_id = conversation_id_from_message(message);
                let Some(shard_index) =
                    crate::message::shard_index_for_key(&conversation_id, self.hot_redis.len())
                else {
                    tracing::warn!("failed to select hot redis shard for db watermark");
                    continue;
                };
                watermarks_by_shard
                    .entry(shard_index)
                    .or_default()
                    .entry(conversation_id)
                    .and_modify(|current| *current = (*current).max(message_id))
                    .or_insert(message_id);
            }
        }
        for (shard_index, watermarks) in watermarks_by_shard {
            let Some(hot_redis) = self.hot_redis.get_mut(shard_index) else {
                tracing::warn!("missing hot redis shard for db watermark");
                continue;
            };
            let mut pipe = redis::pipe();
            for (conversation_id, message_id) in watermarks {
                pipe.set(
                    keys::db_watermark_key(&conversation_id),
                    message_id.to_string(),
                )
                .ignore();
            }
            let result: redis::RedisResult<()> = pipe.query(hot_redis);
            if let Err(error) = result {
                tracing::warn!(error = %error, "failed to update db watermarks");
            }
        }
        Ok(true)
    }

    async fn flush_read_cursors(&mut self) -> anyhow::Result<bool> {
        if self.private_read_batch.is_empty() && self.group_read_batch.is_empty() {
            return Ok(false);
        }
        let started = Instant::now();
        let count = self.read_batch_len();

        let private = coalesce_private_read_cursors(self.private_read_batch.clone());
        let group = coalesce_group_read_cursors(self.group_read_batch.clone());
        let mut tx = self.db.begin().await?;
        upsert_private_read_cursors(&mut tx, &private).await?;
        upsert_group_read_cursors(&mut tx, &group).await?;
        tx.commit().await?;
        self.private_read_batch.clear();
        self.group_read_batch.clear();
        self.flushed_ack_ids.append(&mut self.private_read_ack_ids);
        self.flushed_ack_ids.append(&mut self.group_read_ack_ids);
        tracing::debug!(
            private_count = private.len(),
            group_count = group.len(),
            "batch upserted read cursors"
        );
        observability::writer_flush(
            "read_cursors",
            count,
            u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX),
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

    fn enqueue_read(&mut self, event: ImEvent, stream_id: String) {
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
                last_read_seq: receipt.last_read_seq.unwrap_or_default(),
                last_read_message_id: receipt.last_read_message_id.as_deref().and_then(parse_i64),
            });
            self.group_read_ack_ids.push(stream_id);
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
        self.private_read_ack_ids.push(stream_id);
    }
}

#[derive(Clone)]
struct PendingMessageWrite {
    message: MessageDto,
    device_envelopes: Vec<MessageDeviceEnvelopeDto>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::error::Error;

    #[test]
    fn should_coalesce_group_cursor_by_read_sequence() -> Result<(), Box<dyn Error>> {
        let older_time = NaiveDateTime::parse_from_str("2026-04-28 00:00:00", "%Y-%m-%d %H:%M:%S")?;
        let newer_time = NaiveDateTime::parse_from_str("2026-04-28 00:01:00", "%Y-%m-%d %H:%M:%S")?;
        let cursors = vec![
            GroupReadCursor {
                cursor_id: 1,
                group_id: 10,
                user_id: 20,
                read_at: newer_time,
                last_read_seq: 3,
                last_read_message_id: Some(300),
            },
            GroupReadCursor {
                cursor_id: 2,
                group_id: 10,
                user_id: 20,
                read_at: older_time,
                last_read_seq: 5,
                last_read_message_id: Some(500),
            },
        ];

        let coalesced = coalesce_group_read_cursors(cursors);
        let Some(cursor) = coalesced.first() else {
            return Err("coalesced cursor should exist".into());
        };
        if coalesced.len() != 1 {
            return Err("cursors with the same group/user should coalesce".into());
        }
        if cursor.last_read_seq != 5 {
            return Err("higher read sequence should win even when timestamp is older".into());
        }
        Ok(())
    }
}
