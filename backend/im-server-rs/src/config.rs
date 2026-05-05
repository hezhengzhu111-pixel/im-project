use std::env;

const DEFAULT_REDIS_URL: &str = "redis://127.0.0.1:6379/0";
const DEFAULT_INTERNAL_SECRET: &str =
    "im-internal-secret-im-internal-secret-im-internal-secret-im";
const DEFAULT_GATEWAY_AUTH_SECRET: &str =
    "im-gateway-auth-secret-im-gateway-auth-secret-im-gateway-auth-secret";

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub port: u16,
    pub route_redis_url: String,
    pub auth_service_url: String,
    pub internal_secret: String,
    pub internal_max_skew_ms: i64,
    pub gateway_user_id_header: String,
    pub gateway_username_header: String,
    pub gateway_auth_secret: String,
    pub gateway_auth_max_skew_ms: i64,
    pub instance_id: String,
    pub internal_http_url: String,
    pub internal_ws_url: String,
    pub server_registry_key_prefix: String,
    pub server_lease_ttl_seconds: u64,
    pub server_renew_interval_ms: u64,
    pub route_users_key: String,
    pub route_lease_ttl_ms: i64,
    pub route_renew_interval_ms: u64,
    pub session_heartbeat_timeout_ms: i64,
    pub session_cleanup_interval_ms: u64,
    pub presence_channel: String,
    pub allow_query_ticket: bool,
    pub ws_ticket_cookie_name: String,
    pub ws_ticket_cookie_path: String,
    pub ws_ticket_cookie_same_site: String,
    pub ws_ticket_cookie_secure: String,
    pub max_payload_length: usize,
    pub invalid_payload_threshold: usize,
    pub websocket_outbound_queue_size: usize,
}

impl AppConfig {
    pub fn from_env() -> Self {
        let port = env_u16("IM_SERVER_RS_PORT", 8083);
        let redis_url = env_string("REDIS_URL", DEFAULT_REDIS_URL);
        let config = Self {
            port,
            route_redis_url: env_string("IM_ROUTE_REDIS_URL", &redis_url),
            auth_service_url: env_string("IM_AUTH_SERVICE_URL", "http://127.0.0.1:8084"),
            internal_secret: env_string("IM_INTERNAL_SECRET", DEFAULT_INTERNAL_SECRET),
            internal_max_skew_ms: env_i64("IM_INTERNAL_MAX_SKEW_MS", 300_000),
            gateway_user_id_header: env_string("IM_GATEWAY_USER_ID_HEADER", "X-User-Id"),
            gateway_username_header: env_string("IM_GATEWAY_USERNAME_HEADER", "X-Username"),
            gateway_auth_secret: env_string(
                "IM_GATEWAY_AUTH_SECRET",
                DEFAULT_GATEWAY_AUTH_SECRET,
            ),
            gateway_auth_max_skew_ms: env_i64("IM_GATEWAY_AUTH_MAX_SKEW_MS", 300_000),
            instance_id: env_string("IM_INSTANCE_ID", &default_instance_id(port)),
            internal_http_url: env_string(
                "IM_INTERNAL_HTTP_URL",
                &default_internal_url("http", port),
            ),
            internal_ws_url: env_string("IM_INTERNAL_WS_URL", &default_internal_url("ws", port)),
            server_registry_key_prefix: env_string("IM_SERVER_REGISTRY_KEY_PREFIX", "im:server:"),
            server_lease_ttl_seconds: env_u64("IM_SERVER_LEASE_TTL_SECONDS", 15),
            server_renew_interval_ms: env_u64("IM_SERVER_RENEW_INTERVAL_MS", 3_000),
            route_users_key: env_string("IM_ROUTE_USERS_KEY", "im:route:users"),
            route_lease_ttl_ms: env_i64("IM_ROUTE_LEASE_TTL_MS", 120_000),
            route_renew_interval_ms: env_u64("IM_ROUTE_RENEW_INTERVAL_MS", 30_000),
            session_heartbeat_timeout_ms: env_i64("IM_SESSION_HEARTBEAT_TIMEOUT_MS", 90_000),
            session_cleanup_interval_ms: env_u64("IM_SESSION_CLEANUP_INTERVAL_MS", 30_000),
            presence_channel: env_string("IM_WS_PRESENCE_CHANNEL", "im:presence:broadcast"),
            allow_query_ticket: env_bool("IM_WEBSOCKET_ALLOW_QUERY_TICKET", false),
            ws_ticket_cookie_name: env_string("IM_AUTH_COOKIE_WS_TICKET_NAME", "IM_WS_TICKET"),
            ws_ticket_cookie_path: env_string("IM_AUTH_COOKIE_WS_TICKET_PATH", "/websocket"),
            ws_ticket_cookie_same_site: env_string("IM_AUTH_COOKIE_WS_TICKET_SAME_SITE", "Lax"),
            ws_ticket_cookie_secure: env_string("IM_AUTH_COOKIE_WS_TICKET_SECURE", "auto"),
            max_payload_length: env_usize("IM_WEBSOCKET_MAX_PAYLOAD_LENGTH", 8 * 1024),
            invalid_payload_threshold: env_usize("IM_WEBSOCKET_INVALID_PAYLOAD_THRESHOLD", 3),
            websocket_outbound_queue_size: env_usize("IM_WEBSOCKET_OUTBOUND_QUEUE_SIZE", 1024),
        };
        if is_local_dev_or_test() {
            config.warn_dev_secrets();
        } else if let Err(e) = config.validate_production_secrets() {
            eprintln!("FATAL: Secret config validation failed:\n{e}");
            std::process::exit(1);
        }
        config
    }

