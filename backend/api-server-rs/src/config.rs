use std::env;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub port: u16,
    pub cache_redis_url: String,
    pub private_hot_redis_urls: Vec<String>,
    pub group_hot_redis_urls: Vec<String>,
    pub private_event_redis_url: String,
    pub group_event_redis_url: String,
    pub route_redis_url: String,
    pub mysql_url: String,
    pub mysql_max_connections: u32,
    pub private_event_stream_key: String,
    pub group_event_stream_key: String,
    pub event_stream_max_len: usize,
    pub stream_consumer_block_ms: u64,
    pub event_publisher_enabled: bool,
    pub message_writer_enabled: bool,
    pub publisher_batch_size: usize,
    pub publisher_loop_interval_ms: u64,
    pub writer_group_id: String,
    pub writer_batch_size: usize,
    pub writer_flush_interval_ms: u64,
    pub writer_snowflake_node_id: u16,
    pub push_dispatcher_enabled: bool,
    pub push_dispatcher_group_id: String,
    pub push_dispatcher_batch_size: usize,
    pub route_users_key: String,
    pub route_cache_ttl_ms: i64,
    pub server_registry_key_prefix: String,
    pub jwt_secret: String,
    pub jwt_expiration_ms: i64,
    pub refresh_secret: String,
    pub refresh_expiration_ms: i64,
    pub ws_ticket_ttl_seconds: u64,
    pub revoked_token_ttl_seconds: u64,
    pub resource_cache_ttl_seconds: u64,
    pub token_revocation_check_enabled: bool,
    pub internal_secret: String,
    pub internal_max_skew_ms: i64,
    pub gateway_auth_secret: String,
    pub access_cookie_name: String,
    pub refresh_cookie_name: String,
    pub auth_cookie_same_site: String,
    pub auth_cookie_secure: String,
    pub ws_ticket_cookie_name: String,
    pub ws_ticket_cookie_path: String,
    pub ws_ticket_cookie_same_site: String,
    pub ws_ticket_cookie_secure: String,
    pub admin_usernames: Vec<String>,
    pub admin_user_ids: Vec<i64>,
    pub storage_base_dir: PathBuf,
    pub file_image_max_size: usize,
    pub file_file_max_size: usize,
    pub file_audio_max_size: usize,
    pub file_video_max_size: usize,
    pub file_avatar_max_size: usize,
    pub request_body_limit: usize,
    pub snowflake_node_id: u16,
    pub im_server_url: String,
    pub im_server_ws_url: String,
    pub log_service_url: String,
    pub registry_service_url: String,
}

