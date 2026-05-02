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
pub struct CreatePostRequest {
    pub content: Option<String>,
    pub visibility: Option<i8>,
    pub link_url: Option<String>,
    pub link_title: Option<String>,
    pub link_cover: Option<String>,
    pub location: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedQuery {
    pub cursor: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostDto {
    pub id: String,
    pub user_id: String,
    pub content: Option<String>,
    pub visibility: i8,
    pub link_url: Option<String>,
    pub link_title: Option<String>,
    pub link_cover: Option<String>,
    pub location: Option<String>,
    pub status: i8,
    pub created_at: String,
    pub updated_at: String,
}

fn post_from_row(row: &sqlx::mysql::MySqlRow) -> PostDto {
    let created_at: chrono::NaiveDateTime = row.try_get("created_at").unwrap_or_default();
    let updated_at: chrono::NaiveDateTime = row.try_get("updated_at").unwrap_or_default();
    PostDto {
        id: row
            .try_get::<i64, _>("id")
            .unwrap_or_default()
            .to_string(),
        user_id: row
            .try_get::<i64, _>("user_id")
            .unwrap_or_default()
            .to_string(),
        content: row.try_get("content").unwrap_or_default(),
        visibility: row.try_get("visibility").unwrap_or_default(),
        link_url: row.try_get("link_url").unwrap_or_default(),
        link_title: row.try_get("link_title").unwrap_or_default(),
        link_cover: row.try_get("link_cover").unwrap_or_default(),
        location: row.try_get("location").unwrap_or_default(),
        status: row.try_get("status").unwrap_or_default(),
        created_at: created_at.format("%Y-%m-%dT%H:%M:%S").to_string(),
        updated_at: updated_at.format("%Y-%m-%dT%H:%M:%S").to_string(),
    }
}

pub async fn create_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(form): Json<CreatePostRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user_id = identity.user_id;
    let post_id = ids::next_id(state.config.snowflake_node_id);
    let visibility = form.visibility.unwrap_or(0);

    sqlx::query(
        r#"INSERT INTO service_message_service_db.moments_post
           (id, user_id, content, visibility, link_url, link_title, link_cover, location, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"#,
    )
    .bind(post_id)
    .bind(user_id)
    .bind(&form.content)
    .bind(visibility)
    .bind(&form.link_url)
    .bind(&form.link_title)
    .bind(&form.link_cover)
    .bind(&form.location)
    .execute(&state.db)
    .await?;

    // TODO: Trigger async fan-out to friends' feed caches

    Ok(Json(ApiResponse::success(serde_json::json!({
        "id": post_id.to_string()
    }))))
}

pub async fn get_feed(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<FeedQuery>,
) -> Result<Json<ApiResponse<Vec<PostDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let _user_id = identity.user_id;
    let cursor = query.cursor.unwrap_or(i64::MAX);
    let limit = query.limit.unwrap_or(20).min(50);

    // TODO: Check Redis cache first, fallback to MySQL

    let rows = sqlx::query(
        r#"SELECT id, user_id, content, visibility, link_url, link_title, link_cover, location, status, created_at, updated_at
           FROM service_message_service_db.moments_post
           WHERE id < ? AND status = 0
           ORDER BY id DESC
           LIMIT ?"#,
    )
    .bind(cursor)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    let posts: Vec<PostDto> = rows.iter().map(post_from_row).collect();
    Ok(Json(ApiResponse::success(posts)))
}

pub async fn get_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(post_id): Path<i64>,
) -> Result<Json<ApiResponse<PostDto>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;

    let row = sqlx::query(
        r#"SELECT id, user_id, content, visibility, link_url, link_title, link_cover, location, status, created_at, updated_at
           FROM service_message_service_db.moments_post
           WHERE id = ? AND status = 0"#,
    )
    .bind(post_id)
    .fetch_optional(&state.db)
    .await?;

    match row {
        Some(r) => Ok(Json(ApiResponse::success(post_from_row(&r)))),
        None => Err(AppError::NotFound("Post not found".to_string())),
    }
}

pub async fn delete_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(post_id): Path<i64>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user_id = identity.user_id;

    let result = sqlx::query(
        r#"UPDATE service_message_service_db.moments_post SET status = 1
           WHERE id = ? AND user_id = ?"#,
    )
    .bind(post_id)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(
            "Post not found or unauthorized".to_string(),
        ));
    }

    // TODO: Clean up Redis cache

    Ok(Json(ApiResponse::success(true)))
}

pub async fn get_user_posts(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(target_user_id): Path<i64>,
    Query(query): Query<FeedQuery>,
) -> Result<Json<ApiResponse<Vec<PostDto>>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    let cursor = query.cursor.unwrap_or(i64::MAX);
    let limit = query.limit.unwrap_or(20).min(50);

    let rows = sqlx::query(
        r#"SELECT id, user_id, content, visibility, link_url, link_title, link_cover, location, status, created_at, updated_at
           FROM service_message_service_db.moments_post
           WHERE user_id = ? AND id < ? AND status = 0
           ORDER BY id DESC
           LIMIT ?"#,
    )
    .bind(target_user_id)
    .bind(cursor)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    let posts: Vec<PostDto> = rows.iter().map(post_from_row).collect();
    Ok(Json(ApiResponse::success(posts)))
}
