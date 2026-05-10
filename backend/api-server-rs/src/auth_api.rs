use crate::auth::identity_from_headers;
use crate::config::AppConfig;
use crate::error::AppError;
use crate::web::AppState;
use axum::body::Bytes;
use axum::extract::{OriginalUri, Path, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::Json;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use hmac::{Hmac, Mac};
use im_rs_common::api::ApiResponse;
use im_rs_common::time;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use redis::AsyncCommands;
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use subtle::ConstantTimeEq;
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

/// JWT access/refresh 令牌对。
///
/// 由 [`issue_token_pair`] 签发，access token 有效期较短（默认由 `jwt_expiration_ms` 控制），
/// refresh token 有效期较长（由 `refresh_expiration_ms` 控制）。
/// 两者均使用 HS512 算法签名，secret 长度不少于 64 字节。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TokenPairDto {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_in_ms: Option<i64>,
    pub refresh_expires_in_ms: Option<i64>,
}

/// 刷新令牌成功后返回给客户端的响应体。
///
/// 仅暴露新令牌的过期时间，不重复返回 token 本身（token 通过 Set-Cookie 下发）。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RefreshResponseDto {
    pub expires_in_ms: Option<i64>,
    pub refresh_expires_in_ms: Option<i64>,
    pub authenticated: bool,
}

/// Token 解析结果 DTO，用于 `/auth/parse` 等公开端点。
///
/// 当 `valid=false` 或 `expired=true` 时，身份字段（`user_id`、`username` 等）会被清空，
/// 以防止客户端误用过期或无效的身份信息。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TokenParseResultDto {
    pub valid: bool,
    pub expired: bool,
    pub error: Option<String>,
    #[serde(
        default,
        deserialize_with = "deserialize_option_i64",
        serialize_with = "serialize_option_i64_as_string"
    )]
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub token_type: Option<String>,
    pub jti: Option<String>,
    pub issued_at_epoch_ms: Option<i64>,
    pub expires_at_epoch_ms: Option<i64>,
    pub permissions: Option<Vec<String>>,
}

impl TokenParseResultDto {
    fn clear_identity(&mut self) {
        self.user_id = None;
        self.username = None;
        self.token_type = None;
        self.jti = None;
        self.issued_at_epoch_ms = None;
        self.expires_at_epoch_ms = None;
        self.permissions = None;
    }
}

/// 内省（introspect）结果 DTO，由 `/auth/internal/introspect` 返回。
///
/// 与 [`TokenParseResultDto`] 不同，此结构额外包含 `user_info`、`resource_permissions`
/// 和 `data_scopes`，供内部服务做细粒度鉴权决策。
/// 仅限内部 HMAC 签名校验通过后才可调用。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuthIntrospectResultDto {
    pub valid: bool,
    pub expired: bool,
    #[serde(
        default,
        deserialize_with = "deserialize_option_i64",
        serialize_with = "serialize_option_i64_as_string"
    )]
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub issued_at_epoch_ms: Option<i64>,
    pub expires_at_epoch_ms: Option<i64>,
    pub jti: Option<String>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub user_info: HashMap<String, Value>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub resource_permissions: Vec<String>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub data_scopes: HashMap<String, Value>,
}

/// 用户资源信息 DTO，包含用户元数据、权限列表和数据范围。
///
/// 缓存在 Redis（key: `auth:user:{user_id}`），TTL 由 `resource_cache_ttl_seconds` 控制。
/// 管理员用户会自动注入 `admin`、`file:delete`、`file:read`、`log:read` 权限。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuthUserResourceDto {
    #[serde(
        default,
        deserialize_with = "deserialize_option_i64",
        serialize_with = "serialize_option_i64_as_string"
    )]
    pub user_id: Option<i64>,
    pub username: Option<String>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub user_info: HashMap<String, Value>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub resource_permissions: Vec<String>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub data_scopes: HashMap<String, Value>,
}

/// 内部签发令牌请求体，由 `/auth/internal/token` 使用。
///
/// 需要 HMAC 内部签名。`user_id` 和 `username` 为必填。
/// `permissions` 中的权限会被写入 Redis 用户资源缓存；管理员用户自动追加管理权限。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct IssueTokenRequest {
    #[serde(default, deserialize_with = "deserialize_option_i64")]
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub nickname: Option<String>,
    pub avatar: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub permissions: Vec<String>,
}

/// 刷新令牌请求体，支持从请求体 JSON 或 Cookie 中获取 refresh token。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RefreshTokenRequest {
    pub refresh_token: Option<String>,
    pub access_token: Option<String>,
}

/// 解析令牌请求体。`token` 为空时自动从 Cookie 中提取。
/// `allow_expired=true` 时会返回过期令牌的身份信息（但 `valid` 仍为 `false`）。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ParseTokenRequest {
    pub token: Option<String>,
    pub allow_expired: Option<bool>,
}

/// 权限校验请求体，由 `/auth/internal/check-permission` 使用。
///
/// 支持三种匹配模式：精确权限（`permission`）、资源+动作（`resource`+`action`）、
/// 通配符（`resource:*`）。拥有 `*` 或 `admin` 权限的用户始终通过。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CheckPermissionRequest {
    #[serde(default, deserialize_with = "deserialize_option_i64")]
    pub user_id: Option<i64>,
    pub permission: Option<String>,
    pub resource: Option<String>,
    pub action: Option<String>,
}

/// 权限校验结果 DTO。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PermissionCheckResultDto {
    #[serde(
        default,
        deserialize_with = "deserialize_option_i64",
        serialize_with = "serialize_option_i64_as_string"
    )]
    pub user_id: Option<i64>,
    pub permission: Option<String>,
    pub resource: Option<String>,
    pub action: Option<String>,
    pub granted: bool,
    pub reason: Option<String>,
}

