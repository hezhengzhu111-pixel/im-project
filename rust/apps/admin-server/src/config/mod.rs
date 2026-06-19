use std::env;

const DEFAULT_ADMIN_PORT: u16 = 9090;
const DEFAULT_USER_DB_URL: &str = "mysql://root:root123@127.0.0.1:3306/service_user_service_db";
const DEFAULT_GROUP_DB_URL: &str = "mysql://root:root123@127.0.0.1:3306/service_group_service_db";
const DEFAULT_FILE_DB_URL: &str = "mysql://root:root123@127.0.0.1:3306/service_file_service_db";
const DEFAULT_IM_SERVER_DB_URL: &str = "mysql://root:root123@127.0.0.1:3306/service_im_server_db";
const DEFAULT_REDIS_URL: &str = "redis://127.0.0.1:6379/0";
const DEFAULT_JWT_SECRET: &str = "admin-jwt-secret-admin-jwt-secret-admin-jwt-secret-admin-jwt";
const DEFAULT_API_SERVER_URL: &str = "http://127.0.0.1:8082";
const DEFAULT_IM_SERVER_URL: &str = "http://127.0.0.1:8083";
const DEFAULT_INTERNAL_SECRET: &str = "im-internal-secret-im-internal-secret-im-internal-secret-im";
const DEFAULT_ROUTE_USERS_KEY: &str = "im:route:users";
const DEFAULT_SERVER_REGISTRY_KEY_PREFIX: &str = "im:server:";

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub port: u16,
    pub user_db_url: String,
    pub group_db_url: String,
    pub file_db_url: String,
    pub im_server_db_url: String,
    pub db_max_connections: u32,
    pub redis_url: String,
    pub jwt_secret: String,
    pub jwt_expiration_ms: i64,
    pub api_server_url: String,
    pub im_server_url: String,
    pub internal_secret: String,
    pub route_users_key: String,
    pub server_registry_key_prefix: String,
}

impl AppConfig {
    pub fn from_env() -> Self {
        Self {
            port: env_u16("ADMIN_SERVER_PORT", DEFAULT_ADMIN_PORT),
            user_db_url: env_string("ADMIN_USER_DB_URL", DEFAULT_USER_DB_URL),
            group_db_url: env_string("ADMIN_GROUP_DB_URL", DEFAULT_GROUP_DB_URL),
            file_db_url: env_string("ADMIN_FILE_DB_URL", DEFAULT_FILE_DB_URL),
            im_server_db_url: env_string("ADMIN_IM_SERVER_DB_URL", DEFAULT_IM_SERVER_DB_URL),
            db_max_connections: env_u32("ADMIN_DB_MAX_CONNECTIONS", 16),
            redis_url: env_string("ADMIN_REDIS_URL", DEFAULT_REDIS_URL),
            jwt_secret: env_string("ADMIN_JWT_SECRET", DEFAULT_JWT_SECRET),
            jwt_expiration_ms: env_i64("ADMIN_JWT_EXPIRATION_MS", 86_400_000),
            api_server_url: env_string("ADMIN_API_SERVER_URL", DEFAULT_API_SERVER_URL),
            im_server_url: env_string("ADMIN_IM_SERVER_URL", DEFAULT_IM_SERVER_URL),
            internal_secret: env_string("ADMIN_INTERNAL_SECRET", DEFAULT_INTERNAL_SECRET),
            route_users_key: env_string("ADMIN_ROUTE_USERS_KEY", DEFAULT_ROUTE_USERS_KEY),
            server_registry_key_prefix: env_string(
                "ADMIN_SERVER_REGISTRY_KEY_PREFIX",
                DEFAULT_SERVER_REGISTRY_KEY_PREFIX,
            ),
        }
    }
}

fn env_string(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_string())
}

fn env_u16(key: &str, default: u16) -> u16 {
    env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_u32(key: &str, default: u32) -> u32 {
    env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_i64(key: &str, default: i64) -> i64 {
    env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}
