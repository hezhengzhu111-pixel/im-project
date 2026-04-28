use crate::clients::InternalClients;
use crate::config::AppConfig;
use crate::dto::{now_iso, now_ms, PresenceEvent, WsEnvelope};
use crate::route::RouteRegistry;
use axum::extract::ws::Message;
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, RwLock};
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};
use uuid::Uuid;

#[derive(Clone)]
pub struct ImService {
    inner: Arc<ImServiceInner>,
}

struct ImServiceInner {
    config: Arc<AppConfig>,
    redis: ConnectionManager,
    route_registry: RouteRegistry,
    clients: InternalClients,
    sessions: RwLock<HashMap<String, Arc<SessionEntry>>>,
    user_sessions: RwLock<HashMap<String, HashSet<String>>>,
}

pub struct SessionEntry {
    pub session_id: String,
    pub user_id: String,
    pub sender: mpsc::UnboundedSender<Message>,
    pub last_heartbeat_ms: AtomicI64,
}

impl ImService {
    pub fn new(config: Arc<AppConfig>, redis: ConnectionManager) -> Self {
        let route_registry = RouteRegistry::new(config.clone(), redis.clone());
        let clients = InternalClients::new(config.clone());
        Self {
            inner: Arc::new(ImServiceInner {
                config,
                redis,
                route_registry,
                clients,
                sessions: RwLock::new(HashMap::new()),
                user_sessions: RwLock::new(HashMap::new()),
            }),
        }
    }

    pub fn config(&self) -> &AppConfig {
        &self.inner.config
    }

    pub fn clients(&self) -> &InternalClients {
        &self.inner.clients
    }

    pub fn redis(&self) -> ConnectionManager {
        self.inner.redis.clone()
    }

    pub async fn register_session(
        &self,
        user_id: String,
        _username: String,
        sender: mpsc::UnboundedSender<Message>,
    ) -> String {
        let session_id = Uuid::new_v4().to_string();
        let now = now_ms();
        let entry = Arc::new(SessionEntry {
            session_id: session_id.clone(),
            user_id: user_id.clone(),
            sender,
            last_heartbeat_ms: AtomicI64::new(now),
        });

        let first_local = {
            let mut sessions = self.inner.sessions.write().expect("sessions lock poisoned");
            let mut user_sessions = self
                .inner
                .user_sessions
                .write()
                .expect("user sessions lock poisoned");
            let ids = user_sessions.entry(user_id.clone()).or_default();
            let first_local = ids.is_empty();
            ids.insert(session_id.clone());
            sessions.insert(session_id.clone(), entry);
            first_local
        };

        self.refresh_route_for_user(&user_id).await;
        self.refresh_server_node().await;
        if first_local {
            self.broadcast_presence_locally(&user_id, "ONLINE", None)
                .await;
            self.publish_presence(&user_id, "ONLINE").await;
        }
        session_id
    }

    pub async fn unregister_session(&self, session_id: &str) -> bool {
        let entry = {
            let mut sessions = self.inner.sessions.write().expect("sessions lock poisoned");
            sessions.remove(session_id)
        };
        let Some(entry) = entry else {
            return false;
        };

        let user_has_sessions = {
            let mut user_sessions = self
                .inner
                .user_sessions
                .write()
                .expect("user sessions lock poisoned");
            if let Some(ids) = user_sessions.get_mut(&entry.user_id) {
                ids.remove(session_id);
                let has_sessions = !ids.is_empty();
                if !has_sessions {
                    user_sessions.remove(&entry.user_id);
                }
                has_sessions
            } else {
                false
            }
        };

        if user_has_sessions {
            self.refresh_route_for_user(&entry.user_id).await;
        } else {
            self.inner
                .route_registry
                .remove_local_route(&entry.user_id)
                .await;
            self.broadcast_presence_locally(&entry.user_id, "OFFLINE", None)
                .await;
            self.publish_presence(&entry.user_id, "OFFLINE").await;
        }
        self.refresh_server_node().await;
        true
    }

    pub async fn user_offline(&self, user_id: &str) -> bool {
        let Some(user_id) = normalize_id(user_id) else {
            return false;
        };
        let sessions = self.local_session_ids(&user_id);
        if sessions.is_empty() {
            self.inner.route_registry.remove_local_route(&user_id).await;
            return false;
        }
        for session_id in sessions {
            if let Some(entry) = self.session_entry(&session_id) {
                let _ = entry.sender.send(Message::Close(None));
            }
            self.unregister_session(&session_id).await;
        }
        true
    }

