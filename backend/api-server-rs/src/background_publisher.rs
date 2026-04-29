use crate::background_task;
use crate::config::{AppConfig, EventStreamConfig, EventStreamKind};
use crate::observability;
use crate::redis_streams;
use im_rs_common::event::ImEvent;
use im_rs_common::{keys, time};
use redis::Commands;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

const PENDING_EVENTS_OBSERVE_INTERVAL: Duration = Duration::from_secs(1);

#[derive(Clone)]
struct PendingEventSource {
    kind: PendingEventSourceKind,
    redis_url: String,
}

impl PendingEventSource {
    fn task_name(&self) -> &'static str {
        match self.kind {
            PendingEventSourceKind::Shared => "event-publisher",
            PendingEventSourceKind::Private => "event-publisher-private-hot",
            PendingEventSourceKind::Group => "event-publisher-group-hot",
        }
    }
}

#[derive(Clone, Copy)]
enum PendingEventSourceKind {
    Shared,
    Private,
    Group,
}

impl PendingEventSourceKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Shared => "shared-hot",
            Self::Private => "private-hot",
            Self::Group => "group-hot",
        }
    }

    fn pending_events_operation(self) -> &'static str {
        match self {
            Self::Shared => "publisher.due_events",
            Self::Private => "publisher.private_hot.due_events",
            Self::Group => "publisher.group_hot.due_events",
        }
    }
}

fn pending_event_sources(config: &AppConfig) -> Vec<PendingEventSource> {
    let mut sources = Vec::new();
    let mut seen_urls = Vec::new();
    for redis_url in &config.private_hot_redis_urls {
        let kind = if config.group_hot_redis_urls.contains(redis_url) {
            PendingEventSourceKind::Shared
        } else {
            PendingEventSourceKind::Private
        };
        push_pending_event_source(&mut sources, &mut seen_urls, kind, redis_url);
    }
    for redis_url in &config.group_hot_redis_urls {
        push_pending_event_source(
            &mut sources,
            &mut seen_urls,
            PendingEventSourceKind::Group,
            redis_url,
        );
    }
    sources
}

fn push_pending_event_source(
    sources: &mut Vec<PendingEventSource>,
    seen_urls: &mut Vec<String>,
    kind: PendingEventSourceKind,
    redis_url: &str,
) {
    if seen_urls.iter().any(|seen| seen == redis_url) {
        return;
    }
    seen_urls.push(redis_url.to_string());
    sources.push(PendingEventSource {
        kind,
        redis_url: redis_url.to_string(),
    });
}

pub fn spawn(config: Arc<AppConfig>) {
    if !config.event_publisher_enabled {
        tracing::info!("api-server embedded event publisher disabled");
        return;
    }
    for source in pending_event_sources(&config) {
        let task_config = config.clone();
        background_task::spawn(source.task_name(), move || run(task_config, source));
    }
}

fn run(config: Arc<AppConfig>, source: PendingEventSource) {
    tracing::info!(
        source = source.kind.as_str(),
        private_stream = %config.private_event_stream_key,
        group_stream = %config.group_event_stream_key,
        "api-server embedded event publisher started"
    );
    loop {
        match connect_and_publish(config.clone(), source.clone()) {
            Ok(()) => {}
            Err(error) => {
                tracing::warn!(error = %error, "embedded event publisher failed");
                thread::sleep(Duration::from_secs(2));
            }
        }
    }
}

fn connect_and_publish(config: Arc<AppConfig>, source: PendingEventSource) -> anyhow::Result<()> {
    let hot_redis_client = redis::Client::open(source.redis_url.as_str())?;
    let mut hot_redis = hot_redis_client.get_connection()?;
    let mut publishers = EventPublishers::connect(&config)?;
    let mut last_pending_events_observe = Instant::now() - PENDING_EVENTS_OBSERVE_INTERVAL;

    loop {
        match publish_due_events(
            &config,
            source.kind,
            &mut hot_redis,
            &mut publishers,
            &mut last_pending_events_observe,
        ) {
            Ok(count) if count > 0 => tracing::debug!(count, "published pending events"),
            Ok(_) => thread::sleep(Duration::from_millis(config.publisher_loop_interval_ms)),
            Err(error) => {
                tracing::warn!(error = %error, "publish pending events failed");
                thread::sleep(Duration::from_millis(
                    config.publisher_loop_interval_ms.max(1000),
                ));
                return Err(error);
            }
        }
    }
}

