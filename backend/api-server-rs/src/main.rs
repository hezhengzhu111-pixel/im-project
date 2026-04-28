mod auth;
mod auth_api;
mod background_publisher;
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
use tracing_subscriber::{filter::Directive, layer::SubscriberExt, util::SubscriberInitExt};

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
        .max_connections(20)
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
    let filter = tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        "api_server_rs=info,im_observe=info,tower_http=warn,sqlx::query=off".into()
    });
    filter
        .add_directive(parse_log_directive("im_observe=info"))
        .add_directive(parse_log_directive("sqlx::query=off"))
}

fn parse_log_directive(directive: &str) -> Directive {
    directive
        .parse()
        .unwrap_or_else(|error| panic!("invalid static log directive {directive}: {error}"))
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
