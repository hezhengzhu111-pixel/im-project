#![forbid(unsafe_code)]
#![deny(unused_must_use)]
#![deny(clippy::as_conversions)]
#![deny(clippy::expect_used)]
#![deny(clippy::indexing_slicing)]
#![deny(clippy::panic)]
#![deny(clippy::todo)]
#![deny(clippy::unimplemented)]
#![deny(clippy::unwrap_used)]

use api_server::config::AppConfig;
use api_server::web::{self, AppState};
use axum::extract::DefaultBodyLimit;
use axum::http::{header, HeaderName, Method};
use redis::aio::ConnectionManager;
use sqlx::mysql::MySqlConnectOptions;
use std::net::SocketAddr;
use std::str::FromStr;
use std::sync::Arc;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

const DEFAULT_LOG_FILTER: &str = "api_server=info,im_observe=info,tower_http=warn,sqlx::query=off";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(log_filter())
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Arc::new(AppConfig::from_env());
    tokio::fs::create_dir_all(&config.storage_base_dir).await?;
    let redis_client = redis::Client::open(config.cache_redis_url.as_str())?;
    let redis = ConnectionManager::new(redis_client).await?;
    let private_redis = connect_redis_managers(&config.private_hot_redis_urls).await?;
    let group_redis = connect_redis_managers(&config.group_hot_redis_urls).await?;
    let route_redis_client = redis::Client::open(config.route_redis_url.as_str())?;
    let route_redis = ConnectionManager::new(route_redis_client).await?;
    let mysql_options = MySqlConnectOptions::from_str(&config.mysql_url)?;
    let db = sqlx::mysql::MySqlPoolOptions::new()
        .max_connections(config.mysql_max_connections)
        .connect_with(mysql_options)
        .await?;
    api_server::push::ensure_schema(&db).await?;
    let state = AppState {
        config: config.clone(),
        redis_manager: redis.clone(),
        private_redis_managers: Arc::new(private_redis),
        group_redis_managers: Arc::new(group_redis),
        route_redis_manager: route_redis.clone(),
        db,
        http: reqwest::Client::new(),
    };
    api_server::background_publisher::spawn(config.clone());
    api_server::background_writer::spawn(config.clone(), state.db.clone());
    api_server::push_dispatcher::spawn(config.clone(), state.db.clone());
    api_server::e2ee::cleanup::spawn(state.db.clone());
    // CORS 配置：开发环境允许所有 localhost/127.0.0.1 端口
    // 当 allow_credentials(true) 时，不能使用 wildcard "*"，需用 predicate 动态匹配
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|origin, _parts| {
            // 允许任何 localhost / 127.0.0.1 端口（开发环境）
            let s = origin.to_str().unwrap_or("");
            s.starts_with("http://localhost:")
                || s.starts_with("http://127.0.0.1:")
                || s.starts_with("https://localhost:")
                || s.starts_with("https://127.0.0.1:")
        }))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::PATCH,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::ACCEPT,
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            HeaderName::from_static("x-gateway-route"),
            HeaderName::from_static("x-requested-with"),
            HeaderName::from_static("x-trace-id"),
        ])
        .allow_credentials(true);
    let app = web::router(state)
        .layer(cors)
        .layer(DefaultBodyLimit::max(config.request_body_limit))
        .layer(TraceLayer::new_for_http());
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("api-server-rs listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn connect_redis_managers(urls: &[String]) -> anyhow::Result<Vec<ConnectionManager>> {
    let mut managers = Vec::with_capacity(urls.len());
    for url in urls {
        let client = redis::Client::open(url.as_str())?;
        managers.push(ConnectionManager::new(client).await?);
    }
    Ok(managers)
}

fn log_filter() -> tracing_subscriber::EnvFilter {
    log_filter_from(std::env::var("RUST_LOG").ok().as_deref())
}

fn log_filter_from(raw_filter: Option<&str>) -> tracing_subscriber::EnvFilter {
    raw_filter
        .filter(|value| !value.trim().is_empty())
        .and_then(parse_log_filter)
        .unwrap_or_else(default_log_filter)
}

fn parse_log_filter(raw_filter: &str) -> Option<tracing_subscriber::EnvFilter> {
    tracing_subscriber::EnvFilter::try_new(raw_filter).ok()
}

fn default_log_filter() -> tracing_subscriber::EnvFilter {
    tracing_subscriber::EnvFilter::new(DEFAULT_LOG_FILTER)
}

async fn shutdown_signal() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        tracing::warn!(error = %error, "failed to listen for shutdown signal");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_use_default_log_filter_when_rust_log_is_absent() {
        let rendered = log_filter_from(None).to_string();

        assert!(rendered.contains("api_server=info"));
        assert!(rendered.contains("im_observe=info"));
        assert!(rendered.contains("sqlx::query=off"));
    }

    #[test]
    fn should_respect_explicit_rust_log_without_forced_observe_directive() {
        let rendered = log_filter_from(Some("api_server=warn,im_observe=debug")).to_string();

        assert!(rendered.contains("api_server=warn"));
        assert!(rendered.contains("im_observe=debug"));
        assert!(!rendered.contains("sqlx::query=off"));
    }
}