fn publish_due_events(
    config: &AppConfig,
    source_kind: PendingEventSourceKind,
    hot_redis: &mut redis::Connection,
    publishers: &mut EventPublishers,
    last_observe: &mut Instant,
) -> anyhow::Result<usize> {
    let event_ids: Vec<String> = redis::cmd("ZRANGEBYSCORE")
        .arg(keys::pending_events_key())
        .arg("-inf")
        .arg(time::now_ms())
        .arg("LIMIT")
        .arg(0)
        .arg(config.publisher_batch_size.max(1))
        .query(hot_redis)?;
    if event_ids.is_empty() {
        return Ok(0);
    }
    if last_observe.elapsed() >= PENDING_EVENTS_OBSERVE_INTERVAL {
        let backlog_count = hot_redis.zcard(keys::pending_events_key()).ok();
        observability::pending_events(
            source_kind.pending_events_operation(),
            event_ids.len(),
            backlog_count,
        );
        *last_observe = Instant::now();
    }

    let event_keys = event_ids
        .iter()
        .map(|event_id| keys::event_key(event_id))
        .collect::<Vec<_>>();
    let mut get_pipe = redis::pipe();
    for event_key in &event_keys {
        get_pipe.get(event_key);
    }
    let payloads: Vec<Option<String>> = get_pipe.query(hot_redis)?;

    let mut private_events = Vec::new();
    let mut group_events = Vec::new();
    let mut stale_event_ids = Vec::new();
    let mut stale_event_keys = Vec::new();
    for ((event_id, event_key), payload) in event_ids.into_iter().zip(event_keys).zip(payloads) {
        let Some(payload) = payload else {
            stale_event_ids.push(event_id);
            continue;
        };

        let event: ImEvent = match serde_json::from_str(&payload) {
            Ok(event) => event,
            Err(error) => {
                tracing::warn!(event_id = %event_id, error = %error, "drop invalid pending event");
                stale_event_ids.push(event_id);
                stale_event_keys.push(event_key);
                continue;
            }
        };
        let pending = PendingEvent {
            event_id,
            event_key,
            stream_event_id: event.event_id.clone(),
            conversation_id: event.conversation_id.clone(),
            payload,
        };
        match event_stream_kind(&event) {
            EventStreamKind::Private => private_events.push(pending),
            EventStreamKind::Group => group_events.push(pending),
        }
    }

    remove_stale_events(hot_redis, stale_event_ids, stale_event_keys)?;
    let mut published = 0;
    published += publishers
        .private
        .publish(config, hot_redis, private_events)?;
    published += publishers.group.publish(config, hot_redis, group_events)?;
    Ok(published)
}

fn event_stream_kind(event: &ImEvent) -> EventStreamKind {
    if event.group
        || event.group_id.is_some()
        || event
            .payload
            .as_ref()
            .map(|message| message.is_group_chat)
            .unwrap_or(false)
    {
        return EventStreamKind::Group;
    }
    EventStreamKind::Private
}

fn remove_stale_events(
    hot_redis: &mut redis::Connection,
    event_ids: Vec<String>,
    event_keys: Vec<String>,
) -> anyhow::Result<()> {
    if event_ids.is_empty() && event_keys.is_empty() {
        return Ok(());
    }
    let mut pipe = redis::pipe();
    if !event_keys.is_empty() {
        pipe.del(event_keys).ignore();
    }
    if !event_ids.is_empty() {
        pipe.zrem(keys::pending_events_key(), event_ids).ignore();
    }
    pipe.query::<()>(hot_redis)?;
    Ok(())
}

struct PendingEvent {
    event_id: String,
    event_key: String,
    stream_event_id: String,
    conversation_id: String,
    payload: String,
}

struct EventPublishers {
    private: EventPublisher,
    group: EventPublisher,
}

impl EventPublishers {
    fn connect(config: &AppConfig) -> anyhow::Result<Self> {
        Ok(Self {
            private: EventPublisher::connect(config.private_event_stream())?,
            group: EventPublisher::connect(config.group_event_stream())?,
        })
    }
}

struct EventPublisher {
    stream: EventStreamConfig,
    redis: redis::Connection,
}

impl EventPublisher {
    fn connect(stream: EventStreamConfig) -> anyhow::Result<Self> {
        tracing::info!(
            kind = stream.kind.as_str(),
            stream = %stream.stream_key,
            "connected event stream publisher"
        );
        let redis = redis::Client::open(stream.redis_url.as_str())?.get_connection()?;
        Ok(Self { stream, redis })
    }

    fn publish(
        &mut self,
        config: &AppConfig,
        hot_redis: &mut redis::Connection,
        events: Vec<PendingEvent>,
    ) -> anyhow::Result<usize> {
        if events.is_empty() {
            return Ok(0);
        }
        let mut publish_pipe = redis::pipe();
        for event in &events {
            redis_streams::append_event_cmd(
                &mut publish_pipe,
                &self.stream.stream_key,
                config.event_stream_max_len,
                &event.stream_event_id,
                &event.conversation_id,
                &event.payload,
            );
        }
        publish_pipe.query::<()>(&mut self.redis)?;

        let mut remove_ids = Vec::with_capacity(events.len());
        let mut remove_keys = Vec::with_capacity(events.len());
        for event in events {
            remove_ids.push(event.event_id);
            remove_keys.push(event.event_key);
        }
        let published = remove_ids.len();
        remove_stale_events(hot_redis, remove_ids, remove_keys)?;
        Ok(published)
    }
}
