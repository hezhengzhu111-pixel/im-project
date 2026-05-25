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
use sqlx::Row;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]

pub(crate) struct FileUploadResponse {
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

#[derive(Debug, Clone)]
pub(crate) struct KnowledgeFileSaved {
    pub url: String,
    pub size: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileInfoResponse {
    pub filename: String,
    pub size: i64,
    pub content_type: Option<String>,
    pub last_modified: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileMetadata {
    pub(crate) category: String,
    pub(crate) date: String,
    pub(crate) filename: String,
    pub(crate) original_filename: String,
    pub(crate) uploader_id: Option<i64>,
    pub(crate) size: i64,
    pub(crate) content_type: String,
    pub(crate) created_at: i64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct FileLocator {
    pub(crate) category: String,
    pub(crate) date: String,
    pub(crate) filename: String,
}

