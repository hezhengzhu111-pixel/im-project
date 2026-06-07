use crate::dto::ApiResponse;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use thiserror::Error;

pub const INTERNAL_AUTH_REJECTED_CODE: i32 = 40104;
pub const WS_TICKET_INVALID_CODE: i32 = 40109;
pub const WS_QUERY_TICKET_NOT_ALLOWED_CODE: i32 = 40110;

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
    Http(#[from] reqwest::Error),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl AppError {
    pub fn internal_auth_rejected() -> Self {
        Self::Api {
            status: StatusCode::UNAUTHORIZED,
            code: INTERNAL_AUTH_REJECTED_CODE,
            message: "INTERNAL_AUTH_REJECTED".to_string(),
        }
    }

    pub fn ticket_invalid() -> Self {
        Self::Api {
            status: StatusCode::UNAUTHORIZED,
            code: WS_TICKET_INVALID_CODE,
            message: "WS_TICKET_INVALID_OR_EXPIRED".to_string(),
        }
    }

    pub fn query_ticket_not_allowed() -> Self {
        Self::Api {
            status: StatusCode::UNAUTHORIZED,
            code: WS_QUERY_TICKET_NOT_ALLOWED_CODE,
            message: "WS_QUERY_TICKET_NOT_ALLOWED".to_string(),
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
            AppError::Http(err) => {
                tracing::warn!(error = %err, "http client error");
                (
                    StatusCode::BAD_GATEWAY,
                    Json(ApiResponse::<()>::error(502, "UPSTREAM_ERROR")),
                )
                    .into_response()
            }
            AppError::Other(err) => {
                tracing::error!(error = %err, "im-server-rs error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ApiResponse::<()>::error(500, "SYSTEM_ERROR")),
                )
                    .into_response()
            }
        }
    }
}
