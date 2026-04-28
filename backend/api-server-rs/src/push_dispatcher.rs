use crate::auth_api;
use crate::config::AppConfig;
use crate::local_cache;
use crate::observability;
use crate::redis_streams;
use crate::route::{parse_user_routes, UserRoute};
use im_rs_common::event::{ImEvent, ImEventType};
use im_rs_common::time;
use redis::Commands;
use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use sqlx::MySqlPool;
use std::collections::{BTreeSet, HashMap};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

const GROUP_MEMBERS_CACHE_TTL_SECONDS: u64 = 5 * 60;

pub fn spawn(config: Arc<AppConfig>, db: MySqlPool) {
    if !config.push_dispatcher_enabled {
        tracing::info!("api-server push dispatcher disabled");
        return;
    }
    let handle = tokio::runtime::Handle::current();
    thread::spawn(move || run(config, db, handle));
}

fn run(config: Arc<AppConfig>, db: MySqlPool, handle: tokio::runtime::Handle) {
    tracing::info!(
        stream = %config.event_stream_key,
        group = %config.push_dispatcher_group_id,
        "api-server embedded push dispatcher started"
    );
    loop {
        match connect_and_consume(config.clone(), db.clone(), handle.clone()) {
            Ok(()) => {}
            Err(error) => {
                tracing::warn!(error = %error, "embedded push dispatcher failed");
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
    let mut redis = redis::Client::open(config.redis_url.as_str())?.get_connection()?;
    let stream_key = config.event_stream_key.clone();
    let group_id = config.push_dispatcher_group_id.clone();
    let consumer_name = redis_streams::consumer_name("push-dispatcher");
    redis_streams::ensure_group(&mut redis, &stream_key, &group_id)?;
    let http = Client::new();
    let mut route_cache = HashMap::<String, CachedRoutes>::new();

    loop {
        let events = redis_streams::read_group_events(
            &mut redis,
            &stream_key,
            &group_id,
            &consumer_name,
            config.push_dispatcher_batch_size,
            config.stream_consumer_block_ms,
        )?;
        let mut ack_ids = Vec::with_capacity(events.len());
        for event_message in events {
            match serde_json::from_str::<ImEvent>(&event_message.payload) {
                Ok(event) => {
                    handle.block_on(dispatch_event(
                        &config,
                        &db,
                        &http,
                        &mut redis,
                        &mut route_cache,
                        event,
                    ))?;
                }
                Err(error) => tracing::warn!(error = %error, "skip invalid push event json"),
            }
            ack_ids.push(event_message.stream_id);
        }
        redis_streams::ack(&mut redis, &stream_key, &group_id, &ack_ids)?;
    }
}

async fn dispatch_event(
    config: &AppConfig,
    db: &MySqlPool,
    http: &Client,
    redis: &mut redis::Connection,
    route_cache: &mut HashMap<String, CachedRoutes>,
    event: ImEvent,
) -> anyhow::Result<()> {
    let Some(push) = build_push(db, redis, &event).await? else {
        return Ok(());
    };
    let body_data = push.data.clone();
    for user_id in push.user_ids {
        let routes = routes_for_user(config, redis, route_cache, user_id)?;
        if routes.is_empty() {
            tracing::debug!(user_id, event_id = %event.event_id, "skip push for offline user");
            continue;
        }
        for route in routes {
            let request = InternalPushRequest {
                user_id,
                kind: push.kind.clone(),
                data: body_data.clone(),
            };
            if let Err(error) = send_internal_push(config, http, &route, &request).await {
                tracing::warn!(
                    user_id,
                    server_id = %route.server_id,
                    event_id = %event.event_id,
                    error = %error,
                    "internal websocket push failed"
                );
            }
        }
    }
    Ok(())
}

async fn build_push(
    db: &MySqlPool,
    redis: &mut redis::Connection,
    event: &ImEvent,
) -> anyhow::Result<Option<PushPlan>> {
    match event.event_type {
        ImEventType::MessageCreated => {
            let Some(message) = event.payload.clone() else {
                return Ok(None);
            };
            let data = serde_json::to_value(&message)?;
            let user_ids = if event.group || message.is_group_chat {
                let Some(group_id) = parse_i64_option(event.group_id.as_deref())
                    .or_else(|| parse_i64_option(message.group_id.as_deref()))
                else {
                    return Ok(None);
                };
                load_group_members_cached(
                    redis,
                    db,
                    group_id,
                    "push_dispatcher.load_group_members.message",
                )
                .await?
            } else {
                distinct([
                    parse_i64_option(event.sender_id.as_deref())
                        .or_else(|| parse_i64_option(Some(&message.sender_id))),
                    parse_i64_option(event.receiver_id.as_deref())
                        .or_else(|| parse_i64_option(message.receiver_id.as_deref())),
                ])
            };
            Ok(Some(PushPlan {
                kind: "MESSAGE".to_string(),
                data,
                user_ids,
            }))
        }
        ImEventType::MessageRead => {
            let Some(receipt) = event.read_receipt.clone() else {
                return Ok(None);
            };
            let data = serde_json::to_value(&receipt)?;
            let user_ids = if event.group {
                let Some(group_id) = parse_i64_option(event.group_id.as_deref()) else {
                    return Ok(None);
                };
                load_group_members_cached(
                    redis,
                    db,
                    group_id,
                    "push_dispatcher.load_group_members.read_receipt",
                )
                .await?
            } else {
                distinct([
                    parse_i64_option(Some(&receipt.reader_id)),
                    parse_i64_option(event.target_user_id.as_deref())
                        .or_else(|| parse_i64_option(receipt.to_user_id.as_deref())),
                ])
            };
            Ok(Some(PushPlan {
                kind: "READ_RECEIPT".to_string(),
                data,
                user_ids,
            }))
        }
        ImEventType::MessageRecalled | ImEventType::MessageDeleted => {
            let Some(message) = event.payload.clone() else {
                return Ok(None);
            };
            let data = serde_json::to_value(&message)?;
            let user_ids = if event.group || message.is_group_chat {
                let Some(group_id) = parse_i64_option(event.group_id.as_deref())
                    .or_else(|| parse_i64_option(message.group_id.as_deref()))
                else {
                    return Ok(None);
                };
                load_group_members_cached(
                    redis,
                    db,
                    group_id,
                    "push_dispatcher.load_group_members.status",
                )
                .await?
            } else {
                distinct([
                    parse_i64_option(event.sender_id.as_deref())
                        .or_else(|| parse_i64_option(Some(&message.sender_id))),
                    parse_i64_option(event.receiver_id.as_deref())
                        .or_else(|| parse_i64_option(message.receiver_id.as_deref())),
                ])
            };
            Ok(Some(PushPlan {
                kind: "MESSAGE_STATUS_CHANGED".to_string(),
                data,
                user_ids,
            }))
        }
    }
}

async fn send_internal_push(
    config: &AppConfig,
    http: &Client,
    route: &UserRoute,
    request: &InternalPushRequest,
) -> anyhow::Result<()> {
    let path = "/api/im/internal/push";
    let body = serde_json::to_vec(request)?;
    let headers = auth_api::internal_signature_headers("POST", path, &body, config)?;
    let response = http
        .post(format!(
            "{}{}",
            route.internal_http_url.trim_end_matches('/'),
            path
        ))
        .headers(headers)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await?;
    if !response.status().is_success() {
        anyhow::bail!("im-server returned {}", response.status());
    }
    Ok(())
}

fn routes_for_user(
    config: &AppConfig,
    redis: &mut redis::Connection,
    route_cache: &mut HashMap<String, CachedRoutes>,
    user_id: i64,
) -> anyhow::Result<Vec<UserRoute>> {
    let user_key = user_id.to_string();
    let now = time::now_ms();
    if let Some(cached) = route_cache.get(&user_key) {
        if cached.valid_at(now, config.route_cache_ttl_ms.max(100)) {
            return Ok(cached.routes.clone());
        }
    }

    let raw: Option<Vec<u8>> = redis.hget(&config.route_users_key, &user_key)?;
    let routes = parse_user_routes(raw.as_deref(), config);
    route_cache.insert(
        user_key,
        CachedRoutes {
            routes: routes.clone(),
            cached_at_ms: now,
        },
    );
    if route_cache.len() > config.push_dispatcher_batch_size.max(1000) * 10 {
        route_cache.retain(|_, value| value.valid_at(now, config.route_cache_ttl_ms.max(100)));
    }
    Ok(routes)
}

async fn load_group_members(db: &MySqlPool, group_id: i64) -> anyhow::Result<Vec<i64>> {
    let rows: Vec<i64> = sqlx::query_scalar(
        "SELECT user_id FROM service_group_service_db.im_group_member WHERE group_id = ? AND status = 1",
    )
    .bind(group_id)
    .fetch_all(db)
    .await?;
    Ok(distinct(rows.into_iter().map(Some)))
}

async fn load_group_members_cached(
    redis: &mut redis::Connection,
    db: &MySqlPool,
    group_id: i64,
    operation: &'static str,
) -> anyhow::Result<Vec<i64>> {
    let key = format!("im:cache:group_members:{group_id}");
    if let Some(members) = local_cache::get_i64_vec(&key) {
        return Ok(members);
    }
    let lock = local_cache::key_lock(&key);
    let _guard = lock.lock().await;
    if let Some(members) = local_cache::get_i64_vec(&key) {
        return Ok(members);
    }
    let cached: Option<String> = redis.get(&key).ok().flatten();
    if let Some(raw) = cached {
        if let Ok(members) = serde_json::from_str::<Vec<i64>>(&raw) {
            local_cache::set_i64_vec(&key, members.clone());
            return Ok(members);
        }
    }
    let members = observability::db_query(operation, load_group_members(db, group_id)).await?;
    local_cache::set_i64_vec(&key, members.clone());
    if let Ok(raw) = serde_json::to_string(&members) {
        let _: redis::RedisResult<()> = redis.set_ex(&key, raw, GROUP_MEMBERS_CACHE_TTL_SECONDS);
    }
    Ok(members)
}

fn parse_i64_option(value: Option<&str>) -> Option<i64> {
    value?.trim().parse::<i64>().ok()
}

fn distinct(values: impl IntoIterator<Item = Option<i64>>) -> Vec<i64> {
    let mut seen = BTreeSet::new();
    values
        .into_iter()
        .flatten()
        .filter(|value| seen.insert(*value))
        .collect()
}

struct PushPlan {
    kind: String,
    data: Value,
    user_ids: Vec<i64>,
}

#[derive(Debug, Clone)]
struct CachedRoutes {
    routes: Vec<UserRoute>,
    cached_at_ms: i64,
}

impl CachedRoutes {
    fn valid_at(&self, now: i64, cache_ttl_ms: i64) -> bool {
        now - self.cached_at_ms <= cache_ttl_ms
            && self
                .routes
                .iter()
                .all(|route| route.expires_at_epoch_ms > now)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InternalPushRequest {
    pub user_id: i64,
    #[serde(rename = "type")]
    pub kind: String,
    pub data: Value,
}