    fn warn_dev_secrets(&self) {
        if !is_local_dev_or_test() {
            return;
        }
        warn_if_example("IM_INTERNAL_SECRET", &self.internal_secret, DEFAULT_INTERNAL_SECRET);
        warn_if_example("IM_GATEWAY_AUTH_SECRET", &self.gateway_auth_secret, DEFAULT_GATEWAY_AUTH_SECRET);
    }

    pub fn validate_production_secrets(&self) -> Result<(), String> {
        let mut errors: Vec<String> = Vec::new();
        validate_secret("IM_INTERNAL_SECRET", &self.internal_secret, DEFAULT_INTERNAL_SECRET, 32, &mut errors);
        validate_secret("IM_GATEWAY_AUTH_SECRET", &self.gateway_auth_secret, DEFAULT_GATEWAY_AUTH_SECRET, 32, &mut errors);
        if errors.is_empty() { Ok(()) } else { Err(errors.join("\n")) }
    }
}

fn default_instance_id(port: u16) -> String {
    let host = env::var("HOSTNAME")
        .or_else(|_| env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "im-server-rs".to_string());
    format!("{}:{}", host.trim(), port)
}

fn default_internal_url(scheme: &str, port: u16) -> String {
    let host = env::var("HOSTNAME")
        .or_else(|_| env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "im-server-rs".to_string());
    format!("{}://{}:{}", scheme, host.trim(), port)
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

pub(crate) fn is_local_dev_or_test() -> bool {
    matches!(
        env::var("APP_ENV")
            .or_else(|_| env::var("IM_ENV"))
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "" | "local" | "dev" | "development" | "test"
    )
}

fn warn_if_example(name: &str, value: &str, example: &str) {
    if value.is_empty() {
        eprintln!("WARN: {name} is not set. Set it explicitly via environment variable.");
    } else if value == example {
        eprintln!("WARN: {name} is using an example default value. Set a unique secret via environment variable.");
    }
}

fn validate_secret(name: &str, value: &str, example: &str, min_len: usize, errors: &mut Vec<String>) {
    if value.is_empty() {
        errors.push(format!("{name} must be explicitly set"));
    } else if value == example {
        errors.push(format!("{name} must not use the example default value"));
    } else if value.len() < min_len {
        errors.push(format!("{name} must be at least {min_len} bytes (got {} bytes)", value.len()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_config() -> AppConfig {
        AppConfig {
            port: 8083,
            route_redis_url: "redis://prod:6379/0".to_string(),
            auth_service_url: "http://127.0.0.1:8084".to_string(),
            internal_secret: "c".repeat(32),
            internal_max_skew_ms: 300_000,
            gateway_user_id_header: "X-User-Id".to_string(),
            gateway_username_header: "X-Username".to_string(),
            gateway_auth_secret: "d".repeat(32),
            gateway_auth_max_skew_ms: 300_000,
            instance_id: "test:8083".to_string(),
            internal_http_url: "http://test:8083".to_string(),
            internal_ws_url: "ws://test:8083".to_string(),
            server_registry_key_prefix: "im:server:".to_string(),
            server_lease_ttl_seconds: 15,
            server_renew_interval_ms: 3_000,
            route_users_key: "im:route:users".to_string(),
            route_lease_ttl_ms: 120_000,
            route_renew_interval_ms: 30_000,
            session_heartbeat_timeout_ms: 90_000,
            session_cleanup_interval_ms: 30_000,
            presence_channel: "im:presence:broadcast".to_string(),
            allow_query_ticket: false,
            ws_ticket_cookie_name: "IM_WS_TICKET".to_string(),
            ws_ticket_cookie_path: "/websocket".to_string(),
            ws_ticket_cookie_same_site: "Lax".to_string(),
            ws_ticket_cookie_secure: "auto".to_string(),
            max_payload_length: 8 * 1024,
            invalid_payload_threshold: 3,
            websocket_outbound_queue_size: 1024,
        }
    }

    #[test]
    fn valid_config_passes_production_validation() {
        let cfg = valid_config();
        assert!(cfg.validate_production_secrets().is_ok());
    }

    #[test]
    fn production_missing_internal_secret_fails() {
        let mut cfg = valid_config();
        cfg.internal_secret = String::new();
        let err = cfg.validate_production_secrets().unwrap_err();
        assert!(err.contains("IM_INTERNAL_SECRET"), "error should mention IM_INTERNAL_SECRET, got: {err}");
    }

    #[test]
    fn production_missing_gateway_auth_secret_fails() {
        let mut cfg = valid_config();
        cfg.gateway_auth_secret = String::new();
        let err = cfg.validate_production_secrets().unwrap_err();
        assert!(err.contains("IM_GATEWAY_AUTH_SECRET"), "error should mention IM_GATEWAY_AUTH_SECRET, got: {err}");
    }

    #[test]
    fn production_example_internal_secret_fails() {
        let mut cfg = valid_config();
        cfg.internal_secret = DEFAULT_INTERNAL_SECRET.to_string();
        let err = cfg.validate_production_secrets().unwrap_err();
        assert!(err.contains("IM_INTERNAL_SECRET"));
    }

    #[test]
    fn production_example_gateway_auth_secret_fails() {
        let mut cfg = valid_config();
        cfg.gateway_auth_secret = DEFAULT_GATEWAY_AUTH_SECRET.to_string();
        let err = cfg.validate_production_secrets().unwrap_err();
        assert!(err.contains("IM_GATEWAY_AUTH_SECRET"));
    }

    #[test]
    fn production_short_internal_secret_fails() {
        let mut cfg = valid_config();
        cfg.internal_secret = "short".to_string();
        let err = cfg.validate_production_secrets().unwrap_err();
        assert!(err.contains("IM_INTERNAL_SECRET"));
        assert!(err.contains("32"));
    }

    #[test]
    fn production_short_gateway_auth_secret_fails() {
        let mut cfg = valid_config();
        cfg.gateway_auth_secret = "short".to_string();
        let err = cfg.validate_production_secrets().unwrap_err();
        assert!(err.contains("IM_GATEWAY_AUTH_SECRET"));
        assert!(err.contains("32"));
    }

    #[test]
    fn is_local_dev_or_test_detection() {
        // Only test positive cases to avoid env var race conditions with parallel threads.
        // Unset → local (default)
        env::remove_var("APP_ENV");
        env::remove_var("IM_ENV");
        assert!(is_local_dev_or_test());

        // Explicit local/dev/test values
        env::set_var("APP_ENV", "dev");
        assert!(is_local_dev_or_test());
        env::set_var("APP_ENV", "test");
        assert!(is_local_dev_or_test());
        env::set_var("APP_ENV", "local");
        assert!(is_local_dev_or_test());

        // IM_ENV fallback
        env::remove_var("APP_ENV");
        env::set_var("IM_ENV", "dev");
        assert!(is_local_dev_or_test());
        env::set_var("IM_ENV", "test");
        assert!(is_local_dev_or_test());

        // Restore to safe state
        env::remove_var("APP_ENV");
        env::remove_var("IM_ENV");
    }
}
