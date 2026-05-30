use super::user_helpers::*;
use super::user_types::*;
use crate::auth::identity_from_headers;
use crate::auth_api::{self, IssueTokenRequest, TokenPairDto};
use crate::error::AppError;
use crate::web::AppState;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::Json;
use im_rs_common::api::ApiResponse;
use im_rs_common::{ids, time};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{MySqlPool, Row};
use std::collections::HashMap;

pub(crate) async fn login(
    State(state): State<AppState>,
    Json(request): Json<LoginRequest>,
) -> Result<(StatusCode, HeaderMap, Json<ApiResponse<UserAuthResponse>>), AppError> {
    let username = normalize_username(&request.username)?;
    if request.password.is_empty() {
        return Err(AppError::Unauthorized("用户名或密码错误".to_string()));
    }
    let user = load_user_by_username(&state.db, &username)
        .await?
        .filter(|user| user.status == 1)
        .ok_or_else(|| AppError::Unauthorized("用户名或密码错误".to_string()))?;

    if !verify_password(&request.password, &user.password) {
        return Err(AppError::Unauthorized("用户名或密码错误".to_string()));
    }

    let token_pair = issue_token(&state, &user).await?;
    sqlx::query("UPDATE service_user_service_db.users SET last_login_time = NOW() WHERE id = ?")
        .bind(user.id)
        .execute(&state.db)
        .await?;

    let mut headers = HeaderMap::new();
    auth_api::append_auth_cookies(&mut headers, &state.config, &token_pair, &HeaderMap::new())?;

    Ok((
        StatusCode::OK,
        headers,
        Json(ApiResponse::success(UserAuthResponse {
            success: true,
            message: "登录成功".to_string(),
            user: user.to_dto(),
            token: token_pair.access_token.clone(),
            refresh_token: token_pair.refresh_token.clone(),
            expires_in_ms: token_pair.expires_in_ms,
            refresh_expires_in_ms: token_pair.refresh_expires_in_ms,
            permissions: Vec::new(),
        })),
    ))
}

pub(crate) async fn register(
    State(state): State<AppState>,
    Json(request): Json<RegisterRequest>,
) -> Result<Json<ApiResponse<UserDto>>, AppError> {
    let username = normalize_username(&request.username)?;
    validate_password(&request.password)?;
    let nickname =
        normalize_optional(request.nickname.as_deref()).unwrap_or_else(|| username.clone());
    let email = normalize_optional(request.email.as_deref());
    let phone = normalize_optional(request.phone.as_deref());
    let existing = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM service_user_service_db.users WHERE username = ?",
    )
    .bind(&username)
    .fetch_one(&state.db)
    .await?;
    if existing > 0 {
        return Err(AppError::Conflict("用户名已存在".to_string()));
    }

    let password_hash = bcrypt::hash(&request.password, bcrypt::DEFAULT_COST)
        .map_err(|err| AppError::BadRequest(format!("密码加密失败: {err}")))?;
    let user_id = ids::next_id(state.config.snowflake_node_id);
    sqlx::query(
        r#"INSERT INTO service_user_service_db.users
           (id, username, password, nickname, email, phone, status)
           VALUES (?, ?, ?, ?, ?, ?, 1)"#,
    )
    .bind(user_id)
    .bind(&username)
    .bind(password_hash)
    .bind(&nickname)
    .bind(&email)
    .bind(&phone)
    .execute(&state.db)
    .await?;

    Ok(Json(ApiResponse::success(UserDto {
        id: user_id.to_string(),
        username,
        nickname,
        avatar: None,
        email,
        phone,
        status: "offline".to_string(),
        last_login_time: None,
        create_time: Some(time::now_iso()),
    })))
}

pub(crate) async fn logout(
    State(state): State<AppState>,
) -> (StatusCode, HeaderMap, Json<ApiResponse<String>>) {
    let mut headers = HeaderMap::new();
    auth_api::expire_auth_cookies(&mut headers, &state.config, &HeaderMap::new());
    (
        StatusCode::OK,
        headers,
        Json(ApiResponse::success("ok".to_string())),
    )
}

pub(crate) async fn offline() -> Json<ApiResponse<String>> {
    Json(ApiResponse::success("ok".to_string()))
}

pub(crate) async fn update_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<UpdateProfileRequest>,
) -> Result<Json<ApiResponse<UserDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    sqlx::query(
        r#"UPDATE service_user_service_db.users
           SET nickname = COALESCE(?, nickname),
               avatar = COALESCE(?, avatar),
               email = COALESCE(?, email),
               phone = COALESCE(?, phone)
           WHERE id = ? AND status = 1"#,
    )
    .bind(normalize_optional(request.nickname.as_deref()))
    .bind(normalize_optional(request.avatar.as_deref()))
    .bind(normalize_optional(request.email.as_deref()))
    .bind(normalize_optional(request.phone.as_deref()))
    .bind(identity.user_id)
    .execute(&state.db)
    .await?;
    let user = load_user_by_id(&state.db, identity.user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("user not found".to_string()))?;
    Ok(Json(ApiResponse::success(user.to_dto())))
}

pub(crate) async fn change_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ChangePasswordRequest>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user = load_user_by_id(&state.db, identity.user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("user not found".to_string()))?;
    if !verify_password(&request.current_password, &user.password) {
        return Err(AppError::Unauthorized(
            "current password is incorrect".to_string(),
        ));
    }
    validate_password(&request.new_password)?;
    let password_hash = bcrypt::hash(&request.new_password, bcrypt::DEFAULT_COST)
        .map_err(|err| AppError::BadRequest(format!("password hash failed: {err}")))?;
    sqlx::query("UPDATE service_user_service_db.users SET password = ? WHERE id = ?")
        .bind(password_hash)
        .bind(identity.user_id)
        .execute(&state.db)
        .await?;
    Ok(Json(ApiResponse::success(true)))
}

