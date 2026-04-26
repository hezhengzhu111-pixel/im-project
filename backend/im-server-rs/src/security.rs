use crate::config::AppConfig;
use crate::dto::now_ms;
use crate::error::AppError;
use axum::http::HeaderMap;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

const INTERNAL_TS_HEADER: &str = "X-Internal-Timestamp";
const INTERNAL_NONCE_HEADER: &str = "X-Internal-Nonce";
const INTERNAL_SIGN_HEADER: &str = "X-Internal-Signature";
const AUTH_USER_HEADER: &str = "X-Auth-User";
const AUTH_PERMS_HEADER: &str = "X-Auth-Perms";
const AUTH_DATA_HEADER: &str = "X-Auth-Data";
const AUTH_TS_HEADER: &str = "X-Auth-Ts";
const AUTH_NONCE_HEADER: &str = "X-Auth-Nonce";
const AUTH_SIGN_HEADER: &str = "X-Auth-Sign";

pub fn validate_internal_signature(
    headers: &HeaderMap,
    method: &str,
    path: &str,
    body: &[u8],
    config: &AppConfig,
) -> Result<(), AppError> {
    let ts = header(headers, INTERNAL_TS_HEADER).ok_or_else(AppError::internal_auth_rejected)?;
    let nonce =
        header(headers, INTERNAL_NONCE_HEADER).ok_or_else(AppError::internal_auth_rejected)?;
    let sign =
        header(headers, INTERNAL_SIGN_HEADER).ok_or_else(AppError::internal_auth_rejected)?;
    let timestamp = ts
        .parse::<i64>()
        .map_err(|_| AppError::internal_auth_rejected())?;
    if !within_skew(timestamp, config.internal_max_skew_ms) {
        return Err(AppError::internal_auth_rejected());
    }

    let body_hash = sha256_base64_url(body);
    let canonical = build_internal_canonical(method, path, &body_hash, &ts, &nonce);
    verify_hmac(&config.internal_secret, &canonical, &sign)
        .then_some(())
        .ok_or_else(AppError::internal_auth_rejected)
}

pub fn validate_gateway_ws_identity(
    headers: &HeaderMap,
    config: &AppConfig,
) -> Result<(i64, String), AppError> {
    let user_id_raw = header(headers, &config.gateway_user_id_header)
        .ok_or_else(AppError::internal_auth_rejected)?;
    if user_id_raw.trim().is_empty() {
        return Err(AppError::internal_auth_rejected());
    }
    let user_id = user_id_raw
        .trim()
        .parse::<i64>()
        .map_err(|_| AppError::internal_auth_rejected())?;
    let username = header(headers, &config.gateway_username_header)
        .ok_or_else(AppError::internal_auth_rejected)?;
    if username.trim().is_empty() {
        return Err(AppError::internal_auth_rejected());
    }

    let user_b64 =
        header(headers, AUTH_USER_HEADER).ok_or_else(AppError::internal_auth_rejected)?;
    let perms_b64 =
        header(headers, AUTH_PERMS_HEADER).ok_or_else(AppError::internal_auth_rejected)?;
    let data_b64 =
        header(headers, AUTH_DATA_HEADER).ok_or_else(AppError::internal_auth_rejected)?;
    let ts = header(headers, AUTH_TS_HEADER).ok_or_else(AppError::internal_auth_rejected)?;
    let nonce = header(headers, AUTH_NONCE_HEADER).ok_or_else(AppError::internal_auth_rejected)?;
    let sign = header(headers, AUTH_SIGN_HEADER).ok_or_else(AppError::internal_auth_rejected)?;
    let timestamp = ts
        .parse::<i64>()
        .map_err(|_| AppError::internal_auth_rejected())?;
    if !within_skew(timestamp, config.gateway_auth_max_skew_ms) {
        return Err(AppError::internal_auth_rejected());
    }

    let canonical = build_gateway_canonical(
        &user_id.to_string(),
        username.trim(),
        &user_b64,
        &perms_b64,
        &data_b64,
        &ts,
        &nonce,
    );
    verify_hmac(&config.gateway_auth_secret, &canonical, &sign)
        .then_some((user_id, username.trim().to_string()))
        .ok_or_else(AppError::internal_auth_rejected)
}

pub fn internal_signature_headers(
    method: &str,
    path: &str,
    body: &[u8],
    config: &AppConfig,
) -> Vec<(String, String)> {
    let ts = now_ms().to_string();
    let nonce = uuid::Uuid::new_v4().to_string();
    let body_hash = sha256_base64_url(body);
    let canonical = build_internal_canonical(method, path, &body_hash, &ts, &nonce);
    let sign = sign_hmac(&config.internal_secret, &canonical);
    vec![
        (INTERNAL_TS_HEADER.to_string(), ts),
        (INTERNAL_NONCE_HEADER.to_string(), nonce),
        (INTERNAL_SIGN_HEADER.to_string(), sign),
    ]
}

pub fn sha256_base64_url(value: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(value))
}

pub fn sign_hmac(secret: &str, canonical: &str) -> String {
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("hmac accepts any key length");
    mac.update(canonical.as_bytes());
    URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
}

