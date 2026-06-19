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
pub struct GroupListQuery {
    pub page_num: Option<i32>,
    pub page_size: Option<i32>,
    pub id: Option<i64>,
    pub name: Option<String>,
    pub owner_id: Option<i64>,
    pub status: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct ActionRequest {
    pub reason: String,
}

// GET /api/admin/groups/list
pub async fn list_groups(
    State(state): State<AppState>,
    Query(query): Query<GroupListQuery>,
) -> Result<Json<Value>, AppError> {
    let page_num = query.page_num.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(20);
    let offset = (page_num - 1) * page_size;

    let mut sql = String::from(
        "SELECT g.id, g.name, g.avatar, g.owner_id, g.announcement, g.description, 
         g.member_count, g.max_members, g.status, g.created_time,
         u.username as owner_username, u.nickname as owner_nickname
         FROM im_group g 
         LEFT JOIN users u ON g.owner_id = u.id 
         WHERE 1=1",
    );
    let mut count_sql = String::from("SELECT COUNT(*) as total FROM im_group g WHERE 1=1");

    if let Some(id) = query.id {
        sql.push_str(&format!(" AND g.id = {}", id));
        count_sql.push_str(&format!(" AND g.id = {}", id));
    }
    if let Some(ref name) = query.name {
        sql.push_str(&format!(" AND g.name LIKE '%{}%'", name));
        count_sql.push_str(&format!(" AND g.name LIKE '%{}%'", name));
    }
    if let Some(owner_id) = query.owner_id {
        sql.push_str(&format!(" AND g.owner_id = {}", owner_id));
        count_sql.push_str(&format!(" AND g.owner_id = {}", owner_id));
    }
    if let Some(status) = query.status {
        sql.push_str(&format!(" AND g.status = {}", status));
        count_sql.push_str(&format!(" AND g.status = {}", status));
    }

    sql.push_str(&format!(
        " ORDER BY g.created_time DESC LIMIT {} OFFSET {}",
        page_size, offset
    ));

    let rows = sqlx::query(&sql).fetch_all(&state.group_db).await?;

    let count: (i64,) = sqlx::query_as(&count_sql)
        .fetch_one(&state.group_db)
        .await?;

    let groups: Vec<Value> = rows
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
            "rows": groups,
            "total": count.0
        }
    })))
}

// GET /api/admin/groups/{id}
pub async fn get_group(
    State(state): State<AppState>,
    Path(group_id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let sql = "SELECT g.id, g.name, g.avatar, g.owner_id, g.announcement, g.description, 
               g.member_count, g.max_members, g.status, g.created_time,
               u.username as owner_username, u.nickname as owner_nickname
               FROM im_group g 
               LEFT JOIN users u ON g.owner_id = u.id 
               WHERE g.id = ?";
    let row = sqlx::query(sql)
        .bind(group_id)
        .fetch_one(&state.group_db)
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

// GET /api/admin/groups/{id}/members
pub async fn get_group_members(
    State(state): State<AppState>,
    Path(group_id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let sql =
        "SELECT gm.user_id as member_id, u.username, u.nickname, gm.role, gm.status, gm.join_time
               FROM im_group_member gm
               LEFT JOIN users u ON gm.user_id = u.id
               WHERE gm.group_id = ?";
    let rows = sqlx::query(sql)
        .bind(group_id)
        .fetch_all(&state.group_db)
        .await?;

    let members: Vec<Value> = rows
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
        "data": members
    })))
}

// POST /api/admin/groups/{id}/dismiss
pub async fn dismiss_group(
    State(state): State<AppState>,
    Path(group_id): Path<i64>,
    Json(req): Json<ActionRequest>,
) -> Result<Json<Value>, AppError> {
    let url = format!(
        "{}/api/admin/groups/{}/dismiss",
        state.config.api_server_url, group_id
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
            "message": "Group dismissed"
        })))
    } else {
        Err(AppError::Upstream("Failed to dismiss group".to_string()))
    }
}