    pub async fn touch_user_heartbeat(&self, user_id: &str) -> bool {
        let Some(user_id) = normalize_id(user_id) else {
            return false;
        };
        let now = now_ms();
        let entries = self.local_sessions(&user_id);
        if entries.is_empty() {
            self.inner.route_registry.remove_local_route(&user_id).await;
            return false;
        }
        for entry in entries {
            entry.last_heartbeat_ms.store(now, Ordering::Relaxed);
        }
        self.refresh_route_for_user(&user_id).await;
        true
    }

    pub async fn refresh_session_heartbeat(&self, user_id: &str, session_id: &str) -> bool {
        let Some(entry) = self.session_entry(session_id) else {
            return false;
        };
        if entry.user_id != user_id.trim() {
            return false;
        }
        entry.last_heartbeat_ms.store(now_ms(), Ordering::Relaxed);
        self.refresh_route_for_user(&entry.user_id).await;
        true
    }

    pub async fn check_users_online_status(&self, user_ids: &[String]) -> HashMap<String, bool> {
        let mut status = HashMap::new();
        for raw in user_ids {
            let Some(user_id) = normalize_id(raw) else {
                continue;
            };
            let online = !self.local_sessions(&user_id).is_empty()
                || self
                    .inner
                    .route_registry
                    .is_user_globally_online(&user_id)
                    .await;
            status.insert(user_id, online);
        }
        status
    }

    pub async fn push_to_user(&self, user_id: i64, ws_type: &str, data: Value) -> bool {
        let sessions = self.local_sessions(&user_id.to_string());
        if sessions.is_empty() {
            return false;
        }
        let envelope = match serde_json::to_string(&WsEnvelope {
            kind: ws_type.to_string(),
            data,
            timestamp: now_ms(),
        }) {
            Ok(value) => value,
            Err(err) => {
                tracing::warn!(error = %err, "failed to serialize websocket envelope");
                return false;
            }
        };
        let mut delivered = false;
        for session in sessions {
            if session.sender.send(Message::Text(envelope.clone())).is_ok() {
                delivered = true;
            }
        }
        delivered
    }

    pub async fn broadcast_presence_locally(
        &self,
        user_id: &str,
        status: &str,
        last_seen: Option<String>,
    ) {
        let data = json!({
            "userId": user_id,
            "status": status,
            "lastSeen": last_seen.unwrap_or_else(now_iso),
        });
        let _ = self.push_to_all("ONLINE_STATUS", data).await;
    }

    pub async fn publish_presence(&self, user_id: &str, status: &str) {
        let Some(user_id) = normalize_id(user_id) else {
            return;
        };
        let now = now_ms();
        let event = PresenceEvent {
            user_id,
            status: status.to_string(),
            last_seen: now_iso(),
            event_time: now,
            source_instance_id: self.inner.config.instance_id.clone(),
        };
        let Ok(payload) = serde_json::to_string(&event) else {
            return;
        };
        let mut conn = self.inner.redis.clone();
        let _: redis::RedisResult<i32> = conn
            .publish(&self.inner.config.presence_channel, payload)
            .await;
    }

    pub fn spawn_background_tasks(&self, redis_client: redis::Client) {
        let renew_service = self.clone();
        tokio::spawn(async move {
            renew_service.renew_routes_loop().await;
        });
        let server_node_service = self.clone();
        tokio::spawn(async move {
            server_node_service.renew_server_node_loop().await;
        });
        let cleanup_service = self.clone();
        tokio::spawn(async move {
            cleanup_service.cleanup_stale_sessions_loop().await;
        });
        let presence_service = self.clone();
        tokio::spawn(async move {
            presence_service.subscribe_presence_loop(redis_client).await;
        });
    }

    pub async fn unregister_server_node(&self) {
        self.inner.route_registry.remove_server_node().await;
    }

    async fn renew_routes_loop(self) {
        let interval = self.inner.config.route_renew_interval_ms.max(1000);
        loop {
            sleep(Duration::from_millis(interval)).await;
            for (user_id, count) in self.local_user_counts() {
                self.inner
                    .route_registry
                    .upsert_local_route(&user_id, count)
                    .await;
            }
        }
    }

    async fn renew_server_node_loop(self) {
        let interval = self.inner.config.server_renew_interval_ms.max(1000);
        loop {
            self.refresh_server_node().await;
            sleep(Duration::from_millis(interval)).await;
        }
    }