pub(crate) async fn send_phone_code(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CodeTargetRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_phone(&request.target)?;
    let code = generate_verification_code();
    let key = verification_code_key(identity.user_id, "phone", request.target.trim());
    if let Err(error) = state
        .redis_manager
        .clone()
        .set_ex::<_, _, ()>(&key, &code, 300_u64)
        .await
    {
        tracing::warn!(error = %error, user_id = identity.user_id, "failed to store phone verification code");
    }
    Ok(Json(ApiResponse::success(code)))
}

pub(crate) async fn bind_phone(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BindPhoneRequest>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_phone(&request.phone)?;
    validate_code(&request.code)?;
    verify_and_consume_code(
        &state,
        identity.user_id,
        "phone",
        request.phone.trim(),
        request.code.trim(),
    )
    .await?;
    sqlx::query("UPDATE service_user_service_db.users SET phone = ? WHERE id = ? AND status = 1")
        .bind(request.phone.trim())
        .bind(identity.user_id)
        .execute(&state.db)
        .await?;
    Ok(Json(ApiResponse::success(true)))
}

pub(crate) async fn send_email_code(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CodeTargetRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_email(&request.target)?;
    let code = generate_verification_code();
    let key = verification_code_key(identity.user_id, "email", request.target.trim());
    if let Err(error) = state
        .redis_manager
        .clone()
        .set_ex::<_, _, ()>(&key, &code, 300_u64)
        .await
    {
        tracing::warn!(error = %error, user_id = identity.user_id, "failed to store email verification code");
    }
    Ok(Json(ApiResponse::success(code)))
}

pub(crate) async fn bind_email(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BindEmailRequest>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_email(&request.email)?;
    validate_code(&request.code)?;
    verify_and_consume_code(
        &state,
        identity.user_id,
        "email",
        request.email.trim(),
        request.code.trim(),
    )
    .await?;
    sqlx::query("UPDATE service_user_service_db.users SET email = ? WHERE id = ? AND status = 1")
        .bind(request.email.trim())
        .bind(identity.user_id)
        .execute(&state.db)
        .await?;
    Ok(Json(ApiResponse::success(true)))
}

pub(crate) async fn delete_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<(StatusCode, HeaderMap, Json<ApiResponse<bool>>), AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let request: DeleteAccountRequest = serde_json::from_slice(&body)?;
    let user = load_user_by_id(&state.db, identity.user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("user not found".to_string()))?;
    if !verify_password(&request.password, &user.password) {
        return Err(AppError::Unauthorized("password is incorrect".to_string()));
    }
    let mut tx = state.db.begin().await?;
    sqlx::query("UPDATE service_user_service_db.users SET status = 0 WHERE id = ?")
        .bind(identity.user_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE service_user_service_db.im_friend SET status = 2 WHERE user_id = ? OR friend_id = ?",
    )
    .bind(identity.user_id)
    .bind(identity.user_id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("UPDATE service_group_service_db.im_group_member SET status = 0 WHERE user_id = ?")
        .bind(identity.user_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE service_group_service_db.im_group SET status = 0 WHERE owner_id = ?")
        .bind(identity.user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    let mut response_headers = HeaderMap::new();
    auth_api::expire_auth_cookies(&mut response_headers, &state.config, &headers);
    Ok((
        StatusCode::OK,
        response_headers,
        Json(ApiResponse::success(true)),
    ))
}

pub(crate) async fn search(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<ApiResponse<Vec<UserDto>>>, AppError> {
    let keyword = normalize_optional(Some(query.keyword.as_str())).unwrap_or_default();
    if keyword.is_empty() {
        return Ok(Json(ApiResponse::success(Vec::new())));
    }
    let like = format!("%{}%", keyword);
    let rows = if query.r#type.eq_ignore_ascii_case("phone") {
        sqlx::query(&user_select_sql("phone LIKE ?"))
            .bind(like)
            .fetch_all(&state.db)
            .await?
    } else if query.r#type.eq_ignore_ascii_case("email") {
        sqlx::query(&user_select_sql("email LIKE ?"))
            .bind(like)
            .fetch_all(&state.db)
            .await?
    } else {
        sqlx::query(&user_select_sql("(username LIKE ? OR nickname LIKE ?)"))
            .bind(&like)
            .bind(&like)
            .fetch_all(&state.db)
            .await?
    };
    Ok(Json(ApiResponse::success(
        rows.into_iter()
            .map(|row| user_from_row(&row).to_dto())
            .collect(),
    )))
}

pub(crate) async fn heartbeat(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<ApiResponse<HashMap<String, bool>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let heartbeat_path = format!("/api/im/heartbeat/{}", identity.user_id);
    if let Err(error) = signed_internal_post::<Value>(
        &state,
        &format!(
            "{}{}",
            state.config.im_server_url.trim_end_matches('/'),
            heartbeat_path
        ),
        &heartbeat_path,
        Bytes::new(),
    )
    .await
    {
        tracing::warn!(error = %error, user_id = identity.user_id, "failed to refresh im heartbeat");
    }
    online_status_impl(state, body).await
}

pub(crate) async fn online_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<ApiResponse<HashMap<String, bool>>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    online_status_impl(state, body).await
}

pub(crate) async fn settings(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<UserSettings>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    Ok(Json(ApiResponse::success(default_settings())))
}

pub(crate) async fn update_settings(
    headers: HeaderMap,
    State(state): State<AppState>,
    Path(_kind): Path<String>,
    Json(_payload): Json<Value>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    Ok(Json(ApiResponse::success(true)))
}
