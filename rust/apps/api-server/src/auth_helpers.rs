use super::*;
use crate::config::AppConfig;
use crate::error::AppError;
use axum::body::Bytes;
use axum::http::{header, HeaderMap, HeaderValue};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use hmac::{Hmac, Mac};
use im_common::time;
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use subtle::ConstantTimeEq;
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

const INTERNAL_TS_HEADER: &str = "X-Internal-Timestamp";
const INTERNAL_NONCE_HEADER: &str = "X-Internal-Nonce";
const INTERNAL_SIGN_HEADER: &str = "X-Internal-Signature";

/// 构造内部 HMAC-SHA256 签名请求头。
///
/// 生成 `X-Internal-Timestamp`、`X-Internal-Nonce`、`X-Internal-Signature` 三个头部，
/// 供内部服务间调用时的身份验证。签名的 canonical 格式为：
/// `method=POST&path=/api/...&bodyHash={sha256_base64_url}&ts={ms}&nonce={uuid}`。
pub(crate) fn internal_signature_headers(
    method: &str,
    path: &str,
    body: &[u8],
    config: &AppConfig,
) -> Result<HeaderMap, AppError> {
    let ts = time::now_ms().to_string();
    let nonce = Uuid::new_v4().to_string();
    let body_hash = sha256_base64_url(body);
    let canonical = internal_canonical(method, path, &body_hash, &ts, &nonce);
    let signature = sign_hmac(&config.internal_secret, &canonical)?;
    let mut headers = HeaderMap::new();
    headers.insert(
        INTERNAL_TS_HEADER,
        HeaderValue::from_str(&ts).map_err(|err| AppError::BadRequest(err.to_string()))?,
    );
    headers.insert(
        INTERNAL_NONCE_HEADER,
        HeaderValue::from_str(&nonce).map_err(|err| AppError::BadRequest(err.to_string()))?,
    );
    headers.insert(
        INTERNAL_SIGN_HEADER,
        HeaderValue::from_str(&signature).map_err(|err| AppError::BadRequest(err.to_string()))?,
    );
    Ok(headers)
}

/// 将 access/refresh token 追加为 HttpOnly Set-Cookie。
///
/// `Secure` 属性根据 `config.auth_cookie_secure` 和请求头中的 `x-forwarded-proto` 决定
/// （支持 `true`/`false`/`auto` 三种模式）。
pub(crate) fn append_auth_cookies(
    response_headers: &mut HeaderMap,
    config: &AppConfig,
    token_pair: &TokenPairDto,
    request_headers: &HeaderMap,
) -> Result<(), AppError> {
    let secure = resolve_cookie_secure(config, request_headers);
    if let Some(access) = token_pair.access_token.as_deref() {
        append_cookie(
            response_headers,
            &config.access_cookie_name,
            access,
            token_pair.expires_in_ms.unwrap_or_default(),
            "/",
            &config.auth_cookie_same_site,
            secure,
        )?;
    }
    if let Some(refresh) = token_pair.refresh_token.as_deref() {
        append_cookie(
            response_headers,
            &config.refresh_cookie_name,
            refresh,
            token_pair.refresh_expires_in_ms.unwrap_or_default(),
            "/",
            &config.auth_cookie_same_site,
            secure,
        )?;
    }
    Ok(())
}

/// 立即过期所有认证相关的 Cookie（access、refresh、ws-ticket）。
///
/// 用于登出场景，通过设置 `Max-Age=0` 使浏览器删除对应 Cookie。
pub(crate) fn expire_auth_cookies(
    response_headers: &mut HeaderMap,
    config: &AppConfig,
    request_headers: &HeaderMap,
) {
    let secure = resolve_cookie_secure(config, request_headers);
    expire_cookie(response_headers, &config.access_cookie_name, secure);
    expire_cookie(response_headers, &config.refresh_cookie_name, secure);
    expire_cookie(response_headers, &config.ws_ticket_cookie_name, secure);
}

pub(crate) fn internal_canonical(
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

pub(crate) fn normalize_path(path: &str) -> String {
    let Some(without_query) = path.split('?').next() else {
        return path.to_string();
    };
    let without_query = without_query.to_string();
    if without_query.starts_with('/') {
        without_query.to_string()
    } else {
        format!("/{without_query}")
    }
}

pub(crate) fn ttl_seconds_to_ms(ttl_seconds: u64) -> Result<i64, AppError> {
    let ttl = i64::try_from(ttl_seconds)
        .map_err(|_| AppError::BadRequest("ttl seconds is too large".to_string()))?;
    ttl.checked_mul(1_000)
        .ok_or_else(|| AppError::BadRequest("ttl milliseconds overflow".to_string()))
}

pub(crate) fn within_skew(timestamp_ms: i64, allowed_skew_ms: i64) -> bool {
    time::now_ms()
        .checked_sub(timestamp_ms)
        .and_then(i64::checked_abs)
        .is_some_and(|delta| delta <= allowed_skew_ms)
}

pub(crate) fn sign_hmac(secret: &str, canonical: &str) -> Result<String, AppError> {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|error| AppError::BadRequest(format!("invalid hmac key: {error}")))?;
    mac.update(canonical.as_bytes());
    Ok(URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes()))
}

