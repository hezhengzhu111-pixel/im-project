use super::*;
use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::{Multipart, Query, State};
use axum::http::HeaderMap;
use axum::response::Response;
use axum::Json;
use chrono::Local;
use im_common::api::ApiResponse;
use std::time::UNIX_EPOCH;
use tokio::fs;
pub(crate) fn store_knowledge_file(
    base_dir: &std::path::Path,
    _original_name: &str,
    file_type: &str,
    data: &[u8],
) -> Result<KnowledgeFileSaved, AppError> {
    let date = Local::now().format("%Y-%m-%d").to_string();
    let safe_name = format!("{}.{}", uuid::Uuid::new_v4(), file_type);
    let dir = base_dir.join("knowledge").join(&date);
    std::fs::create_dir_all(&dir).map_err(AppError::Io)?;
    let path = dir.join(&safe_name);
    std::fs::write(&path, data).map_err(AppError::Io)?;
    let url = format!("/files/knowledge/{}/{}", date, safe_name);
    let size = i64::try_from(data.len())
        .map_err(|_| AppError::BadRequest("file too large".to_string()))?;
    Ok(KnowledgeFileSaved { url, size })
}

pub(crate) async fn upload_image(
    State(state): State<AppState>,
    headers: HeaderMap,
    multipart: Multipart,
) -> Result<Json<ApiResponse<FileUploadResponse>>, AppError> {
    upload(
        state,
        headers,
        multipart,
        "images",
        "image",
        allowed_image_types(),
        |cfg| cfg.file_image_max_size,
    )
    .await
}

pub(crate) async fn upload_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    multipart: Multipart,
) -> Result<Json<ApiResponse<FileUploadResponse>>, AppError> {
    upload(
        state,
        headers,
        multipart,
        "files",
        "file",
        allowed_file_types(),
        |cfg| cfg.file_file_max_size,
    )
    .await
}

pub(crate) async fn upload_audio(
    State(state): State<AppState>,
    headers: HeaderMap,
    multipart: Multipart,
) -> Result<Json<ApiResponse<FileUploadResponse>>, AppError> {
    upload(
        state,
        headers,
        multipart,
        "audios",
        "audio",
        allowed_audio_types(),
        |cfg| cfg.file_audio_max_size,
    )
    .await
}

pub(crate) async fn upload_video(
    State(state): State<AppState>,
    headers: HeaderMap,
    multipart: Multipart,
) -> Result<Json<ApiResponse<FileUploadResponse>>, AppError> {
    upload(
        state,
        headers,
        multipart,
        "videos",
        "video",
        allowed_video_types(),
        |cfg| cfg.file_video_max_size,
    )
    .await
}

pub(crate) async fn upload_avatar(
    State(state): State<AppState>,
    headers: HeaderMap,
    multipart: Multipart,
) -> Result<Json<ApiResponse<FileUploadResponse>>, AppError> {
    upload(
        state,
        headers,
        multipart,
        "avatars",
        "avatar",
        allowed_image_types(),
        |cfg| cfg.file_avatar_max_size,
    )
    .await
}

pub(crate) async fn download_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(request): Query<FileLocator>,
) -> Response {
    stream_file(state, headers, request).await
}

pub(crate) async fn download_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<FileLocator>,
) -> Response {
    stream_file(state, headers, request).await
}

pub(crate) async fn file_info(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<FileLocator>,
) -> Result<Json<ApiResponse<FileInfoResponse>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    if !can_read(&state, identity.user_id, &request).await {
        return Err(AppError::Forbidden("file access denied".to_string()));
    }
    let path = resolve_path(
        &state.config.storage_base_dir,
        &request.category,
        &request.date,
        &request.filename,
    );
    let metadata = fs::metadata(&path).await.map_err(|err| {
        if err.kind() == std::io::ErrorKind::NotFound {
            AppError::NotFound("file not found".to_string())
        } else {
            AppError::Anyhow(err.into())
        }
    })?;
    let last_modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| i64::try_from(value.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or_default();
    let size = i64::try_from(metadata.len())
        .map_err(|_| AppError::BadRequest("file size is too large".to_string()))?;
    Ok(Json(ApiResponse::success(FileInfoResponse {
        filename: request.filename,
        size,
        content_type: mime_guess::from_path(&path).first_raw().map(str::to_string),
        last_modified,
    })))
}

pub(crate) async fn delete_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(request): Query<FileLocator>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    if !can_delete(&state, identity.user_id, &request).await {
        return Err(AppError::Forbidden("file delete denied".to_string()));
    }
    let path = resolve_path(
        &state.config.storage_base_dir,
        &request.category,
        &request.date,
        &request.filename,
    );
    match fs::remove_file(&path).await {
        Ok(()) => {
            delete_metadata(&state, &request).await;
            Ok(Json(ApiResponse::success(true)))
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            Err(AppError::NotFound("file not found".to_string()))
        }
        Err(err) => Err(AppError::Anyhow(err.into())),
    }
}
