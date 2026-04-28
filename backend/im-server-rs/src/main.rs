#![forbid(unsafe_code)]
#![deny(unused_must_use)]
#![deny(clippy::as_conversions)]
#![deny(clippy::expect_used)]
#![deny(clippy::indexing_slicing)]
#![deny(clippy::panic)]
#![deny(clippy::todo)]
#![deny(clippy::unimplemented)]
#![deny(clippy::unwrap_used)]

mod clients;
mod config;
mod dto;
mod error;
mod route;
mod security;
mod service;
mod web;

use crate::config::AppConfig;
use crate::service::ImService;
use redis::aio::ConnectionManager;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "im_server_rs=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Arc::new(AppConfig::from_env());
    let redis_client = redis::Client::open(config.redis_url.as_str())?;
    let redis = ConnectionManager::new(redis_client.clone()).await?;
    let service = ImService::new(config.clone(), redis);
    service.spawn_background_tasks(redis_client);

    let app = web::router(service.clone()).layer(TraceLayer::new_for_http());
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("im-server-rs listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(service))
        .await?;
    Ok(())
}

async fn shutdown_signal(service: ImService) {
    if let Err(error) = tokio::signal::ctrl_c().await {
        tracing::warn!(error = %error, "failed to listen for shutdown signal");
    }
    service.unregister_server_node().await;
}
