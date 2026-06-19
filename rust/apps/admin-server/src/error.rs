use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use im_common::api::ErrorResponse;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    BadRequest(String),
    #[error("{0}")]
    Unauthorized(String),
    #[error("{0}")]
    Forbidden(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Upstream(String),
    #[error(transparent)]
    Redis(#[from] redis::RedisError),
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(transparent)]
    Reqwest(#[from] reqwest::Error),
    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            Self::Forbidden(_) => StatusCode::FORBIDDEN,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Upstream(_) => StatusCode::BAD_GATEWAY,
            Self::Redis(_) | Self::Sqlx(_) | Self::Reqwest(_) | Self::Anyhow(_) => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        };
        let code = i32::from(status.as_u16());
        (status, Json(ErrorResponse::new(code, self.to_string()))).into_response()
    }
}