    async fn cleanup_stale_sessions_loop(self) {
        let interval = self.inner.config.session_cleanup_interval_ms.max(1000);
        loop {
            sleep(Duration::from_millis(interval)).await;
            let now = now_ms();
            let timeout = self.inner.config.session_heartbeat_timeout_ms.max(1000);
            let stale: Vec<String> = {
                let sessions = self.inner.sessions.read().expect("sessions lock poisoned");
                sessions
                    .values()
                    .filter(|entry| now - entry.last_heartbeat_ms.load(Ordering::Relaxed) > timeout)
                    .map(|entry| entry.session_id.clone())
                    .collect()
            };
            for session_id in stale {
                if let Some(entry) = self.session_entry(&session_id) {
                    let _ = entry.sender.send(Message::Close(None));
                }
                self.unregister_session(&session_id).await;
            }
        }
    }

    async fn subscribe_presence_loop(self, redis_client: redis::Client) {
        loop {
            match redis_client.get_async_pubsub().await {
                Ok(mut pubsub) => {
                    if let Err(err) = pubsub.subscribe(&self.inner.config.presence_channel).await {
                        tracing::warn!(error = %err, "subscribe presence channel failed");
                        sleep(Duration::from_secs(2)).await;
                        continue;
                    }
                    use futures_util::StreamExt;
                    let mut messages = pubsub.on_message();
                    while let Some(message) = messages.next().await {
                        let payload: redis::RedisResult<Vec<u8>> = message.get_payload();
                        let Ok(payload) = payload else {
                            continue;
                        };
                        if let Ok(event) = serde_json::from_slice::<PresenceEvent>(&payload) {
                            if event.source_instance_id != self.inner.config.instance_id {
                                self.broadcast_presence_locally(
                                    &event.user_id,
                                    &event.status,
                                    Some(event.last_seen),
                                )
                                .await;
                            }
                        }
                    }
                }
                Err(err) => {
                    tracing::warn!(error = %err, "create redis pubsub failed");
                    sleep(Duration::from_secs(2)).await;
                }
            }
        }
    }

    async fn push_to_all(&self, ws_type: &str, data: Value) -> bool {
        let sessions: Vec<Arc<SessionEntry>> = {
            let sessions = self.inner.sessions.read().expect("sessions lock poisoned");
            sessions.values().cloned().collect()
        };
        if sessions.is_empty() {
            return false;
        }
        let envelope = match serde_json::to_string(&WsEnvelope {
            kind: ws_type.to_string(),
            data,
            timestamp: now_ms(),
        }) {
            Ok(value) => value,
            Err(_) => return false,
        };
        let mut delivered = false;
        for session in sessions {
            if session.sender.send(Message::Text(envelope.clone())).is_ok() {
                delivered = true;
            }
        }
        delivered
    }

    async fn refresh_route_for_user(&self, user_id: &str) {
        let count = self.local_sessions(user_id).len();
        self.inner
            .route_registry
            .upsert_local_route(user_id, count)
            .await;
    }

    async fn refresh_server_node(&self) {
        self.inner
            .route_registry
            .upsert_server_node(self.total_session_count())
            .await;
    }

    pub fn local_sessions(&self, user_id: &str) -> Vec<Arc<SessionEntry>> {
        let ids = self.local_session_ids(user_id);
        if ids.is_empty() {
            return Vec::new();
        }
        let sessions = self.inner.sessions.read().expect("sessions lock poisoned");
        ids.into_iter()
            .filter_map(|session_id| sessions.get(&session_id).cloned())
            .collect()
    }

    fn local_session_ids(&self, user_id: &str) -> Vec<String> {
        let user_sessions = self
            .inner
            .user_sessions
            .read()
            .expect("user sessions lock poisoned");
        user_sessions
            .get(user_id.trim())
            .map(|ids| ids.iter().cloned().collect())
            .unwrap_or_default()
    }

    fn local_user_counts(&self) -> Vec<(String, usize)> {
        let user_sessions = self
            .inner
            .user_sessions
            .read()
            .expect("user sessions lock poisoned");
        user_sessions
            .iter()
            .map(|(user_id, ids)| (user_id.clone(), ids.len()))
            .collect()
    }

    fn total_session_count(&self) -> usize {
        let sessions = self.inner.sessions.read().expect("sessions lock poisoned");
        sessions.len()
    }

    fn session_entry(&self, session_id: &str) -> Option<Arc<SessionEntry>> {
        let sessions = self.inner.sessions.read().expect("sessions lock poisoned");
        sessions.get(session_id.trim()).cloned()
    }
}

fn normalize_id(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then_some(trimmed.to_string())
}
