use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::{Query, State};
use axum::http::HeaderMap;
use axum::Json;
use im_rs_common::api::ApiResponse;
use serde::{Deserialize, Serialize};
use sqlx::Row;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationsQuery {
    pub cursor: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationDto {
    pub id: String,
    pub actor_id: String,
    pub notification_type: String,
    pub post_id: String,
    pub comment_id: Option<String>,
    pub is_read: bool,
    pub created_at: String,
}

fn notification_from_row(row: &sqlx::mysql::MySqlRow) -> NotificationDto {
    let created_at: chrono::NaiveDateTime = row.try_get("created_at").unwrap_or_default();
    let comment_id: Option<i64> = row.try_get("comment_id").unwrap_or_default();
    let is_read: i8 = row.try_get("is_read").unwrap_or_default();
    NotificationDto {
        id: row.try_get::<i64, _>("id").unwrap_or_default().to_string(),
        actor_id: row
            .try_get::<i64, _>("actor_id")
            .unwrap_or_default()
            .to_string(),
        notification_type: row.try_get("notification_type").unwrap_or_default(),
        post_id: row
            .try_get::<i64, _>("post_id")
            .unwrap_or_default()
            .to_string(),
        comment_id: comment_id.map(|v| v.to_string()),
        is_read: is_read != 0,
        created_at: created_at.format("%Y-%m-%dT%H:%M:%S").to_string(),
    }
}

pub async fn get_notifications(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<NotificationsQuery>,
) -> Result<Json<ApiResponse<Vec<NotificationDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user_id = identity.user_id;
    let cursor = query.cursor.unwrap_or(i64::MAX);
    let limit = query.limit.unwrap_or(20).min(50);

    let rows = sqlx::query(
        r#"SELECT id, actor_id, notification_type, post_id, comment_id, is_read, created_at
           FROM service_message_service_db.moments_notification
           WHERE user_id = ? AND id < ?
           ORDER BY id DESC
           LIMIT ?"#,
    )
    .bind(user_id)
    .bind(cursor)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    let notifications: Vec<NotificationDto> = rows.iter().map(notification_from_row).collect();
    Ok(Json(ApiResponse::success(notifications)))
}

pub async fn mark_all_read(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user_id = identity.user_id;

    sqlx::query(
        r#"UPDATE service_message_service_db.moments_notification
           SET is_read = 1
           WHERE user_id = ? AND is_read = 0"#,
    )
    .bind(user_id)
    .execute(&state.db)
    .await?;

    Ok(Json(ApiResponse::success(true)))
}
