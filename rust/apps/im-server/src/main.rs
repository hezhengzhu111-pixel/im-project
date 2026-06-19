#![forbid(unsafe_code)]
#![deny(unused_must_use)]
#![cfg_attr(not(test), deny(clippy::as_conversions))]
#![cfg_attr(not(test), deny(clippy::expect_used))]
#![cfg_attr(not(test), deny(clippy::indexing_slicing))]
#![deny(clippy::panic)]
#![deny(clippy::todo)]
#![deny(clippy::unimplemented)]
#![cfg_attr(not(test), deny(clippy::unwrap_used))]

use im_server::config::AppConfig;
use im_server::service::ImService;
use im_server::web;
use redis::aio::ConnectionManager;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "im_server=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Arc::new(AppConfig::from_env());
    let redis_client = redis::Client::open(config.route_redis_url.as_str())?;
    let redis = ConnectionManager::new(redis_client.clone()).await?;
    let service = ImService::new(config.clone(), redis);
    service.spawn_background_tasks(redis_client);

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    let app = web::router(service.clone())
        .layer(cors)
        .layer(TraceLayer::new_for_http());
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
