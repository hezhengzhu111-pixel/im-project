use std::env;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub port: u16,
    pub redis_url: String,
    pub auth_service_url: String,
    pub group_service_url: String,
    pub internal_secret: String,
    pub internal_max_skew_ms: i64,
    pub gateway_user_id_header: String,
    pub gateway_username_header: String,
    pub gateway_auth_secret: String,
    pub gateway_auth_max_skew_ms: i64,
    pub instance_id: String,
    pub route_users_key: String,
    pub route_lease_ttl_ms: i64,
    pub route_renew_interval_ms: u64,
    pub session_heartbeat_timeout_ms: i64,
    pub session_cleanup_interval_ms: u64,
    pub presence_channel: String,
    pub allowed_origins: Vec<String>,
    pub allow_blank_origin: bool,
    pub allow_query_ticket: bool,
    pub ws_ticket_cookie_name: String,
    pub ws_ticket_cookie_path: String,
    pub ws_ticket_cookie_same_site: String,
    pub ws_ticket_cookie_secure: String,
    pub max_payload_length: usize,
    pub invalid_payload_threshold: usize,
    pub kafka_enabled: bool,
    pub kafka_bootstrap_servers: String,
    pub kafka_chat_topic: String,
    pub kafka_read_topic: String,
    pub kafka_status_topic: String,
    pub kafka_auto_offset_reset: String,
    pub kafka_group_prefix: String,
    pub group_members_cache_prefix: String,
    pub group_members_cache_ttl_seconds: u64,
}

impl AppConfig {
    pub fn from_env() -> Self {
        Self {
            port: env_u16("IM_SERVER_RS_PORT", 8083),
            redis_url: env_string("REDIS_URL", "redis://127.0.0.1:6379/0"),
            auth_service_url: env_string("IM_AUTH_SERVICE_URL", "http://127.0.0.1:8084"),
            group_service_url: env_string("IM_GROUP_SERVICE_URL", "http://127.0.0.1:8086"),
            internal_secret: env_string(
                "IM_INTERNAL_SECRET",
                "im-internal-secret-im-internal-secret-im-internal-secret-im",
            ),
            internal_max_skew_ms: env_i64("IM_INTERNAL_MAX_SKEW_MS", 300_000),
            gateway_user_id_header: env_string("IM_GATEWAY_USER_ID_HEADER", "X-User-Id"),
            gateway_username_header: env_string("IM_GATEWAY_USERNAME_HEADER", "X-Username"),
            gateway_auth_secret: env_string(
                "IM_GATEWAY_AUTH_SECRET",
                "im-gateway-auth-secret-im-gateway-auth-secret-im-gateway-auth-secret",
            ),
            gateway_auth_max_skew_ms: env_i64("IM_GATEWAY_AUTH_MAX_SKEW_MS", 300_000),
            instance_id: env_string("IM_INSTANCE_ID", &default_instance_id()),
            route_users_key: env_string("IM_ROUTE_USERS_KEY", "im:route:users"),
            route_lease_ttl_ms: env_i64("IM_ROUTE_LEASE_TTL_MS", 120_000),
            route_renew_interval_ms: env_u64("IM_ROUTE_RENEW_INTERVAL_MS", 30_000),
            session_heartbeat_timeout_ms: env_i64("IM_SESSION_HEARTBEAT_TIMEOUT_MS", 90_000),
            session_cleanup_interval_ms: env_u64("IM_SESSION_CLEANUP_INTERVAL_MS", 30_000),
            presence_channel: env_string("IM_WS_PRESENCE_CHANNEL", "im:presence:broadcast"),
            allowed_origins: parse_csv(&env_string(
                "IM_WEBSOCKET_ALLOWED_ORIGINS",
                "http://localhost,http://127.0.0.1,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080",
            )),
            allow_blank_origin: env_bool("IM_WEBSOCKET_ALLOW_BLANK_ORIGIN", false),
            allow_query_ticket: env_bool("IM_WEBSOCKET_ALLOW_QUERY_TICKET", false),
            ws_ticket_cookie_name: env_string("IM_AUTH_COOKIE_WS_TICKET_NAME", "IM_WS_TICKET"),
            ws_ticket_cookie_path: env_string("IM_AUTH_COOKIE_WS_TICKET_PATH", "/websocket"),
            ws_ticket_cookie_same_site: env_string("IM_AUTH_COOKIE_WS_TICKET_SAME_SITE", "Lax"),
            ws_ticket_cookie_secure: env_string("IM_AUTH_COOKIE_WS_TICKET_SECURE", "auto"),
            max_payload_length: env_usize("IM_WEBSOCKET_MAX_PAYLOAD_LENGTH", 8 * 1024),
            invalid_payload_threshold: env_usize("IM_WEBSOCKET_INVALID_PAYLOAD_THRESHOLD", 3),
            kafka_enabled: env_bool("IM_KAFKA_ENABLED", true),
            kafka_bootstrap_servers: env_string(
                "IM_KAFKA_BOOTSTRAP_SERVERS",
                "127.0.0.1:9092",
            ),
            kafka_chat_topic: env_string("IM_KAFKA_CHAT_TOPIC", "im-chat-topic"),
            kafka_read_topic: env_string("IM_KAFKA_READ_TOPIC", "im-read-topic"),
            kafka_status_topic: env_string("IM_KAFKA_STATUS_TOPIC", "im-status-topic"),
            kafka_auto_offset_reset: env_string("IM_KAFKA_AUTO_OFFSET_RESET", "latest"),
            kafka_group_prefix: env_string("IM_KAFKA_CONSUMER_GROUP_PREFIX", "im-ws-pusher-rs"),
            group_members_cache_prefix: env_string(
                "IM_GROUP_MEMBER_IDS_CACHE_PREFIX",
                "message:group:members:",
            ),
            group_members_cache_ttl_seconds: env_u64("IM_GROUP_MEMBER_IDS_CACHE_TTL_SECONDS", 30),
        }
    }
}

fn default_instance_id() -> String {
    let host = env::var("HOSTNAME")
        .or_else(|_| env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "im-server-rs".to_string());
    format!("{}:8083", host.trim())
}

fn env_string(key: &str, default: &str) -> String {
    env::var(key)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| default.to_string())
}

fn env_i64(key: &str, default: i64) -> i64 {
    env::var(key)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn env_u64(key: &str, default: u64) -> u64 {
    env::var(key)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn env_u16(key: &str, default: u16) -> u16 {
    env::var(key)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn env_usize(key: &str, default: usize) -> usize {
    env::var(key)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn env_bool(key: &str, default: bool) -> bool {
    env::var(key)
        .ok()
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(default)
}

fn parse_csv(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}
