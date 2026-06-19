use axum::Json;
use serde_json::{json, Value};
use sqlx::Row;

pub async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "im-admin-server",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

pub async fn ready_check() -> Json<Value> {
    Json(json!({
        "status": "ready",
        "service": "im-admin-server",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}
