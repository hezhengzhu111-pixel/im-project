use super::*;
use crate::config::AppConfig;
use crate::error::AppError;
use crate::web::AppState;
use axum::body::Bytes;
use axum::extract::{OriginalUri, Path, State};
use axum::http::HeaderMap;
use axum::Json;
use im_common::api::ApiResponse;
use redis::AsyncCommands;
use serde_json::Value;
use std::collections::{HashMap, HashSet};

const USER_RESOURCE_KEY_PREFIX: &str = "auth:user:";
const INTERNAL_TS_HEADER: &str = "X-Internal-Timestamp";
const LEGACY_INTERNAL_TS_HEADER: &str = "X-Internal-Ts";
const INTERNAL_NONCE_HEADER: &str = "X-Internal-Nonce";
const INTERNAL_SIGN_HEADER: &str = "X-Internal-Signature";

/// 内部接口：查询指定用户的资源信息（权限、用户元数据、数据范围）。
///
/// **鉴权要求**：HMAC 内部签名。
///
/// **返回**：从 Redis 缓存读取用户资源；缓存未命中时返回仅含 `user_id` 的默认结构。
pub(crate) async fn internal_user_resource(
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
pub(crate) async fn internal_validate_token(
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
pub(crate) async fn internal_introspect(
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
pub(crate) async fn internal_check_permission(
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

pub(crate) async fn upsert_user_resource(
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

pub(crate) async fn get_user_resource(
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

pub(crate) async fn check_permission(
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

pub(crate) fn permission_result(
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
