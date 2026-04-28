use crate::config::AppConfig;
use crate::dto::now_ms;
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::Arc;
use tokio::time::{sleep, Duration};
use uuid::Uuid;

#[derive(Clone)]
pub struct RouteRegistry {
    config: Arc<AppConfig>,
    redis: ConnectionManager,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteLease {
    pub session_count: i32,
    pub expires_at_epoch_ms: i64,
    #[serde(default)]
    pub internal_http_url: Option<String>,
    #[serde(default)]
    pub internal_ws_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerNode {
    pub server_id: String,
    pub internal_http_url: String,
    pub internal_ws_url: String,
    pub session_count: i32,
    pub updated_at_epoch_ms: i64,
    pub expires_at_epoch_ms: i64,
}

impl RouteRegistry {
    pub fn new(config: Arc<AppConfig>, redis: ConnectionManager) -> Self {
        Self { config, redis }
    }

    pub async fn upsert_local_route(&self, user_id: &str, session_count: usize) {
        let Some(user_id) = normalize_id(user_id) else {
            return;
        };
        let _guard = self.acquire_lock(&user_id).await;
        let now = now_ms();
        let mut snapshot = self.load_snapshot(&user_id, now).await;
        if session_count == 0 {
            snapshot.remove(&self.config.instance_id);
        } else {
            snapshot.insert(
                self.config.instance_id.clone(),
                RouteLease {
                    session_count: session_count as i32,
                    expires_at_epoch_ms: now + self.config.route_lease_ttl_ms.max(1000),
                    internal_http_url: Some(self.config.internal_http_url.clone()),
                    internal_ws_url: Some(self.config.internal_ws_url.clone()),
                },
            );
        }
        self.persist_snapshot(&user_id, &snapshot, now).await;
    }

    pub async fn upsert_server_node(&self, session_count: usize) {
        let now = now_ms();
        let node = ServerNode {
            server_id: self.config.instance_id.clone(),
            internal_http_url: self.config.internal_http_url.clone(),
            internal_ws_url: self.config.internal_ws_url.clone(),
            session_count: session_count as i32,
            updated_at_epoch_ms: now,
            expires_at_epoch_ms: now + (self.config.server_lease_ttl_seconds.max(1) as i64 * 1000),
        };
        let Ok(payload) = serde_json::to_string(&node) else {
            return;
        };
        let key = format!(
            "{}{}",
            self.config.server_registry_key_prefix, self.config.instance_id
        );
        let mut conn = self.redis.clone();
        let _: redis::RedisResult<()> = conn
            .set_ex(key, payload, self.config.server_lease_ttl_seconds.max(1))
            .await;
    }

    pub async fn remove_server_node(&self) {
        let key = format!(
            "{}{}",
            self.config.server_registry_key_prefix, self.config.instance_id
        );
        let mut conn = self.redis.clone();
        let _: redis::RedisResult<i32> = conn.del(key).await;
    }

    pub async fn remove_local_route(&self, user_id: &str) {
        self.upsert_local_route(user_id, 0).await;
    }

    pub async fn is_user_globally_online(&self, user_id: &str) -> bool {
        self.get_global_session_count(user_id).await > 0
    }

    pub async fn get_global_session_count(&self, user_id: &str) -> i32 {
        self.get_instance_session_counts(user_id)
            .await
            .values()
            .copied()
            .filter(|count| *count > 0)
            .sum()
    }

    pub async fn get_instance_session_counts(&self, user_id: &str) -> BTreeMap<String, i32> {
        let Some(user_id) = normalize_id(user_id) else {
            return BTreeMap::new();
        };
        let _guard = self.acquire_lock(&user_id).await;
        let now = now_ms();
        let snapshot = self.load_snapshot(&user_id, now).await;
        self.persist_snapshot(&user_id, &snapshot, now).await;
        snapshot
            .into_iter()
            .filter_map(|(instance, lease)| {
                (lease.session_count > 0).then_some((instance, lease.session_count))
            })
            .collect()
    }

    async fn load_snapshot(&self, user_id: &str, now: i64) -> BTreeMap<String, RouteLease> {
        let mut conn = self.redis.clone();
        let raw: redis::RedisResult<Option<Vec<u8>>> =
            conn.hget(&self.config.route_users_key, user_id).await;
        let Some(bytes) = raw.unwrap_or(None) else {
            return BTreeMap::new();
        };
        let Some(text) = extract_json_object(&bytes) else {
            let _: redis::RedisResult<i32> = conn.hdel(&self.config.route_users_key, user_id).await;
            return BTreeMap::new();
        };
        match serde_json::from_str::<BTreeMap<String, RouteLease>>(&text) {
            Ok(mut snapshot) => {
                snapshot.retain(|instance, lease| {
                    !instance.trim().is_empty()
                        && lease.session_count > 0
                        && lease.expires_at_epoch_ms > now
                });
                snapshot
            }
            Err(_) => {
                let _: redis::RedisResult<i32> =
                    conn.hdel(&self.config.route_users_key, user_id).await;
                BTreeMap::new()
            }
        }
    }

    async fn persist_snapshot(
        &self,
        user_id: &str,
        snapshot: &BTreeMap<String, RouteLease>,
        now: i64,
    ) {
        let mut conn = self.redis.clone();
        if snapshot.is_empty() {
            let _: redis::RedisResult<i32> = conn.hdel(&self.config.route_users_key, user_id).await;
            return;
        }
        let fresh: BTreeMap<String, RouteLease> = snapshot
            .iter()
            .filter_map(|(instance, lease)| {
                (lease.session_count > 0 && lease.expires_at_epoch_ms > now)
                    .then_some((instance.clone(), lease.clone()))
            })
            .collect();
        if fresh.is_empty() {
            let _: redis::RedisResult<i32> = conn.hdel(&self.config.route_users_key, user_id).await;
            return;
        }
        if let Ok(payload) = serde_json::to_string(&fresh) {
            let _: redis::RedisResult<i32> = conn
                .hset(&self.config.route_users_key, user_id, payload)
                .await;
        }
    }

    async fn acquire_lock(&self, user_id: &str) -> Option<RouteLock> {
        let lock_key = format!("{}:lock:{}", self.config.route_users_key, user_id);
        let token = Uuid::new_v4().to_string();
        for _ in 0..20 {
            let mut conn = self.redis.clone();
            let acquired: redis::RedisResult<Option<String>> = redis::cmd("SET")
                .arg(&lock_key)
                .arg(&token)
                .arg("NX")
                .arg("PX")
                .arg(3_000)
                .query_async(&mut conn)
                .await;
            if acquired.ok().flatten().is_some() {
                return Some(RouteLock {
                    key: lock_key,
                    token,
                    redis: self.redis.clone(),
                });
            }
            sleep(Duration::from_millis(25)).await;
        }
        None
    }
}

pub struct RouteLock {
    key: String,
    token: String,
    redis: ConnectionManager,
}

impl Drop for RouteLock {
    fn drop(&mut self) {
        let key = self.key.clone();
        let token = self.token.clone();
        let mut redis = self.redis.clone();
        tokio::spawn(async move {
            let _: redis::RedisResult<i32> = redis::cmd("EVAL")
                .arg("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end")
                .arg(1)
                .arg(key)
                .arg(token)
                .query_async(&mut redis)
                .await;
        });
    }
}

fn normalize_id(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then_some(trimmed.to_string())
}

fn extract_json_object(bytes: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(bytes);
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    (end >= start).then(|| text[start..=end].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_extract_json_from_redisson_prefixed_value() {
        let raw = b"\x00\x01{\"node\":{\"sessionCount\":1,\"expiresAtEpochMs\":999}}";

        let json = extract_json_object(raw).unwrap();

        assert_eq!(
            "{\"node\":{\"sessionCount\":1,\"expiresAtEpochMs\":999}}",
            json
        );
    }

    #[test]
    fn should_parse_route_lease_with_java_field_names() {
        let snapshot: BTreeMap<String, RouteLease> = serde_json::from_str(
            "{\"im-server:8083\":{\"sessionCount\":2,\"expiresAtEpochMs\":9999999999999}}",
        )
        .unwrap();

        assert_eq!(2, snapshot["im-server:8083"].session_count);
    }
}
