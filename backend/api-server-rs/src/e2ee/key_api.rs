use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::Json;
use im_rs_common::api::ApiResponse;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadBundleRequest {
    pub device_id: String,
    pub identity_key: String,
    pub signed_pre_key: String,
    pub signed_pre_key_signature: String,
    pub one_time_pre_keys: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreKeyBundleDto {
    pub user_id: String,
    pub device_id: String,
    pub identity_key: String,
    pub signed_pre_key: String,
    pub signed_pre_key_signature: String,
    pub one_time_pre_key: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDto {
    pub device_id: String,
    pub identity_key: String,
    pub signed_pre_key: String,
    pub last_active_at: String,
}

pub async fn upload_bundle(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<UploadBundleRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    let _ = request;
    Err(AppError::NotFound("E2EE not implemented yet".to_string()))
}

pub async fn get_bundle(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<ApiResponse<PreKeyBundleDto>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    let _ = params;
    Err(AppError::NotFound("E2EE not implemented yet".to_string()))
}

pub async fn get_devices(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<ApiResponse<Vec<DeviceDto>>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    let _ = params;
    Err(AppError::NotFound("E2EE not implemented yet".to_string()))
}

pub async fn heartbeat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    let _ = body;
    Err(AppError::NotFound("E2EE not implemented yet".to_string()))
}

pub async fn get_salt(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    Err(AppError::NotFound("E2EE not implemented yet".to_string()))
}

pub async fn upload_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    let _ = body;
    Err(AppError::NotFound("E2EE not implemented yet".to_string()))
}

pub async fn get_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    Err(AppError::NotFound("E2EE not implemented yet".to_string()))
}

pub async fn delete_device(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(device_id): Path<String>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    let _ = device_id;
    Err(AppError::NotFound("E2EE not implemented yet".to_string()))
}
