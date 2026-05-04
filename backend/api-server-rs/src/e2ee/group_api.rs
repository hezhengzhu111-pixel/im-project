use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use im_rs_common::api::ApiResponse;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnableGroupEncryptionRequest {
    pub group_id: i64,
    pub encrypted_sender_keys: Vec<EncryptedSenderKey>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedSenderKey {
    pub user_id: i64,
    pub device_id: String,
    pub encrypted_sender_key: String,
}

pub async fn enable_group_encryption(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<EnableGroupEncryptionRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    let _ = request;
    Err(AppError::NotFound("E2EE not implemented yet".to_string()))
}

pub async fn disable_group_encryption(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    let _ = body;
    Err(AppError::NotFound("E2EE not implemented yet".to_string()))
}
