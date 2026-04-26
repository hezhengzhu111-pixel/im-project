use std::env;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub port: u16,
    pub redis_url: String,
    pub jwt_secret: String,
    pub jwt_expiration_ms: i64,
    pub refresh_secret: String,
    pub refresh_expiration_ms: i64,
    pub previous_refresh_grace_seconds: u64,
    pub refresh_lock_seconds: u64,
    pub ws_ticket_ttl_seconds: u64,
    pub revoked_token_ttl_seconds: u64,
    pub resource_cache_ttl_seconds: u64,
    pub internal_header: String,
    pub internal_secret: String,
    pub internal_max_skew_ms: i64,
    pub gateway_user_id_header: String,
    pub gateway_username_header: String,
    pub gateway_auth_secret: String,
    pub gateway_auth_max_skew_ms: i64,
    pub access_cookie_name: String,
    pub refresh_cookie_name: String,
    pub auth_cookie_same_site: String,
    pub auth_cookie_secure: String,
    pub ws_ticket_cookie_name: String,
    pub ws_ticket_cookie_path: String,
    pub ws_ticket_cookie_same_site: String,
    pub ws_ticket_cookie_secure: String,
    pub token_revocation_check_enabled: bool,
    pub admin_usernames: Vec<String>,
    pub admin_user_ids: Vec<i64>,
}

impl AppConfig {
    pub fn from_env() -> Self {
        Self {
            port: env_u16("AUTH_RS_PORT", 8084),
            redis_url: env_string("REDIS_URL", "redis://127.0.0.1:6379/0"),
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
            previous_refresh_grace_seconds: env_u64("AUTH_REFRESH_PREVIOUS_GRACE_SECONDS", 10),
            refresh_lock_seconds: env_u64("AUTH_REFRESH_LOCK_SECONDS", 5),
            ws_ticket_ttl_seconds: env_u64("AUTH_WS_TICKET_TTL_SECONDS", 30),
            revoked_token_ttl_seconds: env_u64("AUTH_REVOKE_TOKEN_TTL_SECONDS", 86_400),
            resource_cache_ttl_seconds: env_u64("AUTH_RESOURCE_CACHE_TTL_SECONDS", 604_800),
            internal_header: env_string("IM_INTERNAL_HEADER", "X-Internal-Secret"),
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
            token_revocation_check_enabled: env_bool(
                "IM_SECURITY_TOKEN_REVOCATION_CHECK_ENABLED",
                true,
            ),
            admin_usernames: parse_csv(&env_string("IM_AUTH_ADMIN_USERNAMES", "")),
            admin_user_ids: parse_csv(&env_string("IM_AUTH_ADMIN_USER_IDS", ""))
                .into_iter()
                .filter_map(|value| value.parse::<i64>().ok())
                .collect(),
        }
    }
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
