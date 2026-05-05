use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use im_rs_common::api::ApiResponse;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct E2eeSessionRequest {
    pub session_id: String,
    pub identity_key: Option<String>,
    pub signed_pre_key: Option<String>,
}

pub async fn request_encryption(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<E2eeSessionRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    let _ = request;
    Err(AppError::NotImplemented("E2EE not implemented yet".to_string()))
}

pub async fn accept_encryption(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<E2eeSessionRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    let _ = request;
    Err(AppError::NotImplemented("E2EE not implemented yet".to_string()))
}

pub async fn reject_encryption(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<E2eeSessionRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    let _ = request;
    Err(AppError::NotImplemented("E2EE not implemented yet".to_string()))
}
