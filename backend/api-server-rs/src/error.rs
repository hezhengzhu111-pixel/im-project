use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use im_rs_common::api::ErrorResponse;

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
    Conflict(String),
    #[error("{0}")]
    Upstream(String),
    #[error(transparent)]
    Redis(#[from] redis::RedisError),
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(transparent)]
    Reqwest(#[from] reqwest::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Serde(#[from] serde_json::Error),
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
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::Upstream(_) => StatusCode::BAD_GATEWAY,
            Self::Redis(_)
            | Self::Sqlx(_)
            | Self::Reqwest(_)
            | Self::Io(_)
            | Self::Serde(_)
            | Self::Anyhow(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        let code = if status == StatusCode::UNAUTHORIZED {
            401
        } else if status == StatusCode::FORBIDDEN {
            403
        } else if status == StatusCode::NOT_FOUND {
            404
        } else if status == StatusCode::BAD_REQUEST {
            400
        } else {
            500
        };
        (status, Json(ErrorResponse::new(code, self.to_string()))).into_response()
    }
}
