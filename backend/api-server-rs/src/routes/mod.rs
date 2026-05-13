pub mod ai_routes;
pub mod auth_routes;
pub mod e2ee_routes;
pub mod file_routes;
pub mod message_routes;
pub mod moments_routes;
pub mod push_routes;
pub mod social_routes;
pub mod user_routes;

use crate::web::AppState;
use axum::Router;

pub fn api_routes() -> Router<AppState> {
    Router::new()
        .merge(auth_routes::routes())
        .merge(file_routes::routes())
        .merge(message_routes::routes())
        .merge(e2ee_routes::routes())
        .merge(social_routes::routes())
        .merge(moments_routes::routes())
        .merge(push_routes::routes())
        .merge(user_routes::routes())
        .merge(ai_routes::routes())
}
