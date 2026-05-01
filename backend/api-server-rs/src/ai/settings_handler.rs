use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use im_rs_common::api::ApiResponse;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAiSettingsRequest {
    pub auto_reply_enabled: Option<bool>,
    pub auto_reply_persona: Option<String>,
}

pub async fn get(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let row = sqlx::query_as::<_, AiSettingsRow>(
        "SELECT user_id, auto_reply_enabled, auto_reply_persona \
         FROM service_user_service_db.user_ai_settings WHERE user_id = ?",
    )
    .bind(identity.user_id)
    .fetch_optional(&state.db)
    .await?;

    let settings = match row {
        Some(r) => json!({
            "autoReplyEnabled": r.auto_reply_enabled != 0,
            "autoReplyPersona": r.auto_reply_persona,
        }),
        None => json!({
            "autoReplyEnabled": false,
            "autoReplyPersona": "",
        }),
    };

    Ok(Json(ApiResponse::success(settings)))
}

pub async fn update(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(body): Json<UpdateAiSettingsRequest>,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    let auto_reply_enabled = body.auto_reply_enabled.map(|v| i8::from(v));
    let auto_reply_persona = body.auto_reply_persona.map(|v| v.trim().to_string());

    sqlx::query(
        "INSERT INTO service_user_service_db.user_ai_settings \
         (user_id, auto_reply_enabled, auto_reply_persona, created_time, updated_time) \
         VALUES (?, ?, ?, NOW(), NOW()) \
         ON DUPLICATE KEY UPDATE \
         auto_reply_enabled = COALESCE(?, auto_reply_enabled), \
         auto_reply_persona = COALESCE(?, auto_reply_persona), \
         updated_time = NOW()",
    )
    .bind(identity.user_id)
    .bind(auto_reply_enabled)
    .bind(&auto_reply_persona)
    .bind(auto_reply_enabled)
    .bind(&auto_reply_persona)
    .execute(&state.db)
    .await?;

    let updated = get_impl(identity.user_id, &state.db).await?;
    Ok(Json(ApiResponse::success(updated)))
}

async fn get_impl(user_id: i64, db: &sqlx::MySqlPool) -> Result<Value, AppError> {
    let row = sqlx::query_as::<_, AiSettingsRow>(
        "SELECT user_id, auto_reply_enabled, auto_reply_persona \
         FROM service_user_service_db.user_ai_settings WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?;

    Ok(match row {
        Some(r) => json!({
            "autoReplyEnabled": r.auto_reply_enabled != 0,
            "autoReplyPersona": r.auto_reply_persona,
        }),
        None => json!({
            "autoReplyEnabled": false,
            "autoReplyPersona": "",
        }),
    })
}

#[derive(Debug, sqlx::FromRow)]
struct AiSettingsRow {
    #[allow(dead_code)]
    user_id: i64,
    auto_reply_enabled: i8,
    auto_reply_persona: String,
}
