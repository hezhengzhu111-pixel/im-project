use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Column;
use sqlx::Row;

use crate::error::AppError;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct FileListQuery {
    pub page_num: Option<i32>,
    pub page_size: Option<i32>,
    pub id: Option<i64>,
    pub user_id: Option<i64>,
    pub file_type: Option<String>,
    pub filename: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ActionRequest {
    pub reason: String,
}

// GET /api/admin/files/list
pub async fn list_files(
    State(state): State<AppState>,
    Query(query): Query<FileListQuery>,
) -> Result<Json<Value>, AppError> {
    let page_num = query.page_num.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(20);
    let offset = (page_num - 1) * page_size;

    let mut sql = String::from(
        "SELECT id, filename, file_type, size, user_id, url, path, status, created_time
         FROM file_metadata WHERE 1=1",
    );
    let mut count_sql = String::from("SELECT COUNT(*) as total FROM file_metadata WHERE 1=1");

    if let Some(id) = query.id {
        sql.push_str(&format!(" AND id = {}", id));
        count_sql.push_str(&format!(" AND id = {}", id));
    }
    if let Some(user_id) = query.user_id {
        sql.push_str(&format!(" AND user_id = {}", user_id));
        count_sql.push_str(&format!(" AND user_id = {}", user_id));
    }
    if let Some(ref file_type) = query.file_type {
        sql.push_str(&format!(" AND file_type = '{}'", file_type));
        count_sql.push_str(&format!(" AND file_type = '{}'", file_type));
    }
    if let Some(ref filename) = query.filename {
        sql.push_str(&format!(" AND filename LIKE '%{}%'", filename));
        count_sql.push_str(&format!(" AND filename LIKE '%{}%'", filename));
    }

    sql.push_str(&format!(
        " ORDER BY created_time DESC LIMIT {} OFFSET {}",
        page_size, offset
    ));

    let rows = sqlx::query(&sql).fetch_all(&state.file_db).await?;

    let count: (i64,) = sqlx::query_as(&count_sql).fetch_one(&state.file_db).await?;

    let files: Vec<Value> = rows
        .iter()
        .map(|row| {
            let mut map = serde_json::Map::new();
            for (i, col) in row.columns().iter().enumerate() {
                let value: Value = match row.try_get::<String, _>(i) {
                    Ok(s) => Value::String(s),
                    Err(_) => match row.try_get::<i64, _>(i) {
                        Ok(n) => json!(n),
                        Err(_) => match row.try_get::<f64, _>(i) {
                            Ok(f) => json!(f),
                            Err(_) => match row.try_get::<bool, _>(i) {
                                Ok(b) => json!(b),
                                Err(_) => Value::Null,
                            },
                        },
                    },
                };
                map.insert(col.name().to_string(), value);
            }
            Value::Object(map)
        })
        .collect();

    Ok(Json(json!({
        "success": true,
        "message": "Success",
        "data": {
            "rows": files,
            "total": count.0
        }
    })))
}

// GET /api/admin/files/{id}
pub async fn get_file(
    State(state): State<AppState>,
    Path(file_id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let sql = "SELECT id, filename, file_type, size, user_id, url, path, status, created_time FROM file_metadata WHERE id = ?";
    let row = sqlx::query(sql)
        .bind(file_id)
        .fetch_one(&state.file_db)
        .await?;

    let mut map = serde_json::Map::new();
    for (i, col) in row.columns().iter().enumerate() {
        let value: Value = match row.try_get::<String, _>(i) {
            Ok(s) => Value::String(s),
            Err(_) => match row.try_get::<i64, _>(i) {
                Ok(n) => json!(n),
                Err(_) => match row.try_get::<f64, _>(i) {
                    Ok(f) => json!(f),
                    Err(_) => match row.try_get::<bool, _>(i) {
                        Ok(b) => json!(b),
                        Err(_) => Value::Null,
                    },
                },
            },
        };
        map.insert(col.name().to_string(), value);
    }

    Ok(Json(json!({
        "success": true,
        "message": "Success",
        "data": Value::Object(map)
    })))
}

// GET /api/admin/files/stats
pub async fn get_storage_stats(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let sql = "SELECT 
        COUNT(*) as total_files,
        COALESCE(SUM(size), 0) as total_size,
        SUM(CASE WHEN file_type = 'image' THEN 1 ELSE 0 END) as image_count,
        COALESCE(SUM(CASE WHEN file_type = 'image' THEN size ELSE 0 END), 0) as image_size,
        SUM(CASE WHEN file_type = 'video' THEN 1 ELSE 0 END) as video_count,
        COALESCE(SUM(CASE WHEN file_type = 'video' THEN size ELSE 0 END), 0) as video_size,
        SUM(CASE WHEN file_type = 'audio' THEN 1 ELSE 0 END) as audio_count,
        COALESCE(SUM(CASE WHEN file_type = 'audio' THEN size ELSE 0 END), 0) as audio_size,
        SUM(CASE WHEN file_type = 'file' THEN 1 ELSE 0 END) as file_count,
        COALESCE(SUM(CASE WHEN file_type = 'file' THEN size ELSE 0 END), 0) as file_size
        FROM file_metadata WHERE status = 1";

    let row = sqlx::query(sql).fetch_one(&state.file_db).await?;

    let mut map = serde_json::Map::new();
    for (i, col) in row.columns().iter().enumerate() {
        let value: Value = match row.try_get::<String, _>(i) {
            Ok(s) => Value::String(s),
            Err(_) => match row.try_get::<i64, _>(i) {
                Ok(n) => json!(n),
                Err(_) => match row.try_get::<f64, _>(i) {
                    Ok(f) => json!(f),
                    Err(_) => match row.try_get::<bool, _>(i) {
                        Ok(b) => json!(b),
                        Err(_) => Value::Null,
                    },
                },
            },
        };
        map.insert(col.name().to_string(), value);
    }

    Ok(Json(json!({
        "success": true,
        "message": "Success",
        "data": Value::Object(map)
    })))
}

// POST /api/admin/files/{id}/delete
pub async fn delete_file(
    State(state): State<AppState>,
    Path(file_id): Path<i64>,
    Json(req): Json<ActionRequest>,
) -> Result<Json<Value>, AppError> {
    let url = format!(
        "{}/api/admin/files/{}/delete",
        state.config.api_server_url, file_id
    );
    let response = state
        .http
        .post(&url)
        .json(&json!({ "reason": req.reason }))
        .send()
        .await?;

    if response.status().is_success() {
        Ok(Json(json!({
            "success": true,
            "message": "File deleted"
        })))
    } else {
        Err(AppError::Upstream("Failed to delete file".to_string()))
    }
}