/// 撤销单个令牌请求体，由 `/auth/internal/revoke-token` 使用。
///
/// 被撤销的令牌哈希存入 Redis 黑名单（key: `auth:revoked:token:{hash}`），
/// TTL 由 `revoked_token_ttl_seconds` 控制。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RevokeTokenRequest {
    pub token: Option<String>,
    pub reason: Option<String>,
}

/// 令牌撤销结果 DTO。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TokenRevokeResultDto {
    pub success: bool,
    pub message: Option<String>,
    #[serde(
        default,
        deserialize_with = "deserialize_option_i64",
        serialize_with = "serialize_option_i64_as_string"
    )]
    pub user_id: Option<i64>,
    pub token_type: Option<String>,
}

/// WebSocket 票据 DTO，由 `/auth/ws-ticket` 签发。
///
/// 票据为一次性使用（消费后立即删除），存于 Redis（key: `auth:ws:ticket:{ticket}`），
/// TTL 由 `ws_ticket_ttl_seconds` 控制。客户端在 WebSocket 握手时通过 Cookie 或查询参数携带。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WsTicketDto {
    pub ticket: Option<String>,
    pub expires_in_ms: Option<i64>,
}

/// 消费 WebSocket 票据请求体，由 `/auth/internal/ws-ticket/consume` 使用。
///
/// 仅限内部服务（经 HMAC 签名校验）调用。消费操作是原子的（Lua GET+DEL），
/// 确保同一票据不会被重复使用。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConsumeWsTicketRequest {
    pub ticket: Option<String>,
    #[serde(default, deserialize_with = "deserialize_option_i64")]
    pub user_id: Option<i64>,
}

/// WebSocket 票据消费结果 DTO。
///
/// `valid=true` 且 `status="VALID"` 表示票据有效且用户匹配；
/// `status="USER_MISMATCH"` 表示票据有效但请求的 `user_id` 与票据记录不一致；
/// `status="INVALID"` 表示票据无效或已过期。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WsTicketConsumeResultDto {
    pub valid: bool,
    pub status: Option<String>,
    #[serde(
        default,
        deserialize_with = "deserialize_option_i64",
        serialize_with = "serialize_option_i64_as_string"
    )]
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Claims {
    #[serde(rename = "userId")]
    user_id: i64,
    username: String,
    typ: String,
    jti: String,
    sub: String,
    iat: i64,
    exp: i64,
}

/// 刷新 access token。
///
/// **鉴权要求**：客户端需提供有效的 refresh token（通过请求体或 Cookie）。
///
/// **安全约束**：使用 Redis Lua CAS 脚本原子比对 refresh JTI，防止并发刷新竞态。
/// 刷新成功后会同时签发新的 access + refresh 令牌对，并通过 Set-Cookie 下发。
///
/// **返回**：新的令牌过期时间信息，token 本身仅通过 HttpOnly Cookie 传递。
pub async fn refresh(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<(StatusCode, HeaderMap, Json<ApiResponse<RefreshResponseDto>>), AppError> {
    let mut request: RefreshTokenRequest = optional_json(&body)?;
    if request.refresh_token.as_deref().is_none_or(str::is_empty) {
        request.refresh_token = cookie_value(&headers, &state.config.refresh_cookie_name);
    }
    let token_pair = refresh_token_pair(&state, request).await?;
    let mut response_headers = HeaderMap::new();
    append_auth_cookies(&mut response_headers, &state.config, &token_pair, &headers)?;
    let response = RefreshResponseDto {
        expires_in_ms: token_pair.expires_in_ms,
        refresh_expires_in_ms: token_pair.refresh_expires_in_ms,
        authenticated: true,
    };
    Ok((
        StatusCode::OK,
        response_headers,
        Json(ApiResponse::success(response)),
    ))
}

/// 解析 access token，返回身份和权限信息。
///
/// **鉴权要求**：无（公开端点）。token 从请求体或 Cookie 中提取。
///
/// **返回**：有效时返回 `valid=true` 及身份信息；过期时 `expired=true` 且身份字段被清空。
pub async fn parse(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<ApiResponse<TokenParseResultDto>>, AppError> {
    let request: ParseTokenRequest = optional_json(&body)?;
    let token = request
        .token
        .or_else(|| cookie_value(&headers, &state.config.access_cookie_name));
    let allow_expired = request.allow_expired.unwrap_or(false);
    let mut parsed = parse_token(token.as_deref(), &state.config.jwt_secret, allow_expired);
    if parsed.valid && !parsed.expired {
        if let Some(user_id) = parsed.user_id {
            let resource = match get_user_resource(&state, user_id).await {
                Ok(resource) => resource,
                Err(error) => {
                    tracing::warn!(user_id, error = %error, "failed to load user resource in parse, using empty permissions");
                    Default::default()
                }
            };
            parsed.permissions = Some(resource.resource_permissions);
        }
    }
    Ok(Json(ApiResponse::success(parsed)))
}

/// 签发一次性 WebSocket 握手票据。
///
/// **鉴权要求**：需要有效的 access token（通过 `identity_from_headers` 校验）。
///
/// **安全约束**：票据为 UUID v4，存入 Redis 并设 TTL，消费后立即删除（原子 Lua 脚本）。
/// 票据通过 Set-Cookie 下发，客户端在 WebSocket 握手时携带。
pub async fn issue_ws_ticket(
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

/// 内部接口：签发 JWT 令牌对。
///
/// **鉴权要求**：HMAC-SHA256 内部签名（`X-Internal-Signature` + `X-Internal-Timestamp` + `X-Internal-Nonce`）。
///
/// **安全约束**：签名验证通过 `validate_internal_signature`，包含时间戳偏移校验
/// （`internal_max_skew_ms`）和 nonce 防重放。签发的 access/refresh token 使用 HS512，
/// secret 长度不少于 64 字节。
pub async fn internal_issue_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: Bytes,
) -> Result<Json<ApiResponse<TokenPairDto>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, &state.config)?;
    let request: IssueTokenRequest = required_json(&body)?;
    Ok(Json(ApiResponse::success(
        issue_token_pair(&state, request).await?,
    )))
}

