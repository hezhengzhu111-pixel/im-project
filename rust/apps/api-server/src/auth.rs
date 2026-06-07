use crate::config::AppConfig;
use crate::error::AppError;
use axum::http::{header, HeaderMap};
use im_common::auth::{parse_bearer, validate_access_token, Identity};

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
    .any(|prefix| path == *prefix || path.starts_with(&format!("{prefix}/")))
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

#[cfg(test)]
mod auth_whitelist_tests {
    use super::is_gateway_whitelist;

    // ── 正确命中白名单 ──────────────────────────────────

    #[test]
    fn exact_match_login() {
        assert!(is_gateway_whitelist("/api/user/login"));
    }

    #[test]
    fn exact_match_register() {
        assert!(is_gateway_whitelist("/api/user/register"));
    }

    #[test]
    fn exact_match_check_username() {
        assert!(is_gateway_whitelist("/api/user/check-username"));
    }

    #[test]
    fn exact_match_auth_parse() {
        assert!(is_gateway_whitelist("/api/auth/parse"));
    }

    #[test]
    fn exact_match_auth_refresh() {
        assert!(is_gateway_whitelist("/api/auth/refresh"));
    }

    #[test]
    fn exact_match_health() {
        assert!(is_gateway_whitelist("/health"));
    }

    #[test]
    fn exact_match_ready() {
        assert!(is_gateway_whitelist("/ready"));
    }

    #[test]
    fn subpath_of_login() {
        // /api/user/login/extra 应该命中，因为它是 /api/user/login/ 的子路径
        assert!(is_gateway_whitelist("/api/user/login/extra"));
    }

    #[test]
    fn subpath_of_swagger_ui() {
        assert!(is_gateway_whitelist("/swagger-ui/index.html"));
    }

    #[test]
    fn subpath_of_actuator() {
        assert!(is_gateway_whitelist("/actuator/health"));
    }

    #[test]
    fn subpath_of_api_docs() {
        assert!(is_gateway_whitelist("/v3/api-docs/swagger-config"));
    }

    // ── 不应命中白名单（路径边界防护）─────────────────────

    #[test]
    fn reject_login_xyz() {
        assert!(!is_gateway_whitelist("/api/user/loginXYZ"));
    }

    #[test]
    fn reject_parse_anything() {
        assert!(!is_gateway_whitelist("/api/auth/parseAnything"));
    }

    #[test]
    fn reject_refresh_token() {
        assert!(!is_gateway_whitelist("/api/auth/refreshToken"));
    }

    #[test]
    fn reject_register_extra() {
        assert!(!is_gateway_whitelist("/api/user/registerExtra"));
    }

    #[test]
    fn reject_healthcheck() {
        assert!(!is_gateway_whitelist("/healthcheck"));
    }

    #[test]
    fn reject_readystate() {
        assert!(!is_gateway_whitelist("/readystate"));
    }

    #[test]
    fn reject_actuatorx() {
        assert!(!is_gateway_whitelist("/actuatorX"));
    }

    #[test]
    fn reject_swagger_uix() {
        assert!(!is_gateway_whitelist("/swagger-uiX"));
    }

    #[test]
    fn reject_completely_unrelated() {
        assert!(!is_gateway_whitelist("/api/admin/dashboard"));
    }

    #[test]
    fn reject_empty_path() {
        assert!(!is_gateway_whitelist(""));
    }
}
