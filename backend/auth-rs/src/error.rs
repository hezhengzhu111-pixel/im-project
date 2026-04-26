use crate::dto::ApiResponse;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use thiserror::Error;

pub const TOKEN_EXPIRED_CODE: i32 = 40101;
pub const TOKEN_INVALID_CODE: i32 = 40102;
pub const INTERNAL_AUTH_REJECTED_CODE: i32 = 40104;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{message}")]
    Api {
        status: StatusCode,
        code: i32,
        message: String,
    },
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error(transparent)]
    Redis(#[from] redis::RedisError),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl AppError {
    pub fn token_expired() -> Self {
        Self::Api {
            status: StatusCode::UNAUTHORIZED,
            code: TOKEN_EXPIRED_CODE,
            message: "TOKEN_EXPIRED".to_string(),
        }
    }

    pub fn token_invalid() -> Self {
        Self::Api {
            status: StatusCode::UNAUTHORIZED,
            code: TOKEN_INVALID_CODE,
            message: "TOKEN_INVALID".to_string(),
        }
    }

    pub fn internal_auth_rejected() -> Self {
        Self::Api {
            status: StatusCode::UNAUTHORIZED,
            code: INTERNAL_AUTH_REJECTED_CODE,
            message: "INTERNAL_AUTH_REJECTED".to_string(),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        match self {
            AppError::Api {
                status,
                code,
                message,
            } => (status, Json(ApiResponse::<()>::error(code, message))).into_response(),
            AppError::BadRequest(message) => (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::error(400, message)),
            )
                .into_response(),
            AppError::Redis(err) => {
                tracing::error!(error = %err, "redis error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ApiResponse::<()>::error(500, "SYSTEM_ERROR")),
                )
                    .into_response()
            }
            AppError::Json(err) => (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::error(
                    400,
                    format!("invalid json: {}", err),
                )),
            )
                .into_response(),
            AppError::Other(err) => {
                tracing::error!(error = %err, "auth service error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ApiResponse::<()>::error(500, "SYSTEM_ERROR")),
                )
                    .into_response()
            }
        }
    }
}
