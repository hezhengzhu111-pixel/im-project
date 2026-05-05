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
    NotImplemented(String),
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
            Self::NotImplemented(_) => StatusCode::NOT_IMPLEMENTED,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::Upstream(_) => StatusCode::BAD_GATEWAY,
            Self::Redis(_)
            | Self::Sqlx(_)
            | Self::Reqwest(_)
            | Self::Io(_)
            | Self::Serde(_)
            | Self::Anyhow(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        let code = i32::from(status.as_u16());
        (status, Json(ErrorResponse::new(code, self.to_string()))).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::response::IntoResponse;

    #[test]
    fn bad_request_returns_400_with_code_400() {
        let resp = AppError::BadRequest("test".into()).into_response();
        assert_eq!(resp.status(), 400);
    }

    #[test]
    fn unauthorized_returns_401_with_code_401() {
        let resp = AppError::Unauthorized("test".into()).into_response();
        assert_eq!(resp.status(), 401);
    }

    #[test]
    fn forbidden_returns_403_with_code_403() {
        let resp = AppError::Forbidden("test".into()).into_response();
        assert_eq!(resp.status(), 403);
    }

    #[test]
    fn not_found_returns_404_with_code_404() {
        let resp = AppError::NotFound("test".into()).into_response();
        assert_eq!(resp.status(), 404);
    }

    #[test]
    fn conflict_returns_409_with_code_409() {
        let resp = AppError::Conflict("test".into()).into_response();
        assert_eq!(resp.status(), 409);
    }

    #[test]
    fn upstream_returns_502_with_code_502() {
        let resp = AppError::Upstream("test".into()).into_response();
        assert_eq!(resp.status(), 502);
    }

    #[test]
    fn internal_errors_return_500() {
        let resp = AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, "test")).into_response();
        assert_eq!(resp.status(), 500);
    }
}
