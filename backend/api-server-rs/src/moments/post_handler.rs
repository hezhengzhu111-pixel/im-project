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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaDto {
    pub id: String,
    pub post_id: String,
    #[serde(rename = "type")]
    pub media_type: i8,
    pub url: String,
    pub sort_order: i8,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostWithDetailsDto {
    pub post: PostDto,
    pub media: Vec<MediaDto>,
    pub like_count: i64,
    pub comment_count: i64,
    pub is_liked: bool,
    pub user_nickname: Option<String>,
    pub user_avatar: Option<String>,
}

fn post_from_row(row: &sqlx::mysql::MySqlRow) -> PostDto {
    let created_at: chrono::NaiveDateTime = row.try_get("created_at").unwrap_or_default();
    let updated_at: chrono::NaiveDateTime = row.try_get("updated_at").unwrap_or_default();
    PostDto {
        id: row.try_get::<i64, _>("id").unwrap_or_default().to_string(),
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

fn media_from_row(row: &sqlx::mysql::MySqlRow) -> MediaDto {
    MediaDto {
        id: row.try_get::<i64, _>("id").unwrap_or_default().to_string(),
        post_id: row
            .try_get::<i64, _>("post_id")
            .unwrap_or_default()
            .to_string(),
        media_type: row.try_get::<i8, _>("type").unwrap_or_default(),
        url: row.try_get("url").unwrap_or_default(),
        sort_order: row.try_get::<i8, _>("sort_order").unwrap_or_default(),
    }
}

/// Build PostWithDetailsDto from a list of PostDto, enriching with media, counts, user info.
async fn enrich_posts(
    state: &AppState,
    posts: Vec<PostDto>,
    user_id: i64,
) -> Result<Vec<PostWithDetailsDto>, AppError> {
    if posts.is_empty() {
        return Ok(vec![]);
    }

    let post_ids: Vec<i64> = posts
        .iter()
        .filter_map(|p| p.id.parse::<i64>().ok())
        .collect();
    let user_ids: Vec<i64> = posts
        .iter()
        .filter_map(|p| p.user_id.parse::<i64>().ok())
        .collect();

    // Batch fetch media
    let media_rows = if post_ids.is_empty() {
        vec![]
    } else {
        let placeholders = post_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT id, post_id, type, url, sort_order FROM service_message_service_db.moments_media WHERE post_id IN ({}) ORDER BY sort_order ASC",
            placeholders
        );
        let mut q = sqlx::query(&sql);
        for id in &post_ids {
            q = q.bind(id);
        }
        q.fetch_all(&state.db).await?
    };

    let mut media_map: std::collections::HashMap<String, Vec<MediaDto>> =
        std::collections::HashMap::new();
    for row in media_rows {
        let m = media_from_row(&row);
        media_map.entry(m.post_id.clone()).or_default().push(m);
    }

    // Batch fetch like counts
    let like_count_rows = if post_ids.is_empty() {
        vec![]
    } else {
        let placeholders = post_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT post_id, COUNT(*) as cnt FROM service_message_service_db.moments_like WHERE post_id IN ({}) GROUP BY post_id",
            placeholders
        );
        let mut q = sqlx::query(&sql);
        for id in &post_ids {
            q = q.bind(id);
        }
        q.fetch_all(&state.db).await?
    };

    let mut like_count_map: std::collections::HashMap<String, i64> =
        std::collections::HashMap::new();
    for row in like_count_rows {
        let pid: i64 = row.try_get("post_id").unwrap_or_default();
        let cnt: i64 = row.try_get("cnt").unwrap_or_default();
        like_count_map.insert(pid.to_string(), cnt);
    }

    // Batch fetch comment counts
    let comment_count_rows = if post_ids.is_empty() {
        vec![]
    } else {
        let placeholders = post_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT post_id, COUNT(*) as cnt FROM service_message_service_db.moments_comment WHERE post_id IN ({}) GROUP BY post_id",
            placeholders
        );
        let mut q = sqlx::query(&sql);
        for id in &post_ids {
            q = q.bind(id);
        }
        q.fetch_all(&state.db).await?
    };

    let mut comment_count_map: std::collections::HashMap<String, i64> =
        std::collections::HashMap::new();
    for row in comment_count_rows {
        let pid: i64 = row.try_get("post_id").unwrap_or_default();
        let cnt: i64 = row.try_get("cnt").unwrap_or_default();
        comment_count_map.insert(pid.to_string(), cnt);
    }

    // Check which posts the current user has liked
    let liked_rows = if post_ids.is_empty() {
        vec![]
    } else {
        let placeholders = post_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT post_id FROM service_message_service_db.moments_like WHERE user_id = ? AND post_id IN ({})",
            placeholders
        );
        let mut q = sqlx::query(&sql).bind(user_id);
        for id in &post_ids {
            q = q.bind(id);
        }
        q.fetch_all(&state.db).await?
    };

    let mut liked_set: std::collections::HashSet<String> = std::collections::HashSet::new();
    for row in liked_rows {
        let pid: i64 = row.try_get("post_id").unwrap_or_default();
        liked_set.insert(pid.to_string());
    }

    // Batch fetch user info (nickname/username, avatar) from service_user_service_db.users
    let user_rows = if user_ids.is_empty() {
        vec![]
    } else {
        let placeholders = user_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT id, COALESCE(nickname, username) as display_name, avatar FROM service_user_service_db.users WHERE id IN ({})",
            placeholders
        );
        let mut q = sqlx::query(&sql);
        for id in &user_ids {
            q = q.bind(id);
        }
        q.fetch_all(&state.db).await?
    };

    let mut user_map: std::collections::HashMap<String, (Option<String>, Option<String>)> =
        std::collections::HashMap::new();
    for row in user_rows {
        let uid: i64 = row.try_get("id").unwrap_or_default();
        let display_name: Option<String> = row.try_get("display_name").unwrap_or_default();
        let avatar: Option<String> = row.try_get("avatar").unwrap_or_default();
        user_map.insert(uid.to_string(), (display_name, avatar));
    }

    // Assemble
    let result: Vec<PostWithDetailsDto> = posts
        .into_iter()
        .map(|post| {
            let pid = post.id.clone();
            let (nickname, avatar) = user_map.get(&post.user_id).cloned().unwrap_or((None, None));
            PostWithDetailsDto {
                post,
                media: media_map.remove(&pid).unwrap_or_default(),
                like_count: like_count_map.get(&pid).copied().unwrap_or(0),
                comment_count: comment_count_map.get(&pid).copied().unwrap_or(0),
                is_liked: liked_set.contains(&pid),
                user_nickname: nickname,
                user_avatar: avatar,
            }
        })
        .collect();

    Ok(result)
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

    Ok(Json(ApiResponse::success(serde_json::json!({
        "id": post_id.to_string()
    }))))
}

