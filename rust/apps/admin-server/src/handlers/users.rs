use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Column;
use sqlx::Row;

use crate::error::AppError;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct UserListQuery {
    pub page_num: Option<i32>,
    pub page_size: Option<i32>,
    pub id: Option<i64>,
    pub username: Option<String>,
    pub nickname: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub status: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct ActionRequest {
    pub reason: String,
}

// GET /api/admin/users/list
pub async fn list_users(
    State(state): State<AppState>,
    Query(query): Query<UserListQuery>,
) -> Result<Json<Value>, AppError> {
    let page_num = query.page_num.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(20);
    let offset = (page_num - 1) * page_size;

    let mut sql = String::from(
        "SELECT id, username, nickname, avatar, phone, email, status, gender, signature, location, last_login_time, created_time 
         FROM users WHERE 1=1"
    );
    let mut count_sql = String::from("SELECT COUNT(*) as total FROM users WHERE 1=1");

    if let Some(id) = query.id {
        sql.push_str(&format!(" AND id = {}", id));
        count_sql.push_str(&format!(" AND id = {}", id));
    }
    if let Some(ref username) = query.username {
        sql.push_str(&format!(" AND username LIKE '%{}%'", username));
        count_sql.push_str(&format!(" AND username LIKE '%{}%'", username));
    }
    if let Some(ref nickname) = query.nickname {
        sql.push_str(&format!(" AND nickname LIKE '%{}%'", nickname));
        count_sql.push_str(&format!(" AND nickname LIKE '%{}%'", nickname));
    }
    if let Some(ref phone) = query.phone {
        sql.push_str(&format!(" AND phone LIKE '%{}%'", phone));
        count_sql.push_str(&format!(" AND phone LIKE '%{}%'", phone));
    }
    if let Some(ref email) = query.email {
        sql.push_str(&format!(" AND email LIKE '%{}%'", email));
        count_sql.push_str(&format!(" AND email LIKE '%{}%'", email));
    }
    if let Some(status) = query.status {
        sql.push_str(&format!(" AND status = {}", status));
        count_sql.push_str(&format!(" AND status = {}", status));
    }

    sql.push_str(&format!(
        " ORDER BY created_time DESC LIMIT {} OFFSET {}",
        page_size, offset
    ));

    let rows = sqlx::query(&sql).fetch_all(&state.user_db).await?;

    let count: (i64,) = sqlx::query_as(&count_sql).fetch_one(&state.user_db).await?;

    let users: Vec<Value> = rows
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
            "rows": users,
            "total": count.0
        }
    })))
}

// GET /api/admin/users/{id}
pub async fn get_user(
    State(state): State<AppState>,
    Path(user_id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let sql = "SELECT id, username, nickname, avatar, phone, email, status, gender, signature, location, last_login_time, created_time FROM users WHERE id = ?";
    let row = sqlx::query(sql)
        .bind(user_id)
        .fetch_one(&state.user_db)
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

// GET /api/admin/users/{id}/route
pub async fn get_user_route(
    State(state): State<AppState>,
    Path(user_id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let key = format!("{}{}", state.config.route_users_key, user_id);
    let route: Option<String> = redis::cmd("GET")
        .arg(&key)
        .query_async(&mut state.redis.clone())
        .await?;

    match route {
        Some(route_json) => {
            let route_value: Value = serde_json::from_str(&route_json).unwrap_or(Value::Null);
            Ok(Json(json!({
                "success": true,
                "message": "Success",
                "data": route_value
            })))
        }
        None => Ok(Json(json!({
            "success": true,
            "message": "User not online",
            "data": null
        }))),
    }
}

// POST /api/admin/users/{id}/disable
pub async fn disable_user(
    State(state): State<AppState>,
    Path(user_id): Path<i64>,
    Json(req): Json<ActionRequest>,
) -> Result<Json<Value>, AppError> {
    let url = format!(
        "{}/api/admin/users/{}/disable",
        state.config.api_server_url, user_id
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
            "message": "User disabled"
        })))
    } else {
        Err(AppError::Upstream("Failed to disable user".to_string()))
    }
}

// POST /api/admin/users/{id}/enable
pub async fn enable_user(
    State(state): State<AppState>,
    Path(user_id): Path<i64>,
    Json(req): Json<ActionRequest>,
) -> Result<Json<Value>, AppError> {
    let url = format!(
        "{}/api/admin/users/{}/enable",
        state.config.api_server_url, user_id
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
            "message": "User enabled"
        })))
    } else {
        Err(AppError::Upstream("Failed to enable user".to_string()))
    }
}

// POST /api/admin/users/{id}/force-offline
pub async fn force_offline(
    State(state): State<AppState>,
    Path(user_id): Path<i64>,
    Json(req): Json<ActionRequest>,
) -> Result<Json<Value>, AppError> {
    let url = format!(
        "{}/api/admin/users/{}/force-offline",
        state.config.api_server_url, user_id
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
            "message": "User forced offline"
        })))
    } else {
        Err(AppError::Upstream("Failed to force offline".to_string()))
    }
}