/// 内部接口：查询指定用户的资源信息（权限、用户元数据、数据范围）。
///
/// **鉴权要求**：HMAC 内部签名。
///
/// **返回**：从 Redis 缓存读取用户资源；缓存未命中时返回仅含 `user_id` 的默认结构。
pub async fn internal_user_resource(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    Path(user_id): Path<i64>,
) -> Result<Json<ApiResponse<AuthUserResourceDto>>, AppError> {
    validate_internal_signature(&headers, "GET", uri.path(), &[], &state.config)?;
    Ok(Json(ApiResponse::success(
        get_user_resource(&state, user_id).await?,
    )))
}

/// 内部接口：验证 access token 有效性并返回解析结果。
///
/// **鉴权要求**：HMAC 内部签名。
///
/// **安全约束**：当 `token_revocation_check_enabled` 开启时，会检查令牌黑名单和用户级撤销时间戳。
/// 无效或已撤销的令牌直接返回 `AppError::Unauthorized`。
pub async fn internal_validate_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: Bytes,
) -> Result<Json<ApiResponse<TokenParseResultDto>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, &state.config)?;
    let token = body_text(&body);
    Ok(Json(ApiResponse::success(
        validate_access_token_result(&state, &token, state.config.token_revocation_check_enabled)
            .await?,
    )))
}

/// 内部接口：内省 access token，返回完整的身份 + 权限 + 数据范围。
///
/// **鉴权要求**：HMAC 内部签名。
///
/// **返回**：比 `internal_validate_token` 更丰富，包含 `user_info`、`resource_permissions`、`data_scopes`。
/// 主要供 im-server 等内部服务做细粒度鉴权决策。
pub async fn internal_introspect(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: Bytes,
) -> Result<Json<ApiResponse<AuthIntrospectResultDto>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, &state.config)?;
    let token = body_text(&body);
    let parsed =
        validate_access_token_result(&state, &token, state.config.token_revocation_check_enabled)
            .await?;
    let user_id = parsed
        .user_id
        .ok_or_else(|| AppError::Unauthorized("TOKEN_INVALID".to_string()))?;
    let resource = get_user_resource(&state, user_id).await?;
    Ok(Json(ApiResponse::success(AuthIntrospectResultDto {
        valid: true,
        expired: false,
        user_id: Some(user_id),
        username: resource.username.or(parsed.username),
        issued_at_epoch_ms: parsed.issued_at_epoch_ms,
        expires_at_epoch_ms: parsed.expires_at_epoch_ms,
        jti: parsed.jti,
        user_info: resource.user_info,
        resource_permissions: resource.resource_permissions,
        data_scopes: resource.data_scopes,
    })))
}

/// 内部接口：校验用户是否拥有指定权限。
///
/// **鉴权要求**：HMAC 内部签名。
///
/// **返回**：`granted=true` 表示权限通过。支持精确匹配、资源:动作匹配和通配符匹配。
pub async fn internal_check_permission(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: Bytes,
) -> Result<Json<ApiResponse<PermissionCheckResultDto>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, &state.config)?;
    let request: CheckPermissionRequest = required_json(&body)?;
    Ok(Json(ApiResponse::success(
        check_permission(&state, request).await?,
    )))
}

/// 内部接口：撤销单个 access token。
///
/// **鉴权要求**：HMAC 内部签名。
///
/// **安全约束**：将令牌的 SHA-256 哈希写入 Redis 黑名单（key: `auth:revoked:token:{hash}`），
/// TTL 由 `revoked_token_ttl_seconds` 控制。后续验证时会检查此黑名单。
pub async fn internal_revoke_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: Bytes,
) -> Result<Json<ApiResponse<TokenRevokeResultDto>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, &state.config)?;
    let request: RevokeTokenRequest = required_json(&body)?;
    Ok(Json(ApiResponse::success(
        revoke_token(&state, request).await?,
    )))
}

/// 内部接口：撤销指定用户的所有令牌（用户级撤销）。
///
/// **鉴权要求**：HMAC 内部签名。
///
/// **安全约束**：写入用户级撤销时间戳（key: `auth:user:revoke_after:{user_id}`），
/// 签发时间早于此时间戳的所有令牌均被视为无效。同时清除该用户的 refresh JTI 和资源缓存。
pub async fn internal_revoke_user_tokens(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    Path(user_id): Path<i64>,
    body: Bytes,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, &state.config)?;
    {
        let mut redis = state.redis_manager.clone();
        redis
            .set_ex::<_, _, ()>(
                format!("{}{}", USER_REVOKE_AFTER_KEY_PREFIX, user_id),
                time::now_ms().to_string(),
                state.config.revoked_token_ttl_seconds,
            )
            .await?;
        redis
            .del::<_, ()>(format!("{}{}", REFRESH_JTI_KEY_PREFIX, user_id))
            .await?;
        redis
            .del::<_, ()>(format!("{}{}", USER_RESOURCE_KEY_PREFIX, user_id))
            .await?;
    }
    Ok(Json(ApiResponse::success(true)))
}

