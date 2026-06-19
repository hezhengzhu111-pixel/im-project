use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::{json, Value};
use sqlx::Row;

use crate::error::AppError;
use crate::AppState;

// GET /api/admin/nodes
pub async fn list_nodes(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let mut cursor = 0_u64;
    let mut nodes = Vec::new();
    let prefix = &state.config.server_registry_key_prefix;

    loop {
        let (next, keys): (u64, Vec<String>) = redis::cmd("SCAN")
            .arg(cursor)
            .arg("MATCH")
            .arg(format!("{}*", prefix))
            .arg("COUNT")
            .arg(100)
            .query_async(&mut state.redis.clone())
            .await?;

        for key in keys {
            let raw: Option<String> = redis::cmd("GET")
                .arg(&key)
                .query_async(&mut state.redis.clone())
                .await?;

            if let Some(data) = raw {
                if let Ok(node) = serde_json::from_str::<Value>(&data) {
                    nodes.push(node);
                }
            }
        }

        if next == 0 {
            break;
        }
        cursor = next;
    }

    Ok(Json(json!({
        "success": true,
        "message": "Success",
        "data": nodes
    })))
}

// GET /api/admin/nodes/{id}
pub async fn get_node(
    State(state): State<AppState>,
    Path(node_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let key = format!("{}{}", state.config.server_registry_key_prefix, node_id);
    let node_data: Option<String> = redis::cmd("GET")
        .arg(&key)
        .query_async(&mut state.redis.clone())
        .await?;

    match node_data {
        Some(data) => {
            let mut node: Value = serde_json::from_str(&data)
                .map_err(|_| AppError::BadRequest("Invalid node data".to_string()))?;

            // Check health/ready
            if let Some(http_url) = node.get("internalHttpUrl").and_then(|v| v.as_str()) {
                let (health, ready) = check_service_health(&state.http, http_url).await;
                node["health"] = json!(health);
                node["ready"] = json!(ready);
            }

            Ok(Json(json!({
                "success": true,
                "message": "Success",
                "data": node
            })))
        }
        None => Err(AppError::NotFound("Node not found".to_string())),
    }
}

async fn check_service_health(client: &reqwest::Client, base_url: &str) -> (String, String) {
    let health_url = format!("{}/health", base_url);
    let ready_url = format!("{}/ready", base_url);

    let health = match client.get(&health_url).send().await {
        Ok(resp) if resp.status().is_success() => "UP".to_string(),
        _ => "DOWN".to_string(),
    };

    let ready = match client.get(&ready_url).send().await {
        Ok(resp) if resp.status().is_success() => "READY".to_string(),
        _ => "NOT_READY".to_string(),
    };

    (health, ready)
}