fn build_internal_canonical(
    method: &str,
    path: &str,
    body_hash: &str,
    ts: &str,
    nonce: &str,
) -> String {
    format!(
        "method={}&path={}&bodyHash={}&ts={}&nonce={}",
        method.trim().to_ascii_uppercase(),
        normalize_path(path),
        body_hash,
        ts,
        nonce
    )
}

fn build_gateway_canonical(
    user_id: &str,
    username: &str,
    user: &str,
    perms: &str,
    data: &str,
    ts: &str,
    nonce: &str,
) -> String {
    format!(
        "userId={}&username={}&user={}&perms={}&data={}&ts={}&nonce={}",
        user_id, username, user, perms, data, ts, nonce
    )
}

fn verify_hmac(secret: &str, canonical: &str, signature: &str) -> bool {
    let expected = sign_hmac(secret, canonical);
    expected.as_bytes().ct_eq(signature.as_bytes()).into()
}

fn within_skew(timestamp_ms: i64, allowed_skew_ms: i64) -> bool {
    let now = now_ms();
    (now - timestamp_ms).abs() <= allowed_skew_ms
}

fn normalize_path(path: &str) -> String {
    let without_query = path.split('?').next().unwrap_or("/");
    if without_query.starts_with('/') {
        without_query.to_string()
    } else {
        format!("/{}", without_query)
    }
}

fn header(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn should_verify_internal_signature() {
        let mut cfg = AppConfig::from_env();
        cfg.internal_secret = "secret".to_string();
        let ts = now_ms().to_string();
        let nonce = "n1";
        let body = br#"["7"]"#;
        let body_hash = sha256_base64_url(body);
        let canonical =
            build_internal_canonical("POST", "/api/im/online-status", &body_hash, &ts, nonce);
        let sign = sign_hmac("secret", &canonical);
        let mut headers = HeaderMap::new();
        headers.insert(INTERNAL_TS_HEADER, HeaderValue::from_str(&ts).unwrap());
        headers.insert(INTERNAL_NONCE_HEADER, HeaderValue::from_static(nonce));
        headers.insert(INTERNAL_SIGN_HEADER, HeaderValue::from_str(&sign).unwrap());

        assert!(
            validate_internal_signature(&headers, "POST", "/api/im/online-status", body, &cfg)
                .is_ok()
        );
    }

    #[test]
    fn should_reject_internal_signature_when_body_changes() {
        let mut cfg = AppConfig::from_env();
        cfg.internal_secret = "secret".to_string();
        let ts = now_ms().to_string();
        let nonce = "n1";
        let body_hash = sha256_base64_url(b"{}");
        let canonical =
            build_internal_canonical("POST", "/api/im/online-status", &body_hash, &ts, nonce);
        let sign = sign_hmac("secret", &canonical);
        let mut headers = HeaderMap::new();
        headers.insert(INTERNAL_TS_HEADER, HeaderValue::from_str(&ts).unwrap());
        headers.insert(INTERNAL_NONCE_HEADER, HeaderValue::from_static(nonce));
        headers.insert(INTERNAL_SIGN_HEADER, HeaderValue::from_str(&sign).unwrap());

        assert!(validate_internal_signature(
            &headers,
            "POST",
            "/api/im/online-status",
            b"changed",
            &cfg
        )
        .is_err());
    }

    #[test]
    fn should_verify_gateway_ws_signature_without_trusting_path_user_id() {
        let mut cfg = AppConfig::from_env();
        cfg.gateway_auth_secret = "gateway".to_string();
        let user = "eyJpZCI6N30";
        let perms = "W10";
        let data = "e30";
        let ts = now_ms().to_string();
        let nonce = "nonce-1";
        let canonical = build_gateway_canonical("7", "alice", user, perms, data, &ts, nonce);
        let sign = sign_hmac("gateway", &canonical);
        let mut headers = HeaderMap::new();
        headers.insert("X-User-Id", HeaderValue::from_static("7"));
        headers.insert("X-Username", HeaderValue::from_static("alice"));
        headers.insert(AUTH_USER_HEADER, HeaderValue::from_static(user));
        headers.insert(AUTH_PERMS_HEADER, HeaderValue::from_static(perms));
        headers.insert(AUTH_DATA_HEADER, HeaderValue::from_static(data));
        headers.insert(AUTH_TS_HEADER, HeaderValue::from_str(&ts).unwrap());
        headers.insert(AUTH_NONCE_HEADER, HeaderValue::from_static(nonce));
        headers.insert(AUTH_SIGN_HEADER, HeaderValue::from_str(&sign).unwrap());

        assert_eq!(
            (7, "alice".to_string()),
            validate_gateway_ws_identity(&headers, &cfg).unwrap()
        );
    }

    #[test]
    fn should_reject_gateway_ws_identity_without_signature() {
        let mut cfg = AppConfig::from_env();
        cfg.gateway_auth_secret = "gateway".to_string();
        let mut headers = HeaderMap::new();
        headers.insert("X-User-Id", HeaderValue::from_static("7"));
        headers.insert("X-Username", HeaderValue::from_static("alice"));

        assert!(validate_gateway_ws_identity(&headers, &cfg).is_err());
    }
}