pub(crate) fn verify_hmac(
    secret: &str,
    canonical: &str,
    signature: &str,
) -> Result<bool, AppError> {
    Ok(sign_hmac(secret, canonical)?
        .as_bytes()
        .ct_eq(signature.as_bytes())
        .into())
}

pub(crate) fn sha256_base64_url(value: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(value))
}

pub(crate) fn sha256_hex(value: &str) -> String {
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub(crate) fn normalize_bearer(token: Option<&str>) -> Option<String> {
    let mut value = token?.trim().to_string();
    if let Some(unquoted) = value
        .strip_prefix('"')
        .and_then(|inner| inner.strip_suffix('"'))
    {
        value = unquoted.trim().to_string();
    }
    if let Some(rest) = value.strip_prefix("Bearer ") {
        value = rest.trim().to_string();
    }
    (!value.is_empty()).then_some(value)
}

pub(crate) fn body_text(body: &Bytes) -> String {
    normalize_bearer(std::str::from_utf8(body).ok()).unwrap_or_default()
}

pub(crate) fn optional_json<T>(body: &Bytes) -> Result<T, AppError>
where
    T: for<'de> Deserialize<'de> + Default,
{
    if body.is_empty() {
        return Ok(T::default());
    }
    Ok(serde_json::from_slice(body)?)
}

pub(crate) fn required_json<T>(body: &Bytes) -> Result<T, AppError>
where
    T: for<'de> Deserialize<'de>,
{
    Ok(serde_json::from_slice(body)?)
}

pub(crate) fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    raw.split(';').find_map(|part| {
        let (key, value) = part.trim().split_once('=')?;
        (key.trim() == name)
            .then(|| value.trim().to_string())
            .filter(|value| !value.is_empty())
    })
}

pub(crate) fn append_cookie(
    headers: &mut HeaderMap,
    name: &str,
    value: &str,
    max_age_ms: i64,
    path: &str,
    same_site: &str,
    secure: bool,
) -> Result<(), AppError> {
    let max_age = if max_age_ms <= 0 {
        -1
    } else {
        max_age_ms / 1000
    };
    let secure_attr = if secure { "; Secure" } else { "" };
    headers.append(
        header::SET_COOKIE,
        HeaderValue::from_str(&format!(
            "{name}={value}; Max-Age={max_age}; Path={}; HttpOnly; SameSite={}{}",
            normalize_cookie_path(path),
            normalize_same_site(same_site),
            secure_attr
        ))
        .map_err(|err| AppError::BadRequest(err.to_string()))?,
    );
    Ok(())
}

pub(crate) fn expire_cookie(headers: &mut HeaderMap, name: &str, secure: bool) {
    let secure_attr = if secure { "; Secure" } else { "" };
    if let Ok(value) = HeaderValue::from_str(&format!(
        "{name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax{secure_attr}"
    )) {
        headers.append(header::SET_COOKIE, value);
    }
}

pub(crate) fn normalize_cookie_path(path: &str) -> &str {
    if path.trim().starts_with('/') {
        path.trim()
    } else {
        "/"
    }
}

pub(crate) fn normalize_same_site(value: &str) -> &str {
    if value.trim().is_empty() {
        "Lax"
    } else {
        value.trim()
    }
}

pub(crate) fn resolve_cookie_secure(config: &AppConfig, request_headers: &HeaderMap) -> bool {
    match config
        .auth_cookie_secure
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "true" => true,
        "auto" => request_headers
            .get("x-forwarded-proto")
            .and_then(|v| v.to_str().ok())
            .map(|v| v.eq_ignore_ascii_case("https"))
            .unwrap_or(false),
        _ => false,
    }
}

pub(crate) fn normalize_text(raw: Option<&str>) -> Option<String> {
    let value = raw?.trim();
    (!value.is_empty()).then(|| value.to_string())
}

pub(crate) fn insert_value(map: &mut HashMap<String, Value>, key: &str, value: Option<Value>) {
    if let Some(value) = value {
        map.insert(key.to_string(), value);
    }
}

pub(crate) fn is_admin(config: &AppConfig, request: &IssueTokenRequest) -> bool {
    let Some(user_id) = request.user_id else {
        return false;
    };
    let username = request
        .username
        .as_deref()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    config.admin_user_ids.contains(&user_id)
        || (!username.is_empty()
            && config
                .admin_usernames
                .iter()
                .any(|configured| configured.eq_ignore_ascii_case(&username)))
}

pub(crate) fn header_value(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}