/// 内部接口：消费一次性 WebSocket 票据。
///
/// **鉴权要求**：HMAC 内部签名。
///
/// **安全约束**：使用 Lua 脚本原子执行 GET+DEL，确保票据只能消费一次。
/// 校验票据中记录的 `user_id` 与请求中的 `user_id` 一致，防止票据被其他用户冒用。
pub async fn internal_consume_ws_ticket(
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

/// 签发 JWT access + refresh 令牌对。
///
/// 同时将用户资源信息写入 Redis 缓存，将 refresh JTI 写入 Redis 用于后续 CAS 刷新校验。
/// `user_id` 和 `username` 为必填字段，缺失时返回 `BadRequest`。
pub async fn issue_token_pair(
    state: &AppState,
    request: IssueTokenRequest,
) -> Result<TokenPairDto, AppError> {
    let user_id = request
        .user_id
        .ok_or_else(|| AppError::BadRequest("userId is required".to_string()))?;
    let username = normalize_text(request.username.as_deref())
        .ok_or_else(|| AppError::BadRequest("username is required".to_string()))?;
    upsert_user_resource(state, &request).await?;
    let access_jti = Uuid::new_v4().to_string();
    let refresh_jti = Uuid::new_v4().to_string();
    let dto = TokenPairDto {
        access_token: Some(build_token(
            &state.config.jwt_secret,
            state.config.jwt_expiration_ms,
            user_id,
            &username,
            "access",
            &access_jti,
        )?),
        refresh_token: Some(build_token(
            &state.config.refresh_secret,
            state.config.refresh_expiration_ms,
            user_id,
            &username,
            "refresh",
            &refresh_jti,
        )?),
        expires_in_ms: Some(state.config.jwt_expiration_ms),
        refresh_expires_in_ms: Some(state.config.refresh_expiration_ms),
    };
    let mut redis = state.redis_manager.clone();
    redis::cmd("SET")
        .arg(format!("{}{}", REFRESH_JTI_KEY_PREFIX, user_id))
        .arg(refresh_jti)
        .arg("PX")
        .arg(state.config.refresh_expiration_ms)
        .query_async::<()>(&mut redis)
        .await?;
    Ok(dto)
}

/// 构造内部 HMAC-SHA256 签名请求头。
///
/// 生成 `X-Internal-Timestamp`、`X-Internal-Nonce`、`X-Internal-Signature` 三个头部，
/// 供内部服务间调用时的身份验证。签名的 canonical 格式为：
/// `method=POST&path=/api/...&bodyHash={sha256_base64_url}&ts={ms}&nonce={uuid}`。
pub fn internal_signature_headers(
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
pub fn append_auth_cookies(
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
pub fn expire_auth_cookies(
    response_headers: &mut HeaderMap,
    config: &AppConfig,
    request_headers: &HeaderMap,
) {
    let secure = resolve_cookie_secure(config, request_headers);
    expire_cookie(response_headers, &config.access_cookie_name, secure);
    expire_cookie(response_headers, &config.refresh_cookie_name, secure);
    expire_cookie(response_headers, &config.ws_ticket_cookie_name, secure);
}

async fn refresh_token_pair(
    state: &AppState,
    request: RefreshTokenRequest,
) -> Result<TokenPairDto, AppError> {
    let refresh_token = normalize_bearer(request.refresh_token.as_deref())
        .ok_or_else(|| AppError::Unauthorized("TOKEN_INVALID".to_string()))?;
    let parsed = parse_token(Some(&refresh_token), &state.config.refresh_secret, true);
    if parsed.expired {
        return Err(AppError::Unauthorized("TOKEN_EXPIRED".to_string()));
    }
    if !parsed.valid || parsed.token_type.as_deref() != Some("refresh") {
        return Err(AppError::Unauthorized("TOKEN_INVALID".to_string()));
    }
    let user_id = parsed
        .user_id
        .ok_or_else(|| AppError::Unauthorized("TOKEN_INVALID".to_string()))?;
    let username = parsed
        .username
        .clone()
        .ok_or_else(|| AppError::Unauthorized("TOKEN_INVALID".to_string()))?;
    let refresh_jti = parsed
        .jti
        .as_deref()
        .ok_or_else(|| AppError::Unauthorized("TOKEN_INVALID".to_string()))?;

    let cas_refresh_jti = uuid::Uuid::new_v4().to_string();
    {
        let key = format!("{}{}", REFRESH_JTI_KEY_PREFIX, user_id);
        let mut redis = state.redis_manager.clone();
        let ok: redis::RedisResult<i32> = redis::cmd("EVAL")
            .arg("if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3]) return 1 else return 0 end")
            .arg(1)
            .arg(&key)
            .arg(refresh_jti)
            .arg(&cas_refresh_jti)
            .arg(state.config.refresh_expiration_ms)
            .query_async(&mut redis)
            .await;
        match ok {
            Ok(v) if v != 0 => {}
            _ => {
                return Err(AppError::Unauthorized("TOKEN_INVALID".to_string()));
            }
        }
    }

    let user_resource = get_user_resource(state, user_id).await.ok();
    issue_token_pair(
        state,
        IssueTokenRequest {
            user_id: Some(user_id),
            username: Some(username),
            permissions: user_resource
                .as_ref()
                .map(|r| r.resource_permissions.clone())
                .unwrap_or_default(),
            ..Default::default()
        },
    )
    .await
}

async fn validate_access_token_result(
    state: &AppState,
    token: &str,
    check_revoked: bool,
) -> Result<TokenParseResultDto, AppError> {
    let normalized = normalize_bearer(Some(token))
        .ok_or_else(|| AppError::Unauthorized("TOKEN_INVALID".to_string()))?;
    let mut parsed = parse_token(Some(&normalized), &state.config.jwt_secret, false);
    if parsed.expired {
        return Err(AppError::Unauthorized("TOKEN_EXPIRED".to_string()));
    }
    if !parsed.valid {
        return Err(AppError::Unauthorized("TOKEN_INVALID".to_string()));
    }
    if check_revoked && is_token_revoked(state, &normalized, &parsed).await? {
        return Err(AppError::Unauthorized("TOKEN_INVALID".to_string()));
    }
    if let Some(user_id) = parsed.user_id {
        let resource = match get_user_resource(state, user_id).await {
            Ok(resource) => resource,
            Err(error) => {
                tracing::warn!(user_id, error = %error, "failed to load user resource, using empty permissions");
                Default::default()
            }
        };
        parsed.permissions = Some(resource.resource_permissions);
    }
    Ok(parsed)
}

async fn upsert_user_resource(
    state: &AppState,
    request: &IssueTokenRequest,
) -> Result<(), AppError> {
    let Some(user_id) = request.user_id else {
        return Ok(());
    };
    let mut user_info = HashMap::new();
    insert_value(
        &mut user_info,
        "id",
        request
            .user_id
            .map(|user_id| Value::from(user_id.to_string())),
    );
    insert_value(
        &mut user_info,
        "username",
        request.username.clone().map(Value::from),
    );
    insert_value(
        &mut user_info,
        "nickname",
        request.nickname.clone().map(Value::from),
    );
    insert_value(
        &mut user_info,
        "avatar",
        request.avatar.clone().map(Value::from),
    );
    insert_value(
        &mut user_info,
        "email",
        request.email.clone().map(Value::from),
    );
    insert_value(
        &mut user_info,
        "phone",
        request.phone.clone().map(Value::from),
    );

    let mut permissions = request
        .permissions
        .iter()
        .filter_map(|permission| normalize_text(Some(permission)))
        .collect::<Vec<_>>();
    if is_admin(&state.config, request) {
        let mut set: HashSet<String> = permissions.into_iter().collect();
        for permission in ["admin", "file:delete", "file:read", "log:read"] {
            set.insert(permission.to_string());
        }
        permissions = set.into_iter().collect();
        permissions.sort();
    }
    let resource = AuthUserResourceDto {
        user_id: Some(user_id),
        username: request.username.clone(),
        user_info,
        resource_permissions: permissions,
        data_scopes: HashMap::new(),
    };
    let mut redis = state.redis_manager.clone();
    redis
        .set_ex::<_, _, ()>(
            format!("{}{}", USER_RESOURCE_KEY_PREFIX, user_id),
            serde_json::to_string(&resource)?,
            state.config.resource_cache_ttl_seconds,
        )
        .await?;
    Ok(())
}

async fn get_user_resource(
    state: &AppState,
    user_id: i64,
) -> Result<AuthUserResourceDto, AppError> {
    let key = format!("{}{}", USER_RESOURCE_KEY_PREFIX, user_id);
    let raw: Option<String> = {
        let mut redis = state.redis_manager.clone();
        redis.get(&key).await?
    };
    if let Some(raw) = raw {
        if let Ok(resource) = serde_json::from_str::<AuthUserResourceDto>(&raw) {
            return Ok(resource);
        }
    }
    Ok(AuthUserResourceDto {
        user_id: Some(user_id),
        ..Default::default()
    })
}

async fn check_permission(
    state: &AppState,
    request: CheckPermissionRequest,
) -> Result<PermissionCheckResultDto, AppError> {
    let Some(user_id) = request.user_id else {
        return Ok(permission_result(request, false, "userId is required"));
    };
    let resource = get_user_resource(state, user_id).await?;
    let permissions = resource.resource_permissions;
    let granted = permissions
        .iter()
        .any(|permission| permission == "*" || permission == "admin")
        || request
            .permission
            .as_deref()
            .is_some_and(|permission| permissions.iter().any(|item| item == permission))
        || request
            .resource
            .as_deref()
            .zip(request.action.as_deref())
            .is_some_and(|(resource, action)| {
                let exact = format!("{}:{}", resource.trim(), action.trim());
                let wildcard = format!("{}:*", resource.trim());
                permissions
                    .iter()
                    .any(|permission| permission == &exact || permission == &wildcard)
            });
    Ok(permission_result(
        request,
        granted,
        if granted {
            "permission granted"
        } else {
            "permission denied"
        },
    ))
}

async fn revoke_token(
    state: &AppState,
    request: RevokeTokenRequest,
) -> Result<TokenRevokeResultDto, AppError> {
    let Some(token) = normalize_bearer(request.token.as_deref()) else {
        return Ok(TokenRevokeResultDto {
            success: false,
            message: Some("token is required".to_string()),
            ..Default::default()
        });
    };
    let parsed = parse_token(Some(&token), &state.config.jwt_secret, true);
    let Some(user_id) = parsed.user_id else {
        return Ok(TokenRevokeResultDto {
            success: false,
            message: Some("token parse failed".to_string()),
            ..Default::default()
        });
    };
    let token_hash = sha256_hex(&token);
    {
        let mut redis = state.redis_manager.clone();
        redis
            .set_ex::<_, _, ()>(
                format!("{}{}", REVOKED_TOKEN_KEY_PREFIX, token_hash),
                "1",
                state.config.revoked_token_ttl_seconds,
            )
            .await?;
    }
    Ok(TokenRevokeResultDto {
        success: true,
        message: Some(
            request
                .reason
                .unwrap_or_else(|| "token revoked".to_string()),
        ),
        user_id: Some(user_id),
        token_type: parsed.token_type,
    })
}

async fn is_token_revoked(
    state: &AppState,
    token: &str,
    parsed: &TokenParseResultDto,
) -> Result<bool, AppError> {
    let token_hash = sha256_hex(token);
    let mut redis = state.redis_manager.clone();
    let revoked: bool = redis
        .exists(format!("{}{}", REVOKED_TOKEN_KEY_PREFIX, token_hash))
        .await?;
    if revoked {
        return Ok(true);
    }
    let (Some(user_id), Some(iat)) = (parsed.user_id, parsed.issued_at_epoch_ms) else {
        return Ok(false);
    };
    let revoke_after: Option<String> = redis
        .get(format!("{}{}", USER_REVOKE_AFTER_KEY_PREFIX, user_id))
        .await?;
    Ok(revoke_after
        .and_then(|value| value.parse::<i64>().ok())
        .is_some_and(|revoke_after_ms| iat <= revoke_after_ms))
}

fn build_token(
    secret: &str,
    expiration_ms: i64,
    user_id: i64,
    username: &str,
    typ: &str,
    jti: &str,
) -> Result<String, AppError> {
    if secret.len() < 64 {
        return Err(AppError::BadRequest(format!(
            "JWT secret must be at least 64 bytes (got {} bytes)",
            secret.len()
        )));
    }
    let now_ms = time::now_ms();
    let claims = Claims {
        user_id,
        username: username.to_string(),
        typ: typ.to_string(),
        jti: jti.to_string(),
        sub: username.to_string(),
        iat: now_ms / 1000,
        exp: (now_ms + expiration_ms) / 1000,
    };
    encode(
        &Header::new(Algorithm::HS512),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|err| AppError::BadRequest(err.to_string()))
}

fn parse_token(token: Option<&str>, secret: &str, allow_expired: bool) -> TokenParseResultDto {
    let Some(normalized) = normalize_bearer(token) else {
        return TokenParseResultDto {
            valid: false,
            expired: false,
            error: Some("TOKEN_EMPTY".to_string()),
            ..Default::default()
        };
    };
    let mut validation = Validation::new(Algorithm::HS512);
    validation.validate_exp = false;
    match decode::<Claims>(
        &normalized,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    ) {
        Ok(data) => {
            let claims = data.claims;
            let expired = claims.exp * 1000 <= time::now_ms();
            let mut result = TokenParseResultDto {
                valid: !expired,
                expired,
                error: expired.then(|| "TOKEN_EXPIRED".to_string()),
                user_id: Some(claims.user_id),
                username: Some(claims.username),
                token_type: Some(claims.typ),
                jti: Some(claims.jti),
                issued_at_epoch_ms: Some(claims.iat * 1000),
                expires_at_epoch_ms: Some(claims.exp * 1000),
                permissions: None,
            };
            if expired && !allow_expired {
                result.clear_identity();
            }
            result
        }
        Err(_) => TokenParseResultDto {
            valid: false,
            expired: false,
            error: Some("TOKEN_INVALID".to_string()),
            ..Default::default()
        },
    }
}

/// 校验内部 HMAC-SHA256 签名。
///
/// **安全约束**：
/// - 验证 `X-Internal-Timestamp` 在 `internal_max_skew_ms` 偏移范围内（防重放）
/// - 使用 `subtle::ConstantTimeEq` 比较签名（防时序攻击）
/// - Body 哈希使用 SHA-256 Base64 URL 编码
///
/// 签名失败返回 `AppError::Unauthorized("INTERNAL_AUTH_REJECTED")`。
pub(crate) fn validate_internal_signature(
    headers: &HeaderMap,
    method: &str,
    path: &str,
    body: &[u8],
    config: &AppConfig,
) -> Result<(), AppError> {
    let ts = header_value(headers, INTERNAL_TS_HEADER)
        .or_else(|| header_value(headers, LEGACY_INTERNAL_TS_HEADER))
        .ok_or_else(|| AppError::Unauthorized("INTERNAL_AUTH_REJECTED".to_string()))?;
    let nonce = header_value(headers, INTERNAL_NONCE_HEADER)
        .ok_or_else(|| AppError::Unauthorized("INTERNAL_AUTH_REJECTED".to_string()))?;
    let signature = header_value(headers, INTERNAL_SIGN_HEADER)
        .ok_or_else(|| AppError::Unauthorized("INTERNAL_AUTH_REJECTED".to_string()))?;
    let timestamp = ts
        .parse::<i64>()
        .map_err(|_| AppError::Unauthorized("INTERNAL_AUTH_REJECTED".to_string()))?;
    if !within_skew(timestamp, config.internal_max_skew_ms) {
        return Err(AppError::Unauthorized("INTERNAL_AUTH_REJECTED".to_string()));
    }
    let body_hash = sha256_base64_url(body);
    let canonical = internal_canonical(method, path, &body_hash, &ts, &nonce);
    if !verify_hmac(&config.internal_secret, &canonical, &signature)? {
        return Err(AppError::Unauthorized("INTERNAL_AUTH_REJECTED".to_string()));
    }
    Ok(())
}

fn internal_canonical(method: &str, path: &str, body_hash: &str, ts: &str, nonce: &str) -> String {
    format!(
        "method={}&path={}&bodyHash={}&ts={}&nonce={}",
        method.trim().to_ascii_uppercase(),
        normalize_path(path),
        body_hash,
        ts,
        nonce
    )
}

fn normalize_path(path: &str) -> String {
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

fn ttl_seconds_to_ms(ttl_seconds: u64) -> Result<i64, AppError> {
    let ttl = i64::try_from(ttl_seconds)
        .map_err(|_| AppError::BadRequest("ttl seconds is too large".to_string()))?;
    ttl.checked_mul(1_000)
        .ok_or_else(|| AppError::BadRequest("ttl milliseconds overflow".to_string()))
}

fn within_skew(timestamp_ms: i64, allowed_skew_ms: i64) -> bool {
    time::now_ms()
        .checked_sub(timestamp_ms)
        .and_then(i64::checked_abs)
        .is_some_and(|delta| delta <= allowed_skew_ms)
}

fn sign_hmac(secret: &str, canonical: &str) -> Result<String, AppError> {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|error| AppError::BadRequest(format!("invalid hmac key: {error}")))?;
    mac.update(canonical.as_bytes());
    Ok(URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes()))
}

fn verify_hmac(secret: &str, canonical: &str, signature: &str) -> Result<bool, AppError> {
    Ok(sign_hmac(secret, canonical)?
        .as_bytes()
        .ct_eq(signature.as_bytes())
        .into())
}

fn sha256_base64_url(value: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(value))
}

fn sha256_hex(value: &str) -> String {
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn normalize_bearer(token: Option<&str>) -> Option<String> {
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

fn body_text(body: &Bytes) -> String {
    normalize_bearer(std::str::from_utf8(body).ok()).unwrap_or_default()
}

fn optional_json<T>(body: &Bytes) -> Result<T, AppError>
where
    T: for<'de> Deserialize<'de> + Default,
{
    if body.is_empty() {
        return Ok(T::default());
    }
    Ok(serde_json::from_slice(body)?)
}

fn required_json<T>(body: &Bytes) -> Result<T, AppError>
where
    T: for<'de> Deserialize<'de>,
{
    Ok(serde_json::from_slice(body)?)
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

fn append_cookie(
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

fn expire_cookie(headers: &mut HeaderMap, name: &str, secure: bool) {
    let secure_attr = if secure { "; Secure" } else { "" };
    if let Ok(value) = HeaderValue::from_str(&format!(
        "{name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax{secure_attr}"
    )) {
        headers.append(header::SET_COOKIE, value);
    }
}

fn normalize_cookie_path(path: &str) -> &str {
    if path.trim().starts_with('/') {
        path.trim()
    } else {
        "/"
    }
}

fn normalize_same_site(value: &str) -> &str {
    if value.trim().is_empty() {
        "Lax"
    } else {
        value.trim()
    }
}

fn resolve_cookie_secure(config: &AppConfig, request_headers: &HeaderMap) -> bool {
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

fn resolve_ws_ticket_cookie_secure(config: &AppConfig) -> bool {
    matches!(
        config
            .ws_ticket_cookie_secure
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "true"
    )
}

fn invalid_ws_ticket(error: &str) -> WsTicketConsumeResultDto {
    WsTicketConsumeResultDto {
        valid: false,
        status: Some("INVALID".to_string()),
        error: Some(error.to_string()),
        ..Default::default()
    }
}

fn parse_ws_ticket_payload(payload: &str) -> Option<(i64, String)> {
    let (user_id, username) = payload.split_once('\n')?;
    Some((user_id.trim().parse().ok()?, username.trim().to_string()))
}

fn permission_result(
    input: CheckPermissionRequest,
    granted: bool,
    reason: &str,
) -> PermissionCheckResultDto {
    PermissionCheckResultDto {
        user_id: input.user_id,
        permission: input.permission,
        resource: input.resource,
        action: input.action,
        granted,
        reason: Some(reason.to_string()),
    }
}

fn normalize_text(raw: Option<&str>) -> Option<String> {
    let value = raw?.trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn insert_value(map: &mut HashMap<String, Value>, key: &str, value: Option<Value>) {
    if let Some(value) = value {
        map.insert(key.to_string(), value);
    }
}

fn serialize_option_i64_as_string<S>(value: &Option<i64>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    match value {
        Some(value) => serializer.serialize_some(&value.to_string()),
        None => serializer.serialize_none(),
    }
}

fn deserialize_option_i64<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    let Some(value) = value else {
        return Ok(None);
    };
    match value {
        Value::Number(number) => Ok(number
            .as_i64()
            .or_else(|| number.as_u64().and_then(|item| i64::try_from(item).ok()))),
        Value::String(text) => text
            .trim()
            .parse()
            .map(Some)
            .map_err(|_| de::Error::custom("invalid integer")),
        _ => Err(de::Error::custom("invalid integer")),
    }
}

fn is_admin(config: &AppConfig, request: &IssueTokenRequest) -> bool {
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

fn header_value(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn null_to_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de> + Default,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config_with_secure(secure: &str) -> AppConfig {
        AppConfig {
            port: 0,
            cache_redis_url: String::new(),
            private_hot_redis_urls: vec![],
            group_hot_redis_urls: vec![],
            private_event_redis_url: String::new(),
            group_event_redis_url: String::new(),
            route_redis_url: String::new(),
            mysql_url: String::new(),
            mysql_max_connections: 0,
            private_event_stream_key: String::new(),
            group_event_stream_key: String::new(),
            event_stream_max_len: 0,
            stream_consumer_block_ms: 0,
            event_publisher_enabled: false,
            message_writer_enabled: false,
            publisher_batch_size: 0,
            publisher_loop_interval_ms: 0,
            writer_group_id: String::new(),
            writer_batch_size: 0,
            writer_flush_interval_ms: 0,
            writer_snowflake_node_id: 0,
            push_dispatcher_enabled: false,
            push_dispatcher_group_id: String::new(),
            push_dispatcher_batch_size: 0,
            route_users_key: String::new(),
            route_cache_ttl_ms: 0,
            server_registry_key_prefix: String::new(),
            jwt_secret: String::new(),
            jwt_expiration_ms: 0,
            refresh_secret: String::new(),
            refresh_expiration_ms: 0,
            ws_ticket_ttl_seconds: 0,
            revoked_token_ttl_seconds: 0,
            resource_cache_ttl_seconds: 0,
            token_revocation_check_enabled: false,
            internal_secret: String::new(),
            internal_max_skew_ms: 0,
            gateway_auth_secret: String::new(),
            access_cookie_name: "IM_ACCESS_TOKEN".to_string(),
            refresh_cookie_name: "IM_REFRESH_TOKEN".to_string(),
            auth_cookie_same_site: "Lax".to_string(),
            auth_cookie_secure: secure.to_string(),
            ws_ticket_cookie_name: "IM_WS_TICKET".to_string(),
            ws_ticket_cookie_path: "/websocket".to_string(),
            ws_ticket_cookie_same_site: "Strict".to_string(),
            ws_ticket_cookie_secure: "false".to_string(),
            admin_usernames: vec![],
            admin_user_ids: vec![],
            storage_base_dir: std::path::PathBuf::new(),
            file_image_max_size: 0,
            file_file_max_size: 0,
            file_audio_max_size: 0,
            file_video_max_size: 0,
            file_avatar_max_size: 0,
            request_body_limit: 0,
            snowflake_node_id: 0,
            im_server_url: String::new(),
            im_server_ws_url: String::new(),
            log_service_url: String::new(),
            registry_service_url: String::new(),
            ai_enabled: false,
            ai_encryption_key_base64: String::new(),
            ai_spring_url: String::new(),
            ai_task_stream_key: String::new(),
            ai_auto_reply_cache_ttl_sec: 0,
            ai_anti_reentry_ms: 0,
            ai_summary_max_tokens: 0,
            ai_summary_cache_ttl_sec: 0,
            ai_snowflake_node_id: 0,
        }
    }

    fn set_cookie_contains_secure(headers: &HeaderMap, cookie_name: &str) -> bool {
        headers
            .get_all(header::SET_COOKIE)
            .into_iter()
            .filter_map(|v| v.to_str().ok())
            .any(|v| v.starts_with(cookie_name) && v.contains("; Secure"))
    }

    #[test]
    fn resolve_secure_auto_with_https_header() {
        let config = config_with_secure("auto");
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-proto", HeaderValue::from_static("https"));
        assert!(resolve_cookie_secure(&config, &headers));
    }

    #[test]
    fn resolve_secure_auto_without_https_header() {
        let config = config_with_secure("auto");
        let headers = HeaderMap::new();
        assert!(!resolve_cookie_secure(&config, &headers));
    }

    #[test]
    fn resolve_secure_true_always_secure() {
        let config = config_with_secure("true");
        let headers = HeaderMap::new();
        assert!(resolve_cookie_secure(&config, &headers));
    }

    #[test]
    fn append_cookies_auto_https_sets_secure() -> anyhow::Result<()> {
        let config = config_with_secure("auto");
        let mut request_headers = HeaderMap::new();
        request_headers.insert("x-forwarded-proto", HeaderValue::from_static("https"));

        let token_pair = TokenPairDto {
            access_token: Some("at".to_string()),
            refresh_token: Some("rt".to_string()),
            expires_in_ms: Some(60_000),
            refresh_expires_in_ms: Some(3_600_000),
        };
        let mut response_headers = HeaderMap::new();
        append_auth_cookies(
            &mut response_headers,
            &config,
            &token_pair,
            &request_headers,
        )?;

        assert!(set_cookie_contains_secure(
            &response_headers,
            "IM_ACCESS_TOKEN"
        ));
        assert!(set_cookie_contains_secure(
            &response_headers,
            "IM_REFRESH_TOKEN"
        ));
        Ok(())
    }

    #[test]
    fn append_cookies_auto_no_https_omits_secure() -> anyhow::Result<()> {
        let config = config_with_secure("auto");
        let request_headers = HeaderMap::new();

        let token_pair = TokenPairDto {
            access_token: Some("at".to_string()),
            refresh_token: Some("rt".to_string()),
            expires_in_ms: Some(60_000),
            refresh_expires_in_ms: Some(3_600_000),
        };
        let mut response_headers = HeaderMap::new();
        append_auth_cookies(
            &mut response_headers,
            &config,
            &token_pair,
            &request_headers,
        )?;

        assert!(!set_cookie_contains_secure(
            &response_headers,
            "IM_ACCESS_TOKEN"
        ));
        assert!(!set_cookie_contains_secure(
            &response_headers,
            "IM_REFRESH_TOKEN"
        ));
        Ok(())
    }

    #[test]
    fn append_cookies_true_always_sets_secure() -> anyhow::Result<()> {
        let config = config_with_secure("true");
        let request_headers = HeaderMap::new();

        let token_pair = TokenPairDto {
            access_token: Some("at".to_string()),
            refresh_token: Some("rt".to_string()),
            expires_in_ms: Some(60_000),
            refresh_expires_in_ms: Some(3_600_000),
        };
        let mut response_headers = HeaderMap::new();
        append_auth_cookies(
            &mut response_headers,
            &config,
            &token_pair,
            &request_headers,
        )?;

        assert!(set_cookie_contains_secure(
            &response_headers,
            "IM_ACCESS_TOKEN"
        ));
        assert!(set_cookie_contains_secure(
            &response_headers,
            "IM_REFRESH_TOKEN"
        ));
        Ok(())
    }

    #[test]
    fn build_token_empty_secret_fails() {
        let result = build_token("", 3_600_000, 1, "user", "access", "jti1");
        assert!(result.is_err(), "empty secret should fail");
    }

    #[test]
    fn build_token_short_secret_fails() {
        let result = build_token("short", 3_600_000, 1, "user", "access", "jti1");
        assert!(result.is_err(), "short secret should fail");
    }

    #[test]
    fn build_token_valid_secret_succeeds() {
        let secret = "a-valid-secret-that-is-exactly-sixty-four-bytes-long-for-testing-ok!!!";
        let token = build_token(secret, 3_600_000, 1, "user", "access", "jti1");
        assert!(
            token.is_ok(),
            "valid secret should succeed: {:?}",
            token.err()
        );
    }

    #[test]
    fn parse_token_with_valid_secret_succeeds() -> anyhow::Result<()> {
        let secret = "a-valid-secret-that-is-exactly-sixty-four-bytes-long-for-testing-ok!!!";
        let token = build_token(secret, 3_600_000, 1, "user", "access", "jti1")?;
        let result = parse_token(Some(&format!("Bearer {token}")), secret, false);
        assert!(result.valid, "parse should succeed");
        assert_eq!(result.user_id, Some(1));
        assert_eq!(result.username.as_deref(), Some("user"));
        Ok(())
    }

    #[test]
    fn parse_token_empty_secret_fails() -> anyhow::Result<()> {
        let secret = "a-valid-secret-that-is-exactly-sixty-four-bytes-long-for-testing-ok!!!";
        let token = build_token(secret, 3_600_000, 1, "user", "access", "jti1")?;
        let result = parse_token(Some(&token), "", false);
        assert!(!result.valid, "empty secret should fail validation");
        Ok(())
    }

    #[test]
    fn parse_token_short_secret_fails() -> anyhow::Result<()> {
        let secret = "a-valid-secret-that-is-exactly-sixty-four-bytes-long-for-testing-ok!!!";
        let token = build_token(secret, 3_600_000, 1, "user", "access", "jti1")?;
        let result = parse_token(Some(&token), "short", false);
        assert!(!result.valid, "short secret should fail validation");
        Ok(())
    }
}
