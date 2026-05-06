use crate::ai::summary_handler::resolve_provider_and_key;
use crate::ai::task_bridge::{self, TaskPayload, TaskType};
use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::file_api;
use crate::web::AppState;
use axum::extract::{Multipart, Path, State};
use axum::http::HeaderMap;
use axum::Json;
use im_rs_common::api::ApiResponse;
use im_rs_common::ids;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RagQueryRequest {
    pub query: String,
    pub group_id: Option<i64>,
}

const ALLOWED_RAG_TYPES: &[&str] = &[
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
];

pub async fn upload(
    headers: HeaderMap,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let mut group_id: Option<i64> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().map(|s| s.to_string()).unwrap_or_default();
        if name == "groupId" {
            if let Ok(text) = field.text().await {
                if let Ok(id) = text.trim().parse::<i64>() {
                    group_id = Some(id);
                }
            }
        } else if name == "file" {
            let file_name = field
                .file_name()
                .map(|s| s.to_string())
                .unwrap_or_else(|| "unknown".to_string());
            let content_type = field
                .content_type()
                .map(|s| s.to_string())
                .unwrap_or_else(|| "application/octet-stream".to_string());

            if !ALLOWED_RAG_TYPES.contains(&content_type.as_str()) {
                return Err(AppError::BadRequest(format!(
                    "unsupported file type: {content_type}"
                )));
            }

            let data = field
                .bytes()
                .await
                .map_err(|_| AppError::BadRequest("read upload failed".into()))?;
            let file_size = i64::try_from(data.len())
                .map_err(|_| AppError::BadRequest("file too large".to_string()))?;
            let file_type = match content_type.as_str() {
                "application/pdf" => "pdf",
                "application/msword" => "doc",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => "docx",
                "text/plain" => "txt",
                _ => "unknown",
            };

            let saved = file_api::store_knowledge_file(
                &state.config.storage_base_dir,
                &file_name,
                file_type,
                &data,
            )?;

            let doc_id = ids::next_id(state.config.ai_snowflake_node_id);
            sqlx::query(
                "INSERT INTO service_user_service_db.user_knowledge_docs \
                 (id, user_id, group_id, file_name, file_type, file_size, oss_url, chunk_count, parse_status, created_time, updated_time) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'pending', NOW(), NOW())",
            )
            .bind(doc_id)
            .bind(identity.user_id)
            .bind(group_id)
            .bind(&file_name)
            .bind(file_type)
            .bind(file_size)
            .bind(&saved.url)
            .execute(&state.db)
            .await?;

            let mut hot_redis = state.redis_manager.clone();
            task_bridge::enqueue_task(
                &mut hot_redis,
                &state.config,
                TaskPayload {
                    task_type: TaskType::RagParse,
                    user_id: identity.user_id,
                    doc_id: Some(doc_id),
                    oss_url: Some(saved.url),
                    ..Default::default()
                },
            )
            .await?;

            return Ok(Json(ApiResponse::success(json!({
                "id": doc_id,
                "fileName": file_name,
                "fileType": file_type,
                "fileSize": file_size,
                "parseStatus": "pending",
            }))));
        }
    }

    Err(AppError::BadRequest("no file found in upload".into()))
}

pub async fn list(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let rows = sqlx::query_as::<_, DocRow>(
        "SELECT id, user_id, group_id, file_name, file_type, file_size, \
         oss_url, chunk_count, parse_status, \
         UNIX_TIMESTAMP(created_time) as created_ts, \
         UNIX_TIMESTAMP(updated_time) as updated_ts \
         FROM service_user_service_db.user_knowledge_docs \
         WHERE user_id = ? ORDER BY id DESC",
    )
    .bind(identity.user_id)
    .fetch_all(&state.db)
    .await?;

    let items: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.id,
                "userId": r.user_id,
                "groupId": r.group_id,
                "fileName": r.file_name,
                "fileType": r.file_type,
                "fileSize": r.file_size,
                "ossUrl": r.oss_url,
                "chunkCount": r.chunk_count,
                "parseStatus": r.parse_status,
                "createdAt": r.created_ts.map(|t| t * 1000),
                "updatedAt": r.updated_ts.map(|t| t * 1000),
            })
        })
        .collect();

    Ok(Json(ApiResponse::success(
        serde_json::to_value(items).unwrap_or_default(),
    )))
}

pub async fn delete_doc(
    headers: HeaderMap,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let result = sqlx::query(
        "DELETE FROM service_user_service_db.user_knowledge_docs WHERE id = ? AND user_id = ?",
    )
    .bind(id)
    .bind(identity.user_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("document not found".into()));
    }
    Ok(Json(ApiResponse::success(json!({"deleted": true}))))
}

pub async fn query(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(body): Json<RagQueryRequest>,
) -> Result<Json<ApiResponse<Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let query = body.query.trim().to_string();
    if query.is_empty() {
        return Err(AppError::BadRequest("query is required".into()));
    }

    let task_id = ids::next_id(state.config.ai_snowflake_node_id);
    let (provider, decrypted_key) =
        resolve_provider_and_key(&state.db, &state.config, identity.user_id).await?;

    let mut hot_redis = state.redis_manager.clone();
    task_bridge::enqueue_task(
        &mut hot_redis,
        &state.config,
        TaskPayload {
            task_type: TaskType::RagQuery,
            user_id: identity.user_id,
            provider: Some(provider),
            decrypted_key: Some(decrypted_key),
            query: Some(query),
            group_id: body.group_id,
            task_id: Some(task_id),
            ..Default::default()
        },
    )
    .await?;

    Ok(Json(ApiResponse::success(json!({
        "taskId": task_id,
        "streamUrl": format!("/api/ai/stream/{}", task_id),
    }))))
}

#[derive(Debug, sqlx::FromRow)]
struct DocRow {
    id: i64,
    #[allow(dead_code)]
    user_id: i64,
    group_id: Option<i64>,
    file_name: String,
    file_type: String,
    file_size: i64,
    oss_url: String,
    chunk_count: i32,
    parse_status: String,
    created_ts: Option<i64>,
    updated_ts: Option<i64>,
}
