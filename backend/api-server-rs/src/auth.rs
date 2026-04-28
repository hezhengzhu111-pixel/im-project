use crate::config::AppConfig;
use crate::error::AppError;
use axum::http::{header, HeaderMap};
use im_rs_common::auth::{parse_bearer, validate_access_token, Identity};

pub fn identity_from_headers(
    headers: &HeaderMap,
    config: &AppConfig,
) -> Result<Identity, AppError> {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| parse_bearer(Some(value)))
        .or_else(|| cookie_value(headers, &config.access_cookie_name));
    let Some(token) = token else {
        return Err(AppError::Unauthorized("TOKEN_EMPTY".to_string()));
    };
    validate_access_token(&token, &config.jwt_secret)
        .map_err(|_| AppError::Unauthorized("TOKEN_INVALID".to_string()))
}

pub fn is_gateway_whitelist(path: &str) -> bool {
    [
        "/actuator",
        "/health",
        "/ready",
        "/v3/api-docs",
        "/swagger-ui",
        "/swagger-ui.html",
        "/api/user/login",
        "/api/user/register",
        "/api/user/check-username",
        "/user/login",
        "/user/register",
        "/user/check-username",
        "/api/auth/refresh",
        "/api/auth/parse",
        "/auth/refresh",
        "/auth/parse",
    ]
    .iter()
    .any(|prefix| path.starts_with(prefix))
}

fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    raw.split(';').find_map(|part| {
        let (key, value) = part.trim().split_once('=')?;
        (key.trim() == name)
            .then(|| value.trim().to_string())
            .filter(|value| !value.is_empty())
    })
}
