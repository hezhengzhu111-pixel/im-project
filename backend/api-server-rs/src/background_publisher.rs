use crate::config::AppConfig;
use crate::observability;
use crate::redis_streams;
use im_rs_common::event::ImEvent;
use im_rs_common::{keys, time};
use redis::Commands;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

const PENDING_EVENTS_OBSERVE_INTERVAL: Duration = Duration::from_secs(1);

pub fn spawn(config: Arc<AppConfig>) {
    if !config.event_publisher_enabled {
        tracing::info!("api-server embedded event publisher disabled");
        return;
    }
    thread::spawn(move || run(config));
}

fn run(config: Arc<AppConfig>) {
    tracing::info!(
        stream = %config.event_stream_key,
        "api-server embedded event publisher started"
    );
    loop {
        match connect_and_publish(config.clone()) {
            Ok(()) => {}
            Err(error) => {
                tracing::warn!(error = %error, "embedded event publisher failed");
                thread::sleep(Duration::from_secs(2));
            }
        }
    }
}

fn connect_and_publish(config: Arc<AppConfig>) -> anyhow::Result<()> {
    let redis_client = redis::Client::open(config.redis_url.as_str())?;
    let mut redis = redis_client.get_connection()?;
    let mut last_pending_events_observe = Instant::now() - PENDING_EVENTS_OBSERVE_INTERVAL;

    loop {
        match publish_due_events(&config, &mut redis, &mut last_pending_events_observe) {
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
    redis: &mut redis::Connection,
    last_observe: &mut Instant,
) -> anyhow::Result<usize> {
    let event_ids: Vec<String> = redis::cmd("ZRANGEBYSCORE")
        .arg(keys::pending_events_key())
        .arg("-inf")
        .arg(time::now_ms())
        .arg("LIMIT")
        .arg(0)
        .arg(config.publisher_batch_size.max(1))
        .query(redis)?;
    if !event_ids.is_empty() && last_observe.elapsed() >= PENDING_EVENTS_OBSERVE_INTERVAL {
        let backlog_count = redis.zcard(keys::pending_events_key()).ok();
        observability::pending_events("publisher.due_events", event_ids.len(), backlog_count);
        *last_observe = Instant::now();
    }

    let mut published = 0;
    for event_id in event_ids {
        let event_key = keys::event_key(&event_id);
        let Some(payload): Option<String> = redis.get(&event_key)? else {
            let _: usize = redis.zrem(keys::pending_events_key(), &event_id)?;
            continue;
        };

        let event: ImEvent = match serde_json::from_str(&payload) {
            Ok(event) => event,
            Err(error) => {
                tracing::warn!(event_id = %event_id, error = %error, "drop invalid pending event");
                let _: usize = redis.del(&event_key)?;
                let _: usize = redis.zrem(keys::pending_events_key(), &event_id)?;
                continue;
            }
        };

        redis_streams::append_event(
            config,
            redis,
            &event.event_id,
            &event.conversation_id,
            &payload,
        )?;

        let _: usize = redis.del(&event_key)?;
        let _: usize = redis.zrem(keys::pending_events_key(), &event_id)?;
        published += 1;
    }

    Ok(published)
}
