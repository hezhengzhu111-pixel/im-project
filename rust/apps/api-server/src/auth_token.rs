use super::*;
use crate::error::AppError;
use crate::web::AppState;
use axum::body::Bytes;
use axum::extract::{OriginalUri, Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use im_common::api::ApiResponse;
use im_common::time;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use redis::AsyncCommands;
use uuid::Uuid;

const REFRESH_JTI_KEY_PREFIX: &str = "auth:refresh:jti:";
const USER_RESOURCE_KEY_PREFIX: &str = "auth:user:";
const REVOKED_TOKEN_KEY_PREFIX: &str = "auth:revoked:token:";
const USER_REVOKE_AFTER_KEY_PREFIX: &str = "auth:user:revoke_after:";

/// 刷新 access token。
///
/// **鉴权要求**：客户端需提供有效的 refresh token（通过请求体或 Cookie）。
///
/// **安全约束**：使用 Redis Lua CAS 脚本原子比对 refresh JTI，防止并发刷新竞态。
/// 刷新成功后会同时签发新的 access + refresh 令牌对，并通过 Set-Cookie 下发。
///
/// **返回**：新的令牌过期时间信息，token 本身仅通过 HttpOnly Cookie 传递。
pub(crate) async fn refresh(
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
pub(crate) async fn parse(
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

/// 内部接口：签发 JWT 令牌对。
///
/// **鉴权要求**：HMAC-SHA256 内部签名（`X-Internal-Signature` + `X-Internal-Timestamp` + `X-Internal-Nonce`）。
///
/// **安全约束**：签名验证通过 `validate_internal_signature`，包含时间戳偏移校验
/// （`internal_max_skew_ms`）和 nonce 防重放。签发的 access/refresh token 使用 HS512，
/// secret 长度不少于 64 字节。
pub(crate) async fn internal_issue_token(
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

/// 内部接口：撤销单个 access token。
///
/// **鉴权要求**：HMAC 内部签名。
///
/// **安全约束**：将令牌的 SHA-256 哈希写入 Redis 黑名单（key: `auth:revoked:token:{hash}`），
/// TTL 由 `revoked_token_ttl_seconds` 控制。后续验证时会检查此黑名单。
pub(crate) async fn internal_revoke_token(
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
pub(crate) async fn internal_revoke_user_tokens(
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

/// 签发 JWT access + refresh 令牌对。
///
/// 同时将用户资源信息写入 Redis 缓存，将 refresh JTI 写入 Redis 用于后续 CAS 刷新校验。
/// `user_id` 和 `username` 为必填字段，缺失时返回 `BadRequest`。
pub(crate) async fn issue_token_pair(
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

    // Use longer refresh expiration when rememberMe is true.
    let refresh_expiration_ms = if request.remember_me {
        state.config.remember_me_refresh_expiration_ms
    } else {
        state.config.refresh_expiration_ms
    };

    let dto = TokenPairDto {
        access_token: Some(build_token(
            &state.config.jwt_secret,
            state.config.jwt_expiration_ms,
            user_id,
            &username,
            "access",
            &access_jti,
            request.remember_me,
        )?),
        refresh_token: Some(build_token(
            &state.config.refresh_secret,
            refresh_expiration_ms,
            user_id,
            &username,
            "refresh",
            &refresh_jti,
            request.remember_me,
        )?),
        expires_in_ms: Some(state.config.jwt_expiration_ms),
        refresh_expires_in_ms: Some(refresh_expiration_ms),
    };
    let mut redis = state.redis_manager.clone();
    redis::cmd("SET")
        .arg(format!("{}{}", REFRESH_JTI_KEY_PREFIX, user_id))
        .arg(refresh_jti)
        .arg("PX")
        .arg(refresh_expiration_ms)
        .query_async::<()>(&mut redis)
        .await?;
    Ok(dto)
}

pub(crate) async fn refresh_token_pair(
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
            remember_me: parsed.remember_me,
            ..Default::default()
        },
    )
    .await
}

pub(crate) async fn validate_access_token_result(
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

pub(crate) async fn revoke_token(
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

pub(crate) async fn is_token_revoked(
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

pub(crate) fn build_token(
    secret: &str,
    expiration_ms: i64,
    user_id: i64,
    username: &str,
    typ: &str,
    jti: &str,
    remember_me: bool,
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
        remember_me,
    };
    encode(
        &Header::new(Algorithm::HS512),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|err| AppError::BadRequest(err.to_string()))
}

pub(crate) fn parse_token(
    token: Option<&str>,
    secret: &str,
    allow_expired: bool,
) -> TokenParseResultDto {
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
                remember_me: claims.remember_me,
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