impl AppConfig {
    pub fn from_env() -> Self {
        let default_redis_url = env_string("REDIS_URL", "redis://127.0.0.1:6379/0");
        let cache_redis_url = env_string("IM_CACHE_REDIS_URL", &default_redis_url);
        let hot_redis_url = env_string("IM_HOT_REDIS_URL", &default_redis_url);
        let private_hot_redis_url = env_string("IM_PRIVATE_HOT_REDIS_URL", &hot_redis_url);
        let group_hot_redis_url = env_string("IM_GROUP_HOT_REDIS_URL", &hot_redis_url);
        let private_hot_redis_urls = env_string_list(
            "IM_PRIVATE_HOT_REDIS_URLS",
            std::slice::from_ref(&private_hot_redis_url),
        );
        let group_hot_redis_urls = env_string_list(
            "IM_GROUP_HOT_REDIS_URLS",
            std::slice::from_ref(&group_hot_redis_url),
        );
        let event_redis_url = env_string("IM_EVENT_REDIS_URL", &default_redis_url);
        let legacy_event_stream_key = env_string("IM_EVENT_STREAM_KEY", "im:events");
        let default_private_event_stream_key = format!("{legacy_event_stream_key}:private");
        let default_group_event_stream_key = format!("{legacy_event_stream_key}:group");
        let file_image_max_size = env_usize("IM_FILE_IMAGE_MAX_SIZE", 20_971_520);
        let file_file_max_size = env_usize("IM_FILE_FILE_MAX_SIZE", 536_870_912);
        let file_audio_max_size = env_usize("IM_FILE_AUDIO_MAX_SIZE", 104_857_600);
        let file_video_max_size = env_usize("IM_FILE_VIDEO_MAX_SIZE", 1_073_741_824);
        let file_avatar_max_size = env_usize("IM_FILE_AVATAR_MAX_SIZE", 5_242_880);
        let max_upload_size = [
            file_image_max_size,
            file_file_max_size,
            file_audio_max_size,
            file_video_max_size,
            file_avatar_max_size,
        ]
        .into_iter()
        .max()
        .unwrap_or(file_video_max_size);
        Self {
            port: env_u16("API_SERVER_RS_PORT", env_u16("GATEWAY_RS_PORT", 8082)),
            cache_redis_url,
            private_hot_redis_urls,
            group_hot_redis_urls,
            private_event_redis_url: env_string("IM_PRIVATE_EVENT_REDIS_URL", &event_redis_url),
            group_event_redis_url: env_string("IM_GROUP_EVENT_REDIS_URL", &event_redis_url),
            route_redis_url: env_string("IM_ROUTE_REDIS_URL", &default_redis_url),
            mysql_url: env_string(
                "MYSQL_URL",
                "mysql://root:root123@127.0.0.1:3306/service_message_service_db",
            ),
            mysql_max_connections: env_u32("IM_MYSQL_MAX_CONNECTIONS", 64),
            private_event_stream_key: env_string(
                "IM_PRIVATE_EVENT_STREAM_KEY",
                &default_private_event_stream_key,
            ),
            group_event_stream_key: env_string(
                "IM_GROUP_EVENT_STREAM_KEY",
                &default_group_event_stream_key,
            ),
            event_stream_max_len: env_usize("IM_EVENT_STREAM_MAX_LEN", 100_000),
            stream_consumer_block_ms: env_u64("IM_EVENT_STREAM_BLOCK_MS", 1_000),
            event_publisher_enabled: env_bool("IM_EVENT_PUBLISHER_ENABLED", true),
            message_writer_enabled: env_bool("IM_MESSAGE_WRITER_ENABLED", true),
            publisher_batch_size: env_usize("IM_PUBLISHER_BATCH_SIZE", 200),
            publisher_loop_interval_ms: env_u64("IM_PUBLISHER_LOOP_INTERVAL_MS", 50),
            writer_group_id: env_string("IM_MESSAGE_WRITER_GROUP_ID", "api-server-rs-writer"),
            writer_batch_size: env_usize("IM_WRITER_BATCH_SIZE", 500),
            writer_flush_interval_ms: env_u64("IM_WRITER_FLUSH_INTERVAL_MS", 500),
            writer_snowflake_node_id: env_u16("IM_WRITER_SNOWFLAKE_NODE_ID", 31),
            push_dispatcher_enabled: env_bool("IM_PUSH_DISPATCHER_ENABLED", true),
            push_dispatcher_group_id: env_string(
                "IM_PUSH_DISPATCHER_GROUP_ID",
                "api-server-rs-push-dispatcher",
            ),
            push_dispatcher_batch_size: env_usize("IM_PUSH_DISPATCHER_BATCH_SIZE", 200),
            route_users_key: env_string("IM_ROUTE_USERS_KEY", "im:route:users"),
            route_cache_ttl_ms: env_i64("IM_ROUTE_CACHE_TTL_MS", 3_000),
            server_registry_key_prefix: env_string("IM_SERVER_REGISTRY_KEY_PREFIX", "im:server:"),
            jwt_secret: env_string(
                "JWT_SECRET",
                "im-access-secret-im-access-secret-im-access-secret-im-access-secret",
            ),
            jwt_expiration_ms: env_i64("JWT_EXPIRATION_MS", 86_400_000),
            refresh_secret: env_string(
                "AUTH_REFRESH_SECRET",
                "im-refresh-secret-im-refresh-secret-im-refresh-secret-im",
            ),
            refresh_expiration_ms: env_i64("AUTH_REFRESH_EXPIRATION_MS", 604_800_000),
            ws_ticket_ttl_seconds: env_u64("AUTH_WS_TICKET_TTL_SECONDS", 30),
            revoked_token_ttl_seconds: env_u64("AUTH_REVOKE_TOKEN_TTL_SECONDS", 86_400),
            resource_cache_ttl_seconds: env_u64("AUTH_RESOURCE_CACHE_TTL_SECONDS", 604_800),
            token_revocation_check_enabled: env_bool(
                "IM_SECURITY_TOKEN_REVOCATION_CHECK_ENABLED",
                true,
            ),
            internal_secret: env_string(
                "IM_INTERNAL_SECRET",
                "im-internal-secret-im-internal-secret-im-internal-secret-im",
            ),
            internal_max_skew_ms: env_i64("IM_INTERNAL_MAX_SKEW_MS", 300_000),
            gateway_auth_secret: env_string(
                "IM_GATEWAY_AUTH_SECRET",
                "im-gateway-auth-secret-im-gateway-auth-secret-im-gateway-auth-secret",
            ),
            access_cookie_name: env_string("IM_AUTH_COOKIE_ACCESS_TOKEN_NAME", "IM_ACCESS_TOKEN"),
            refresh_cookie_name: env_string(
                "IM_AUTH_COOKIE_REFRESH_TOKEN_NAME",
                "IM_REFRESH_TOKEN",
            ),
            auth_cookie_same_site: env_string("IM_AUTH_COOKIE_SAME_SITE", "Lax"),
            auth_cookie_secure: env_string("IM_AUTH_COOKIE_SECURE", "auto"),
            ws_ticket_cookie_name: env_string("IM_AUTH_COOKIE_WS_TICKET_NAME", "IM_WS_TICKET"),
            ws_ticket_cookie_path: env_string("IM_AUTH_COOKIE_WS_TICKET_PATH", "/websocket"),
            ws_ticket_cookie_same_site: env_string("IM_AUTH_COOKIE_WS_TICKET_SAME_SITE", "Lax"),
            ws_ticket_cookie_secure: env_string("IM_AUTH_COOKIE_WS_TICKET_SECURE", "auto"),
            admin_usernames: parse_csv(&env_string("IM_AUTH_ADMIN_USERNAMES", "")),
            admin_user_ids: parse_csv(&env_string("IM_AUTH_ADMIN_USER_IDS", ""))
                .into_iter()
                .filter_map(|value| value.parse::<i64>().ok())
                .collect(),
            storage_base_dir: PathBuf::from(env_string(
                "IM_STORAGE_LOCAL_BASE_DIR",
                "/data/im-files",
            )),
            file_image_max_size,
            file_file_max_size,
            file_audio_max_size,
            file_video_max_size,
            file_avatar_max_size,
            request_body_limit: env_usize(
                "IM_FILE_MULTIPART_MAX_BYTES",
                max_upload_size.saturating_add(8 * 1024 * 1024),
            ),
            snowflake_node_id: env_u16("IM_SNOWFLAKE_NODE_ID", 21),
            im_server_url: env_string("IM_SERVER_ROUTE_URI", "http://127.0.0.1:8083"),
            im_server_ws_url: env_string("IM_SERVER_WS_ROUTE_URI", "ws://127.0.0.1:8083"),
            log_service_url: env_string("IM_LOG_SERVICE_URL", "http://127.0.0.1:8091"),
            registry_service_url: env_string("IM_REGISTRY_SERVICE_URL", "http://127.0.0.1:8090"),
        }
    }

