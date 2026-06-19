use axum::{routing::get, Router};
use std::sync::Arc;
use tokio::net::TcpListener;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod error;
mod handlers;
mod routes;

use config::AppConfig;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub user_db: sqlx::MySqlPool,
    pub group_db: sqlx::MySqlPool,
    pub file_db: sqlx::MySqlPool,
    pub im_server_db: sqlx::MySqlPool,
    pub redis: redis::aio::ConnectionManager,
    pub http: reqwest::Client,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = AppConfig::from_env();
    tracing::info!("Admin server starting on port {}", config.port);

    let user_db = sqlx::mysql::MySqlPoolOptions::new()
        .max_connections(config.db_max_connections)
        .connect(&config.user_db_url)
        .await?;
    let group_db = sqlx::mysql::MySqlPoolOptions::new()
        .max_connections(config.db_max_connections)
        .connect(&config.group_db_url)
        .await?;
    let file_db = sqlx::mysql::MySqlPoolOptions::new()
        .max_connections(config.db_max_connections)
        .connect(&config.file_db_url)
        .await?;
    let im_server_db = sqlx::mysql::MySqlPoolOptions::new()
        .max_connections(config.db_max_connections)
        .connect(&config.im_server_db_url)
        .await?;
    tracing::info!("Database pools connected");

    let redis_client = redis::Client::open(config.redis_url.clone())?;
    let redis = redis::aio::ConnectionManager::new(redis_client).await?;
    tracing::info!("Redis connected");

    let http = reqwest::Client::new();

    let state = AppState {
        config: Arc::new(config),
        user_db,
        group_db,
        file_db,
        im_server_db,
        redis,
        http,
    };

    let port = state.config.port;
    let app = Router::new()
        .route("/health", get(handlers::health::health_check))
        .route("/ready", get(handlers::health::ready_check))
        .merge(routes::admin::admin_routes())
        .with_state(state)
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .layer(
            tower_http::cors::CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any),
        );

    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).await?;
    tracing::info!("Admin server listening on {}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}