pub async fn get_feed(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<FeedQuery>,
) -> Result<Json<ApiResponse<Vec<PostWithDetailsDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user_id = identity.user_id;
    let cursor = query.cursor.unwrap_or(i64::MAX);
    let limit = query.limit.unwrap_or(20).min(50);

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
    let enriched = enrich_posts(&state, posts, user_id).await?;
    Ok(Json(ApiResponse::success(enriched)))
}

pub async fn get_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(post_id): Path<i64>,
) -> Result<Json<ApiResponse<PostWithDetailsDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user_id = identity.user_id;

    let row = sqlx::query(
        r#"SELECT id, user_id, content, visibility, link_url, link_title, link_cover, location, status, created_at, updated_at
           FROM service_message_service_db.moments_post
           WHERE id = ? AND status = 0"#,
    )
    .bind(post_id)
    .fetch_optional(&state.db)
    .await?;

    match row {
        Some(r) => {
            let post = post_from_row(&r);
            let mut enriched = enrich_posts(&state, vec![post], user_id).await?;
            match enriched.pop() {
                Some(details) => Ok(Json(ApiResponse::success(details))),
                None => Err(AppError::NotFound("Post not found".to_string())),
            }
        }
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

    Ok(Json(ApiResponse::success(true)))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddMediaItem {
    pub url: String,
    #[serde(rename = "type")]
    pub media_type: Option<i8>,
    pub sort_order: Option<i8>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddMediaRequest {
    pub media: Vec<AddMediaItem>,
}

pub async fn add_media(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(post_id): Path<i64>,
    Json(form): Json<AddMediaRequest>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user_id = identity.user_id;

    // Verify the post belongs to the user
    let row = sqlx::query(
        "SELECT user_id FROM service_message_service_db.moments_post WHERE id = ? AND status = 0",
    )
    .bind(post_id)
    .fetch_optional(&state.db)
    .await?;

    match row {
        Some(r) => {
            let owner: i64 = r.try_get("user_id").unwrap_or_default();
            if owner != user_id {
                return Err(AppError::NotFound(
                    "Post not found or unauthorized".to_string(),
                ));
            }
        }
        None => {
            return Err(AppError::NotFound("Post not found".to_string()));
        }
    }

    for (i, item) in form.media.iter().enumerate() {
        let media_id = ids::next_id(state.config.snowflake_node_id);
        let media_type = item.media_type.unwrap_or(0);
        let sort_order = item.sort_order.unwrap_or(i as i8);

        sqlx::query(
            r#"INSERT INTO service_message_service_db.moments_media
               (id, post_id, type, url, sort_order)
               VALUES (?, ?, ?, ?, ?)"#,
        )
        .bind(media_id)
        .bind(post_id)
        .bind(media_type)
        .bind(&item.url)
        .bind(sort_order)
        .execute(&state.db)
        .await?;
    }

    Ok(Json(ApiResponse::success(true)))
}

pub async fn get_user_posts(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(target_user_id): Path<i64>,
    Query(query): Query<FeedQuery>,
) -> Result<Json<ApiResponse<Vec<PostWithDetailsDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user_id = identity.user_id;
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
    let enriched = enrich_posts(&state, posts, user_id).await?;
    Ok(Json(ApiResponse::success(enriched)))
}
