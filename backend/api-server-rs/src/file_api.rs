use crate::auth::identity_from_headers;
use crate::config::AppConfig;
use crate::error::AppError;
use crate::web::AppState;
use axum::body::Body;
use axum::extract::{Multipart, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use chrono::Local;
use im_rs_common::api::ApiResponse;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileUploadResponse {
    pub original_filename: String,
    pub filename: String,
    pub url: String,
    pub size: i64,
    pub content_type: String,
    pub category: String,
    pub upload_date: String,
    pub upload_time: i64,
    pub uploader_id: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfoResponse {
    pub filename: String,
    pub size: i64,
    pub content_type: Option<String>,
    pub last_modified: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FileMetadata {
    category: String,
    date: String,
    filename: String,
    original_filename: String,
    uploader_id: Option<i64>,
    size: i64,
    content_type: String,
    created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct FileLocator {
    category: String,
    date: String,
    filename: String,
}

pub async fn upload_image(
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

pub async fn upload_file(
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

pub async fn upload_audio(
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

pub async fn upload_video(
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

pub async fn upload_avatar(
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

pub async fn download_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(request): Query<FileLocator>,
) -> Response {
    stream_file(state, headers, request).await
}

pub async fn download_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<FileLocator>,
) -> Response {
    stream_file(state, headers, request).await
}

pub async fn file_info(
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

pub async fn delete_file(
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

async fn upload(
    state: AppState,
    headers: HeaderMap,
    multipart: Multipart,
    category: &str,
    file_type_name: &str,
    allowed_types: HashSet<&'static str>,
    max_size: impl Fn(&AppConfig) -> usize,
) -> Result<Json<ApiResponse<FileUploadResponse>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let response = store_file_from_multipart(
        &state,
        multipart,
        category,
        file_type_name,
        &allowed_types,
        max_size(&state.config),
        identity.user_id,
    )
    .await?;
    save_metadata(&state, &response).await;
    Ok(Json(ApiResponse::success(response)))
}

async fn store_file_from_multipart(
    state: &AppState,
    mut multipart: Multipart,
    category: &str,
    file_type_name: &str,
    allowed_types: &HashSet<&'static str>,
    max_size: usize,
    user_id: i64,
) -> Result<FileUploadResponse, AppError> {
    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|err| AppError::BadRequest(format!("invalid multipart request: {err}")))?
    {
        if field.name() != Some("file") {
            continue;
        }
        let original_filename = field
            .file_name()
            .map(str::to_string)
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| AppError::BadRequest("file name must not be empty".to_string()))?;
        let content_type = field
            .content_type()
            .map(str::to_ascii_lowercase)
            .unwrap_or_default();
        let content_type = resolve_content_type(&original_filename, &content_type, file_type_name);
        if !is_content_type_allowed(&content_type, allowed_types) {
            return Err(AppError::BadRequest(format!(
                "unsupported {file_type_name} content type: {content_type}"
            )));
        }

        let extension = file_extension(&original_filename);
        let filename = format!("{}{}", Uuid::new_v4(), extension);
        let date = Local::now().format("%Y-%m-%d").to_string();
        let target = resolve_path(&state.config.storage_base_dir, category, &date, &filename);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).await?;
        }

        let temp_filename = format!(".{filename}.uploading");
        let temp_target = resolve_path(
            &state.config.storage_base_dir,
            category,
            &date,
            &temp_filename,
        );
        let mut output = fs::File::create(&temp_target).await?;
        let mut size = 0usize;
        while let Some(chunk) = field
            .chunk()
            .await
            .map_err(|err| AppError::BadRequest(format!("failed to read upload file: {err}")))?
        {
            size = size
                .checked_add(chunk.len())
                .ok_or_else(|| AppError::BadRequest("file is too large".to_string()))?;
            if size > max_size {
                drop(output);
                remove_temp_file(&temp_target).await;
                return Err(AppError::BadRequest(format!(
                    "{file_type_name} file size must not exceed {}",
                    format_limit(max_size)
                )));
            }
            output.write_all(&chunk).await?;
        }
        output.flush().await?;
        drop(output);

        if size == 0 {
            remove_temp_file(&temp_target).await;
            return Err(AppError::BadRequest(format!(
                "{file_type_name} file must not be empty"
            )));
        }

        fs::rename(&temp_target, &target).await?;
        let upload_time = im_rs_common::time::now_ms();
        return Ok(FileUploadResponse {
            original_filename,
            filename: filename.clone(),
            url: static_file_url(category, &date, &filename),
            size: i64::try_from(size)
                .map_err(|_| AppError::BadRequest("file size is too large".to_string()))?,
            content_type,
            category: category.to_string(),
            upload_date: date,
            upload_time,
            uploader_id: user_id,
        });
    }
    Err(AppError::BadRequest(
        "file field must not be empty".to_string(),
    ))
}

async fn remove_temp_file(path: &Path) {
    match fs::remove_file(path).await {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            tracing::warn!(path = %path.display(), error = %error, "failed to remove temporary upload file");
        }
    }
}

async fn stream_file(state: AppState, headers: HeaderMap, request: FileLocator) -> Response {
    let identity = match identity_from_headers(&headers, &state.config) {
        Ok(identity) => identity,
        Err(err) => return err.into_response(),
    };
    if !can_read(&state, identity.user_id, &request).await {
        return AppError::Forbidden("file access denied".to_string()).into_response();
    }
    let path = resolve_path(
        &state.config.storage_base_dir,
        &request.category,
        &request.date,
        &request.filename,
    );
    let file = match fs::File::open(&path).await {
        Ok(file) => file,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return AppError::NotFound("file not found".to_string()).into_response()
        }
        Err(err) => return AppError::Anyhow(err.into()).into_response(),
    };
    let metadata = match file.metadata().await {
        Ok(metadata) => metadata,
        Err(err) => return AppError::Anyhow(err.into()).into_response(),
    };
    let mut response_headers = HeaderMap::new();
    let content_type = mime_guess::from_path(&path)
        .first_raw()
        .unwrap_or("application/octet-stream");
    response_headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(content_type)
            .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
    );
    if let Ok(value) = HeaderValue::from_str(&metadata.len().to_string()) {
        response_headers.insert(header::CONTENT_LENGTH, value);
    }
    if let Ok(value) = HeaderValue::from_str(&format!(
        "attachment; filename=\"{}\"",
        safe_segment(&request.filename)
    )) {
        response_headers.insert(header::CONTENT_DISPOSITION, value);
    }
    (
        StatusCode::OK,
        response_headers,
        Body::from_stream(ReaderStream::new(file)),
    )
        .into_response()
}

async fn can_read(state: &AppState, user_id: i64, request: &FileLocator) -> bool {
    match get_metadata(state, request).await {
        Some(metadata) => metadata.uploader_id == Some(user_id),
        None => true,
    }
}

async fn can_delete(state: &AppState, user_id: i64, request: &FileLocator) -> bool {
    match get_metadata(state, request).await {
        Some(metadata) => metadata.uploader_id == Some(user_id),
        None => false,
    }
}

async fn save_metadata(state: &AppState, response: &FileUploadResponse) {
    let metadata = FileMetadata {
        category: response.category.clone(),
        date: response.upload_date.clone(),
        filename: response.filename.clone(),
        original_filename: response.original_filename.clone(),
        uploader_id: Some(response.uploader_id),
        size: response.size,
        content_type: response.content_type.clone(),
        created_at: response.upload_time,
    };
    let Ok(value) = serde_json::to_string(&metadata) else {
        return;
    };
    let mut redis = state.redis_manager.clone();
    let result: redis::RedisResult<()> = redis
        .set(
            metadata_key(&metadata.category, &metadata.date, &metadata.filename),
            value,
        )
        .await;
    if let Err(error) = result {
        tracing::warn!(error = %error, "failed to save file metadata");
    }
}

async fn get_metadata(state: &AppState, request: &FileLocator) -> Option<FileMetadata> {
    let mut redis = state.redis_manager.clone();
    let raw: redis::RedisResult<Option<String>> = redis
        .get(metadata_key(
            &request.category,
            &request.date,
            &request.filename,
        ))
        .await;
    match raw {
        Ok(Some(value)) => serde_json::from_str::<FileMetadata>(&value).ok(),
        Ok(None) => None,
        Err(error) => {
            tracing::warn!(error = %error, "failed to read file metadata");
            None
        }
    }
}

async fn delete_metadata(state: &AppState, request: &FileLocator) {
    let mut redis = state.redis_manager.clone();
    let result: redis::RedisResult<()> = redis
        .del(metadata_key(
            &request.category,
            &request.date,
            &request.filename,
        ))
        .await;
    if let Err(error) = result {
        tracing::warn!(error = %error, "failed to delete file metadata");
    }
}

fn metadata_key(category: &str, date: &str, filename: &str) -> String {
    format!(
        "file:meta:{}:{}:{}",
        safe_segment(category),
        safe_segment(date),
        safe_segment(filename)
    )
}

fn resolve_path(base: &Path, category: &str, date: &str, filename: &str) -> PathBuf {
    base.join(safe_segment(category))
        .join(safe_segment(date))
        .join(safe_segment(filename))
}

fn static_file_url(category: &str, date: &str, filename: &str) -> String {
    format!(
        "/files/{}/{}/{}",
        safe_segment(category),
        safe_segment(date),
        safe_segment(filename)
    )
}

fn safe_segment(value: &str) -> String {
    let sanitized = value
        .replace("..", "_")
        .replace(['\\', '/'], "_")
        .trim()
        .to_string();
    if sanitized.is_empty() {
        "_".to_string()
    } else {
        sanitized
    }
}

fn file_extension(filename: &str) -> String {
    let Some(extension) = Path::new(filename)
        .extension()
        .and_then(|value| value.to_str())
    else {
        return String::new();
    };
    let extension = extension
        .chars()
        .filter(|value| value.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_lowercase();
    if extension.is_empty() || extension.len() > 16 {
        String::new()
    } else {
        format!(".{extension}")
    }
}

fn format_limit(size: usize) -> String {
    if size >= 1024 * 1024 {
        format!("{}MB", size / 1024 / 1024)
    } else if size >= 1024 {
        format!("{}KB", size / 1024)
    } else {
        format!("{size}B")
    }
}

fn normalize_content_type(value: &str) -> String {
    value
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
}

fn resolve_content_type(filename: &str, raw_content_type: &str, file_type_name: &str) -> String {
    let normalized = normalize_content_type(raw_content_type);
    if !normalized.is_empty() {
        return normalized;
    }

    let extension = Path::new(filename)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if file_type_name == "audio" {
        if extension == "webm" {
            return "audio/webm".to_string();
        }
        if extension == "m4a" {
            return "audio/mp4".to_string();
        }
    }

    mime_guess::from_path(filename)
        .first_raw()
        .map(normalize_content_type)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "application/octet-stream".to_string())
}

fn is_content_type_allowed(content_type: &str, allowed_types: &HashSet<&'static str>) -> bool {
    allowed_types.contains("*/*") || allowed_types.contains(content_type)
}

fn allowed_image_types() -> HashSet<&'static str> {
    HashSet::from([
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/bmp",
    ])
}

fn allowed_file_types() -> HashSet<&'static str> {
    HashSet::from(["*/*"])
}

fn allowed_audio_types() -> HashSet<&'static str> {
    HashSet::from([
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/x-wav",
        "audio/ogg",
        "audio/aac",
        "audio/webm",
        "audio/mp4",
        "audio/x-m4a",
    ])
}

fn allowed_video_types() -> HashSet<&'static str> {
    HashSet::from([
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "video/x-msvideo",
        "video/x-ms-wmv",
        "video/x-flv",
        "video/avi",
        "video/mov",
        "video/wmv",
        "video/flv",
    ])
}
