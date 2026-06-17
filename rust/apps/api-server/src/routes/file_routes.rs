use crate::file_api;
use crate::web::AppState;
use axum::routing::{delete, get, post};
use axum::Router;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/file/upload/image", post(file_api::upload_image))
        .route("/api/file/upload/file", post(file_api::upload_file))
        .route("/api/file/upload/audio", post(file_api::upload_audio))
        .route("/api/file/upload/video", post(file_api::upload_video))
        .route("/api/file/upload/avatar", post(file_api::upload_avatar))
        .route(
            "/api/file/download",
            get(file_api::download_get).post(file_api::download_post),
        )
        .route("/api/file/info", post(file_api::file_info))
        .route("/api/file/delete", delete(file_api::delete_file))
}
