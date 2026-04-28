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
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{MySqlPool, Row};
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    username: String,
    password: String,
    nickname: Option<String>,
    email: Option<String>,
    phone: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfileRequest {
    nickname: Option<String>,
    avatar: Option<String>,
    email: Option<String>,
    phone: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangePasswordRequest {
    current_password: String,
    new_password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeTargetRequest {
    target: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BindPhoneRequest {
    phone: String,
    code: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BindEmailRequest {
    email: String,
    code: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAccountRequest {
    password: String,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    keyword: String,
    #[serde(default = "default_search_type")]
    r#type: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserDto {
    id: String,
    username: String,
    nickname: String,
    avatar: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    status: String,
    last_login_time: Option<String>,
    create_time: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserAuthResponse {
    success: bool,
    message: String,
    user: UserDto,
    token: Option<String>,
    refresh_token: Option<String>,
    expires_in_ms: Option<i64>,
    refresh_expires_in_ms: Option<i64>,
    permissions: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpstreamApiResponse<T> {
    code: i32,
    message: String,
    data: Option<T>,
}

struct UserRecord {
    id: i64,
    username: String,
    password: String,
    nickname: Option<String>,
    avatar: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    status: i32,
    last_login_time: Option<chrono::NaiveDateTime>,
    created_time: Option<chrono::NaiveDateTime>,
}

pub async fn login(
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
    auth_api::append_auth_cookies(&mut headers, &state.config, &token_pair)?;

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

pub async fn register(
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

pub async fn logout(
    State(state): State<AppState>,
) -> (StatusCode, HeaderMap, Json<ApiResponse<String>>) {
    let mut headers = HeaderMap::new();
    auth_api::expire_auth_cookies(&mut headers, &state.config);
    (
        StatusCode::OK,
        headers,
        Json(ApiResponse::success("ok".to_string())),
    )
}

pub async fn offline() -> Json<ApiResponse<String>> {
    Json(ApiResponse::success("ok".to_string()))
}

pub async fn update_profile(
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

pub async fn change_password(
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

pub async fn send_phone_code(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CodeTargetRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    validate_phone(&request.target)?;
    Ok(Json(ApiResponse::success("000000".to_string())))
}

pub async fn bind_phone(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BindPhoneRequest>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_phone(&request.phone)?;
    validate_code(&request.code)?;
    sqlx::query("UPDATE service_user_service_db.users SET phone = ? WHERE id = ? AND status = 1")
        .bind(request.phone.trim())
        .bind(identity.user_id)
        .execute(&state.db)
        .await?;
    Ok(Json(ApiResponse::success(true)))
}

pub async fn send_email_code(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CodeTargetRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    validate_email(&request.target)?;
    Ok(Json(ApiResponse::success("000000".to_string())))
}

pub async fn bind_email(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BindEmailRequest>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_email(&request.email)?;
    validate_code(&request.code)?;
    sqlx::query("UPDATE service_user_service_db.users SET email = ? WHERE id = ? AND status = 1")
        .bind(request.email.trim())
        .bind(identity.user_id)
        .execute(&state.db)
        .await?;
    Ok(Json(ApiResponse::success(true)))
}

pub async fn delete_account(
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
    sqlx::query("UPDATE service_user_service_db.users SET status = 0 WHERE id = ?")
        .bind(identity.user_id)
        .execute(&state.db)
        .await?;
    sqlx::query(
        "UPDATE service_user_service_db.im_friend SET status = 2 WHERE user_id = ? OR friend_id = ?",
    )
    .bind(identity.user_id)
    .bind(identity.user_id)
    .execute(&state.db)
    .await?;
    sqlx::query("UPDATE service_group_service_db.im_group_member SET status = 0 WHERE user_id = ?")
        .bind(identity.user_id)
        .execute(&state.db)
        .await?;
    sqlx::query("UPDATE service_group_service_db.im_group SET status = 0 WHERE owner_id = ?")
        .bind(identity.user_id)
        .execute(&state.db)
        .await?;
    let mut response_headers = HeaderMap::new();
    auth_api::expire_auth_cookies(&mut response_headers, &state.config);
    Ok((
        StatusCode::OK,
        response_headers,
        Json(ApiResponse::success(true)),
    ))
}

pub async fn search(
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

pub async fn heartbeat(
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

pub async fn online_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<ApiResponse<HashMap<String, bool>>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    online_status_impl(state, body).await
}

pub async fn settings(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    Ok(Json(ApiResponse::success(default_settings())))
}

pub async fn update_settings(
    headers: HeaderMap,
    State(state): State<AppState>,
    Path(_kind): Path<String>,
    Json(_payload): Json<Value>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    Ok(Json(ApiResponse::success(true)))
}

async fn online_status_impl(
    state: AppState,
    body: Bytes,
) -> Result<Json<ApiResponse<HashMap<String, bool>>>, AppError> {
    let user_ids = parse_user_ids(&body)?;
    if user_ids.is_empty() {
        return Ok(Json(ApiResponse::success(HashMap::new())));
    }
    match signed_internal_post::<HashMap<String, bool>>(
        &state,
        &format!(
            "{}/api/im/online-status",
            state.config.im_server_url.trim_end_matches('/')
        ),
        "/api/im/online-status",
        Bytes::from(serde_json::to_vec(&user_ids)?),
    )
    .await
    {
        Ok(status) => Ok(Json(ApiResponse::success(status))),
        Err(error) => {
            tracing::warn!(error = %error, "online-status fallback to offline map");
            Ok(Json(ApiResponse::success(
                user_ids.into_iter().map(|id| (id, false)).collect(),
            )))
        }
    }
}

async fn signed_internal_post<T>(
    state: &AppState,
    url: &str,
    signed_path: &str,
    body: Bytes,
) -> Result<T, AppError>
where
    T: for<'de> Deserialize<'de>,
{
    let headers = auth_api::internal_signature_headers("POST", signed_path, &body, &state.config)?;
    let response = state
        .http
        .post(url)
        .headers(headers)
        .header(header::CONTENT_TYPE, "application/json")
        .body(body.to_vec())
        .send()
        .await?;
    let status = response.status();
    let payload: UpstreamApiResponse<T> = response.json().await?;
    if !status.is_success() || payload.code != 200 {
        return Err(AppError::Upstream(payload.message));
    }
    payload
        .data
        .ok_or_else(|| AppError::Upstream("upstream response missing data".to_string()))
}

async fn issue_token(state: &AppState, user: &UserRecord) -> Result<TokenPairDto, AppError> {
    auth_api::issue_token_pair(
        state,
        IssueTokenRequest {
            user_id: Some(user.id),
            username: Some(user.username.clone()),
            nickname: user.nickname.clone(),
            avatar: user.avatar.clone(),
            email: user.email.clone(),
            phone: user.phone.clone(),
            permissions: Vec::new(),
        },
    )
    .await
}

async fn load_user_by_username(
    db: &MySqlPool,
    username: &str,
) -> Result<Option<UserRecord>, AppError> {
    let row = sqlx::query(&user_select_sql("username = ?"))
        .bind(username)
        .fetch_optional(db)
        .await?;
    Ok(row.as_ref().map(user_from_row))
}

async fn load_user_by_id(db: &MySqlPool, user_id: i64) -> Result<Option<UserRecord>, AppError> {
    let row = sqlx::query(&user_select_sql("id = ?"))
        .bind(user_id)
        .fetch_optional(db)
        .await?;
    Ok(row.as_ref().map(user_from_row))
}

fn user_select_sql(where_clause: &str) -> String {
    format!(
        "SELECT id, username, password, nickname, avatar, email, phone, status, last_login_time, created_time \
         FROM service_user_service_db.users WHERE status = 1 AND {where_clause} LIMIT 20"
    )
}

fn user_from_row(row: &sqlx::mysql::MySqlRow) -> UserRecord {
    UserRecord {
        id: row.get("id"),
        username: row.get("username"),
        password: row.get("password"),
        nickname: row.get("nickname"),
        avatar: row.get("avatar"),
        email: row.get("email"),
        phone: row.get("phone"),
        status: i32::from(row.get::<i8, _>("status")),
        last_login_time: row.get("last_login_time"),
        created_time: row.get("created_time"),
    }
}

impl UserRecord {
    fn to_dto(&self) -> UserDto {
        UserDto {
            id: self.id.to_string(),
            username: self.username.clone(),
            nickname: self
                .nickname
                .clone()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| self.username.clone()),
            avatar: self.avatar.clone(),
            email: self.email.clone(),
            phone: self.phone.clone(),
            status: "offline".to_string(),
            last_login_time: self.last_login_time.map(|value| value.to_string()),
            create_time: self.created_time.map(|value| value.to_string()),
        }
    }
}

fn normalize_username(raw: &str) -> Result<String, AppError> {
    let username = raw.trim().to_ascii_lowercase();
    if username.len() < 3
        || username.len() > 20
        || !username
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
    {
        return Err(AppError::BadRequest(
            "用户名只能包含3-20位字母、数字和下划线".to_string(),
        ));
    }
    Ok(username)
}

fn validate_password(password: &str) -> Result<(), AppError> {
    let has_letter = password.chars().any(|ch| ch.is_ascii_alphabetic());
    let has_digit = password.chars().any(|ch| ch.is_ascii_digit());
    if password.len() < 8 || password.len() > 64 || !has_letter || !has_digit {
        return Err(AppError::BadRequest(
            "密码需为8-64位，且包含字母和数字".to_string(),
        ));
    }
    Ok(())
}

fn validate_phone(phone: &str) -> Result<(), AppError> {
    let value = phone.trim();
    if value.len() < 6
        || value.len() > 20
        || !value.chars().all(|ch| ch.is_ascii_digit() || ch == '+')
    {
        return Err(AppError::BadRequest("invalid phone".to_string()));
    }
    Ok(())
}

fn validate_email(email: &str) -> Result<(), AppError> {
    let value = email.trim();
    if value.len() < 5 || value.len() > 128 || !value.contains('@') || value.starts_with('@') {
        return Err(AppError::BadRequest("invalid email".to_string()));
    }
    Ok(())
}

fn validate_code(code: &str) -> Result<(), AppError> {
    let value = code.trim();
    if value.is_empty() || value.len() > 16 {
        return Err(AppError::BadRequest(
            "invalid verification code".to_string(),
        ));
    }
    Ok(())
}

fn normalize_optional(raw: Option<&str>) -> Option<String> {
    raw.map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn verify_password(raw: &str, stored: &str) -> bool {
    if stored.starts_with("$2") {
        bcrypt::verify(raw, stored).unwrap_or(false)
    } else {
        raw == stored
    }
}

fn parse_user_ids(body: &[u8]) -> Result<Vec<String>, AppError> {
    if body.is_empty() {
        return Ok(Vec::new());
    }
    let value: Value = serde_json::from_slice(body)?;
    let Some(items) = value.as_array() else {
        return Ok(Vec::new());
    };
    Ok(items
        .iter()
        .filter_map(|item| {
            item.as_str()
                .map(str::to_string)
                .or_else(|| item.as_i64().map(|id| id.to_string()))
        })
        .filter(|id| !id.trim().is_empty())
        .collect())
}

fn default_search_type() -> String {
    "username".to_string()
}

fn default_settings() -> Value {
    json!({
        "general": {
            "language": "zh-CN",
            "theme": "light",
            "fontSize": "medium",
            "autoLogin": true,
            "minimizeOnStart": false
        },
        "privacy": {
            "allowStrangerAdd": true,
            "showOnlineStatus": true,
            "allowViewMoments": true,
            "messageReadReceipt": true
        },
        "message": {
            "enableNotification": true,
            "enableSound": true,
            "enableVibration": false,
            "muteGroupMessages": false,
            "autoDownloadImages": true
        },
        "notifications": {
            "sound": true,
            "desktop": true,
            "preview": true
        }
    })
}
