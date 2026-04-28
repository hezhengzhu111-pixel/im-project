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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TokenPairDto {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_in_ms: Option<i64>,
    pub refresh_expires_in_ms: Option<i64>,
}

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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RefreshTokenRequest {
    pub refresh_token: Option<String>,
    pub access_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ParseTokenRequest {
    pub token: Option<String>,
    pub allow_expired: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CheckPermissionRequest {
    #[serde(default, deserialize_with = "deserialize_option_i64")]
    pub user_id: Option<i64>,
    pub permission: Option<String>,
    pub resource: Option<String>,
    pub action: Option<String>,
}

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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RevokeTokenRequest {
    pub token: Option<String>,
    pub reason: Option<String>,
}

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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WsTicketDto {
    pub ticket: Option<String>,
    pub expires_in_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConsumeWsTicketRequest {
    pub ticket: Option<String>,
    #[serde(default, deserialize_with = "deserialize_option_i64")]
    pub user_id: Option<i64>,
}

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

pub async fn refresh(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<(StatusCode, HeaderMap, Json<ApiResponse<TokenPairDto>>), AppError> {
    let mut request: RefreshTokenRequest = optional_json(&body)?;
    if request.refresh_token.as_deref().is_none_or(str::is_empty) {
        request.refresh_token = cookie_value(&headers, &state.config.refresh_cookie_name);
    }
    let token_pair = refresh_token_pair(&state, request).await?;
    let mut response_headers = HeaderMap::new();
    append_auth_cookies(&mut response_headers, &state.config, &token_pair)?;
    Ok((
        StatusCode::OK,
        response_headers,
        Json(ApiResponse::success(token_pair)),
    ))
}

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
            let resource = get_user_resource(&state, user_id).await.unwrap_or_default();
            parsed.permissions = Some(resource.resource_permissions);
        }
    }
    Ok(Json(ApiResponse::success(parsed)))
}

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

pub fn append_auth_cookies(
    headers: &mut HeaderMap,
    config: &AppConfig,
    token_pair: &TokenPairDto,
) -> Result<(), AppError> {
    if let Some(access) = token_pair.access_token.as_deref() {
        append_cookie(
            headers,
            &config.access_cookie_name,
            access,
            token_pair.expires_in_ms.unwrap_or_default(),
            "/",
            &config.auth_cookie_same_site,
            resolve_cookie_secure(config, HeaderMap::new()),
        )?;
    }
    if let Some(refresh) = token_pair.refresh_token.as_deref() {
        append_cookie(
            headers,
            &config.refresh_cookie_name,
            refresh,
            token_pair.refresh_expires_in_ms.unwrap_or_default(),
            "/",
            &config.auth_cookie_same_site,
            resolve_cookie_secure(config, HeaderMap::new()),
        )?;
    }
    Ok(())
}

pub fn expire_auth_cookies(headers: &mut HeaderMap, config: &AppConfig) {
    expire_cookie(headers, &config.access_cookie_name);
    expire_cookie(headers, &config.refresh_cookie_name);
    expire_cookie(headers, &config.ws_ticket_cookie_name);
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

    let stored: Option<String> = {
        let mut redis = state.redis_manager.clone();
        redis
            .get(format!("{}{}", REFRESH_JTI_KEY_PREFIX, user_id))
            .await?
    };
    if stored.as_deref() != Some(refresh_jti) {
        return Err(AppError::Unauthorized("TOKEN_INVALID".to_string()));
    }

    issue_token_pair(
        state,
        IssueTokenRequest {
            user_id: Some(user_id),
            username: Some(username),
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
        let resource = get_user_resource(state, user_id).await.unwrap_or_default();
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
        &EncodingKey::from_secret(&padded_hs512_secret(secret)),
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
        &DecodingKey::from_secret(&padded_hs512_secret(secret)),
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
    let without_query = path.split('?').next().unwrap_or("/");
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

fn padded_hs512_secret(secret: &str) -> Vec<u8> {
    let bytes = secret.as_bytes();
    if bytes.len() >= 64 {
        return bytes.to_vec();
    }
    let mut padded = vec![0_u8; 64];
    if bytes.is_empty() {
        return padded;
    }
    let source_len = bytes.len();
    for (index, slot) in padded.iter_mut().enumerate() {
        let source_index = index % source_len;
        if let Some(byte) = bytes.get(source_index) {
            *slot = *byte;
        }
    }
    padded
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

fn expire_cookie(headers: &mut HeaderMap, name: &str) {
    if let Ok(value) = HeaderValue::from_str(&format!(
        "{name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax"
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

fn resolve_cookie_secure(config: &AppConfig, _headers: HeaderMap) -> bool {
    matches!(
        config
            .auth_cookie_secure
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "true"
    )
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
