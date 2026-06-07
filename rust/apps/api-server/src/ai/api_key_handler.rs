use crate::ai::crypto;
use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::Json;
use im_common::api::ApiResponse;
use im_common::ids;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::MySqlPool;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateKeyRequest {
    pub provider: String,
    pub api_key: String,
    #[serde(default)]
    pub key_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateKeyRequest {
    pub api_key: Option<String>,
    pub key_name: Option<String>,
}

pub async fn create(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(body): Json<CreateKeyRequest>,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let master_key = crypto::load_master_key(&state.config.ai_encryption_key_base64)?;
    let provider = body.provider.trim().to_ascii_lowercase();
    if provider.is_empty() || provider.len() > 32 {
        return Err(AppError::BadRequest("invalid provider".into()));
    }
    if body.api_key.trim().is_empty() {
        return Err(AppError::BadRequest("api_key is required".into()));
    }
    let encrypted = crypto::encrypt(body.api_key.trim(), &master_key)?;
    let id = ids::next_id(state.config.ai_snowflake_node_id);
    sqlx::query(
        "INSERT INTO service_user_service_db.user_ai_api_keys \
         (id, user_id, provider, encrypted_api_key, key_name, is_active, created_time, updated_time) \
         VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())",
    )
    .bind(id)
    .bind(identity.user_id)
    .bind(&provider)
    .bind(&encrypted)
    .bind(body.key_name.trim())
    .execute(&state.db)
    .await?;

    Ok(Json(ApiResponse::success(json!({
        "id": id.to_string(),
        "provider": provider,
        "keyName": body.key_name,
        "maskedKey": mask_key(body.api_key.trim()),
        "isActive": true,
        "validateStatus": "",
    }))))
}

pub async fn list(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let rows = sqlx::query_as::<_, KeyRow>(
        "SELECT id, user_id, provider, encrypted_api_key, key_name, is_active, \
         last_validated_at, validate_status \
         FROM service_user_service_db.user_ai_api_keys WHERE user_id = ? ORDER BY id DESC",
    )
    .bind(identity.user_id)
    .fetch_all(&state.db)
    .await?;

    let items: Vec<Value> = rows
        .iter()
        .map(|row| {
            let masked = mask_from_encrypted(&row.encrypted_api_key);
            json!({
                "id": row.id.to_string(),
                "provider": row.provider,
                "keyName": row.key_name,
                "maskedKey": masked,
                "isActive": row.is_active != 0,
                "validateStatus": row.validate_status,
                "lastValidatedAt": row.last_validated_at,
            })
        })
        .collect();

    Ok(Json(ApiResponse::success(
        serde_json::to_value(items).unwrap_or_default(),
    )))
}

pub async fn update(
    headers: HeaderMap,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateKeyRequest>,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let master_key = crypto::load_master_key(&state.config.ai_encryption_key_base64)?;

    let existing = find_key_for_user(&state.db, id, identity.user_id).await?;

    let key_name = body
        .key_name
        .map(|v| v.trim().to_string())
        .unwrap_or(existing.key_name);
    let encrypted = if let Some(ref raw_key) = body.api_key {
        if raw_key.trim().is_empty() {
            return Err(AppError::BadRequest("api_key cannot be empty".into()));
        }
        crypto::encrypt(raw_key.trim(), &master_key)?
    } else {
        existing.encrypted_api_key
    };

    sqlx::query(
        "UPDATE service_user_service_db.user_ai_api_keys \
         SET encrypted_api_key = ?, key_name = ?, updated_time = NOW() \
         WHERE id = ? AND user_id = ?",
    )
    .bind(&encrypted)
    .bind(&key_name)
    .bind(id)
    .bind(identity.user_id)
    .execute(&state.db)
    .await?;

    let masked = mask_from_encrypted(&encrypted);
    Ok(Json(ApiResponse::success(json!({
        "id": id.to_string(),
        "keyName": key_name,
        "maskedKey": masked,
    }))))
}

pub async fn delete(
    headers: HeaderMap,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let result = sqlx::query(
        "DELETE FROM service_user_service_db.user_ai_api_keys WHERE id = ? AND user_id = ?",
    )
    .bind(id)
    .bind(identity.user_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("key not found".into()));
    }
    Ok(Json(ApiResponse::success(json!({"deleted": true}))))
}

pub async fn test(
    headers: HeaderMap,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let master_key = crypto::load_master_key(&state.config.ai_encryption_key_base64)?;
    let existing = find_key_for_user(&state.db, id, identity.user_id).await?;

    let decrypted = crypto::decrypt(&existing.encrypted_api_key, &master_key)?;

    match call_spring_test(&state, &existing.provider, &decrypted).await {
        Ok(status) => {
            let _ = sqlx::query(
                "UPDATE service_user_service_db.user_ai_api_keys \
                 SET validate_status = ?, last_validated_at = ?, updated_time = NOW() \
                 WHERE id = ?",
            )
            .bind(&status)
            .bind(im_common::time::now_ms())
            .bind(id)
            .execute(&state.db)
            .await;
            Ok(Json(ApiResponse::success(json!({
                "id": id.to_string(),
                "validateStatus": status,
            }))))
        }
        Err(message) => {
            let _ = sqlx::query(
                "UPDATE service_user_service_db.user_ai_api_keys \
                 SET validate_status = 'error', last_validated_at = ?, updated_time = NOW() \
                 WHERE id = ?",
            )
            .bind(im_common::time::now_ms())
            .bind(id)
            .execute(&state.db)
            .await;
            Err(AppError::Upstream(message))
        }
    }
}

async fn call_spring_test(
    state: &AppState,
    provider: &str,
    api_key: &str,
) -> Result<String, String> {
    let url = format!("{}/api/ai/internal/test-key", state.config.ai_spring_url);
    let body = json!({
        "provider": provider,
        "apiKey": api_key,
    });
    let response = state
        .http
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|err| format!("spring AI unreachable: {err}"))?;

    let status = response.status();
    let raw: Value = response
        .json()
        .await
        .map_err(|err| format!("bad response: {err}"))?;

    if status.is_success() {
        Ok(raw
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("ok")
            .to_string())
    } else {
        Err(raw
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error")
            .to_string())
    }
}

#[derive(Debug, sqlx::FromRow)]
struct KeyRow {
    id: i64,
    #[allow(dead_code)]
    user_id: i64,
    provider: String,
    encrypted_api_key: String,
    key_name: String,
    is_active: i8,
    last_validated_at: Option<i64>,
    validate_status: String,
}

async fn find_key_for_user(db: &MySqlPool, id: i64, user_id: i64) -> Result<KeyRow, AppError> {
    sqlx::query_as::<_, KeyRow>(
        "SELECT id, user_id, provider, encrypted_api_key, key_name, is_active, \
         last_validated_at, validate_status \
         FROM service_user_service_db.user_ai_api_keys WHERE id = ? AND user_id = ?",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("key not found".into()))
}

fn mask_key(raw: &str) -> String {
    if raw.len() <= 8 {
        return "****".to_string();
    }
    let prefix: String = raw.chars().take(3).collect();
    let suffix: String = raw.chars().rev().take(4).collect::<String>();
    format!("{}****{}", prefix, suffix.chars().rev().collect::<String>())
}

fn mask_from_encrypted(_encrypted: &str) -> String {
    "sk-****".to_string()
}
