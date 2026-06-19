use axum::{extract::State, Json};
use serde_json::{json, Value};
use sqlx::Row;

use crate::error::AppError;
use crate::AppState;

// GET /api/admin/middleware/mysql/status
pub async fn get_mysql_status(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let version: (String,) = sqlx::query_as("SELECT VERSION() as version")
        .fetch_one(&state.user_db)
        .await?;

    let connections: (String, String) = sqlx::query_as("SHOW STATUS LIKE 'Threads_connected'")
        .fetch_one(&state.user_db)
        .await?;

    let max_conn: (String, String) = sqlx::query_as("SHOW VARIABLES LIKE 'max_connections'")
        .fetch_one(&state.user_db)
        .await?;

    Ok(Json(json!({
        "success": true,
        "message": "Success",
        "data": {
            "type": "mysql",
            "connection_status": "CONNECTED",
            "version": version.0,
            "current_connections": connections.1.parse::<i32>().unwrap_or(0),
            "max_connections": max_conn.1.parse::<i32>().unwrap_or(0),
        }
    })))
}

// GET /api/admin/middleware/redis/status
pub async fn get_redis_status(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let info: String = redis::cmd("INFO")
        .query_async(&mut state.redis.clone())
        .await?;

    let used_memory = extract_redis_info(&info, "used_memory_human");
    let connected_clients = extract_redis_info(&info, "connected_clients");
    let total_commands = extract_redis_info(&info, "total_commands_processed");

    // Count route keys
    let mut cursor = 0_u64;
    let mut route_count = 0;
    let route_prefix = &state.config.route_users_key;

    loop {
        let (next, keys): (u64, Vec<String>) = redis::cmd("HSCAN")
            .arg(route_prefix)
            .arg(cursor)
            .arg("COUNT")
            .arg(1000)
            .query_async(&mut state.redis.clone())
            .await?;

        route_count += keys.len() / 2; // HSCAN returns field-value pairs

        if next == 0 {
            break;
        }
        cursor = next;
    }

    // Count node keys
    let mut node_count = 0;
    let node_prefix = &state.config.server_registry_key_prefix;
    cursor = 0;

    loop {
        let (next, keys): (u64, Vec<String>) = redis::cmd("SCAN")
            .arg(cursor)
            .arg("MATCH")
            .arg(format!("{}*", node_prefix))
            .arg("COUNT")
            .arg(100)
            .query_async(&mut state.redis.clone())
            .await?;

        node_count += keys.len();

        if next == 0 {
            break;
        }
        cursor = next;
    }

    Ok(Json(json!({
        "success": true,
        "message": "Success",
        "data": {
            "type": "redis",
            "connection_status": "CONNECTED",
            "used_memory": used_memory,
            "connected_clients": connected_clients.parse::<i32>().unwrap_or(0),
            "total_commands_processed": total_commands.parse::<i64>().unwrap_or(0),
            "route_registry_count": route_count,
            "node_count": node_count,
        }
    })))
}

fn extract_redis_info(info: &str, key: &str) -> String {
    for line in info.lines() {
        if line.starts_with(key) {
            if let Some(value) = line.split(':').nth(1) {
                return value.trim().to_string();
            }
        }
    }
    String::new()
}
