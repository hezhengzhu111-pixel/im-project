use crate::file_api;
use crate::web::AppState;
use axum::routing::{delete, get, post};
use axum::Router;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/upload/image", post(file_api::upload_image))
        .route("/upload/file", post(file_api::upload_file))
        .route("/upload/audio", post(file_api::upload_audio))
        .route("/upload/video", post(file_api::upload_video))
        .route("/upload/avatar", post(file_api::upload_avatar))
        .route("/file/upload/image", post(file_api::upload_image))
        .route("/file/upload/file", post(file_api::upload_file))
        .route("/file/upload/audio", post(file_api::upload_audio))
        .route("/file/upload/video", post(file_api::upload_video))
        .route("/file/upload/avatar", post(file_api::upload_avatar))
        .route("/api/file/upload/image", post(file_api::upload_image))
        .route("/api/file/upload/file", post(file_api::upload_file))
        .route("/api/file/upload/audio", post(file_api::upload_audio))
        .route("/api/file/upload/video", post(file_api::upload_video))
        .route("/api/file/upload/avatar", post(file_api::upload_avatar))
        .route(
            "/download",
            get(file_api::download_get).post(file_api::download_post),
        )
        .route(
            "/file/download",
            get(file_api::download_get).post(file_api::download_post),
        )
        .route(
            "/api/file/download",
            get(file_api::download_get).post(file_api::download_post),
        )
        .route("/info", post(file_api::file_info))
        .route("/file/info", post(file_api::file_info))
        .route("/api/file/info", post(file_api::file_info))
        .route("/delete", delete(file_api::delete_file))
        .route("/file/delete", delete(file_api::delete_file))
        .route("/api/file/delete", delete(file_api::delete_file))
}
