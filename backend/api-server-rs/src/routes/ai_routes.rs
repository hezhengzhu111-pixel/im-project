use crate::ai;
use crate::web::AppState;
use axum::routing::{delete, get, post, put};
use axum::Router;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/api/ai/keys",
            post(ai::api_key_handler::create).get(ai::api_key_handler::list),
        )
        .route(
            "/api/ai/keys/:id",
            put(ai::api_key_handler::update).delete(ai::api_key_handler::delete),
        )
        .route("/api/ai/keys/:id/test", post(ai::api_key_handler::test))
        .route(
            "/api/ai/settings",
            get(ai::settings_handler::get).put(ai::settings_handler::update),
        )
        .route("/api/ai/summary", post(ai::summary_handler::create))
        .route("/api/ai/stream/:task_id", get(ai::stream_bridge::subscribe))
        .route("/api/ai/internal/reply", post(ai::internal_reply::handle))
        .route(
            "/api/ai/rag/docs",
            post(ai::rag_handler::upload).get(ai::rag_handler::list),
        )
        .route("/api/ai/rag/docs/:id", delete(ai::rag_handler::delete_doc))
        .route("/api/ai/rag/query", post(ai::rag_handler::query))
}