    pub fn private_event_stream(&self) -> EventStreamConfig {
        EventStreamConfig {
            kind: EventStreamKind::Private,
            redis_url: self.private_event_redis_url.clone(),
            stream_key: self.private_event_stream_key.clone(),
        }
    }

    pub fn group_event_stream(&self) -> EventStreamConfig {
        EventStreamConfig {
            kind: EventStreamKind::Group,
            redis_url: self.group_event_redis_url.clone(),
            stream_key: self.group_event_stream_key.clone(),
        }
    }

    pub fn event_streams(&self) -> [EventStreamConfig; 2] {
        [self.private_event_stream(), self.group_event_stream()]
    }

    pub fn hot_redis_urls_for(&self, kind: EventStreamKind) -> &[String] {
        match kind {
            EventStreamKind::Private => &self.private_hot_redis_urls,
            EventStreamKind::Group => &self.group_hot_redis_urls,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EventStreamKind {
    Private,
    Group,
}

impl EventStreamKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Private => "private",
            Self::Group => "group",
        }
    }
}

#[derive(Clone, Debug)]
pub struct EventStreamConfig {
    pub kind: EventStreamKind,
    pub redis_url: String,
    pub stream_key: String,
}

fn env_string(key: &str, default: &str) -> String {
    env::var(key)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| default.to_string())
}

fn env_u16(key: &str, default: u16) -> u16 {
    env::var(key)
        .ok()
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(default)
}

fn env_u64(key: &str, default: u64) -> u64 {
    env::var(key)
        .ok()
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(default)
}

fn env_string_list(key: &str, default: &[String]) -> Vec<String> {
    env::var(key)
        .ok()
        .map(|raw| parse_csv(&raw))
        .filter(|values| !values.is_empty())
        .unwrap_or_else(|| default.to_vec())
}

fn env_u32(key: &str, default: u32) -> u32 {
    env::var(key)
        .ok()
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(default)
}

fn env_i64(key: &str, default: i64) -> i64 {
    env::var(key)
        .ok()
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(default)
}

fn env_usize(key: &str, default: usize) -> usize {
    env::var(key)
        .ok()
        .and_then(|value| value.trim().parse().ok())
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
