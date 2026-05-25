use super::*;
use crate::auth::identity_from_headers;
use crate::config::AppConfig;
use crate::error::AppError;
use crate::web::AppState;
use axum::body::Bytes;
use axum::extract::{OriginalUri, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use base64::Engine;
use hmac::{Hmac, Mac};
use im_rs_common::api::ApiResponse;
use redis::AsyncCommands;
use sha2::{Digest, Sha256};
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

const REFRESH_JTI_KEY_PREFIX: &str = "auth:refresh:jti:";
const WS_TICKET_KEY_PREFIX: &str = "auth:ws:ticket:";
const USER_RESOURCE_KEY_PREFIX: &str = "auth:user:";
const REVOKED_TOKEN_KEY_PREFIX: &str = "auth:revoked:token:";
const USER_REVOKE_AFTER_KEY_PREFIX: &str = "auth:user:revoke_after:";

const INTERNAL_TS_HEADER: &str = "X-Internal-Timestamp";
const LEGACY_INTERNAL_TS_HEADER: &str = "X-Internal-Ts";
const INTERNAL_NONCE_HEADER: &str = "X-Internal-Nonce";
const INTERNAL_SIGN_HEADER: &str = "X-Internal-Signature";


/// 签发一次性 WebSocket 握手票据。
///
/// **鉴权要求**：需要有效的 access token（通过 `identity_from_headers` 校验）。
///
/// **安全约束**：票据为 UUID v4，存入 Redis 并设 TTL，消费后立即删除（原子 Lua 脚本）。
/// 票据通过 Set-Cookie 下发，客户端在 WebSocket 握手时携带。
pub(crate) async fn issue_ws_ticket(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<(StatusCode, HeaderMap, Json<ApiResponse<WsTicketDto>>), AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let ticket = Uuid::new_v4().to_string();
    let ttl = state.config.ws_ticket_ttl_seconds;
    {
        let mut redis = state.redis_manager.clone();
        redis
            .set_ex::<_, _, ()>(
                format!("{}{}", WS_TICKET_KEY_PREFIX, ticket),
                format!("{}\n{}", identity.user_id, identity.username),
                ttl,
            )
            .await?;
    }
    let dto = WsTicketDto {
        ticket: Some(ticket.clone()),
        expires_in_ms: Some(ttl_seconds_to_ms(ttl)?),
    };
    let mut response_headers = HeaderMap::new();
    append_cookie(
        &mut response_headers,
        &state.config.ws_ticket_cookie_name,
        &ticket,
        ttl_seconds_to_ms(ttl)?,
        normalize_cookie_path(&state.config.ws_ticket_cookie_path),
        &state.config.ws_ticket_cookie_same_site,
        resolve_ws_ticket_cookie_secure(&state.config),
    )?;
    Ok((
        StatusCode::OK,
        response_headers,
        Json(ApiResponse::success(dto)),
    ))
}

/// 内部接口：消费一次性 WebSocket 票据。
///
/// **鉴权要求**：HMAC 内部签名。
///
/// **安全约束**：使用 Lua 脚本原子执行 GET+DEL，确保票据只能消费一次。
/// 校验票据中记录的 `user_id` 与请求中的 `user_id` 一致，防止票据被其他用户冒用。
pub(crate) async fn internal_consume_ws_ticket(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: Bytes,
) -> Result<Json<ApiResponse<WsTicketConsumeResultDto>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, &state.config)?;
    let request: ConsumeWsTicketRequest = required_json(&body)?;
    let Some(ticket) = normalize_text(request.ticket.as_deref()) else {
        return Ok(Json(ApiResponse::success(invalid_ws_ticket(
            "ticket is required",
        ))));
    };
    let Some(expected_user_id) = request.user_id else {
        return Ok(Json(ApiResponse::success(invalid_ws_ticket(
            "userId is required",
        ))));
    };
    let payload: Option<String> = {
        let mut redis = state.redis_manager.clone();
        redis::Script::new(
            "local payload = redis.call('GET', KEYS[1]); if not payload then return nil end; redis.call('DEL', KEYS[1]); return payload",
        )
        .key(format!("{}{}", WS_TICKET_KEY_PREFIX, ticket))
        .invoke_async(&mut redis)
        .await?
    };
    let Some(payload) = payload else {
        return Ok(Json(ApiResponse::success(invalid_ws_ticket(
            "ticket is invalid or expired",
        ))));
    };
    let Some((actual_user_id, username)) = parse_ws_ticket_payload(&payload) else {
        return Ok(Json(ApiResponse::success(invalid_ws_ticket(
            "ticket payload is invalid",
        ))));
    };
    if actual_user_id != expected_user_id {
        return Ok(Json(ApiResponse::success(WsTicketConsumeResultDto {
            valid: false,
            status: Some("USER_MISMATCH".to_string()),
            user_id: Some(actual_user_id),
            username: Some(username),
            error: Some("ticket userId mismatch".to_string()),
        })));
    }
    Ok(Json(ApiResponse::success(WsTicketConsumeResultDto {
        valid: true,
        status: Some("VALID".to_string()),
        user_id: Some(actual_user_id),
        username: Some(username),
        error: None,
    })))
}

pub(crate) fn resolve_ws_ticket_cookie_secure(config: &AppConfig) -> bool {
    matches!(
        config
            .ws_ticket_cookie_secure
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "true"
    )
}

pub(crate) fn invalid_ws_ticket(error: &str) -> WsTicketConsumeResultDto {
    WsTicketConsumeResultDto {
        valid: false,
        status: Some("INVALID".to_string()),
        error: Some(error.to_string()),
        ..Default::default()
    }
}

pub(crate) fn parse_ws_ticket_payload(payload: &str) -> Option<(i64, String)> {
    let (user_id, username) = payload.split_once('\n')?;
    Some((user_id.trim().parse().ok()?, username.trim().to_string()))
}

