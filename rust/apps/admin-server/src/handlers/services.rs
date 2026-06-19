use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::{json, Value};
use sqlx::Row;

use crate::error::AppError;
use crate::AppState;

// GET /api/admin/services/status
pub async fn get_services_status(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let api_server_url = &state.config.api_server_url;
    let im_server_url = &state.config.im_server_url;

    let api_health = check_health(&state.http, api_server_url).await;
    let im_health = check_health(&state.http, im_server_url).await;

    Ok(Json(json!({
        "success": true,
        "message": "Success",
        "data": {
            "api_server": {
                "name": "api-server",
                "url": api_server_url,
                "health": api_health.0,
                "ready": api_health.1,
                "response_time_ms": api_health.2
            },
            "im_server": {
                "name": "im-server",
                "url": im_server_url,
                "health": im_health.0,
                "ready": im_health.1,
                "response_time_ms": im_health.2
            }
        }
    })))
}

// GET /api/admin/services/{name}/status
pub async fn get_service_status(
    State(state): State<AppState>,
    Path(service_name): Path<String>,
) -> Result<Json<Value>, AppError> {
    let url = match service_name.as_str() {
        "api-server" => &state.config.api_server_url,
        "im-server" => &state.config.im_server_url,
        _ => return Err(AppError::NotFound("Service not found".to_string())),
    };

    let (health, ready, response_time) = check_health(&state.http, url).await;

    Ok(Json(json!({
        "success": true,
        "message": "Success",
        "data": {
            "name": service_name,
            "url": url,
            "health": health,
            "ready": ready,
            "response_time_ms": response_time
        }
    })))
}

async fn check_health(client: &reqwest::Client, base_url: &str) -> (String, String, u64) {
    let health_url = format!("{}/health", base_url);
    let ready_url = format!("{}/ready", base_url);

    let start = std::time::Instant::now();
    let health = match client.get(&health_url).send().await {
        Ok(resp) if resp.status().is_success() => "UP".to_string(),
        _ => "DOWN".to_string(),
    };
    let response_time = start.elapsed().as_millis() as u64;

    let ready = match client.get(&ready_url).send().await {
        Ok(resp) if resp.status().is_success() => "READY".to_string(),
        _ => "NOT_READY".to_string(),
    };

    (health, ready, response_time)
}
