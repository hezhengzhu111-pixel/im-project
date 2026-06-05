use super::*;
use crate::auth_api::{self, IssueTokenRequest, TokenPairDto};
use crate::error::AppError;
use crate::web::AppState;
use axum::body::Bytes;
use axum::http::header;
use axum::Json;
use im_rs_common::api::ApiResponse;
use redis::AsyncCommands;
use serde::Deserialize;
use serde_json::Value;
use sqlx::{MySqlPool, Row};
use std::collections::HashMap;

pub(crate) async fn online_status_impl(
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

pub(crate) async fn signed_internal_post<T>(
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

pub(crate) async fn issue_token(
    state: &AppState,
    user: &UserRecord,
    remember_me: bool,
) -> Result<TokenPairDto, AppError> {
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
            remember_me,
        },
    )
    .await
}

pub(crate) async fn load_user_by_username(
    db: &MySqlPool,
    username: &str,
) -> Result<Option<UserRecord>, AppError> {
    let row = sqlx::query(&user_select_sql("username = ?"))
        .bind(username)
        .fetch_optional(db)
        .await?;
    Ok(row.as_ref().map(user_from_row))
}

pub(crate) async fn load_user_by_id(
    db: &MySqlPool,
    user_id: i64,
) -> Result<Option<UserRecord>, AppError> {
    let row = sqlx::query(&user_select_sql("id = ?"))
        .bind(user_id)
        .fetch_optional(db)
        .await?;
    Ok(row.as_ref().map(user_from_row))
}

pub(crate) fn user_select_sql(where_clause: &str) -> String {
    format!(
        "SELECT id, username, password, nickname, avatar, email, phone, status, last_login_time, created_time \
         FROM service_user_service_db.users WHERE status = 1 AND {where_clause} LIMIT 20"
    )
}

pub(crate) fn user_from_row(row: &sqlx::mysql::MySqlRow) -> UserRecord {
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

pub(crate) fn normalize_username(raw: &str) -> Result<String, AppError> {
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

pub(crate) fn validate_password(password: &str) -> Result<(), AppError> {
    let has_letter = password.chars().any(|ch| ch.is_ascii_alphabetic());
    let has_digit = password.chars().any(|ch| ch.is_ascii_digit());
    if password.len() < 8 || password.len() > 64 || !has_letter || !has_digit {
        return Err(AppError::BadRequest(
            "密码需为8-64位，且包含字母和数字".to_string(),
        ));
    }
    Ok(())
}

pub(crate) fn validate_phone(phone: &str) -> Result<(), AppError> {
    let value = phone.trim();
    if value.len() < 6
        || value.len() > 20
        || !value.chars().all(|ch| ch.is_ascii_digit() || ch == '+')
    {
        return Err(AppError::BadRequest("invalid phone".to_string()));
    }
    Ok(())
}

pub(crate) fn validate_email(email: &str) -> Result<(), AppError> {
    let value = email.trim();
    if value.len() < 5 || value.len() > 128 || !value.contains('@') || value.starts_with('@') {
        return Err(AppError::BadRequest("invalid email".to_string()));
    }
    Ok(())
}

pub(crate) fn validate_code(code: &str) -> Result<(), AppError> {
    let value = code.trim();
    if value.is_empty() || value.len() > 16 {
        return Err(AppError::BadRequest(
            "invalid verification code".to_string(),
        ));
    }
    Ok(())
}

pub(crate) fn generate_verification_code() -> String {
    let num = uuid::Uuid::new_v4()
        .as_u128()
        .checked_rem(1_000_000)
        .unwrap_or(0);
    format!("{num:06}")
}

pub(crate) fn verification_code_key(user_id: i64, kind: &str, target: &str) -> String {
    format!("im:code:{user_id}:{kind}:{target}")
}

pub(crate) async fn verify_and_consume_code(
    state: &AppState,
    user_id: i64,
    kind: &str,
    target: &str,
    code: &str,
) -> Result<(), AppError> {
    let key = verification_code_key(user_id, kind, target);
    let mut redis = state.redis_manager.clone();
    let stored: redis::RedisResult<Option<String>> = redis.get(&key).await;
    match stored {
        Ok(Some(stored_code)) if stored_code == code => {
            let _: redis::RedisResult<()> = redis.del(&key).await;
            Ok(())
        }
        Ok(_) => Err(AppError::BadRequest(
            "verification code is incorrect or expired".to_string(),
        )),
        Err(error) => {
            tracing::warn!(error = %error, user_id, kind, target, "redis error during code verification");
            Err(AppError::BadRequest(
                "verification code is incorrect or expired".to_string(),
            ))
        }
    }
}

pub(crate) fn normalize_optional(raw: Option<&str>) -> Option<String> {
    raw.map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub(crate) fn verify_password(raw: &str, stored: &str) -> bool {
    if stored.starts_with("$2") {
        bcrypt::verify(raw, stored).unwrap_or(false)
    } else {
        raw == stored
    }
}

pub(crate) fn parse_user_ids(body: &[u8]) -> Result<Vec<String>, AppError> {
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
