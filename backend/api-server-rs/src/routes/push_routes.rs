use crate::push;
use crate::web::AppState;
use axum::routing::{get, post, put};
use axum::Router;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/push/devices/register", post(push::register_device))
        .route("/api/push/devices/register", post(push::register_device))
        .route("/push/devices/unregister", post(push::unregister_device))
        .route("/api/push/devices/unregister", post(push::unregister_device))
        .route("/push/devices/token", put(push::update_device_token))
        .route("/api/push/devices/token", put(push::update_device_token))
        .route("/push/settings", get(push::get_settings).put(push::update_settings))
        .route(
            "/api/push/settings",
            get(push::get_settings).put(push::update_settings),
        )
}
