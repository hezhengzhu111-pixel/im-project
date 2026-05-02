use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::Json;
use im_rs_common::api::ApiResponse;
use im_rs_common::ids;
use serde::{Deserialize, Serialize};
use sqlx::Row;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCommentRequest {
    pub content: String,
    pub parent_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentsQuery {
    pub cursor: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LikeDto {
    pub id: String,
    pub user_id: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentDto {
    pub id: String,
    pub post_id: String,
    pub user_id: String,
    pub parent_id: Option<String>,
    pub content: String,
    pub created_at: String,
}

fn like_from_row(row: &sqlx::mysql::MySqlRow) -> LikeDto {
    let created_at: chrono::NaiveDateTime = row.try_get("created_at").unwrap_or_default();
    LikeDto {
        id: row
            .try_get::<i64, _>("id")
            .unwrap_or_default()
            .to_string(),
        user_id: row
            .try_get::<i64, _>("user_id")
            .unwrap_or_default()
            .to_string(),
        created_at: created_at.format("%Y-%m-%dT%H:%M:%S").to_string(),
    }
}

fn comment_from_row(row: &sqlx::mysql::MySqlRow) -> CommentDto {
    let created_at: chrono::NaiveDateTime = row.try_get("created_at").unwrap_or_default();
    let parent_id: Option<i64> = row.try_get("parent_id").unwrap_or_default();
    CommentDto {
        id: row
            .try_get::<i64, _>("id")
            .unwrap_or_default()
            .to_string(),
        post_id: row
            .try_get::<i64, _>("post_id")
            .unwrap_or_default()
            .to_string(),
        user_id: row
            .try_get::<i64, _>("user_id")
            .unwrap_or_default()
            .to_string(),
        parent_id: parent_id.map(|v| v.to_string()),
        content: row.try_get("content").unwrap_or_default(),
        created_at: created_at.format("%Y-%m-%dT%H:%M:%S").to_string(),
    }
}

pub async fn like_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(post_id): Path<i64>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user_id = identity.user_id;
    let like_id = ids::next_id(state.config.snowflake_node_id);

    // Use INSERT IGNORE to handle duplicate likes gracefully (UNIQUE constraint on post_id, user_id)
    sqlx::query(
        r#"INSERT IGNORE INTO service_message_service_db.moments_like
           (id, post_id, user_id)
           VALUES (?, ?, ?)"#,
    )
    .bind(like_id)
    .bind(post_id)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    Ok(Json(ApiResponse::success(serde_json::json!({
        "id": like_id.to_string(),
        "liked": true
    }))))
}

pub async fn unlike_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(post_id): Path<i64>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user_id = identity.user_id;

    sqlx::query(
        r#"DELETE FROM service_message_service_db.moments_like
           WHERE post_id = ? AND user_id = ?"#,
    )
    .bind(post_id)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    Ok(Json(ApiResponse::success(true)))
}

pub async fn get_likes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(post_id): Path<i64>,
) -> Result<Json<ApiResponse<Vec<LikeDto>>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;

    let rows = sqlx::query(
        r#"SELECT id, user_id, created_at
           FROM service_message_service_db.moments_like
           WHERE post_id = ?
           ORDER BY created_at DESC"#,
    )
    .bind(post_id)
    .fetch_all(&state.db)
    .await?;

    let likes: Vec<LikeDto> = rows.iter().map(like_from_row).collect();
    Ok(Json(ApiResponse::success(likes)))
}

pub async fn create_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(post_id): Path<i64>,
    Json(form): Json<CreateCommentRequest>,
) -> Result<Json<ApiResponse<CommentDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user_id = identity.user_id;
    let comment_id = ids::next_id(state.config.snowflake_node_id);

    sqlx::query(
        r#"INSERT INTO service_message_service_db.moments_comment
           (id, post_id, user_id, parent_id, content)
           VALUES (?, ?, ?, ?, ?)"#,
    )
    .bind(comment_id)
    .bind(post_id)
    .bind(user_id)
    .bind(form.parent_id)
    .bind(&form.content)
    .execute(&state.db)
    .await?;

    let row = sqlx::query(
        r#"SELECT id, post_id, user_id, parent_id, content, created_at
           FROM service_message_service_db.moments_comment
           WHERE id = ?"#,
    )
    .bind(comment_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(ApiResponse::success(comment_from_row(&row))))
}

pub async fn delete_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(comment_id): Path<i64>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user_id = identity.user_id;

    let result = sqlx::query(
        r#"DELETE FROM service_message_service_db.moments_comment
           WHERE id = ? AND user_id = ?"#,
    )
    .bind(comment_id)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(
            "Comment not found or unauthorized".to_string(),
        ));
    }

    Ok(Json(ApiResponse::success(true)))
}

pub async fn get_comments(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(post_id): Path<i64>,
    Query(query): Query<CommentsQuery>,
) -> Result<Json<ApiResponse<Vec<CommentDto>>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    let cursor = query.cursor.unwrap_or(0);
    let limit = query.limit.unwrap_or(50).min(100);

    let rows = if cursor > 0 {
        sqlx::query(
            r#"SELECT id, post_id, user_id, parent_id, content, created_at
               FROM service_message_service_db.moments_comment
               WHERE post_id = ? AND id > ?
               ORDER BY id ASC
               LIMIT ?"#,
        )
        .bind(post_id)
        .bind(cursor)
        .bind(limit)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query(
            r#"SELECT id, post_id, user_id, parent_id, content, created_at
               FROM service_message_service_db.moments_comment
               WHERE post_id = ?
               ORDER BY id ASC
               LIMIT ?"#,
        )
        .bind(post_id)
        .bind(limit)
        .fetch_all(&state.db)
        .await?
    };

    let comments: Vec<CommentDto> = rows.iter().map(comment_from_row).collect();
    Ok(Json(ApiResponse::success(comments)))
}
