#![forbid(unsafe_code)]
#![deny(unused_must_use)]
#![deny(clippy::as_conversions)]
#![deny(clippy::expect_used)]
#![deny(clippy::indexing_slicing)]
#![deny(clippy::panic)]
#![deny(clippy::todo)]
#![deny(clippy::unimplemented)]
#![deny(clippy::unwrap_used)]

mod auth;
mod auth_api;
mod background_publisher;
mod background_task;
mod background_writer;
mod config;
mod error;
mod file_api;
mod id_resolver;
mod local_cache;
mod message;
mod observability;
mod push_dispatcher;
mod redis_streams;
mod route;
mod social;
mod user;
mod web;

use crate::config::AppConfig;
use crate::web::AppState;
use axum::extract::DefaultBodyLimit;
use redis::aio::ConnectionManager;
use sqlx::mysql::MySqlConnectOptions;
use std::net::SocketAddr;
use std::str::FromStr;
use std::sync::Arc;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

const DEFAULT_LOG_FILTER: &str =
    "api_server_rs=info,im_observe=info,tower_http=warn,sqlx::query=off";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(log_filter())
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Arc::new(AppConfig::from_env());
    tokio::fs::create_dir_all(&config.storage_base_dir).await?;
    let redis_client = redis::Client::open(config.redis_url.as_str())?;
    let redis = ConnectionManager::new(redis_client).await?;
    let mysql_options = MySqlConnectOptions::from_str(&config.mysql_url)?;
    let db = sqlx::mysql::MySqlPoolOptions::new()
        .max_connections(config.mysql_max_connections)
        .connect_with(mysql_options)
        .await?;
    let state = AppState {
        config: config.clone(),
        redis_manager: redis.clone(),
        db,
        http: reqwest::Client::new(),
    };
    background_publisher::spawn(config.clone());
    background_writer::spawn(config.clone(), state.db.clone());
    push_dispatcher::spawn(config.clone(), state.db.clone());
    let app = web::router(state)
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

        assert!(rendered.contains("api_server_rs=info"));
        assert!(rendered.contains("im_observe=info"));
        assert!(rendered.contains("sqlx::query=off"));
    }

    #[test]
    fn should_respect_explicit_rust_log_without_forced_observe_directive() {
        let rendered = log_filter_from(Some("api_server_rs=warn,im_observe=debug")).to_string();

        assert!(rendered.contains("api_server_rs=warn"));
        assert!(rendered.contains("im_observe=debug"));
        assert!(!rendered.contains("sqlx::query=off"));
    }
}
